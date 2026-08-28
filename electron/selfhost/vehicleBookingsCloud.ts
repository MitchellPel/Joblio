import type { VehicleBookingRow, VehicleBookingMonthRow } from '../repositories/vehicleBookingsRepo';
import { currentYearMonth } from '../repositories/vehicleBookingsRepo';
import { sbFetch, sbJson } from './rest';
import { ensureUserCache, findUserByIdCloudCached } from './usersCloud';

function monthBounds(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${yearMonth}-01`,
    to: `${yearMonth}-${String(last).padStart(2, '0')}`,
  };
}

function mapBooking(row: any, createdName: string | null): VehicleBookingRow {
  const job = row.jobs || {};
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    scheduled_date: String(row.scheduled_date).slice(0, 10),
    note: row.note ?? null,
    created_by: Number(row.created_by),
    created_at: row.created_at,
    created_name: createdName,
    job_no: job.job_no || '',
    job_name: job.job_name || '',
    client: job.client || '',
  };
}

export async function ensureVehicleBookingMonthsCloud(): Promise<void> {
  const current = currentYearMonth();
  await sbFetch('vehicle_booking_months', {
    method: 'POST',
    query: { on_conflict: 'year_month' },
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ year_month: current, status: 'active' }),
  });

  const stale = await sbJson<any[]>('vehicle_booking_months', {
    query: {
      select: 'year_month',
      status: 'eq.active',
      year_month: `lt.${current}`,
    },
  });
  for (const row of stale) {
    await sbFetch('vehicle_booking_months', {
      method: 'PATCH',
      query: { year_month: `eq.${row.year_month}` },
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'archived', archived_at: new Date().toISOString() }),
    });
  }
}

export async function listArchivedVehicleMonthsCloud(): Promise<VehicleBookingMonthRow[]> {
  const rows = await sbJson<any[]>('vehicle_booking_months', {
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

export async function isArchivedVehicleMonthCloud(yearMonth: string): Promise<boolean> {
  const rows = await sbJson<any[]>('vehicle_booking_months', {
    query: {
      select: 'status',
      year_month: `eq.${yearMonth}`,
      limit: '1',
    },
  });
  return rows[0]?.status === 'archived';
}

export async function listBookingsForMonthCloud(yearMonth: string): Promise<VehicleBookingRow[]> {
  const { from, to } = monthBounds(yearMonth);
  await ensureUserCache();
  const rows = await sbJson<any[]>('vehicle_bookings', {
    query: {
      select: 'id,job_id,scheduled_date,note,created_by,created_at,jobs!inner(job_no,job_name,client)',
      and: `(scheduled_date.gte.${from},scheduled_date.lte.${to})`,
      order: 'scheduled_date,job_id',
    },
  });
  return rows
    .map((r) => {
      const u = findUserByIdCloudCached(Number(r.created_by));
      return mapBooking(r, u?.full_name ?? null);
    })
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.job_no.localeCompare(b.job_no));
}

async function getBookingCloud(id: number): Promise<VehicleBookingRow | undefined> {
  await ensureUserCache();
  const rows = await sbJson<any[]>('vehicle_bookings', {
    query: {
      select: 'id,job_id,scheduled_date,note,created_by,created_at,jobs!inner(job_no,job_name,client)',
      id: `eq.${id}`,
      limit: '1',
    },
  });
  if (!rows[0]) return undefined;
  const u = findUserByIdCloudCached(Number(rows[0].created_by));
  return mapBooking(rows[0], u?.full_name ?? null);
}

export async function addBookingCloud(
  jobId: number,
  scheduledDate: string,
  createdBy: number,
  note?: string | null
): Promise<VehicleBookingRow> {
  const jobs = await sbJson<any[]>('jobs', {
    query: {
      select: 'id,job_kind',
      id: `eq.${jobId}`,
      archived_at: 'is.null',
      limit: '1',
    },
  });
  if (!jobs[0]) throw new Error('Job not found or archived.');
  if (jobs[0].job_kind !== 'vehicle') {
    throw new Error('Only vehicle jobs can be booked on this calendar.');
  }

  const existing = await sbJson<any[]>('vehicle_bookings', {
    query: { select: 'id', job_id: `eq.${jobId}`, limit: '1' },
  });
  if (existing[0]) throw new Error('That job is already on the vehicle calendar.');

  const rows = await sbJson<any[]>('vehicle_bookings', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      job_id: jobId,
      scheduled_date: scheduledDate,
      note: note?.trim() || null,
      created_by: createdBy,
    }),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  const full = await getBookingCloud(Number(created.id));
  if (!full) throw new Error('Failed to load new vehicle booking.');
  return full;
}

export async function updateBookingCloud(
  id: number,
  fields: { scheduled_date?: string; note?: string | null }
): Promise<VehicleBookingRow> {
  const patch: Record<string, unknown> = {};
  if (fields.scheduled_date !== undefined) patch.scheduled_date = fields.scheduled_date;
  if (fields.note !== undefined) patch.note = fields.note?.trim() || null;
  if (Object.keys(patch).length === 0) {
    const existing = await getBookingCloud(id);
    if (!existing) throw new Error('Booking not found.');
    return existing;
  }
  await sbFetch('vehicle_bookings', {
    method: 'PATCH',
    query: { id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  const updated = await getBookingCloud(id);
  if (!updated) throw new Error('Booking not found.');
  return updated;
}

export async function removeBookingCloud(id: number): Promise<void> {
  await sbFetch('vehicle_bookings', {
    method: 'DELETE',
    query: { id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
  });
}

export async function searchJobsForVehiclesCloud(
  query: string,
  limit = 20
): Promise<
  { id: number; job_no: string; job_name: string; client: string; stage: string; has_booking: boolean }[]
> {
  const q = query.trim();
  if (!q) return [];
  const jobs = await sbJson<any[]>('jobs', {
    query: {
      select: 'id,job_no,job_name,client,stage',
      archived_at: 'is.null',
      job_kind: 'eq.vehicle',
      or: `(job_no.ilike.%${q.replace(/[%(),]/g, '')}%,job_name.ilike.%${q.replace(/[%(),]/g, '')}%,client.ilike.%${q.replace(/[%(),]/g, '')}%)`,
      order: 'job_no.desc',
      limit: String(limit),
    },
  });
  const bookings = await sbJson<any[]>('vehicle_bookings', {
    query: { select: 'job_id' },
  });
  const onCal = new Set(bookings.map((r) => Number(r.job_id)));
  return jobs.map((j) => ({
    id: Number(j.id),
    job_no: j.job_no,
    job_name: j.job_name || '',
    client: j.client || '',
    stage: j.stage,
    has_booking: onCal.has(Number(j.id)),
  }));
}

export async function listUnbookedVehicleJobsCloud(): Promise<
  { id: number; job_no: string; job_name: string; client: string; stage: string; due_date: string | null }[]
> {
  const jobs = await sbJson<any[]>('jobs', {
    query: {
      select: 'id,job_no,job_name,client,stage,due_date',
      archived_at: 'is.null',
      job_kind: 'eq.vehicle',
      order: 'job_no.desc',
      limit: '500',
    },
  });
  const bookings = await sbJson<any[]>('vehicle_bookings', {
    query: { select: 'job_id' },
  });
  const onCal = new Set(bookings.map((r) => Number(r.job_id)));
  return jobs
    .filter((j) => !onCal.has(Number(j.id)))
    .map((j) => ({
      id: Number(j.id),
      job_no: j.job_no,
      job_name: j.job_name || '',
      client: j.client || '',
      stage: j.stage,
      due_date: j.due_date ? String(j.due_date).slice(0, 10) : null,
    }))
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return a.job_no.localeCompare(b.job_no);
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date) || a.job_no.localeCompare(b.job_no);
    });
}
