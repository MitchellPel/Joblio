namespace JoblioStackMonitor;

internal enum RowState
{
    Waiting,
    Online,
    Offline,
    Warning,
}

internal sealed class StatusRow : Panel
{
    private readonly Label _name;
    private readonly Label _badge;
    private readonly Label _detail;
    private readonly Panel _accent;

    public StatusRow(string title)
    {
        Height = 52;
        Dock = DockStyle.Top;
        Margin = new Padding(0, 0, 0, 6);
        BackColor = Color.White;
        Padding = new Padding(0);

        _accent = new Panel
        {
            Width = 4,
            Dock = DockStyle.Left,
            BackColor = Color.FromArgb(210, 214, 220),
        };

        var inner = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(12, 8, 12, 8),
        };

        _name = new Label
        {
            AutoSize = false,
            Width = 148,
            Dock = DockStyle.Left,
            Font = new Font("Segoe UI Semibold", 10f),
            ForeColor = Color.FromArgb(28, 32, 38),
            TextAlign = ContentAlignment.MiddleLeft,
            Text = title,
        };

        _badge = new Label
        {
            AutoSize = false,
            Width = 88,
            Dock = DockStyle.Left,
            Font = new Font("Segoe UI Semibold", 8.5f),
            TextAlign = ContentAlignment.MiddleCenter,
            Margin = new Padding(0),
            Text = "…",
        };

        _detail = new Label
        {
            AutoSize = false,
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9f),
            ForeColor = Color.FromArgb(82, 90, 102),
            TextAlign = ContentAlignment.MiddleLeft,
            Text = "Checking…",
        };

        inner.Controls.Add(_detail);
        inner.Controls.Add(_badge);
        inner.Controls.Add(_name);
        Controls.Add(inner);
        Controls.Add(_accent);
        SetState(RowState.Waiting, "Checking…");
    }

    public void SetState(RowState state, string detail)
    {
        _detail.Text = string.IsNullOrWhiteSpace(detail) ? "—" : detail;
        switch (state)
        {
            case RowState.Online:
                _badge.Text = "OK";
                _badge.BackColor = Color.FromArgb(214, 245, 224);
                _badge.ForeColor = Color.FromArgb(18, 110, 58);
                _accent.BackColor = Color.FromArgb(40, 167, 69);
                break;
            case RowState.Offline:
                _badge.Text = "DOWN";
                _badge.BackColor = Color.FromArgb(255, 228, 230);
                _badge.ForeColor = Color.FromArgb(170, 30, 45);
                _accent.BackColor = Color.FromArgb(220, 53, 69);
                break;
            case RowState.Warning:
                _badge.Text = "WARN";
                _badge.BackColor = Color.FromArgb(255, 244, 210);
                _badge.ForeColor = Color.FromArgb(140, 95, 0);
                _accent.BackColor = Color.FromArgb(255, 193, 7);
                break;
            default:
                _badge.Text = "…";
                _badge.BackColor = Color.FromArgb(236, 239, 243);
                _badge.ForeColor = Color.FromArgb(90, 98, 110);
                _accent.BackColor = Color.FromArgb(210, 214, 220);
                break;
        }
    }
}
