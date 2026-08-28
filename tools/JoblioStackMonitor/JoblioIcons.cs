namespace JoblioStackMonitor;

internal static class JoblioIcons
{
    private static Icon? _appIcon;
    private static readonly object Lock = new();

    public static Icon AppIcon => GetAppIcon();

    public static Icon TrayIcon(OverallStatus status)
    {
        lock (Lock)
        {
            using var baseBmp = new Bitmap(AppIcon.ToBitmap(), new Size(32, 32));
            using var g = Graphics.FromImage(baseBmp);
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            var color = status switch
            {
                OverallStatus.Ok => Color.FromArgb(40, 167, 69),
                OverallStatus.Warn => Color.FromArgb(255, 193, 7),
                _ => Color.FromArgb(220, 53, 69),
            };

            using var ring = new Pen(Color.White, 2f);
            using var fill = new SolidBrush(color);
            g.FillEllipse(fill, 21, 21, 10, 10);
            g.DrawEllipse(ring, 21, 21, 10, 10);

            var hIcon = baseBmp.GetHicon();
            return (Icon)Icon.FromHandle(hIcon).Clone();
        }
    }

    private static Icon GetAppIcon()
    {
        lock (Lock)
        {
            if (_appIcon is not null) return _appIcon;

            var besideExe = Path.Combine(AppContext.BaseDirectory, "joblio-monitor.ico");
            if (File.Exists(besideExe))
            {
                _appIcon = new Icon(besideExe);
                return _appIcon;
            }

            try
            {
                var exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (exeIcon is not null)
                {
                    _appIcon = (Icon)exeIcon.Clone();
                    exeIcon.Dispose();
                    return _appIcon;
                }
            }
            catch
            {
                // fall through
            }

            _appIcon = SystemIcons.Shield;
            return _appIcon;
        }
    }
}
