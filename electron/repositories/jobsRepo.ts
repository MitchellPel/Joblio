import type { StageKey } from '../preload';
import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';
import { parseDesignerStatuses, serializeDesignerStatuses } from '../utils/designerStatus';
import type { DesignerStatus } from '../preload';

export interface JobWithAssigned {
  id: number;
  job_no: string;
  job_name: string;
  client: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  stage: StageKey;
  assigned_to: number | null;
  assigned_name: string | null;
  assigned_color: string | null;
  due_date: string | null;
  scope_notes: string | null;
  pinned_brief: string | null;
  /** Vehicle or Sign job — shown as an icon on the board. */
  job_kind: 'vehicle' | 'sign' | 'vinyl' | null;
  designer_status: DesignerStatus[];
  created_by: number;
  created_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
  /** Truncated plain-text preview of the newest job note, or null if none. */
  last_note_preview: string | null;
}

export type JobUpdateResult =
  | { conflict: true; serverJob: JobWithAssigned }
  | JobWithAssigned;

const LAST_NOTE_PREVIEW_LEN = 100;

/** Collapse whitespace and truncate for board card scanning. Mentions stay as plain @Name. */
function previewLastNote(body: string | null | undefined): string | null {
  if (!body) return null;
  const plain = body.replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  if (plain.length <= LAST_NOTE_PREVIEW_LEN) return plain;
  return `${plain.slice(0, LAST_NOTE_PREVIEW_LEN - 1).trimEnd()}…`;
}

function rowMapper(row: any): JobWithAssigned {
  const { last_note_body, ...rest } = row;
  return {
    ...rest,
    assigned_to: row.assigned_to ?? null,
    assigned_name: row.assigned_name ?? null,
    assigned_color: row.assigned_color ?? null,
    due_date: row.due_date ?? null,
    scope_notes: row.scope_notes ?? null,
    pinned_brief: row.pinned_brief ?? null,
    job_kind: row.job_kind === 'vehicle' || row.job_kind === 'sign' || row.job_kind === 'vinyl' ? row.job_kind : null,
    designer_status: parseDesignerStatuses(row.designer_status),
    contact_name: row.contact_name ?? null,
    contact_phone: row.contact_phone ?? null,
    contact_email: row.contact_email ?? null,
    archived_at: row.archived_at ?? null,
    last_note_preview: previewLastNote(last_note_body),
  };
}

const JOB_SELECT = `SELECT j.*,
  assign.full_name AS assigned_name,
  assign.board_color AS assigned_color,
  creator.full_name AS created_name,
  (SELECT n.body FROM job_notes n
   WHERE n.job_id = j.id
   ORDER BY n.created_at DESC, n.id DESC
   LIMIT 1) AS last_note_body
 FROM jobs j
 LEFT JOIN users assign ON j.assigned_to = assign.id
 LEFT JOIN users creator ON j.created_by = creator.id`;
export function listJobs(): JobWithAssigned[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const rows = h.all(
    `${JOB_SELECT} WHERE j.archived_at IS NULL ORDER BY j.created_at DESC`
  );
  return rows.map(rowMapper);
}

export function listArchivedJobs(): JobWithAssigned[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const rows = h.all(
    `${JOB_SELECT} WHERE j.archived_at IS NOT NULL ORDER BY j.archived_at DESC`
  );
  return rows.map(rowMapper);
}

export function getJob(id: number): JobWithAssigned | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const row = h.get(`${JOB_SELECT} WHERE j.id = ?`, [id]);
  return row ? rowMapper(row) : undefined;
}

export function createJob(data: {
  job_no: string;
  job_name: string;
  client: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  stage?: StageKey;
  assigned_to?: number | null;
  due_date?: string | null;
  scope_notes?: string | null;
  job_kind?: 'vehicle' | 'sign' | 'vinyl' | null;
  designer_status?: DesignerStatus[];
  created_by: number;
}): JobWithAssigned {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const result = h.run(
    `INSERT INTO jobs (job_no, job_name, client, contact_name, contact_phone, contact_email, stage, assigned_to, due_date, scope_notes, job_kind, designer_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.job_no,
      data.job_name,
      data.client,
      data.contact_name ?? null,
      data.contact_phone ?? null,
      data.contact_email ?? null,
      data.stage ?? 'new',
      data.assigned_to ?? null,
      data.due_date ?? null,
      data.scope_notes ?? null,
      data.job_kind === 'vehicle' || data.job_kind === 'sign' || data.job_kind === 'vinyl'
        ? data.job_kind
        : null,
      serializeDesignerStatuses(
        Array.isArray(data.designer_status)
          ? data.designer_status
          : parseDesignerStatuses(data.designer_status)
      ),
      data.created_by,
    ]
  );
  return getJob(result.lastInsertRowid)!;
}

export function updateJobSafe(
  id: number,
  expectedVersion: number,
  fields: Partial<{
    job_no: string;
    job_name: string;
    client: string;
    contact_name: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    stage: StageKey;
    assigned_to: number | null;
    due_date: string | null;
    scope_notes: string | null;
    pinned_brief: string | null;
    job_kind: 'vehicle' | 'sign' | 'vinyl' | null;
    designer_status: DesignerStatus[];
  }>
): JobUpdateResult | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const current = h.get('SELECT version FROM jobs WHERE id = ?', [id]) as { version: number } | undefined;
  if (!current) return undefined; // job deleted

  if (current.version !== expectedVersion) {
    const serverJob = getJob(id)!;
    return { conflict: true, serverJob };
  }

  const sets: string[] = ["updated_at = datetime('now')", 'version = version + 1'];
  const params: any[] = [];

  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    if (key === 'designer_status') {
      params.push(
        serializeDesignerStatuses(
          Array.isArray(value) ? (value as DesignerStatus[]) : parseDesignerStatuses(value)
        )
      );
    } else {
      params.push(value === undefined ? null : value);
    }
  }

  params.push(id);
  h.run(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, params);
  return getJob(id)!;
}

export function archiveJobSafe(id: number, expectedVersion: number): JobUpdateResult | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const current = h.get('SELECT version FROM jobs WHERE id = ?', [id]) as { version: number } | undefined;
  if (!current) return undefined;

  if (current.version !== expectedVersion) {
    const serverJob = getJob(id)!;
    return { conflict: true, serverJob };
  }

  h.run("UPDATE jobs SET archived_at = datetime('now'), updated_at = datetime('now'), version = version + 1 WHERE id = ?", [id]);
  return getJob(id)!;
}

export function unarchiveJobSafe(id: number, expectedVersion: number): JobUpdateResult | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const current = h.get('SELECT version, archived_at FROM jobs WHERE id = ?', [id]) as
    | { version: number; archived_at: string | null }
    | undefined;
  if (!current) return undefined;
  if (!current.archived_at) return getJob(id)!;

  if (current.version !== expectedVersion) {
    const serverJob = getJob(id)!;
    return { conflict: true, serverJob };
  }

  h.run(
    "UPDATE jobs SET archived_at = NULL, updated_at = datetime('now'), version = version + 1 WHERE id = ?",
    [id]
  );
  return getJob(id)!;
}

export function getNextJobNo(): string {
  const year = new Date().getFullYear();
  const db = getDatabase();
  const h = createDbHelpers(db);
  const row = h.get("SELECT MAX(job_no) AS last FROM jobs WHERE job_no LIKE ?", [`J-${year}-%`]);
  if (!row || !row.last) return `J-${year}-0001`;
  const parts = (row.last as string).split('-');
  const num = parseInt(parts[parts.length - 1], 10) + 1;
  return `J-${year}-${String(num).padStart(4, '0')}`;
}

export function deleteJobSafe(id: number, expectedVersion: number): { ok: true } | { conflict: true } | { error: string } {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const current = h.get('SELECT version FROM jobs WHERE id = ?', [id]) as { version: number } | undefined;
  if (!current) return { error: 'Job not found or already deleted.' };

  if (current.version !== expectedVersion) {
    return { conflict: true };
  }

  h.run('DELETE FROM jobs WHERE id = ?', [id]);
  return { ok: true };
}

/** Global quick search across active (and optionally archived) jobs. */
export function searchJobs(query: string, limit = 25): JobWithAssigned[] {
  const q = query.trim();
  if (!q) return [];
  const db = getDatabase();
  const h = createDbHelpers(db);
  const like = `%${q.replace(/%/g, '')}%`;
  const rows = h.all(
    `${JOB_SELECT}
     WHERE (
       j.job_no LIKE ? COLLATE NOCASE
       OR j.job_name LIKE ? COLLATE NOCASE
       OR j.client LIKE ? COLLATE NOCASE
       OR IFNULL(j.contact_name, '') LIKE ? COLLATE NOCASE
       OR IFNULL(assign.full_name, '') LIKE ? COLLATE NOCASE
     )
     ORDER BY
       CASE WHEN j.archived_at IS NULL THEN 0 ELSE 1 END,
       j.updated_at DESC
     LIMIT ?`,
    [like, like, like, like, like, limit]
  );
  return rows.map(rowMapper);
}

/** Jobs that have a due date set (for calendar view). */
export function listJobsWithDueDates(): JobWithAssigned[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const rows = h.all(
    `${JOB_SELECT}
     WHERE j.due_date IS NOT NULL AND j.due_date != '' AND j.archived_at IS NULL
     ORDER BY j.due_date ASC`
  );
  return rows.map(rowMapper);
}

/** Calendar bookings set the job due date without requiring the job form's version. */
export function setJobDueDate(jobId: number, dueDate: string): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run(
    `UPDATE jobs SET due_date = ?, updated_at = datetime('now'), version = version + 1
     WHERE id = ? AND archived_at IS NULL`,
    [dueDate, jobId]
  );
}

