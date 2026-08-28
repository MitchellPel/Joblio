import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { RiggingInstall } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import InstallTodoList, { printInstallTodo } from './InstallTodoList';
import { formatLocalDate } from '../utils/dates';
import { ClipboardList, Printer, X } from 'lucide-react';

const SESSION_KEY = 'joblio-installs-popup-shown';

/** Above board overlays; below rigging alert toasts (10000). */
const POPUP_Z = 9000;

export default function InstallDayPopup() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [installs, setInstalls] = useState<RiggingInstall[]>([]);
  const [today] = useState(() => formatLocalDate(new Date()));

  const loadTodayInstalls = useCallback(async () => {
    if (!token) return;
    if (sessionStorage.getItem(SESSION_KEY) === today) return;

    const result = await window.tracker.riggingListInstallsForDate(token, today);
    if ('error' in result) return;
    if (result.length === 0) return;

    setInstalls(result);
    setOpen(true);
    sessionStorage.setItem(SESSION_KEY, today);
  }, [token, today]);

  useEffect(() => {
    loadTodayInstalls();
  }, [loadTodayInstalls]);

  if (!open) return null;

  return createPortal(
    <div
      className="jt-anim-overlay fixed inset-0 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px] print:hidden"
      style={{ zIndex: POPUP_Z }}
    >
      <div
        className="jt-anim-panel jt-scroll flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-canvas shadow-raised"
        role="dialog"
        aria-labelledby="install-day-popup-title"
      >
        <div className="flex items-center justify-between border-b border-ink-10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15">
              <ClipboardList className="h-4 w-4 text-brand" />
            </div>
            <div>
              <h2 id="install-day-popup-title" className="text-sm font-medium text-ink">
                Today&apos;s Installs
              </h2>
              <p className="text-xs text-ink-40">Print this list for your rigging team</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-ink-40 hover:bg-ink-6 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="jt-scroll min-h-0 flex-1 overflow-y-auto p-4">
          <InstallTodoList date={today} installs={installs} printId="install-popup-print" />
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-10 px-4 py-3">
          <button type="button" onClick={() => setOpen(false)} className="jt-btn-ghost">
            Close
          </button>
          <button
            type="button"
            onClick={() => printInstallTodo('install-popup-print', { date: today, installs })}
            className="jt-btn-primary flex items-center gap-1.5"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
