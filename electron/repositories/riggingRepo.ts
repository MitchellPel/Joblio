import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';
import { addCalendarDays, clampDurationDays, monthOverlapRange } from '../utils/dates';

export type RiggingAlertType = '5day' | '2day' | 'dayof';

export interface RiggingInstallRow {
  id: number;
  job_id: number;
  scheduled_date: string;
  duration_days: 1 | 3;
  note: string | null;
  created_by: number;
  created_at: string;
  job_no: string;
  job_name: string;
  client: string;
}

export interface RiggingMonthRow {
  year_month: string;
  status: 'active' | 'archived';
  archived_at: string | null;
}

export function yearMonthFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function currentYearMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Ensure the current month is active and auto-archive any prior active months. */
export function ensureRiggingMonths(): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const current = currentYearMonth();

  h.run(
    `INSERT OR IGNORE INTO rigging_months (year_month, status) VALUES (?, 'active')`,
    [current]
  );

  const stale = h.all(
    `SELECT year_month FROM rigging_months
     WHERE status = 'active' AND year_month < ?`,
    [current]
  ) as { year_month: string }[];

  for (const row of stale) {
    h.run(
      `UPDATE rigging_months SET status = 'archived', archived_at = datetime('now')
       WHERE year_month = ?`,
      [row.year_month]
    );
  }
}

export function listArchivedMonths(): RiggingMonthRow[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT year_month, status, archived_at FROM rigging_months
     WHERE status = 'archived'
     ORDER BY year_month DESC`
  ) as RiggingMonthRow[];
}

const INSTALL_SELECT = `SELECT ri.id, ri.job_id, ri.scheduled_date, ri.note, ri.created_by, ri.created_at,
            IFNULL(ri.duration_days, 1) AS duration_days,
            j.job_no, j.job_name, j.client
     FROM rigging_installs ri
     JOIN jobs j ON j.id = ri.job_id`;

function mapInstallRow(row: Record<string, unknown>): RiggingInstallRow {
  return {
    ...(row as unknown as RiggingInstallRow),
    duration_days: clampDurationDays(row.duration_days),
    scheduled_date: String(row.scheduled_date).slice(0, 10),
  };
}

export function listInstallsForMonth(yearMonth: string): RiggingInstallRow[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const { from, to } = monthOverlapRange(yearMonth);
  return (h.all(
    `${INSTALL_SELECT}
     WHERE ri.scheduled_date >= ?
       AND ri.scheduled_date <= ?
       AND j.archived_at IS NULL
     ORDER BY ri.scheduled_date, j.job_no`,
    [from, to]
  ) as Record<string, unknown>[]).map(mapInstallRow);
}

export function listInstallsForDate(date: string): RiggingInstallRow[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const prev1 = addCalendarDays(date, -1);
  const prev2 = addCalendarDays(date, -2);
  return (h.all(
    `${INSTALL_SELECT}
     WHERE j.archived_at IS NULL
       AND (
         ri.scheduled_date = ?
         OR (IFNULL(ri.duration_days, 1) = 3 AND ri.scheduled_date IN (?, ?))
       )
     ORDER BY j.client, j.job_no`,
    [date, prev1, prev2]
  ) as Record<string, unknown>[]).map(mapInstallRow);
}

export function isArchivedMonth(yearMonth: string): boolean {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const row = h.get('SELECT status FROM rigging_months WHERE year_month = ?', [yearMonth]) as
    | { status: string }
    | undefined;
  return row?.status === 'archived';
}

export function addInstall(
  jobId: number,
  scheduledDate: string,
  createdBy: number,
  note?: string | null,
  durationDays?: number | null
): RiggingInstallRow {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const duration = clampDurationDays(durationDays);
  const result = h.run(
    `INSERT INTO rigging_installs (job_id, scheduled_date, note, created_by, duration_days)
     VALUES (?, ?, ?, ?, ?)`,
    [jobId, scheduledDate, note ?? null, createdBy, duration]
  );

  return getInstallById(result.lastInsertRowid)!;
}

/**
 * Put a job on the rigging calendar if it isn't already.
 * Uses due_date when set, otherwise today.
 */
export function ensureJobOnRiggingSchedule(
  jobId: number,
  createdBy: number
): RiggingInstallRow | null {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const existing = h.get(`SELECT id FROM rigging_installs WHERE job_id = ?`, [jobId]);
  if (existing) return null;

  const job = h.get(
    `SELECT due_date FROM jobs WHERE id = ? AND archived_at IS NULL`,
    [jobId]
  ) as { due_date: string | null } | undefined;
  if (!job) return null;

  const scheduled =
    job.due_date && String(job.due_date).trim()
      ? String(job.due_date).slice(0, 10)
      : formatLocalDate(new Date());

  ensureRiggingMonths();
  try {
    return addInstall(jobId, scheduled, createdBy, 'Auto-scheduled');
  } catch {
    return null;
  }
}

/** Jobs already in Install stage but missing from the rigging calendar. */
export function syncInstallJobsToRigging(createdBy: number): number {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const missing = h.all(
    `SELECT j.id AS id
     FROM jobs j
     LEFT JOIN rigging_installs ri ON ri.job_id = j.id
     WHERE j.archived_at IS NULL
       AND j.stage = 'install'
       AND ri.id IS NULL`
  ) as { id: number }[];

  let added = 0;
  for (const row of missing) {
    if (ensureJobOnRiggingSchedule(row.id, createdBy)) added++;
  }
  return added;
}

/** Keep rigging date in sync when a job's due date changes (install stage only). */
export function syncJobDueDateToRigging(
  jobId: number,
  dueDate: string | null,
  stage: string,
  createdBy: number
): void {
  if (stage !== 'install') return;
  const db = getDatabase();
  const h = createDbHelpers(db);
  const existing = h.get(`SELECT id FROM rigging_installs WHERE job_id = ?`, [jobId]) as
    | { id: number }
    | undefined;

  if (!dueDate) {
    if (!existing) ensureJobOnRiggingSchedule(jobId, createdBy);
    return;
  }

  const date = dueDate.slice(0, 10);
  if (existing) {
    h.run(`UPDATE rigging_installs SET scheduled_date = ? WHERE id = ?`, [date, existing.id]);
  } else {
    ensureRiggingMonths();
    try {
      addInstall(jobId, date, createdBy, 'Auto-scheduled');
    } catch {
      // ignore unique conflicts
    }
  }
}

export function updateInstall(
  id: number,
  fields: { scheduled_date?: string; note?: string | null; duration_days?: number | null }
): RiggingInstallRow | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const sets: string[] = [];
  const params: unknown[] = [];

  if (fields.scheduled_date !== undefined) {
    sets.push('scheduled_date = ?');
    params.push(fields.scheduled_date);
  }
  if (fields.note !== undefined) {
    sets.push('note = ?');
    params.push(fields.note);
  }
  if (fields.duration_days !== undefined) {
    sets.push('duration_days = ?');
    params.push(clampDurationDays(fields.duration_days));
  }
  if (sets.length === 0) return getInstallById(id);

  params.push(id);
  h.run(`UPDATE rigging_installs SET ${sets.join(', ')} WHERE id = ?`, params);
  return getInstallById(id);
}

export function getInstallById(id: number): RiggingInstallRow | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const row = h.get(`${INSTALL_SELECT} WHERE ri.id = ?`, [id]) as Record<string, unknown> | undefined;
  return row ? mapInstallRow(row) : undefined;
}

export function removeInstall(id: number): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run('DELETE FROM rigging_installs WHERE id = ?', [id]);
}

export function searchJobsForRigging(query: string, limit = 20): {
  id: number;
  job_no: string;
  job_name: string;
  client: string;
  stage: string;
  has_rigging: boolean;
}[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const q = `%${query.trim()}%`;
  return h.all(
    `SELECT j.id, j.job_no, j.job_name, j.client, j.stage,
            CASE WHEN ri.id IS NOT NULL THEN 1 ELSE 0 END AS has_rigging
     FROM jobs j
     LEFT JOIN rigging_installs ri ON ri.job_id = j.id
     WHERE j.archived_at IS NULL
       AND (j.job_no LIKE ? OR j.job_name LIKE ? OR j.client LIKE ?)
     ORDER BY j.job_no DESC
     LIMIT ?`,
    [q, q, q, limit]
  ).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    job_no: row.job_no as string,
    job_name: row.job_name as string,
    client: row.client as string,
    stage: row.stage as string,
    has_rigging: !!(row.has_rigging as number),
  }));
}

export interface UpcomingInstall {
  install_id: number;
  job_id: number;
  scheduled_date: string;
  job_no: string;
  job_name: string;
  client: string;
  days_until: number;
}

export function getUpcomingInstalls(): UpcomingInstall[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const today = formatLocalDate(new Date());

  const rows = h.all(
    `SELECT ri.id AS install_id, ri.job_id, ri.scheduled_date,
            j.job_no, j.job_name, j.client
     FROM rigging_installs ri
     JOIN jobs j ON j.id = ri.job_id
     WHERE j.archived_at IS NULL
       AND ri.scheduled_date >= ?
     ORDER BY ri.scheduled_date`,
    [today]
  ) as Omit<UpcomingInstall, 'days_until'>[];

  return rows.map((row) => ({
    ...row,
    days_until: calendarDaysBetween(today, row.scheduled_date),
  }));
}

export function wasAlertSent(
  userId: number,
  installId: number,
  alertType: RiggingAlertType,
  alertDate: string
): boolean {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const row = h.get(
    `SELECT id FROM rigging_alerts_sent
     WHERE user_id = ? AND install_id = ? AND alert_type = ? AND alert_date = ?`,
    [userId, installId, alertType, alertDate]
  );
  return !!row;
}

export function recordAlertSent(
  userId: number,
  installId: number,
  alertType: RiggingAlertType,
  alertDate: string
): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run(
    `INSERT OR IGNORE INTO rigging_alerts_sent (user_id, install_id, alert_type, alert_date)
     VALUES (?, ?, ?, ?)`,
    [userId, installId, alertType, alertDate]
  );
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Calendar-day difference from fromDate to toDate (toDate - fromDate). */
export function calendarDaysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export function alertTypeForDays(daysUntil: number): RiggingAlertType | null {
  if (daysUntil === 5) return '5day';
  if (daysUntil === 2) return '2day';
  if (daysUntil === 0) return 'dayof';
  return null;
}

export function alertMessage(alertType: RiggingAlertType, install: UpcomingInstall): string {
  const label = `${install.job_no} — ${install.client}${install.job_name ? ` (${install.job_name})` : ''}`;
  const dateLabel = formatDisplayDate(install.scheduled_date);
  switch (alertType) {
    case '5day':
      return `Install in 5 days (${dateLabel}): ${label}`;
    case '2day':
      return `Install in 2 days (${dateLabel}): ${label}`;
    case 'dayof':
      return `Install today: ${label}`;
  }
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]}`;
}
