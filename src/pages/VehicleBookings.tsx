import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Truck, Plus, Trash2, Lock, Search } from 'lucide-react';
import type { VehicleBooking, VehicleBookingMonth } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';
import { mergeList } from '../utils/mergeList';
import AppModal from '../components/AppModal';
import CalendarDayEvent, { CAL_DAY_EVENT_VISIBLE } from '../components/CalendarDayEvent';
import {
  WEEKDAYS,
  buildCalendarDays,
  dateKey,
  formatMonthLabel,
  formatYearMonth,
  isWeekend,
  parseYearMonth,
  todayKey,
} from '../utils/calendarGrid';

type JobOption = {
  id: number;
  job_no: string;
  job_name: string;
  client: string;
  stage: string;
  has_booking: boolean;
};

type UnbookedJob = {
  id: number;
  job_no: string;
  job_name: string;
  client: string;
  stage: string;
  due_date: string | null;
};

type DragPayload =
  | { kind: 'job'; job_id: number }
  | { kind: 'booking'; id: number; job_id: number };

function parseDragPayload(raw: string): DragPayload | null {
  try {
    const data = JSON.parse(raw) as DragPayload;
    if (data?.kind === 'job' && typeof data.job_id === 'number') return data;
    if (data?.kind === 'booking' && typeof data.id === 'number') return data;
    return null;
  } catch {
    return null;
  }
}

function jobChipLabel(job: { job_no: string; job_name: string }) {
  return [job.job_no, job.job_name].filter(Boolean).join(' · ') || 'Vehicle job';
}

export default function VehicleBookings() {
  const { token, isAdmin, user } = useAuth();
  const navigate = useNavigate();

  const [currentMonth, setCurrentMonth] = useState('');
  const [viewMonth, setViewMonth] = useState('');
  const [archivedMonths, setArchivedMonths] = useState<VehicleBookingMonth[]>([]);
  const [bookings, setBookings] = useState<VehicleBooking[]>([]);
  const [unbooked, setUnbooked] = useState<UnbookedJob[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<JobOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');

  const isArchivedView =
    viewMonth !== currentMonth && archivedMonths.some((m) => m.year_month === viewMonth);
  const readOnly = isArchivedView || !canEdit;

  const loadData = useCallback(
    async (silent = false) => {
      if (!token) return;
      try {
        if (!silent) setLoading(true);
        const [monthRes, archivedRes, editRes, unbookedRes] = await Promise.all([
          window.tracker.vehiclesGetCurrentMonth(token),
          window.tracker.vehiclesListArchivedMonths(token),
          window.tracker.vehiclesCanEdit(token),
          window.tracker.vehiclesListUnbookedJobs(token),
        ]);

        if ('error' in monthRes) {
          setError(monthRes.error);
          return;
        }

        const archived = 'error' in archivedRes ? [] : archivedRes;
        setCurrentMonth(monthRes.year_month);
        setArchivedMonths(archived);
        const editOk = !('error' in editRes) && editRes.can_edit;
        setCanEdit(isAdmin || !!user?.can_edit_vehicle_bookings || editOk);
        setUnbooked('error' in unbookedRes ? [] : unbookedRes);

        const ym = viewMonth || monthRes.year_month;
        if (!viewMonth) setViewMonth(monthRes.year_month);

        const bookingsRes = await window.tracker.vehiclesListBookings(token, ym);
        if ('error' in bookingsRes) {
          setError(bookingsRes.error);
        } else {
          setBookings((prev) => mergeList(prev, bookingsRes));
          setError('');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load vehicle bookings');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token, viewMonth, isAdmin, user?.can_edit_vehicle_bookings]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useDbSync(() => loadData(true), !!token);

  const { year, month } = useMemo(
    () => parseYearMonth(viewMonth || currentMonth || '2026-01'),
    [viewMonth, currentMonth]
  );
  const calendarDays = useMemo(() => buildCalendarDays(year, month), [year, month]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, VehicleBooking[]>();
    for (const b of bookings) {
      const list = map.get(b.scheduled_date) ?? [];
      list.push(b);
      map.set(b.scheduled_date, list);
    }
    return map;
  }, [bookings]);

  const selectedBookings = selectedDay ? bookingsByDate.get(selectedDay) ?? [] : [];

  function goMonth(delta: number) {
    const { year: y, month: m } = parseYearMonth(viewMonth);
    const next = new Date(y, m + delta, 1);
    setViewMonth(formatYearMonth(next.getFullYear(), next.getMonth()));
  }

  function goToCurrentMonth() {
    if (currentMonth) setViewMonth(currentMonth);
  }

  function closeDayModal() {
    setSelectedDay(null);
    setShowAdd(false);
    setSearchQuery('');
    setSearchResults([]);
    setAddError('');
  }

  function openJobDetail(jobId: number) {
    closeDayModal();
    navigate(`/jobs/${jobId}`);
  }

  function setDragData(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData('text/plain', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!token || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const res = await window.tracker.vehiclesSearchJobs(token, q.trim());
    setSearchResults('error' in res ? [] : res.filter((j) => !j.has_booking));
    setSearching(false);
  }

  async function handleAddJob(job: JobOption) {
    if (!token || !selectedDay) return;
    setAddBusy(true);
    setAddError('');
    const res = await window.tracker.vehiclesAddBooking(token, {
      job_id: job.id,
      scheduled_date: selectedDay,
    });
    if ('error' in res) {
      setAddError(res.error);
    } else {
      setShowAdd(false);
      setSearchQuery('');
      setSearchResults([]);
      loadData(true);
    }
    setAddBusy(false);
  }

  async function handleRemove(id: number) {
    if (!token || readOnly) return;
    await window.tracker.vehiclesRemoveBooking(token, id);
    loadData(true);
  }

  async function handleMove(booking: VehicleBooking, newDate: string) {
    if (!token || readOnly) return;
    const res = await window.tracker.vehiclesUpdateBooking(token, {
      id: booking.id,
      scheduled_date: newDate,
    });
    if ('error' in res) setError(res.error);
    else loadData(true);
  }

  async function handleDropOnDay(date: string, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverDay(null);
    if (!token || readOnly) return;
    const payload = parseDragPayload(e.dataTransfer.getData('text/plain'));
    if (!payload) return;

    if (payload.kind === 'job') {
      const res = await window.tracker.vehiclesAddBooking(token, {
        job_id: payload.job_id,
        scheduled_date: date,
      });
      if ('error' in res) setError(res.error);
      else {
        setError('');
        loadData(true);
      }
      return;
    }

    const current = bookings.find((b) => b.id === payload.id);
    if (current?.scheduled_date === date) return;
    const res = await window.tracker.vehiclesUpdateBooking(token, {
      id: payload.id,
      scheduled_date: date,
    });
    if ('error' in res) setError(res.error);
    else {
      setError('');
      loadData(true);
    }
  }

  if (loading && !viewMonth) {
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
            <Truck className="h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0">
              <h1 className="font-display text-base font-medium tracking-display text-ink sm:text-lg">
                Vehicle Bookings
              </h1>
              <p className="hidden text-xs text-ink-40 sm:block">
                Drag vehicle jobs onto a day — due date follows
              </p>
            </div>
          </div>

          {isArchivedView && (
            <span className="rounded-pill bg-stage-production/15 px-2 py-0.5 text-[10px] font-medium text-stage-production">
              Archived — read only
            </span>
          )}
          {readOnly && !isArchivedView && (
            <span className="flex items-center gap-1 rounded-pill bg-ink-6 px-2 py-0.5 text-[10px] font-medium text-ink-55">
              <Lock className="h-3 w-3" />
              View only
            </span>
          )}
        </div>

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
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="rounded-md p-1.5 text-ink-55 hover:bg-ink-6 hover:text-ink"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] px-2 text-center text-sm font-medium text-ink">
              {formatMonthLabel(viewMonth)}
            </span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="rounded-md p-1.5 text-ink-55 hover:bg-ink-6 hover:text-ink"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {viewMonth !== currentMonth && (
            <button type="button" onClick={goToCurrentMonth} className="jt-btn-ghost !py-1.5 text-xs">
              Today
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-52 shrink-0 flex-col border-r border-ink-10 bg-surface-soft/40 sm:w-56">
          <div className="shrink-0 border-b border-ink-10 px-3 py-2">
            <p className="text-xs font-medium text-ink">Unbooked vehicles</p>
            <p className="text-[10px] text-ink-40">
              {readOnly ? `${unbooked.length} waiting` : 'Drag onto a day'}
            </p>
          </div>
          <div className="jt-scroll min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
            {unbooked.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-ink-40">All vehicle jobs are booked.</p>
            ) : (
              unbooked.map((job) => (
                <div
                  key={job.id}
                  draggable={!readOnly}
                  onDragStart={(e) => {
                    if (readOnly) {
                      e.preventDefault();
                      return;
                    }
                    setDragData(e, { kind: 'job', job_id: job.id });
                  }}
                  className={`rounded-lg border border-ink-10 bg-card px-2 py-1.5 text-left ${
                    readOnly ? '' : 'cursor-grab active:cursor-grabbing'
                  }`}
                  title={jobChipLabel(job)}
                >
                  <p className="truncate text-xs font-medium text-ink">{job.job_no}</p>
                  <p className="truncate text-[11px] text-ink-55">{job.job_name || '—'}</p>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
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
                const dayBookings = bookingsByDate.get(key) ?? [];
                const weekend = isWeekend(year, month, day);
                const isToday = key === todayKey();
                const isDropTarget = dragOverDay === key;

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDay(key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedDay(key);
                    }}
                    onDragOver={(e) => {
                      if (readOnly) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverDay(key);
                    }}
                    onDragLeave={() => {
                      setDragOverDay((cur) => (cur === key ? null : cur));
                    }}
                    onDrop={(e) => handleDropOnDay(key, e)}
                    className={`flex min-h-0 min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border p-1.5 text-left transition-colors sm:p-2 ${
                      weekend
                        ? 'border-danger/25 bg-danger/8 hover:bg-danger/12 dark:bg-danger/12 dark:hover:bg-danger/18'
                        : 'border-ink-10 bg-card hover:bg-surface-soft'
                    } ${isToday ? 'ring-2 ring-brand/40' : ''} ${
                      isDropTarget ? 'ring-2 ring-brand' : ''
                    }`}
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
                      {dayBookings.length > 0 && (
                        <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                          {dayBookings.length}
                        </span>
                      )}
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-start gap-0.5 overflow-hidden">
                      {dayBookings.slice(0, CAL_DAY_EVENT_VISIBLE).map((b) => (
                        <div
                          key={b.id}
                          draggable={!readOnly}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            if (readOnly) {
                              e.preventDefault();
                              return;
                            }
                            setDragData(e, { kind: 'booking', id: b.id, job_id: b.job_id });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CalendarDayEvent
                            client={b.client}
                            jobName={b.job_name}
                            jobNo={b.job_no}
                            weekend={weekend}
                          />
                        </div>
                      ))}
                      {dayBookings.length > CAL_DAY_EVENT_VISIBLE && (
                        <div className="shrink-0 truncate px-0.5 text-[9px] font-medium leading-none text-ink-55 sm:text-[10px]">
                          +{dayBookings.length - CAL_DAY_EVENT_VISIBLE} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
            ? `${selectedBookings.length} booking${selectedBookings.length !== 1 ? 's' : ''}`
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
              Add booking
            </button>
          ) : undefined
        }
      >
        {selectedBookings.length === 0 && !showAdd && (
          <p className="py-4 text-center text-sm text-ink-40">No bookings for this day.</p>
        )}

        <ul className="space-y-2">
          {selectedBookings.map((b) => (
            <li key={b.id} className="rounded-xl border border-ink-10 bg-card p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <button
                  type="button"
                  onClick={() => openJobDetail(b.job_id)}
                  className="min-w-0 flex-1 text-left hover:text-brand"
                >
                  <p className="font-medium text-ink">{[b.job_no, b.job_name].filter(Boolean).join(' · ') || '—'}</p>
                </button>
                {!readOnly && (
                  <div className="flex shrink-0 items-center gap-1">
                    <input
                      type="date"
                      defaultValue={b.scheduled_date}
                      onChange={(e) => {
                        if (e.target.value && e.target.value !== b.scheduled_date) {
                          handleMove(b, e.target.value);
                        }
                      }}
                      className="jt-input !w-full !py-1 text-xs sm:!w-auto"
                      title="Move to another day"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemove(b.id)}
                      className="rounded-lg p-2 text-ink-40 hover:bg-danger/10 hover:text-danger"
                      title="Remove booking"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {showAdd && !readOnly && (
          <div className="mt-4 rounded-xl border border-brand/25 bg-brand/5 p-4">
            <label className="jt-label">Search vehicle job to schedule</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Job # or name…"
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
                    {job.job_name ? <span className="text-ink-40"> · {job.job_name}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </AppModal>
    </div>
  );
}
