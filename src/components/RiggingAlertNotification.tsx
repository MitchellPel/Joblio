import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';

interface RiggingAlert {
  id: string;
  message: string;
  alert_type: string;
}

/** Above board overlays (~100–130) and @hello-pangea/dnd drag clones (5000). */
const TOAST_Z = 10000;

export default function RiggingAlertNotification() {
  const [alerts, setAlerts] = useState<RiggingAlert[]>([]);

  useEffect(() => {
    const unsubscribe = window.tracker.onRiggingAlert((payload) => {
      setAlerts((prev) => [
        {
          id: `${payload.install_id}-${payload.alert_type}-${Date.now()}`,
          message: payload.message,
          alert_type: payload.alert_type,
        },
        ...prev,
      ].slice(0, 5));
    });
    return unsubscribe;
  }, []);

  function dismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  if (alerts.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-4 right-4 flex max-w-sm flex-col gap-2"
      style={{ zIndex: TOAST_Z }}
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-brand/30 bg-card p-4 shadow-raised"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15">
            <Bell className="h-4 w-4 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-caps text-brand">Rigging Schedule</p>
            <p className="mt-0.5 text-sm text-ink">{alert.message}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(alert.id)}
            className="shrink-0 rounded-lg p-1 text-ink-40 hover:bg-ink-6 hover:text-ink"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
