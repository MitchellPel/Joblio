namespace JoblioStackMonitor;

internal enum OverallStatus
{
    Ok,
    Warn,
    Error,
}

internal sealed class CheckResult
{
    public OverallStatus Overall { get; set; } = OverallStatus.Ok;
    public bool HealthOk { get; set; }
    public string HealthDetail { get; set; } = "";
    public bool DockerOk { get; set; }
    public string DockerDetail { get; set; } = "";
    public bool NgrokOk { get; set; }
    public string NgrokDetail { get; set; } = "";
    public bool EndpointOk { get; set; }
    public string EndpointDetail { get; set; } = "";
    public bool ApiKeyOk { get; set; }
    public string ApiKeyDetail { get; set; } = "";
    public bool BackupOk { get; set; }
    public string BackupDetail { get; set; } = "";
    public bool RestLocked { get; set; }
    public string RestDetail { get; set; } = "";
    /// <summary>Docker engine/daemon reachable (Docker Desktop running).</summary>
    public bool DockerEngineOk { get; set; }
    public string DockerEngineDetail { get; set; } = "";
    public string Summary { get; set; } = "";
    public DateTime CheckedAt { get; set; } = DateTime.Now;
    public List<string> Problems { get; } = new();
}

internal static class StackChecker
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromSeconds(8),
    };

    public static async Task<CheckResult> RunAsync(Config cfg, MonitorLog log)
    {
        var r = new CheckResult { CheckedAt = DateTime.Now };

        await CheckHealthAsync(cfg, r);

        // Source of truth for "is the cloud up?" is /health — not docker CLI.
        // Docker Desktop on this server often exposes a broken `docker` shim
        // (no .exe / wrong arch) that throws Win32 193. Never fail the board for that.
        if (r.HealthOk)
        {
            r.DockerEngineOk = true;
            r.DockerOk = true;
            r.DockerEngineDetail = "Online (Office API answering)";
            r.DockerDetail = "Online — joblio-ok";
        }
        else
        {
            CheckDocker(cfg, r);
        }

        CheckNgrok(r);
        CheckEndpoint(cfg, r);
        CheckApiKey(cfg, r);
        CheckBackup(cfg, r);
        await CheckRestLockAsync(cfg, r);

        if (r.Problems.Count == 0)
        {
            r.Overall = OverallStatus.Ok;
            r.Summary = "All checks OK";
        }
        else if (r.Problems.Any(p => p.StartsWith("WARN:", StringComparison.Ordinal)))
        {
            var hard = r.Problems.Where(p => !p.StartsWith("WARN:", StringComparison.Ordinal)).ToList();
            if (hard.Count == 0)
            {
                r.Overall = OverallStatus.Warn;
                r.Summary = string.Join("; ", r.Problems);
            }
            else
            {
                r.Overall = OverallStatus.Error;
                r.Summary = string.Join("; ", hard);
            }
        }
        else
        {
            r.Overall = OverallStatus.Error;
            r.Summary = string.Join("; ", r.Problems);
        }

        log.Info($"check overall={r.Overall} health={r.HealthOk} dockerEngine={r.DockerEngineOk} docker={r.DockerOk} ngrok={r.NgrokOk} endpoint={r.EndpointOk}");
        return r;
    }

    private static async Task CheckHealthAsync(Config cfg, CheckResult r)
    {
        try
        {
            using var res = await Http.GetAsync(cfg.HealthUrl);
            var body = (await res.Content.ReadAsStringAsync()).Trim();
            r.HealthOk = res.IsSuccessStatusCode && body.Contains("joblio-ok", StringComparison.OrdinalIgnoreCase);
            r.HealthDetail = r.HealthOk ? $"OK ({body})" : $"HTTP {(int)res.StatusCode} body={Truncate(body, 80)}";
            if (!r.HealthOk) r.Problems.Add("health failed");
        }
        catch (Exception ex)
        {
            r.HealthOk = false;
            r.HealthDetail = ex.Message;
            r.Problems.Add("health unreachable");
        }
    }

    private static async Task CheckRestLockAsync(Config cfg, CheckResult r)
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, cfg.RestProbeUrl);
            req.Headers.TryAddWithoutValidation("User-Agent", "JoblioStackMonitor/1.0");
            using var res = await Http.SendAsync(req);
            r.RestLocked = (int)res.StatusCode == 401;
            r.RestDetail = r.RestLocked ? "401 without key (good)" : $"unexpected HTTP {(int)res.StatusCode}";
            if (!r.RestLocked)
                r.Problems.Add("WARN: REST not locked (expected 401 without key)");
        }
        catch (Exception ex)
        {
            r.RestLocked = false;
            r.RestDetail = ex.Message;
            r.Problems.Add("WARN: REST lock probe failed");
        }
    }

    private static void CheckDocker(Config cfg, CheckResult r)
    {
        try
        {
            var docker = ResolveDocker();
            if (docker is null)
            {
                r.DockerEngineOk = false;
                r.DockerOk = false;
                r.DockerEngineDetail = "docker.exe not found";
                r.DockerDetail = "Install/start Docker Desktop";
                r.Problems.Add("docker missing");
                return;
            }

            // 1) Is the Docker engine up?
            var (infoCode, infoOut) = Run(docker, "info --format={{.ServerVersion}}", cfg.ComposeDir, 25);
            if (infoCode != 0 || string.IsNullOrWhiteSpace(infoOut) ||
                infoOut.Contains("error", StringComparison.OrdinalIgnoreCase) ||
                infoOut.Contains("Cannot connect", StringComparison.OrdinalIgnoreCase))
            {
                // fallback: docker version
                var (verCode, verOut) = Run(docker, "version --format={{.Server.Version}}", cfg.ComposeDir, 20);
                if (verCode != 0 || string.IsNullOrWhiteSpace(verOut) ||
                    verOut.Contains("error", StringComparison.OrdinalIgnoreCase))
                {
                    r.DockerEngineOk = false;
                    r.DockerOk = false;
                    r.DockerEngineDetail = "Docker Desktop is not running";
                    r.DockerDetail = "Click Start Docker Desktop";
                    r.Problems.Add("docker engine down");
                    return;
                }
                r.DockerEngineOk = true;
                r.DockerEngineDetail = $"engine {verOut.Trim()}";
            }
            else
            {
                r.DockerEngineOk = true;
                r.DockerEngineDetail = $"engine {infoOut.Trim()}";
            }

            // 2) Are Joblio compose services up?
            var (code, output) = Run(docker, "compose ps --format json", cfg.ComposeDir, 25);
            if (code != 0 || string.IsNullOrWhiteSpace(output))
                (code, output) = Run(docker, "compose ps", cfg.ComposeDir, 25);

            if (code != 0)
            {
                r.DockerOk = false;
                r.DockerDetail = Truncate(output, 180);
                r.Problems.Add("docker compose ps failed");
                return;
            }

            var running = CountRunningServices(output);
            r.DockerOk = running >= 2; // db + postgrest at minimum; gateway makes 3
            if (running >= 3) r.DockerOk = true;

            r.DockerDetail = r.DockerOk
                ? $"{running} container(s) running · {r.DockerEngineDetail}"
                : running == 0
                    ? "Docker is on, but Joblio containers are not running"
                    : $"Only {running} container(s) running (need 3)";

            if (!r.DockerOk)
                r.Problems.Add(running == 0 ? "joblio containers down" : "docker services not all up");
        }
        catch (Exception ex)
        {
            r.DockerEngineOk = false;
            r.DockerOk = false;
            r.DockerDetail = ex.Message;
            r.Problems.Add("docker check error");
        }
    }

    /// <summary>
    /// Supports: JSON array, JSON-lines, or plain `docker compose ps` text.
    /// </summary>
    private static int CountRunningServices(string output)
    {
        if (string.IsNullOrWhiteSpace(output)) return 0;
        var trimmed = output.Trim();

        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(trimmed);
            if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                var n = 0;
                foreach (var el in doc.RootElement.EnumerateArray())
                {
                    if (IsRunningElement(el)) n++;
                }
                return n;
            }
            if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object)
                return IsRunningElement(doc.RootElement) ? 1 : 0;
        }
        catch
        {
            // not a single JSON doc — try JSON lines
        }

        var lines = trimmed.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var jsonLines = 0;
        var jsonRunning = 0;
        foreach (var line in lines)
        {
            if (!line.StartsWith('{')) continue;
            jsonLines++;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(line);
                if (IsRunningElement(doc.RootElement)) jsonRunning++;
            }
            catch
            {
                // ignore bad line
            }
        }
        if (jsonLines > 0) return jsonRunning;

        // Plain text table: look for "Up"
        return lines.Count(l =>
            l.Contains(" Up ", StringComparison.OrdinalIgnoreCase) ||
            l.StartsWith("Up ", StringComparison.OrdinalIgnoreCase) ||
            (l.Contains("Up", StringComparison.OrdinalIgnoreCase) &&
             !l.Contains("Exited", StringComparison.OrdinalIgnoreCase) &&
             !l.Contains("NAME", StringComparison.OrdinalIgnoreCase) &&
             !l.Contains("IMAGE", StringComparison.OrdinalIgnoreCase)));
    }

    private static bool IsRunningElement(System.Text.Json.JsonElement el)
    {
        string? state = null;
        string? status = null;
        if (el.TryGetProperty("State", out var st)) state = st.GetString();
        if (el.TryGetProperty("state", out var st2)) state ??= st2.GetString();
        if (el.TryGetProperty("Status", out var su)) status = su.GetString();
        if (el.TryGetProperty("status", out var su2)) status ??= su2.GetString();

        if (!string.IsNullOrEmpty(state) &&
            state.Equals("running", StringComparison.OrdinalIgnoreCase))
            return true;

        if (!string.IsNullOrEmpty(status) &&
            status.Contains("Up", StringComparison.OrdinalIgnoreCase) &&
            !status.Contains("Exited", StringComparison.OrdinalIgnoreCase))
            return true;

        return false;
    }

    private static void CheckNgrok(CheckResult r)
    {
        try
        {
            var procs = System.Diagnostics.Process.GetProcessesByName("ngrok");
            r.NgrokOk = procs.Length > 0;
            r.NgrokDetail = r.NgrokOk ? $"running (pid {procs[0].Id})" : "not running";
            if (!r.NgrokOk) r.Problems.Add("ngrok down");
            foreach (var p in procs) p.Dispose();
        }
        catch (Exception ex)
        {
            r.NgrokOk = false;
            r.NgrokDetail = ex.Message;
            r.Problems.Add("ngrok check error");
        }
    }

    private static void CheckEndpoint(Config cfg, CheckResult r)
    {
        try
        {
            if (!File.Exists(cfg.EndpointJsonPath))
            {
                r.EndpointOk = false;
                r.EndpointDetail = $"missing at {cfg.EndpointJsonPath}";
                r.Problems.Add("WARN: endpoint.json missing");
                return;
            }

            using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(cfg.EndpointJsonPath));
            var root = doc.RootElement;
            var apiUrl = root.TryGetProperty("api_url", out var u) ? u.GetString() : null;
            var ok = !root.TryGetProperty("ok", out var o) || o.ValueKind != System.Text.Json.JsonValueKind.False;
            var hasKeyLeak = root.TryGetProperty("api_key", out _) ||
                             root.TryGetProperty("JOBLIO_API_KEY", out _) ||
                             root.TryGetProperty("key", out _);

            r.EndpointOk = ok && !string.IsNullOrWhiteSpace(apiUrl) && !hasKeyLeak;
            r.EndpointDetail = r.EndpointOk
                ? $"ok api_url={apiUrl}"
                : hasKeyLeak
                    ? "KEY LEAK in endpoint.json"
                    : $"bad endpoint ok={ok} api_url={apiUrl}";

            if (hasKeyLeak) r.Problems.Add("WARN: endpoint.json contains key");
            else if (!r.EndpointOk) r.Problems.Add("WARN: endpoint.json invalid");
        }
        catch (Exception ex)
        {
            r.EndpointOk = false;
            r.EndpointDetail = ex.Message;
            r.Problems.Add("WARN: endpoint.json error");
        }
    }

    private static void CheckApiKey(Config cfg, CheckResult r)
    {
        try
        {
            if (!File.Exists(cfg.ApiKeyPath))
            {
                r.ApiKeyOk = false;
                r.ApiKeyDetail = $"missing at {cfg.ApiKeyPath}";
                r.Problems.Add("WARN: api key file missing");
                return;
            }

            var len = File.ReadAllText(cfg.ApiKeyPath).Trim().Length;
            r.ApiKeyOk = len >= 8;
            r.ApiKeyDetail = r.ApiKeyOk ? $"present (len {len})" : "empty/too short";
            if (!r.ApiKeyOk) r.Problems.Add("WARN: api key file empty");
        }
        catch (Exception ex)
        {
            r.ApiKeyOk = false;
            r.ApiKeyDetail = ex.Message;
            r.Problems.Add("WARN: api key check error");
        }
    }

    private static void CheckBackup(Config cfg, CheckResult r)
    {
        try
        {
            if (!Directory.Exists(cfg.BackupsDir))
            {
                r.BackupOk = false;
                r.BackupDetail = "backups folder missing";
                r.Problems.Add("WARN: backups folder missing");
                return;
            }

            var newest = Directory.EnumerateFiles(cfg.BackupsDir, "joblio-*.sql*")
                .Select(f => new FileInfo(f))
                .OrderByDescending(f => f.LastWriteTime)
                .FirstOrDefault();

            if (newest is null)
            {
                r.BackupOk = false;
                r.BackupDetail = "no backup files";
                r.Problems.Add("WARN: no backups yet");
                return;
            }

            var age = DateTime.Now - newest.LastWriteTime;
            r.BackupOk = age.TotalHours <= cfg.BackupMaxAgeHours;
            r.BackupDetail = $"{newest.Name} ({age.TotalHours:0.0}h ago)";
            if (!r.BackupOk)
                r.Problems.Add($"WARN: backup stale ({age.TotalHours:0.0}h)");
        }
        catch (Exception ex)
        {
            r.BackupOk = false;
            r.BackupDetail = ex.Message;
            r.Problems.Add("WARN: backup check error");
        }
    }

    internal static string? ResolveDocker()
    {
        var candidates = new List<string>
        {
            @"C:\Program Files\Docker\Docker\resources\bin\docker.exe",
            @"C:\Program Files\Docker\Docker\resources\docker.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Docker", "Docker", "resources", "bin", "docker.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Docker\Docker\resources\bin\docker.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\DockerDesktop\resources\bin\docker.exe"),
        };

        foreach (var c in candidates)
        {
            if (IsUsableDockerExe(c)) return c;
        }

        try
        {
            var (code, output) = Run("where.exe", "docker.exe", Environment.CurrentDirectory, 10);
            if (code == 0)
            {
                foreach (var line in output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (IsUsableDockerExe(line)) return line;
                }
            }
        }
        catch
        {
            // ignore
        }

        return null;
    }

    private static bool IsUsableDockerExe(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return false;
        if (!path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) return false;
        if (!File.Exists(path)) return false;
        // Reject known-bad shim locations without .exe were already excluded;
        // also skip zero-length / tiny non-PE files.
        try
        {
            var len = new FileInfo(path).Length;
            return len > 10_000;
        }
        catch
        {
            return false;
        }
    }

    internal static (int ExitCode, string Output) Run(string file, string args, string? workDir, int timeoutSec)
    {
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = file,
                Arguments = args,
                WorkingDirectory = workDir ?? Environment.CurrentDirectory,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var p = System.Diagnostics.Process.Start(psi);
            if (p is null) return (-1, "failed to start");
            var stdout = p.StandardOutput.ReadToEnd();
            var stderr = p.StandardError.ReadToEnd();
            if (!p.WaitForExit(timeoutSec * 1000))
            {
                try { p.Kill(entireProcessTree: true); } catch { /* ignore */ }
                return (-1, "timeout");
            }
            return (p.ExitCode, (stdout + "\n" + stderr).Trim());
        }
        catch (Exception ex)
        {
            // Win32 193 = bad exe format (Linux shim / missing .exe) — never crash UI
            return (-1, ex.Message);
        }
    }

    private static string Truncate(string s, int max) =>
        string.IsNullOrEmpty(s) ? "" : s.Length <= max ? s : s[..max] + "…";
}
