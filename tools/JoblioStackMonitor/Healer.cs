namespace JoblioStackMonitor;

internal sealed class Healer
{
    private readonly Config _cfg;
    private readonly MonitorLog _log;
    private DateTime _lastHealUtc = DateTime.MinValue;
    private string _lastAction = "none";

    public Healer(Config cfg, MonitorLog log)
    {
        _cfg = cfg;
        _log = log;
    }

    public string LastAction => _lastAction;
    public DateTime LastHealUtc => _lastHealUtc;

    public bool CanHealNow()
    {
        return (DateTime.UtcNow - _lastHealUtc).TotalSeconds >= _cfg.HealCooldownSeconds;
    }

    public async Task<string> TryHealAsync(CheckResult check)
    {
        if (!CanHealNow())
        {
            var wait = _cfg.HealCooldownSeconds - (int)(DateTime.UtcNow - _lastHealUtc).TotalSeconds;
            return $"heal cooldown ({Math.Max(wait, 1)}s left)";
        }

        var actions = new List<string>();

        // Never auto-heal Docker via CLI when Office API is already healthy —
        // that was spamming Win32 193 errors on a broken docker shim.
        if (!check.HealthOk)
        {
            if (!check.DockerEngineOk)
                actions.Add(await StartDockerDesktopAsync());
            else
                actions.Add(await HealDockerAsync(check));
        }

        if (!check.NgrokOk)
        {
            actions.Add(StartScheduledTask(_cfg.NgrokTaskName, "ngrok"));
            if (!ProcessRunning("ngrok"))
                actions.Add(TryStartNgrokFromKnownScripts());
        }

        if (!check.EndpointOk || !check.ApiKeyOk)
        {
            var shareFix = SharePathHealer.TryHeal(_cfg, check);
            if (!string.IsNullOrWhiteSpace(shareFix))
                actions.Add(shareFix);
            else if (!check.EndpointOk)
                actions.Add(StartScheduledTask(_cfg.EndpointPublisherTaskName, "endpoint publisher"));
        }

        _lastHealUtc = DateTime.UtcNow;
        _lastAction = string.Join(" | ", actions.Where(a => !string.IsNullOrWhiteSpace(a)));
        if (string.IsNullOrWhiteSpace(_lastAction)) _lastAction = check.HealthOk ? "none needed (API online)" : "no heal actions taken";
        _log.Warn($"heal: {_lastAction}");
        return _lastAction;
    }

    public string RestartGateway()
    {
        _lastHealUtc = DateTime.UtcNow;
        var docker = StackChecker.ResolveDocker();
        if (docker is null) return _lastAction = "docker missing";
        var (code, output) = StackChecker.Run(docker, "compose restart gateway", _cfg.ComposeDir, 60);
        _lastAction = code == 0 ? "restarted gateway" : $"gateway restart failed: {Truncate(output, 120)}";
        _log.Warn(_lastAction);
        return _lastAction;
    }

    public string RestartStack()
    {
        _lastHealUtc = DateTime.UtcNow;
        var docker = StackChecker.ResolveDocker();
        if (docker is null) return _lastAction = "docker missing";
        var (code, output) = StackChecker.Run(docker, "compose up -d", _cfg.ComposeDir, 120);
        _lastAction = code == 0 ? "compose up -d OK" : $"compose up failed: {Truncate(output, 120)}";
        _log.Warn(_lastAction);
        return _lastAction;
    }

    public string RestartNgrok()
    {
        _lastHealUtc = DateTime.UtcNow;
        KillProcesses("ngrok");
        var msg = StartScheduledTask(_cfg.NgrokTaskName, "ngrok");
        if (!ProcessRunning("ngrok"))
            msg += " | " + TryStartNgrokFromKnownScripts();
        _lastAction = msg;
        _log.Warn(_lastAction);
        return _lastAction;
    }

    public async Task<string> StartDockerDesktopAsync()
    {
        _lastHealUtc = DateTime.UtcNow;
        var exe = ResolveDockerDesktop();
        if (exe is null)
        {
            _lastAction = "Docker Desktop.exe not found";
            _log.Warn(_lastAction);
            return _lastAction;
        }

        try
        {
            if (ProcessRunning("Docker Desktop") || ProcessRunning("com.docker.backend"))
            {
                _lastAction = "Docker Desktop already open — waiting for engine…";
            }
            else
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = exe,
                    UseShellExecute = true,
                });
                _lastAction = "Starting Docker Desktop…";
            }

            var docker = StackChecker.ResolveDocker();
            if (docker is null)
            {
                _lastAction = "Started Desktop but docker.exe missing";
                return _lastAction;
            }

            for (var i = 0; i < 40; i++)
            {
                await Task.Delay(3000);
                var (code, output) = StackChecker.Run(docker, "info --format={{.ServerVersion}}", _cfg.ComposeDir, 15);
                if (code == 0 && !string.IsNullOrWhiteSpace(output) &&
                    !output.Contains("error", StringComparison.OrdinalIgnoreCase))
                {
                    StackChecker.Run(docker, "compose up -d", _cfg.ComposeDir, 120);
                    _lastAction = $"Docker engine up ({output.Trim()}) · Joblio stack started";
                    _log.Warn(_lastAction);
                    return _lastAction;
                }
            }

            _lastAction = "Docker Desktop started but engine not ready yet — press Check now in a minute";
            _log.Warn(_lastAction);
            return _lastAction;
        }
        catch (Exception ex)
        {
            _lastAction = $"Start Docker failed: {ex.Message}";
            _log.Error(_lastAction);
            return _lastAction;
        }
    }

    private async Task<string> HealDockerAsync(CheckResult check)
    {
        var docker = StackChecker.ResolveDocker();
        if (docker is null) return "docker missing";

        if (!check.DockerOk)
        {
            var (code, output) = StackChecker.Run(docker, "compose up -d", _cfg.ComposeDir, 120);
            return code == 0 ? "compose up -d" : $"compose up failed: {Truncate(output, 100)}";
        }

        StackChecker.Run(docker, "compose restart gateway", _cfg.ComposeDir, 60);
        await Task.Delay(2500);
        if (await HealthOkAsync()) return "restarted gateway (health restored)";

        StackChecker.Run(docker, "compose restart postgrest gateway", _cfg.ComposeDir, 90);
        await Task.Delay(3000);
        if (await HealthOkAsync()) return "restarted postgrest+gateway";

        StackChecker.Run(docker, "compose up -d", _cfg.ComposeDir, 120);
        await Task.Delay(4000);
        if (await HealthOkAsync()) return "compose up -d after health fail";

        StackChecker.Run(docker, "compose restart db postgrest gateway", _cfg.ComposeDir, 120);
        return $"escalated full service restart (no volume wipe); health still={(await HealthOkAsync() ? "ok" : "bad")}";
    }

    private async Task<bool> HealthOkAsync()
    {
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var body = await http.GetStringAsync(_cfg.HealthUrl);
            return body.Contains("joblio-ok", StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private string StartScheduledTask(string taskName, string label)
    {
        try
        {
            var (code, output) = StackChecker.Run("schtasks.exe", $"/Run /TN \"{taskName}\"", null, 20);
            if (code == 0) return $"started task {taskName}";
            return $"task {taskName} start failed: {Truncate(output, 100)}";
        }
        catch (Exception ex)
        {
            return $"{label} task error: {ex.Message}";
        }
    }

    private string TryStartNgrokFromKnownScripts()
    {
        var candidates = new[]
        {
            Path.Combine(_cfg.ComposeDir, "start-ngrok.cmd"),
            Path.Combine(_cfg.ComposeDir, "start-ngrok.bat"),
            Path.Combine(_cfg.ComposeDir, "ngrok", "start.cmd"),
            Path.Combine(_cfg.ShareRoot, "start-ngrok.cmd"),
            Path.Combine(Config.DefaultShareRoot, "start-ngrok.cmd"),
            @"D:\Gary\Job Tracker\start-ngrok.cmd",
        };
        foreach (var script in candidates)
        {
            if (!File.Exists(script)) continue;
            try
            {
                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = script,
                    WorkingDirectory = Path.GetDirectoryName(script)!,
                    UseShellExecute = true,
                    WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden,
                };
                System.Diagnostics.Process.Start(psi);
                return $"launched {Path.GetFileName(script)}";
            }
            catch (Exception ex)
            {
                return $"script {Path.GetFileName(script)} failed: {ex.Message}";
            }
        }
        return "no ngrok start script found";
    }

    private static string? ResolveDockerDesktop()
    {
        var candidates = new[]
        {
            @"C:\Program Files\Docker\Docker\Docker Desktop.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Docker", "Docker", "Docker Desktop.exe"),
        };
        foreach (var c in candidates)
            if (File.Exists(c)) return c;
        return null;
    }

    private static bool ProcessRunning(string name) =>
        System.Diagnostics.Process.GetProcessesByName(name).Length > 0;

    private static void KillProcesses(string name)
    {
        foreach (var p in System.Diagnostics.Process.GetProcessesByName(name))
        {
            try { p.Kill(entireProcessTree: true); } catch { /* ignore */ }
            p.Dispose();
        }
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? "" : s.Length <= max ? s : s[..max] + "…";
}
