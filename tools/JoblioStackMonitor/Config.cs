namespace JoblioStackMonitor;

internal sealed class Config
{
    /// <summary>Primary share after server drive move (Aug 2026).</summary>
    public const string DefaultShareRoot = @"D:\Joblio DB\Jobtracker";

    internal static readonly string[] ShareRootCandidates =
    [
        DefaultShareRoot,
        @"\\server\D\Joblio DB\Jobtracker",
        @"D:\Gary\Job Tracker",
        @"\\server\Gary\Job Tracker",
    ];

    public string ComposeDir { get; init; } = @"C:\Joblio-selfhost";
    public string ShareRoot { get; init; } = DefaultShareRoot;
    public string HealthUrl { get; init; } = "http://127.0.0.1:8080/health";
    public string RestProbeUrl { get; init; } = "http://127.0.0.1:8080/rest/v1/users?select=id&limit=1";
    public string NgrokTaskName { get; init; } = "JoblioNgrok";
    public string EndpointPublisherTaskName { get; init; } = "JoblioEndpointPublisher";
    public int CheckIntervalSeconds { get; init; } = 45;
    public int HealCooldownSeconds { get; init; } = 90;
    public int BackupMaxAgeHours { get; init; } = 36;

    public string EndpointJsonPath => Path.Combine(ShareRoot, "joblio-endpoint.json");
    public string ApiKeyPath => Path.Combine(ShareRoot, "joblio-api-key.txt");
    public string BackupsDir => Path.Combine(ComposeDir, "backups");
    public string LogsDir => Path.Combine(ComposeDir, "monitor", "logs");

    /// <summary>Pick the first share root that has joblio-api-key.txt (and endpoint if present).</summary>
    public static string ResolveShareRoot(string? preferred)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(preferred))
            candidates.Add(NormalizeRoot(preferred));
        foreach (var c in ShareRootCandidates)
        {
            if (!candidates.Any(x => x.Equals(c, StringComparison.OrdinalIgnoreCase)))
                candidates.Add(c);
        }

        foreach (var root in candidates)
        {
            if (Directory.Exists(root) && File.Exists(Path.Combine(root, "joblio-api-key.txt")))
                return root;
        }

        foreach (var root in candidates)
        {
            if (Directory.Exists(root))
                return root;
        }

        return candidates.FirstOrDefault() ?? DefaultShareRoot;
    }

    private static string NormalizeRoot(string root) =>
        root.Trim().TrimEnd('\\', '/');

    public static Config Load()
    {
        var cfg = new Config();
        var besideExe = Path.Combine(AppContext.BaseDirectory, "monitor-config.json");
        var inCompose = Path.Combine(cfg.ComposeDir, "monitor", "monitor-config.json");
        string? configuredShare = null;
        string? loadedFrom = null;

        foreach (var path in new[] { besideExe, inCompose })
        {
            try
            {
                if (!File.Exists(path)) continue;
                loadedFrom = path;
                var json = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
                var root = json.RootElement;
                string? S(string name) =>
                    root.TryGetProperty(name, out var p) && p.ValueKind == System.Text.Json.JsonValueKind.String
                        ? p.GetString()
                        : null;
                int? I(string name) =>
                    root.TryGetProperty(name, out var p) && p.TryGetInt32(out var v) ? v : null;

                configuredShare = S("shareRoot");
                cfg = new Config
                {
                    ComposeDir = S("composeDir") ?? cfg.ComposeDir,
                    ShareRoot = configuredShare ?? cfg.ShareRoot,
                    HealthUrl = S("healthUrl") ?? cfg.HealthUrl,
                    RestProbeUrl = S("restProbeUrl") ?? cfg.RestProbeUrl,
                    NgrokTaskName = S("ngrokTaskName") ?? cfg.NgrokTaskName,
                    EndpointPublisherTaskName = S("endpointPublisherTaskName") ?? cfg.EndpointPublisherTaskName,
                    CheckIntervalSeconds = I("checkIntervalSeconds") ?? cfg.CheckIntervalSeconds,
                    HealCooldownSeconds = I("healCooldownSeconds") ?? cfg.HealCooldownSeconds,
                    BackupMaxAgeHours = I("backupMaxAgeHours") ?? cfg.BackupMaxAgeHours,
                };
                break;
            }
            catch
            {
                // ignore bad config; use defaults
            }
        }

        var resolved = ResolveShareRoot(cfg.ShareRoot);
        if (!resolved.Equals(cfg.ShareRoot, StringComparison.OrdinalIgnoreCase))
        {
            cfg = new Config
            {
                ComposeDir = cfg.ComposeDir,
                ShareRoot = resolved,
                HealthUrl = cfg.HealthUrl,
                RestProbeUrl = cfg.RestProbeUrl,
                NgrokTaskName = cfg.NgrokTaskName,
                EndpointPublisherTaskName = cfg.EndpointPublisherTaskName,
                CheckIntervalSeconds = cfg.CheckIntervalSeconds,
                HealCooldownSeconds = cfg.HealCooldownSeconds,
                BackupMaxAgeHours = cfg.BackupMaxAgeHours,
            };
            if (loadedFrom is not null)
                TryPersistShareRoot(loadedFrom, resolved);
        }

        return cfg;
    }

    private static void TryPersistShareRoot(string configPath, string shareRoot)
    {
        try
        {
            var obj = new Dictionary<string, object>();
            if (File.Exists(configPath))
            {
                using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(configPath));
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    obj[prop.Name] = prop.Value.ValueKind switch
                    {
                        System.Text.Json.JsonValueKind.String => prop.Value.GetString()!,
                        System.Text.Json.JsonValueKind.Number => prop.Value.GetInt32(),
                        _ => prop.Value.ToString(),
                    };
                }
            }
            obj["shareRoot"] = shareRoot;
            var json = System.Text.Json.JsonSerializer.Serialize(
                obj,
                new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(configPath, json);
        }
        catch
        {
            // non-fatal — resolved path still used this session
        }
    }
}
