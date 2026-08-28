import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Trash2, Search, Lock, ClipboardList } from 'lucide-react';
import type { RiggingInstall, RiggingJobOption, RiggingMonth } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';
import { mergeList } from '../utils/mergeList';
import AppModal from '../components/AppModal';
import CalendarDayEvent, { CAL_DAY_EVENT_VISIBLE } from '../components/CalendarDayEvent';
import Installs from './Installs';
import { installSpanDates } from '../utils/calendarGrid';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m - 1 };
}

function formatYearMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isWeekend(year: number, monthIndex: number, day: number): boolean {
  const d = new Date(year, monthIndex, day).getDay();
  return d === 0 || d === 6;
}

function buildCalendarDays(year: number, monthIndex: number): (number | null)[] {
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  // Monday-start: Mon=0 … Sun=6
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatMonthLabel(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  return `${MONTH_NAMES[month]} ${year}`;
}

export default function RiggingSchedule() {
  const { token, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'installs' ? 'installs' : 'calendar';

  const [currentMonth, setCurrentMonth] = useState<string>('');
  const [viewMonth, setViewMonth] = useState<string>('');
  const [archivedMonths, setArchivedMonths] = useState<RiggingMonth[]>([]);
  const [installs, setInstalls] = useState<RiggingInstall[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RiggingJobOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const [threeDay, setThreeDay] = useState(false);

  function setTab(next: 'calendar' | 'installs') {
    if (next === 'installs') setSearchParams({ tab: 'installs' });
    else setSearchParams({});
  }

  const isArchivedView = viewMonth !== currentMonth && archivedMonths.some((m) => m.year_month === viewMonth);
  const readOnly = isArchivedView || !canEdit;

  const loadData = useCallback(async (silent = false) => {
    if (!token) return;
    try {
      if (!silent) setLoading(true);

      const [monthRes, archivedRes, editRes] = await Promise.all([
        window.tracker.riggingGetCurrentMonth(token),
        window.tracker.riggingListArchivedMonths(token),
        window.tracker.riggingCanEdit(token),
      ]);

      if ('error' in monthRes) {
        setError(monthRes.error);
        return;
      }

      const archived = 'error' in archivedRes ? [] : archivedRes;
      setCurrentMonth(monthRes.year_month);
      setArchivedMonths(archived);
      setCanEdit(isAdmin || !!user?.can_edit_rigging || editRes.can_edit);

      const ym = viewMonth || monthRes.year_month;
      if (!viewMonth) setViewMonth(monthRes.year_month);

      const installsRes = await window.tracker.riggingListInstalls(token, ym);
      if ('error' in installsRes) {
        setError(installsRes.error);
      } else {
        setInstalls((prev) => mergeList(prev, installsRes));
        setError('');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, viewMonth, isAdmin, user?.can_edit_rigging]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useDbSync(() => loadData(true), !!token);

  const { year, month } = useMemo(() => parseYearMonth(viewMonth || currentMonth || '2026-01'), [viewMonth, currentMonth]);
  const calendarDays = useMemo(() => buildCalendarDays(year, month), [year, month]);

  const installsByDate = useMemo(() => {
    const map = new Map<string, RiggingInstall[]>();
    for (const inst of installs) {
      for (const date of installSpanDates(inst.scheduled_date, inst.duration_days)) {
        if (viewMonth && !date.startsWith(viewMonth)) continue;
        const list = map.get(date) ?? [];
        list.push(inst);
        map.set(date, list);
      }
    }
    return map;
  }, [installs, viewMonth]);

  const selectedInstalls = selectedDay ? installsByDate.get(selectedDay) ?? [] : [];

  function goMonth(delta: number) {
    const { year: y, month: m } = parseYearMonth(viewMonth);
    const next = new Date(y, m + delta, 1);
    setViewMonth(formatYearMonth(next.getFullYear(), next.getMonth()));
  }

  function goToCurrentMonth() {
    if (currentMonth) setViewMonth(currentMonth);
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!token || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const res = await window.tracker.riggingSearchJobs(token, q.trim());
    setSearchResults('error' in res ? [] : res.filter((j) => !j.has_rigging));
    setSearching(false);
  }

  async function handleAddJob(job: RiggingJobOption) {
    if (!token || !selectedDay) return;
    setAddBusy(true);
    setAddError('');
    const res = await window.tracker.riggingAddInstall(token, {
      job_id: job.id,
      scheduled_date: selectedDay,
      duration_days: threeDay ? 3 : 1,
    });
    if ('error' in res) {
      setAddError(res.error);
    } else {
      setShowAdd(false);
      setSearchQuery('');
      setSearchResults([]);
      setThreeDay(false);
      loadData(true);
    }
    setAddBusy(false);
  }

  function closeDayModal() {
    setSelectedDay(null);
    setShowAdd(false);
    setSearchQuery('');
    setSearchResults([]);
    setAddError('');
    setThreeDay(false);
  }

  function openJobDetail(jobId: number) {
    closeDayModal();
    navigate(`/jobs/${jobId}`);
  }

  async function handleRemove(installId: number) {
    if (!token || readOnly) return;
    await window.tracker.riggingRemoveInstall(token, installId);
    loadData(true);
  }

  async function handleMove(install: RiggingInstall, newDate: string) {
    if (!token || readOnly) return;
    const res = await window.tracker.riggingUpdateInstall(token, {
      id: install.id,
      scheduled_date: newDate,
    });
    if (!('error' in res)) loadData(true);
  }

  async function handleDuration(install: RiggingInstall, durationDays: 1 | 3) {
    if (!token || readOnly) return;
    const res = await window.tracker.riggingUpdateInstall(token, {
      id: install.id,
      duration_days: durationDays,
    });
    if (!('error' in res)) loadData(true);
  }

  if (tab === 'calendar' && loading && !viewMonth) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-ink-10 border-t-brand animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ink-10 bg-canvas px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0">
              <h1 className="font-display text-base font-medium tracking-display text-ink sm:text-lg">
                Rigging
              </h1>
              <p className="hidden text-xs text-ink-40 sm:block">
                Calendar + daily install lists
              </p>
            </div>
          </div>

          <div className="flex items-center gap-0.5 rounded-lg bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setTab('calendar')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                tab === 'calendar' ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setTab('installs')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                tab === 'installs' ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Installs
            </button>
          </div>

          {tab === 'calendar' && isArchivedView && (
            <span className="rounded-pill bg-stage-production/15 px-2 py-0.5 text-[10px] font-medium text-stage-production">
              Archived — read only
            </span>
          )}
          {tab === 'calendar' && readOnly && !isArchivedView && (
            <span className="flex items-center gap-1 rounded-pill bg-ink-6 px-2 py-0.5 text-[10px] font-medium text-ink-55">
              <Lock className="h-3 w-3" />
              View only
            </span>
          )}
        </div>

        {tab === 'calendar' && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {archivedMonths.length > 0 && (
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(e.target.value)}
                className="jt-input !w-auto !py-1.5 text-sm"
              >
                <option value={currentMonth}>{formatMonthLabel(currentMonth)} (current)</option>
                {archivedMonths.map((m) => (
                  <option key={m.year_month} value={m.year_month}>
                    {formatMonthLabel(m.year_month)} (archived)
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1 rounded-lg border border-ink-10 bg-card p-0.5">
              <button type="button" onClick={() => goMonth(-1)} className="rounded-md p-1.5 text-ink-55 hover:bg-ink-6 hover:text-ink" aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[140px] px-2 text-center text-sm font-medium text-ink">
                {formatMonthLabel(viewMonth)}
              </span>
              <button type="button" onClick={() => goMonth(1)} className="rounded-md p-1.5 text-ink-55 hover:bg-ink-6 hover:text-ink" aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {viewMonth !== currentMonth && (
              <button type="button" onClick={goToCurrentMonth} className="jt-btn-ghost !py-1.5 text-xs">
                Today
              </button>
            )}
          </div>
        )}
      </div>

      {tab === 'installs' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <Installs embedded />
        </div>
      ) : (
        <>
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
          <div className="mb-1 grid shrink-0 grid-cols-7 gap-1.5">
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className={`py-1 text-center text-xs font-medium uppercase tracking-caps ${
                  i >= 5 ? 'text-danger' : 'text-ink-40'
                }`}
              >
                {wd}
              </div>
            ))}
          </div>

          <div
            className="grid min-h-0 min-w-0 flex-1 grid-cols-7 gap-1.5"
            style={{
              gridTemplateRows: `repeat(${Math.ceil(calendarDays.length / 7)}, minmax(0, 1fr))`,
            }}
          >
            {calendarDays.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="min-h-0 rounded-xl bg-ink-6/30" />;
              }

              const key = dateKey(year, month, day);
              const dayInstalls = installsByDate.get(key) ?? [];
              const weekend = isWeekend(year, month, day);
              const isToday =
                key ===
                `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(key)}
                  className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border p-1.5 text-left transition-colors sm:p-2 ${
                    weekend
                      ? 'border-danger/25 bg-danger/8 hover:bg-danger/12 dark:bg-danger/12 dark:hover:bg-danger/18'
                      : 'border-ink-10 bg-card hover:bg-surface-soft'
                  } ${isToday ? 'ring-2 ring-brand/40' : ''}`}
                >
                  <div
                    className={`mb-1 flex shrink-0 items-center justify-between gap-1 ${
                      weekend ? 'text-danger' : 'text-ink'
                    }`}
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:text-sm ${
                        isToday ? 'bg-brand text-white' : ''
                      }`}
                    >
                      {day}
                    </span>
                    {dayInstalls.length > 0 && (
                      <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                        {dayInstalls.length}
                      </span>
                    )}
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-0.5 overflow-hidden">
                    {dayInstalls.slice(0, CAL_DAY_EVENT_VISIBLE).map((inst) => (
                      <CalendarDayEvent
                        key={inst.id}
                        client={inst.client}
                        jobName={inst.job_name}
                        jobNo={inst.job_no}
                        weekend={weekend}
                        continued={key !== inst.scheduled_date}
                        badge={inst.duration_days === 3 && key === inst.scheduled_date ? '3d' : undefined}
                      />
                    ))}
                    {dayInstalls.length > CAL_DAY_EVENT_VISIBLE && (
                      <div className="shrink-0 truncate px-0.5 text-[9px] font-medium leading-none text-ink-55 sm:text-[10px]">
                        +{dayInstalls.length - CAL_DAY_EVENT_VISIBLE} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <AppModal
        open={!!selectedDay}
        onClose={closeDayModal}
        title={
          selectedDay
            ? new Date(selectedDay + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : ''
        }
        subtitle={
          selectedDay
            ? `${selectedInstalls.length} install${selectedInstalls.length !== 1 ? 's' : ''}`
            : undefined
        }
        footer={
          !readOnly && !showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="jt-btn-accent flex w-full items-center justify-center gap-2 !py-2"
            >
              <Plus className="h-4 w-4" />
              Add install
            </button>
          ) : undefined
        }
      >
        {selectedInstalls.length === 0 && !showAdd && (
          <p className="py-4 text-center text-sm text-ink-40">No installs scheduled for this day.</p>
        )}

        <ul className="space-y-2">
          {selectedInstalls.map((inst) => (
            <li key={inst.id} className="rounded-xl border border-ink-10 bg-card p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <button
                  type="button"
                  onClick={() => openJobDetail(inst.job_id)}
                  className="min-w-0 flex-1 text-left hover:text-brand"
                >
                  <p className="font-medium text-ink">
                    {[inst.job_no, inst.job_name].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {inst.duration_days === 3 && selectedDay !== inst.scheduled_date && (
                    <p className="text-xs text-ink-40">Continues from {inst.scheduled_date}</p>
                  )}
                </button>
                {!readOnly && (
                  <div className="flex shrink-0 items-center gap-1">
                    <input
                      type="date"
                      defaultValue={inst.scheduled_date}
                      onChange={(e) => {
                        if (e.target.value && e.target.value !== inst.scheduled_date) {
                          handleMove(inst, e.target.value);
                        }
                      }}
                      className="jt-input !w-full !py-1 text-xs sm:!w-auto"
                      title="Move to another day"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemove(inst.id)}
                      className="rounded-lg p-2 text-ink-40 hover:bg-danger/10 hover:text-danger"
                      title="Remove from schedule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {!readOnly && (
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-55">
                  <input
                    type="checkbox"
                    checked={inst.duration_days === 3}
                    onChange={() => handleDuration(inst, inst.duration_days === 3 ? 1 : 3)}
                  />
                  3-day install
                </label>
              )}
            </li>
          ))}
        </ul>

        {showAdd && !readOnly && (
          <div className="mt-4 rounded-xl border border-brand/25 bg-brand/5 p-4">
            <label className="jt-label">Search job to schedule</label>
            <label className="mb-2 flex items-center gap-2 text-xs text-ink-55">
              <input
                type="checkbox"
                checked={threeDay}
                onChange={(e) => setThreeDay(e.target.checked)}
              />
              3-day install
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Job #, name, or client…"
                className="jt-input !pl-9"
                autoFocus
              />
            </div>
            {addError && <p className="mt-2 text-sm text-danger">{addError}</p>}
            {searching && <p className="mt-2 text-xs text-ink-40">Searching…</p>}
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto overscroll-contain">
              {searchResults.map((job) => (
                <li key={job.id}>
                  <button
                    type="button"
                    disabled={addBusy}
                    onClick={() => handleAddJob(job)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-ink-6 disabled:opacity-50"
                  >
                    <span className="font-medium">{job.job_no}</span>
                    {job.client?.trim() ? (
                      <span className="text-ink-55"> — {job.client.trim()}</span>
                    ) : null}
                    {job.job_name ? (
                      <span className="text-ink-40"> · {job.job_name}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AppModal>
        </>
      )}
    </div>
  );
}
