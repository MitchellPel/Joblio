namespace JoblioStackMonitor;

internal sealed class MonitorForm : Form
{
    private const string VersionLabel = "v1.5.1";

    private Config _cfg;
    private readonly MonitorLog _log;
    private readonly Healer _healer;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly NotifyIcon _tray;

    private readonly Panel _header;
    private readonly Label _overallTitle;
    private readonly Label _overallSub;
    private readonly Label _helpBanner;
    private readonly Label _footer;
    private readonly Panel _advancedPanel;
    private readonly LinkLabel _advancedToggle;

    private readonly StatusRow _rowStaff;
    private readonly StatusRow _rowRemote;
    private readonly StatusRow _rowShare;
    private readonly StatusRow _rowDatabase;
    private readonly StatusRow _rowEngine;
    private readonly StatusRow _rowDocker;
    private readonly StatusRow _rowBackup;
    private readonly StatusRow _rowLock;

    private readonly CheckBox _autoHealBox;
    private readonly Button _fixButton;

    private OverallStatus? _prevOverall;
    private Icon? _trayIcon;
    private bool _autoHeal = true;
    private bool _busy;
    private bool _healing;
    private bool _advancedVisible;

    public MonitorForm()
    {
        _cfg = Config.Load();
        Directory.CreateDirectory(Path.Combine(_cfg.ComposeDir, "monitor"));
        _log = new MonitorLog(_cfg.LogsDir);
        _healer = new Healer(_cfg, _log);

        Text = $"Joblio Cloud Monitor {VersionLabel}";
        Icon = JoblioIcons.AppIcon;
        Width = 520;
        Height = 580;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        ShowInTaskbar = true;
        BackColor = Color.FromArgb(241, 244, 248);
        Font = new Font("Segoe UI", 9.5f);

        _header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 96,
            BackColor = Color.FromArgb(32, 38, 48),
            Padding = new Padding(20, 16, 20, 12),
        };

        _overallTitle = new Label
        {
            AutoSize = false,
            Dock = DockStyle.Top,
            Height = 36,
            Font = new Font("Segoe UI Semibold", 22f),
            ForeColor = Color.White,
            Text = "Checking…",
        };

        _overallSub = new Label
        {
            AutoSize = false,
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.5f),
            ForeColor = Color.FromArgb(190, 198, 210),
            Text = "Joblio office cloud status",
        };

        _header.Controls.Add(_overallSub);
        _header.Controls.Add(_overallTitle);

        _helpBanner = new Label
        {
            Dock = DockStyle.Top,
            Height = 44,
            Padding = new Padding(16, 10, 16, 8),
            BackColor = Color.FromArgb(232, 240, 255),
            ForeColor = Color.FromArgb(40, 70, 120),
            Font = new Font("Segoe UI", 9f),
            Text =
                "Installed on this server · runs in the tray · open from desktop shortcut or " +
                "\"Joblio Cloud Monitor\\Open Joblio Cloud Monitor.cmd\" on the share.",
        };

        var board = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14, 10, 14, 6),
            AutoScroll = true,
        };

        _rowStaff = new StatusRow("Staff can log in");
        _rowRemote = new StatusRow("Remote access");
        _rowShare = new StatusRow("Share files");

        _advancedPanel = new Panel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            Visible = false,
            Padding = new Padding(0, 4, 0, 0),
        };

        _rowDatabase = new StatusRow("Database API");
        _rowEngine = new StatusRow("Docker Desktop");
        _rowDocker = new StatusRow("Joblio containers");
        _rowBackup = new StatusRow("Daily backup");
        _rowLock = new StatusRow("API security");

        foreach (var row in new[] { _rowLock, _rowBackup, _rowDocker, _rowEngine, _rowDatabase })
        {
            var wrap = new Panel { Dock = DockStyle.Top, Height = 58, Padding = new Padding(0, 0, 0, 0) };
            row.Dock = DockStyle.Fill;
            wrap.Controls.Add(row);
            _advancedPanel.Controls.Add(wrap);
        }

        _advancedToggle = new LinkLabel
        {
            Dock = DockStyle.Top,
            Height = 28,
            Text = "Show server details ▾",
            LinkColor = Color.FromArgb(50, 100, 180),
            ActiveLinkColor = Color.FromArgb(30, 70, 140),
            Padding = new Padding(4, 4, 0, 0),
            Font = new Font("Segoe UI", 9f),
        };
        _advancedToggle.LinkClicked += (_, _) => ToggleAdvanced();

        foreach (var row in new[] { _rowShare, _rowRemote, _rowStaff })
        {
            var wrap = new Panel { Dock = DockStyle.Top, Height = 58 };
            row.Dock = DockStyle.Fill;
            wrap.Controls.Add(row);
            board.Controls.Add(wrap);
        }
        board.Controls.Add(_advancedPanel);
        board.Controls.Add(_advancedToggle);

        _footer = new Label
        {
            Dock = DockStyle.Bottom,
            Height = 36,
            Padding = new Padding(14, 8, 14, 6),
            Font = new Font("Segoe UI", 8.5f),
            ForeColor = Color.FromArgb(100, 108, 118),
            Text = $"Share: {_cfg.ShareRoot}",
            BackColor = Color.White,
        };

        var actionBar = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 96,
            BackColor = Color.White,
            Padding = new Padding(14, 10, 14, 10),
        };

        _fixButton = new Button
        {
            Text = "Fix problems now",
            Dock = DockStyle.Top,
            Height = 40,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(40, 167, 69),
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 10.5f),
            Cursor = Cursors.Hand,
        };
        _fixButton.FlatAppearance.BorderSize = 0;
        _fixButton.Click += async (_, _) => await RunCheckAsync(forceHeal: true);

        var secondary = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 36,
            WrapContents = false,
            Padding = new Padding(0, 8, 0, 0),
        };
        secondary.Controls.Add(MakeGhostButton("Check now", async (_, _) => await RunCheckAsync(forceHeal: false)));
        secondary.Controls.Add(MakeGhostButton("Open logs", (_, _) => OpenLogs()));

        _autoHealBox = new CheckBox
        {
            Text = "Auto-fix when something breaks",
            Checked = true,
            AutoSize = true,
            Margin = new Padding(8, 8, 0, 0),
            Font = new Font("Segoe UI", 9f),
        };
        _autoHealBox.CheckedChanged += (_, _) => _autoHeal = _autoHealBox.Checked;
        secondary.Controls.Add(_autoHealBox);

        actionBar.Controls.Add(secondary);
        actionBar.Controls.Add(_fixButton);

        Controls.Add(board);
        Controls.Add(_footer);
        Controls.Add(actionBar);
        Controls.Add(_helpBanner);
        Controls.Add(_header);

        _tray = new NotifyIcon
        {
            Visible = true,
            Text = "Joblio Cloud Monitor",
            Icon = TrayIcons.Make(OverallStatus.Warn),
        };
        _trayIcon = _tray.Icon;
        _tray.DoubleClick += (_, _) => ShowWindow();

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open dashboard", null, (_, _) => ShowWindow());
        menu.Items.Add("Fix problems", null, async (_, _) => await RunCheckAsync(forceHeal: true));
        menu.Items.Add("Check now", null, async (_, _) => await RunCheckAsync(forceHeal: false));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) =>
        {
            _tray.Visible = false;
            Application.Exit();
        });
        _tray.ContextMenuStrip = menu;

        _timer = new System.Windows.Forms.Timer { Interval = Math.Max(15, _cfg.CheckIntervalSeconds) * 1000 };
        _timer.Tick += async (_, _) => await RunCheckAsync(forceHeal: true);
        _timer.Start();

        Load += async (_, _) =>
        {
            SetWaitingUi();
            _log.Info("monitor started");
            await RunCheckAsync(forceHeal: false);
        };

        Resize += (_, _) =>
        {
            if (WindowState == FormWindowState.Minimized)
            {
                Hide();
                ShowInTaskbar = false;
            }
        };

        FormClosing += (_, e) =>
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                Hide();
                ShowInTaskbar = false;
            }
        };
    }

    private void ToggleAdvanced()
    {
        _advancedVisible = !_advancedVisible;
        _advancedPanel.Visible = _advancedVisible;
        _advancedToggle.Text = _advancedVisible ? "Hide server details ▴" : "Show server details ▾";
        if (_advancedVisible)
            Height = 680;
        else
            Height = 580;
    }

    private void OpenLogs()
    {
        Directory.CreateDirectory(_log.LogsFolder);
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
        {
            FileName = _log.LogsFolder,
            UseShellExecute = true,
        });
    }

    private void ShowWindow()
    {
        Show();
        WindowState = FormWindowState.Normal;
        ShowInTaskbar = true;
        Activate();
    }

    private static Button MakeGhostButton(string text, EventHandler onClick)
    {
        var b = new Button
        {
            Text = text,
            AutoSize = true,
            Margin = new Padding(0, 0, 6, 0),
            Padding = new Padding(10, 4, 10, 4),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(245, 247, 250),
            ForeColor = Color.FromArgb(50, 58, 68),
            Font = new Font("Segoe UI", 9f),
            Cursor = Cursors.Hand,
        };
        b.FlatAppearance.BorderColor = Color.FromArgb(210, 216, 224);
        b.Click += onClick;
        return b;
    }

    private void SetWaitingUi(string? title = null)
    {
        _healing = title is not null;
        _overallTitle.Text = title ?? "Checking…";
        _overallSub.Text = title is null ? "Testing office cloud…" : "Please wait…";
        _header.BackColor = Color.FromArgb(70, 78, 92);
        _overallTitle.ForeColor = Color.White;
        _overallSub.ForeColor = Color.FromArgb(210, 216, 224);

        foreach (var row in AllRows())
            row.SetState(RowState.Waiting, "Checking…");

        _fixButton.Enabled = title is null;
    }

    private IEnumerable<StatusRow> AllRows() =>
        new[] { _rowStaff, _rowRemote, _rowShare, _rowDatabase, _rowEngine, _rowDocker, _rowBackup, _rowLock };

    private async Task RunCheckAsync(bool forceHeal)
    {
        if (_busy) return;
        _busy = true;
        _fixButton.Enabled = false;
        try
        {
            if (!_healing) SetWaitingUi();

            _cfg = Config.Load();
            var result = await StackChecker.RunAsync(_cfg, _log);
            ApplyUi(result);

            var needsHeal = result.Overall == OverallStatus.Error ||
                            (result.Overall == OverallStatus.Warn &&
                             (!result.EndpointOk || !result.ApiKeyOk || !result.HealthOk || !result.NgrokOk));

            if (_autoHeal && forceHeal && needsHeal && _healer.CanHealNow())
            {
                _healing = true;
                SetWaitingUi("Fixing…");
                var msg = await _healer.TryHealAsync(result);
                _footer.Text = $"Last fix: {msg}  ·  Share: {_cfg.ShareRoot}";
                await Task.Delay(3500);
                _cfg = Config.Load();
                var again = await StackChecker.RunAsync(_cfg, _log);
                ApplyUi(again);
            }
        }
        catch (Exception ex)
        {
            _log.Error(ex.ToString());
            _overallTitle.Text = "Error";
            _overallSub.Text = ex.Message;
            _header.BackColor = Color.FromArgb(220, 53, 69);
            SetTray(OverallStatus.Error, "Monitor error");
        }
        finally
        {
            _healing = false;
            _busy = false;
            _fixButton.Enabled = true;
        }
    }

    private void ApplyUi(CheckResult r)
    {
        switch (r.Overall)
        {
            case OverallStatus.Ok:
                _overallTitle.Text = "All good";
                _overallSub.Text = $"Staff can use Joblio · {r.CheckedAt:HH:mm}";
                _header.BackColor = Color.FromArgb(34, 139, 84);
                break;
            case OverallStatus.Warn:
                _overallTitle.Text = "Needs attention";
                _overallSub.Text = Friendly(r.Summary);
                _header.BackColor = Color.FromArgb(210, 145, 20);
                break;
            default:
                _overallTitle.Text = "Staff blocked";
                _overallSub.Text = Friendly(r.Summary);
                _header.BackColor = Color.FromArgb(200, 45, 55);
                break;
        }
        _overallTitle.ForeColor = Color.White;
        _overallSub.ForeColor = Color.FromArgb(240, 244, 248);

        _rowStaff.SetState(
            r.HealthOk ? RowState.Online : RowState.Offline,
            r.HealthOk ? "Office database is answering" : "Login will fail until this is fixed");

        _rowRemote.SetState(
            r.NgrokOk ? RowState.Online : RowState.Offline,
            r.NgrokOk ? "Boss / away-from-office access is up" : "Remote staff may not connect");

        var shareOk = r.EndpointOk && r.ApiKeyOk;
        _rowShare.SetState(
            shareOk ? RowState.Online : (r.ApiKeyOk || r.EndpointOk ? RowState.Warning : RowState.Offline),
            shareOk
                ? _cfg.ShareRoot
                : !r.ApiKeyOk && !r.EndpointOk
                    ? "Key or address file missing on share"
                    : Friendly(r.EndpointOk ? r.ApiKeyDetail : r.EndpointDetail));

        _rowDatabase.SetState(r.HealthOk ? RowState.Online : RowState.Offline, Friendly(r.HealthDetail));
        _rowEngine.SetState(r.DockerEngineOk ? RowState.Online : RowState.Offline, Friendly(r.DockerEngineDetail));
        _rowDocker.SetState(
            !r.DockerEngineOk ? RowState.Waiting : (r.DockerOk ? RowState.Online : RowState.Offline),
            Friendly(r.DockerDetail));
        _rowBackup.SetState(r.BackupOk ? RowState.Online : RowState.Warning, Friendly(r.BackupDetail));
        _rowLock.SetState(r.RestLocked ? RowState.Online : RowState.Warning, Friendly(r.RestDetail));

        _footer.Text = $"Share: {_cfg.ShareRoot}  ·  Auto-fix: {(_autoHeal ? "on" : "off")}  ·  {VersionLabel}";
        SetTray(r.Overall, r.Summary);
    }

    private static string Friendly(string detail)
    {
        if (string.IsNullOrWhiteSpace(detail)) return "—";
        return detail.Length > 72 ? detail[..72] + "…" : detail;
    }

    private void SetTray(OverallStatus status, string tip)
    {
        var old = _trayIcon;
        _trayIcon = TrayIcons.Make(status);
        _tray.Icon = _trayIcon;
        old?.Dispose();

        _tray.Text = status switch
        {
            OverallStatus.Ok => "Joblio: all good",
            OverallStatus.Warn => "Joblio: needs attention",
            _ => "Joblio: staff blocked",
        };

        if (status == OverallStatus.Error && _prevOverall != OverallStatus.Error)
        {
            _tray.BalloonTipTitle = "Joblio cloud down";
            _tray.BalloonTipText = tip.Length > 180 ? tip[..180] : tip;
            _tray.ShowBalloonTip(5000);
        }
        _prevOverall = status;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _timer.Dispose();
            _tray.Visible = false;
            _tray.Dispose();
            _trayIcon?.Dispose();
        }
        base.Dispose(disposing);
    }
}
