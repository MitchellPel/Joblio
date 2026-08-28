namespace JoblioStackMonitor;

internal static class TrayIcons
{
    public static Icon Make(OverallStatus status) => JoblioIcons.TrayIcon(status);
}
