import { useState, useEffect, useCallback } from 'react';
import type { RiggingInstall } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';
import InstallTodoList, { printInstallTodo } from '../components/InstallTodoList';
import { addDaysToDate, formatLocalDate, formatShortDate } from '../utils/dates';
import { mergeList } from '../utils/mergeList';
import { ChevronLeft, ChevronRight, ClipboardList, Printer } from 'lucide-react';

export default function Installs({ embedded = false }: { embedded?: boolean }) {
  const { token } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDate(new Date()));
  const [installs, setInstalls] = useState<RiggingInstall[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInstalls = useCallback(
    async (silent = false) => {
      if (!token) return;
      try {
        if (!silent) setLoading(true);
        const result = await window.tracker.riggingListInstallsForDate(token, selectedDate);
        if ('error' in result) {
          console.error(result.error);
        } else {
          setInstalls((prev) => mergeList(prev, result));
        }
      } catch (err: unknown) {
        console.error(err instanceof Error ? err.message : err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, selectedDate]
  );

  useEffect(() => {
    loadInstalls();
  }, [loadInstalls]);

  useDbSync(() => loadInstalls(true), !!token);

  const isToday = selectedDate === formatLocalDate(new Date());

  return (
    <div className={`flex h-full flex-col bg-canvas ${embedded ? '' : ''}`}>
      <div className="shrink-0 border-b border-ink-10 bg-canvas px-4 py-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          {!embedded && (
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-ink-55" />
              <h1 className="text-base font-medium text-ink">Installs</h1>
              <span className="rounded-pill bg-surface px-2 py-0.5 text-xs text-ink-40">
                {installs.length} for this day
              </span>
            </div>
          )}
          {embedded && (
            <span className="rounded-pill bg-surface px-2 py-0.5 text-xs text-ink-40">
              {installs.length} for this day
            </span>
          )}

          <div className={`${embedded ? '' : 'ml-auto'} flex flex-wrap items-center gap-2 ${embedded ? 'ml-auto' : ''}`}>
            <div className="flex items-center gap-1 rounded-lg border border-ink-10 bg-card p-0.5">
              <button
                type="button"
                onClick={() => setSelectedDate((d) => addDaysToDate(d, -1))}
                className="rounded-md p-1.5 text-ink-55 hover:bg-ink-6 hover:text-ink"
                aria-label="Previous day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[140px] px-2 text-center text-sm font-medium text-ink">
                {formatShortDate(selectedDate)}
                {isToday && (
                  <span className="ml-1.5 text-xs font-normal text-brand">Today</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setSelectedDate((d) => addDaysToDate(d, 1))}
                className="rounded-md p-1.5 text-ink-55 hover:bg-ink-6 hover:text-ink"
                aria-label="Next day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(formatLocalDate(new Date()))}
                className="jt-btn-ghost text-sm"
              >
                Today
              </button>
            )}
            <button
              type="button"
              onClick={() => printInstallTodo('installs-page-print', { date: selectedDate, installs })}
              disabled={installs.length === 0}
              className="jt-btn-primary flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="jt-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <InstallTodoList date={selectedDate} installs={installs} printId="installs-page-print" />
          </div>
        )}
      </div>
    </div>
  );
}
