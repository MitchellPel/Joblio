using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Principal;

namespace JoblioCloudMonitorSetup;

internal static class Program
{
    private const string DestDir = @"C:\Joblio-selfhost\monitor";
    private const string ExeName = "JoblioCloudMonitor.exe";
    private const string ProductVersion = "1.5.1";

    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();

        try
        {
            var installedExe = Path.Combine(DestDir, ExeName);

            // Already installed — normal double-click opens the monitor (no reinstall).
            if (File.Exists(installedExe))
            {
                if (!IsAdmin())
                {
                    LaunchMonitor(installedExe);
                    return;
                }

                var choice = MessageBox.Show(
                    "Joblio Cloud Monitor is already installed on this server.\n\n" +
                    "• Yes — open the monitor\n" +
                    "• No — update / reinstall\n" +
                    "• Cancel — close",
                    "Joblio Cloud Monitor",
                    MessageBoxButtons.YesNoCancel,
                    MessageBoxIcon.Question);

                if (choice == DialogResult.Yes)
                {
                    LaunchMonitor(installedExe);
                    return;
                }
                if (choice == DialogResult.Cancel)
                    return;
            }
            else if (!IsAdmin())
            {
                MessageBox.Show(
                    "First-time install needs Administrator once.\n\n" +
                    "Right-click \"Install Joblio Cloud Monitor (once).exe\" → Run as administrator.\n\n" +
                    "Share folder: Joblio DB\\Jobtracker\\Joblio Cloud Monitor\\\n\n" +
                    "After that, use \"Open Joblio Cloud Monitor.cmd\" or the desktop shortcut — " +
                    "you won't need the installer again.",
                    "Joblio Cloud Monitor",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            var install = MessageBox.Show(
                $"Install Joblio Cloud Monitor v{ProductVersion}?\n\n" +
                "One-time setup on this server:\n" +
                "• Installs to C:\\Joblio-selfhost\\monitor\\\n" +
                "• Desktop + Start Menu shortcuts\n" +
                "• Starts with Windows (system tray)\n\n" +
                "You only run Setup once. After that, open from the desktop icon.",
                "Joblio Cloud Monitor Setup",
                MessageBoxButtons.OKCancel,
                MessageBoxIcon.Question);

            if (install != DialogResult.OK) return;

            Install();

            MessageBox.Show(
                $"Installed v{ProductVersion}.\n\n" +
                "Use the desktop shortcut \"Joblio Cloud Monitor\" from now on.\n" +
                "It runs in the system tray — double-click the tray dot to open.\n\n" +
                "You do NOT need to run Setup again unless updating.",
                "Joblio Cloud Monitor",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.ToString(), "Install failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void LaunchMonitor(string exePath)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = exePath,
            WorkingDirectory = Path.GetDirectoryName(exePath)!,
            UseShellExecute = true,
        });
    }

    private static bool IsAdmin()
    {
        using var id = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private static void Install()
    {
        foreach (var name in new[] { "JoblioStackMonitor", "JoblioCloudMonitor", "JoblioCloudMonitor-Setup" })
        {
            foreach (var p in Process.GetProcessesByName(name))
            {
                try
                {
                    if (p.Id == Environment.ProcessId) continue;
                    p.Kill(entireProcessTree: true);
                }
                catch { /* ignore */ }
                finally { p.Dispose(); }
            }
        }
        Thread.Sleep(1500);

        if (Directory.Exists(DestDir))
            Directory.Delete(DestDir, recursive: true);
        Directory.CreateDirectory(DestDir);
        Directory.CreateDirectory(Path.Combine(DestDir, "logs"));

        ExtractPayload(DestDir);

        var exePath = Path.Combine(DestDir, ExeName);
        if (!File.Exists(exePath))
            throw new FileNotFoundException("Payload missing JoblioCloudMonitor.exe");

        try
        {
            RunHidden("powershell.exe",
                $"-NoProfile -Command \"Add-MpPreference -ExclusionPath '{DestDir}'\"");
        }
        catch { /* optional */ }

        CreateAllShortcuts(exePath);
        DeleteObsolete();
        LaunchMonitor(exePath);
    }

    private static void CreateAllShortcuts(string exePath)
    {
        var startup = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Startup),
            "Joblio Cloud Monitor.lnk");
        foreach (var old in Directory.GetFiles(
                     Environment.GetFolderPath(Environment.SpecialFolder.Startup),
                     "*Joblio*Monitor*"))
        {
            try { File.Delete(old); } catch { /* ignore */ }
        }

        var desktop = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            "Joblio Cloud Monitor.lnk");
        var programs = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            "Joblio");
        Directory.CreateDirectory(programs);
        var startMenu = Path.Combine(programs, "Joblio Cloud Monitor.lnk");

        CreateShortcut(startup, exePath, DestDir);
        CreateShortcut(desktop, exePath, DestDir);
        CreateShortcut(startMenu, exePath, DestDir);
    }

    private static void ExtractPayload(string destDir)
    {
        var asm = Assembly.GetExecutingAssembly();
        var name = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("payload.zip", StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("payload.zip not embedded — rebuild setup.");

        using var stream = asm.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException("Cannot open payload.zip resource.");
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
        zip.ExtractToDirectory(destDir, overwriteFiles: true);
    }

    private static void DeleteObsolete()
    {
        string[] junk =
        [
            @"D:\Gary\Job Tracker\JoblioStackMonitor",
            @"D:\Gary\Job Tracker\JoblioCloudMonitor",
            @"D:\Gary\Job Tracker\JoblioCloudMonitor-v1.2",
            @"D:\Gary\Job Tracker\_JoblioCloudMonitor_staging",
            @"D:\Gary\Job Tracker\_DELETE_ME_old_JoblioStackMonitor",
            @"\\server\Gary\Job Tracker\JoblioStackMonitor",
            @"\\server\Gary\Job Tracker\JoblioCloudMonitor",
            @"\\server\Gary\Job Tracker\JoblioCloudMonitor-v1.2",
            @"\\server\Gary\Job Tracker\_JoblioCloudMonitor_staging",
        ];

        foreach (var path in junk)
        {
            try
            {
                if (Directory.Exists(path))
                    Directory.Delete(path, recursive: true);
                else if (File.Exists(path))
                    File.Delete(path);
            }
            catch { /* ignore */ }
        }

        foreach (var f in Directory.GetFiles(DestDir, "JoblioStackMonitor.*"))
        {
            try { File.Delete(f); } catch { /* ignore */ }
        }
    }

    private static void CreateShortcut(string lnkPath, string target, string workDir)
    {
        var t = Type.GetTypeFromProgID("WScript.Shell")
            ?? throw new InvalidOperationException("WScript.Shell unavailable");
        dynamic shell = Activator.CreateInstance(t)!;
        var sc = shell.CreateShortcut(lnkPath);
        sc.TargetPath = target;
        sc.WorkingDirectory = workDir;
        sc.Description = $"Joblio Cloud Monitor v{ProductVersion}";
        sc.Save();
    }

    private static void RunHidden(string file, string args)
    {
        using var p = Process.Start(new ProcessStartInfo
        {
            FileName = file,
            Arguments = args,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        });
        p?.WaitForExit(15000);
    }
}
