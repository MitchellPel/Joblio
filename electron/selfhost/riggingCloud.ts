import type { RiggingInstallRow, RiggingMonthRow } from '../repositories/riggingRepo';
import { currentYearMonth, yearMonthFromDate } from '../repositories/riggingRepo';
import { sbFetch, sbJson } from './rest';
import { addCalendarDays, clampDurationDays, installSpanDates, monthOverlapRange } from '../utils/dates';

const INSTALL_SELECT =
  'id,job_id,scheduled_date,duration_days,note,created_by,created_at,jobs!inner(job_no,job_name,client,archived_at)';
const INSTALL_SELECT_ONE =
  'id,job_id,scheduled_date,duration_days,note,created_by,created_at,jobs!inner(job_no,job_name,client)';

function missingDurationColumn(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /duration_days/i.test(msg);
}

async function fetchInstallRows(query: Record<string, string>): Promise<any[]> {
  try {
    return await sbJson<any[]>('rigging_installs', { query });
  } catch (err) {
    if (!missingDurationColumn(err) || !query.select?.includes('duration_days')) throw err;
    return await sbJson<any[]>('rigging_installs', {
      query: { ...query, select: query.select.replace('duration_days,', '') },
    });
  }
}

function mapInstall(row: any): RiggingInstallRow {
  const job = row.jobs || {};
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    scheduled_date: String(row.scheduled_date).slice(0, 10),
    duration_days: clampDurationDays(row.duration_days),
    note: row.note ?? null,
    created_by: Number(row.created_by),
    created_at: row.created_at,
    job_no: job.job_no || '',
    job_name: job.job_name || '',
    client: job.client || '',
  };
}

export async function ensureRiggingMonthsCloud(): Promise<void> {
  const current = currentYearMonth();
  await sbFetch('rigging_months', {
    method: 'POST',
    query: { on_conflict: 'year_month' },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ year_month: current, status: 'active' }),
  });

  const stale = await sbJson<any[]>('rigging_months', {
    query: {
      select: 'year_month',
      status: 'eq.active',
      year_month: `lt.${current}`,
    },
  });
  for (const row of stale) {
    await sbFetch('rigging_months', {
      method: 'PATCH',
      query: { year_month: `eq.${row.year_month}` },
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'archived', archived_at: new Date().toISOString() }),
    });
  }
}

export async function listArchivedMonthsCloud(): Promise<RiggingMonthRow[]> {
  const rows = await sbJson<any[]>('rigging_months', {
    query: {
      select: 'year_month,status,archived_at',
      status: 'eq.archived',
      order: 'year_month.desc',
    },
  });
  return rows.map((r) => ({
    year_month: r.year_month,
    status: r.status,
    archived_at: r.archived_at ?? null,
  }));
}

export async function isArchivedMonthCloud(yearMonth: string): Promise<boolean> {
  const rows = await sbJson<any[]>('rigging_months', {
    query: {
      select: 'status',
      year_month: `eq.${yearMonth}`,
      limit: '1',
    },
  });
  return rows[0]?.status === 'archived';
}

export async function listInstallsForMonthCloud(yearMonth: string): Promise<RiggingInstallRow[]> {
  const { from, to } = monthOverlapRange(yearMonth);
  const rows = await fetchInstallRows({
    select: INSTALL_SELECT,
    and: `(scheduled_date.gte.${from},scheduled_date.lte.${to})`,
    'jobs.archived_at': 'is.null',
    order: 'scheduled_date,job_id',
  });
  return rows
    .filter((r) => !r.jobs?.archived_at)
    .map(mapInstall)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.job_no.localeCompare(b.job_no));
}

export async function listInstallsForDateCloud(date: string): Promise<RiggingInstallRow[]> {
  const from = addCalendarDays(date, -2);
  const rows = await fetchInstallRows({
    select: INSTALL_SELECT,
    and: `(scheduled_date.gte.${from},scheduled_date.lte.${date})`,
    'jobs.archived_at': 'is.null',
    order: 'job_id',
  });
  return rows
    .filter((r) => !r.jobs?.archived_at)
    .map(mapInstall)
    .filter((inst) => installSpanDates(inst.scheduled_date, inst.duration_days).includes(date));
}

async function getInstallByIdCloud(id: number): Promise<RiggingInstallRow | undefined> {
  const rows = await fetchInstallRows({
    select: INSTALL_SELECT_ONE,
    id: `eq.${id}`,
    limit: '1',
  });
  return rows[0] ? mapInstall(rows[0]) : undefined;
}

export async function addInstallCloud(
  jobId: number,
  scheduledDate: string,
  createdBy: number,
  note?: string | null,
  durationDays?: number | null
): Promise<RiggingInstallRow> {
  const duration = clampDurationDays(durationDays);
  const payload: Record<string, unknown> = {
    job_id: jobId,
    scheduled_date: scheduledDate,
    note: note ?? null,
    created_by: createdBy,
    duration_days: duration,
  };
  let rows: any[];
  try {
    rows = await sbJson<any[]>('rigging_installs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (!missingDurationColumn(err)) throw err;
    if (duration === 3) {
      throw new Error('Apply add_calendar_notes.sql on the Joblio server to use 3-day installs.');
    }
    delete payload.duration_days;
    rows = await sbJson<any[]>('rigging_installs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
  }
  const created = Array.isArray(rows) ? rows[0] : rows;
  const full = await getInstallByIdCloud(Number(created.id));
  if (!full) throw new Error('Failed to load new rigging install.');
  return full;
}

export async function updateInstallCloud(
  id: number,
  fields: { scheduled_date?: string; note?: string | null; duration_days?: number | null }
): Promise<RiggingInstallRow | undefined> {
  const patch: Record<string, unknown> = {};
  if (fields.scheduled_date !== undefined) patch.scheduled_date = fields.scheduled_date;
  if (fields.note !== undefined) patch.note = fields.note;
  if (fields.duration_days !== undefined) patch.duration_days = clampDurationDays(fields.duration_days);
  if (Object.keys(patch).length === 0) return getInstallByIdCloud(id);

  const res = await sbFetch('rigging_installs', {
    method: 'PATCH',
    query: { id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text();
    if (fields.duration_days !== undefined && /duration_days/i.test(text)) {
      throw new Error('Apply add_calendar_notes.sql on the Joblio server to use 3-day installs.');
    }
    throw new Error(`update install ${res.status}: ${text}`);
  }
  return getInstallByIdCloud(id);
}

export async function removeInstallCloud(id: number): Promise<void> {
  await sbFetch('rigging_installs', {
    method: 'DELETE',
    query: { id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
  });
}

export async function searchJobsForRiggingCloud(
  query: string,
  limit = 20
): Promise<
  { id: number; job_no: string; job_name: string; client: string; stage: string; has_rigging: boolean }[]
> {
  const q = query.trim();
  if (!q) return [];
  const jobs = await sbJson<any[]>('jobs', {
    query: {
      select: 'id,job_no,job_name,client,stage',
      archived_at: 'is.null',
      or: `(job_no.ilike.%${q.replace(/[%(),]/g, '')}%,job_name.ilike.%${q.replace(/[%(),]/g, '')}%,client.ilike.%${q.replace(/[%(),]/g, '')}%)`,
      order: 'job_no.desc',
      limit: String(limit),
    },
  });
  const installs = await sbJson<any[]>('rigging_installs', {
    query: { select: 'job_id' },
  });
  const onCal = new Set(installs.map((r) => Number(r.job_id)));
  return jobs.map((j) => ({
    id: Number(j.id),
    job_no: j.job_no,
    job_name: j.job_name || '',
    client: j.client || '',
    stage: j.stage,
    has_rigging: onCal.has(Number(j.id)),
  }));
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function ensureJobOnRiggingScheduleCloud(
  jobId: number,
  createdBy: number
): Promise<RiggingInstallRow | null> {
  const existing = await sbJson<any[]>('rigging_installs', {
    query: { select: 'id', job_id: `eq.${jobId}`, limit: '1' },
  });
  if (existing[0]) return null;

  const jobs = await sbJson<any[]>('jobs', {
    query: {
      select: 'due_date',
      id: `eq.${jobId}`,
      archived_at: 'is.null',
      limit: '1',
    },
  });
  if (!jobs[0]) return null;

  const scheduled =
    jobs[0].due_date && String(jobs[0].due_date).trim()
      ? String(jobs[0].due_date).slice(0, 10)
      : formatLocalDate(new Date());

  await ensureRiggingMonthsCloud();
  try {
    return await addInstallCloud(jobId, scheduled, createdBy, 'Auto-scheduled');
  } catch {
    return null;
  }
}

export async function syncInstallJobsToRiggingCloud(createdBy: number): Promise<number> {
  const jobs = await sbJson<any[]>('jobs', {
    query: {
      select: 'id',
      archived_at: 'is.null',
      stage: 'eq.install',
    },
  });
  const installs = await sbJson<any[]>('rigging_installs', {
    query: { select: 'job_id' },
  });
  const onCal = new Set(installs.map((r) => Number(r.job_id)));
  let added = 0;
  for (const j of jobs) {
    const id = Number(j.id);
    if (onCal.has(id)) continue;
    if (await ensureJobOnRiggingScheduleCloud(id, createdBy)) added++;
  }
  return added;
}

export async function syncJobDueDateToRiggingCloud(
  jobId: number,
  dueDate: string | null,
  stage: string,
  createdBy: number
): Promise<void> {
  if (stage !== 'install') return;
  const existing = await sbJson<any[]>('rigging_installs', {
    query: { select: 'id', job_id: `eq.${jobId}`, limit: '1' },
  });

  if (!dueDate) {
    if (!existing[0]) await ensureJobOnRiggingScheduleCloud(jobId, createdBy);
    return;
  }

  const date = dueDate.slice(0, 10);
  if (existing[0]) {
    await updateInstallCloud(Number(existing[0].id), { scheduled_date: date });
  } else {
    await ensureRiggingMonthsCloud();
    try {
      await addInstallCloud(jobId, date, createdBy, 'Auto-scheduled');
    } catch {
      // ignore unique conflicts
    }
  }
}

export type UpcomingInstallCloud = {
  install_id: number;
  job_id: number;
  scheduled_date: string;
  job_no: string;
  job_name: string;
  client: string;
  days_until: number;
};

function formatLocalDateCloud(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calendarDaysBetweenCloud(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export async function getUpcomingInstallsCloud(): Promise<UpcomingInstallCloud[]> {
  const today = formatLocalDateCloud(new Date());
  const rows = await sbJson<any[]>('rigging_installs', {
    query: {
      select: 'id,job_id,scheduled_date,jobs(job_no,job_name,client,archived_at)',
      scheduled_date: `gte.${today}`,
      order: 'scheduled_date.asc',
    },
  });

  const out: UpcomingInstallCloud[] = [];
  for (const row of rows) {
    const job = row.jobs || {};
    if (job.archived_at) continue;
    const scheduled = String(row.scheduled_date).slice(0, 10);
    out.push({
      install_id: Number(row.id),
      job_id: Number(row.job_id),
      scheduled_date: scheduled,
      job_no: job.job_no || '',
      job_name: job.job_name || '',
      client: job.client || '',
      days_until: calendarDaysBetweenCloud(today, scheduled),
    });
  }
  return out;
}

export async function wasAlertSentCloud(
  userId: number,
  installId: number,
  alertType: string,
  alertDate: string
): Promise<boolean> {
  const rows = await sbJson<any[]>('rigging_alerts_sent', {
    query: {
      select: 'id',
      user_id: `eq.${userId}`,
      install_id: `eq.${installId}`,
      alert_type: `eq.${alertType}`,
      alert_date: `eq.${alertDate}`,
      limit: '1',
    },
  });
  return rows.length > 0;
}

export async function recordAlertSentCloud(
  userId: number,
  installId: number,
  alertType: string,
  alertDate: string
): Promise<void> {
  const res = await sbFetch('rigging_alerts_sent', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify({
      user_id: userId,
      install_id: installId,
      alert_type: alertType,
      alert_date: alertDate,
    }),
  });
  // Unique conflict = already recorded for this day — treat as success
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`record alert ${res.status}: ${text}`);
  }
}

export { currentYearMonth, yearMonthFromDate };
