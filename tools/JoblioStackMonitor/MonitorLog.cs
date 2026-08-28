namespace JoblioStackMonitor;

internal sealed class MonitorLog
{
    private readonly string _dir;
    private readonly object _lock = new();

    public MonitorLog(string logsDir)
    {
        _dir = logsDir;
        Directory.CreateDirectory(_dir);
    }

    public void Info(string message) => Write("INFO", message);
    public void Warn(string message) => Write("WARN", message);
    public void Error(string message) => Write("ERROR", message);

    private void Write(string level, string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{level}] {message}";
        lock (_lock)
        {
            try
            {
                var path = Path.Combine(_dir, $"monitor-{DateTime.Now:yyyyMMdd}.log");
                File.AppendAllText(path, line + Environment.NewLine);
                TrimOldLogs();
            }
            catch
            {
                // never crash UI over logging
            }
        }
    }

    private void TrimOldLogs()
    {
        try
        {
            var cutoff = DateTime.Now.AddDays(-14);
            foreach (var file in Directory.EnumerateFiles(_dir, "monitor-*.log"))
            {
                if (File.GetLastWriteTime(file) < cutoff)
                    File.Delete(file);
            }
        }
        catch
        {
            // ignore
        }
    }

    public string LogsFolder => _dir;
}
