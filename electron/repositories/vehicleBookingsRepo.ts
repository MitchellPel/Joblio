import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';

export interface VehicleBookingRow {
  id: number;
  job_id: number;
  scheduled_date: string;
  note: string | null;
  created_by: number;
  created_at: string;
  created_name: string | null;
  job_no: string;
  job_name: string;
  client: string;
}

export interface VehicleBookingMonthRow {
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

export function ensureVehicleBookingMonths(): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const current = currentYearMonth();

  h.run(
    `INSERT OR IGNORE INTO vehicle_booking_months (year_month, status) VALUES (?, 'active')`,
    [current]
  );

  const stale = h.all(
    `SELECT year_month FROM vehicle_booking_months
     WHERE status = 'active' AND year_month < ?`,
    [current]
  ) as { year_month: string }[];

  for (const row of stale) {
    h.run(
      `UPDATE vehicle_booking_months SET status = 'archived', archived_at = datetime('now')
       WHERE year_month = ?`,
      [row.year_month]
    );
  }
}

export function listArchivedVehicleMonths(): VehicleBookingMonthRow[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT year_month, status, archived_at FROM vehicle_booking_months
     WHERE status = 'archived'
     ORDER BY year_month DESC`
  ) as VehicleBookingMonthRow[];
}

export function isArchivedVehicleMonth(yearMonth: string): boolean {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const row = h.get('SELECT status FROM vehicle_booking_months WHERE year_month = ?', [yearMonth]) as
    | { status: string }
    | undefined;
  return row?.status === 'archived';
}

const BOOKING_SELECT = `
  SELECT vb.id, vb.job_id, vb.scheduled_date, vb.note,
         vb.created_by, vb.created_at,
         u.full_name AS created_name,
         j.job_no AS job_no,
         j.job_name AS job_name,
         j.client AS client
  FROM vehicle_bookings vb
  JOIN jobs j ON j.id = vb.job_id
  LEFT JOIN users u ON u.id = vb.created_by`;

export function listBookingsForMonth(yearMonth: string): VehicleBookingRow[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `${BOOKING_SELECT}
     WHERE vb.scheduled_date LIKE ?
     ORDER BY vb.scheduled_date, j.job_no`,
    [`${yearMonth}-%`]
  ) as VehicleBookingRow[];
}

export function getBooking(id: number): VehicleBookingRow | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.get(`${BOOKING_SELECT} WHERE vb.id = ?`, [id]) as VehicleBookingRow | undefined;
}

export function addBooking(
  jobId: number,
  scheduledDate: string,
  createdBy: number,
  note?: string | null
): VehicleBookingRow {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const job = h.get(
    'SELECT id, job_kind FROM jobs WHERE id = ? AND archived_at IS NULL',
    [jobId]
  ) as { id: number; job_kind: string | null } | undefined;
  if (!job) throw new Error('Job not found or archived.');
  if (job.job_kind !== 'vehicle') {
    throw new Error('Only vehicle jobs can be booked on this calendar.');
  }

  const existing = h.get('SELECT id FROM vehicle_bookings WHERE job_id = ?', [jobId]);
  if (existing) throw new Error('That job is already on the vehicle calendar.');

  const result = h.run(
    `INSERT INTO vehicle_bookings (job_id, scheduled_date, note, created_by)
     VALUES (?, ?, ?, ?)`,
    [jobId, scheduledDate, note?.trim() || null, createdBy]
  );
  return getBooking(result.lastInsertRowid)!;
}

export function updateBooking(
  id: number,
  fields: { scheduled_date?: string; note?: string | null }
): VehicleBookingRow {
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
    params.push(fields.note?.trim() || null);
  }
  if (sets.length === 0) return getBooking(id)!;
  params.push(id);
  h.run(`UPDATE vehicle_bookings SET ${sets.join(', ')} WHERE id = ?`, params);
  return getBooking(id)!;
}

export function removeBooking(id: number): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run('DELETE FROM vehicle_bookings WHERE id = ?', [id]);
}

/** Search active board jobs by number, name, or client — same pattern as Rigging. */
export function searchJobsForVehicles(query: string, limit = 20): {
  id: number;
  job_no: string;
  job_name: string;
  client: string;
  stage: string;
  has_booking: boolean;
}[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const q = `%${query.trim()}%`;
  return h
    .all(
      `SELECT j.id, j.job_no, j.job_name, j.client, j.stage,
              CASE WHEN vb.id IS NOT NULL THEN 1 ELSE 0 END AS has_booking
       FROM jobs j
       LEFT JOIN vehicle_bookings vb ON vb.job_id = j.id
       WHERE j.archived_at IS NULL
         AND j.job_kind = 'vehicle'
         AND (j.job_no LIKE ? OR j.job_name LIKE ? OR j.client LIKE ?)
       ORDER BY j.job_no DESC
       LIMIT ?`,
      [q, q, q, limit]
    )
    .map((row: Record<string, unknown>) => ({
      id: row.id as number,
      job_no: row.job_no as string,
      job_name: row.job_name as string,
      client: row.client as string,
      stage: row.stage as string,
      has_booking: !!(row.has_booking as number),
    }));
}

export function listUnbookedVehicleJobs(): {
  id: number;
  job_no: string;
  job_name: string;
  client: string;
  stage: string;
  due_date: string | null;
}[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h
    .all(
      `SELECT j.id, j.job_no, j.job_name, j.client, j.stage, j.due_date
       FROM jobs j
       LEFT JOIN vehicle_bookings vb ON vb.job_id = j.id
       WHERE j.archived_at IS NULL
         AND j.job_kind = 'vehicle'
         AND vb.id IS NULL
       ORDER BY CASE WHEN j.due_date IS NULL OR j.due_date = '' THEN 1 ELSE 0 END,
                j.due_date, j.job_no`
    )
    .map((row: Record<string, unknown>) => ({
      id: row.id as number,
      job_no: row.job_no as string,
      job_name: (row.job_name as string) || '',
      client: (row.client as string) || '',
      stage: row.stage as string,
      due_date: (row.due_date as string) || null,
    }));
}
