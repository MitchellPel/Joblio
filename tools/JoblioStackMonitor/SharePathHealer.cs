namespace JoblioStackMonitor;

/// <summary>
/// Keeps share files reachable after drive-letter or folder moves.
/// </summary>
internal static class SharePathHealer
{
    internal static string TryHeal(Config cfg, CheckResult check)
    {
        var actions = new List<string>();
        var target = Config.ResolveShareRoot(cfg.ShareRoot);

        if (!Directory.Exists(target))
        {
            try
            {
                Directory.CreateDirectory(target);
                actions.Add($"created {target}");
            }
            catch (Exception ex)
            {
                return $"share folder unavailable: {ex.Message}";
            }
        }

        if (!check.ApiKeyOk)
        {
            var copied = CopyIfMissing("joblio-api-key.txt", target);
            if (copied is not null) actions.Add($"copied key from {copied}");
        }

        if (!check.EndpointOk)
        {
            var copied = CopyIfMissing("joblio-endpoint.json", target);
            if (copied is not null) actions.Add($"copied endpoint from {copied}");
        }

        if (actions.Count > 0)
            PersistShareRoot(cfg, target);

        return actions.Count == 0 ? "" : string.Join(" · ", actions);
    }

    private static string? CopyIfMissing(string fileName, string targetDir)
    {
        var dest = Path.Combine(targetDir, fileName);
        if (File.Exists(dest)) return null;

        foreach (var root in Config.ShareRootCandidates)
        {
            if (root.Equals(targetDir, StringComparison.OrdinalIgnoreCase)) continue;
            var src = Path.Combine(root, fileName);
            if (!File.Exists(src)) continue;
            try
            {
                File.Copy(src, dest, overwrite: false);
                return root;
            }
            catch
            {
                // try next candidate
            }
        }

        return null;
    }

    private static void PersistShareRoot(Config cfg, string shareRoot)
    {
        var paths = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "monitor-config.json"),
            Path.Combine(cfg.ComposeDir, "monitor", "monitor-config.json"),
        };
        foreach (var path in paths)
        {
            try
            {
                if (!File.Exists(path)) continue;
                using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
                var obj = new Dictionary<string, object>();
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    obj[prop.Name] = prop.Value.ValueKind switch
                    {
                        System.Text.Json.JsonValueKind.String => prop.Value.GetString()!,
                        System.Text.Json.JsonValueKind.Number => prop.Value.GetInt32(),
                        _ => prop.Value.ToString(),
                    };
                }
                obj["shareRoot"] = shareRoot;
                var json = System.Text.Json.JsonSerializer.Serialize(
                    obj,
                    new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(path, json);
            }
            catch
            {
                // ignore
            }
        }
    }
}
