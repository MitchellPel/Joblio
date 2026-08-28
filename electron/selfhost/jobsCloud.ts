import type { StageKey } from '../preload';
import type { JobUpdateResult, JobWithAssigned } from '../repositories/jobsRepo';
import { sbFetch, sbJson } from './rest';
import { findUserByIdCloudCached, ensureUserCache, getCachedUsers } from './usersCloud';
import { parseDesignerStatuses, serializeDesignerStatuses } from '../utils/designerStatus';
import type { DesignerStatus } from '../preload';

const LAST_NOTE_PREVIEW_LEN = 100;

function previewLastNote(body: string | null | undefined): string | null {
  if (!body) return null;
  const plain = body.replace(/\s+/g, ' ').trim();
  if (!plain) return null;
  if (plain.length <= LAST_NOTE_PREVIEW_LEN) return plain;
  return `${plain.slice(0, LAST_NOTE_PREVIEW_LEN - 1).trimEnd()}…`;
}

function mapJob(
  row: any,
  users: Map<number, { full_name: string; board_color: string | null }>,
  lastNote?: string | null
): JobWithAssigned {
  const assigned = row.assigned_to != null ? users.get(Number(row.assigned_to)) : null;
  const creator = row.created_by != null ? users.get(Number(row.created_by)) : null;
  return {
    id: Number(row.id),
    job_no: row.job_no,
    job_name: row.job_name || '',
    client: row.client || '',
    contact_name: row.contact_name ?? null,
    contact_phone: row.contact_phone ?? null,
    contact_email: row.contact_email ?? null,
    stage: row.stage as StageKey,
    assigned_to: row.assigned_to != null ? Number(row.assigned_to) : null,
    assigned_name: assigned?.full_name ?? null,
    assigned_color: assigned?.board_color ?? null,
    due_date: row.due_date ?? null,
    scope_notes: row.scope_notes ?? null,
    pinned_brief: row.pinned_brief ?? null,
    job_kind:
      row.job_kind === 'vehicle' || row.job_kind === 'sign' || row.job_kind === 'vinyl'
        ? row.job_kind
        : null,
    designer_status: parseDesignerStatuses(row.designer_status),
    created_by: Number(row.created_by),
    created_name: creator?.full_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
    version: row.version ?? 1,
    last_note_preview: previewLastNote(lastNote),
  };
}

async function userNameMap(): Promise<Map<number, { full_name: string; board_color: string | null }>> {
  await ensureUserCache();
  const m = new Map<number, { full_name: string; board_color: string | null }>();
  for (const u of getCachedUsers()) {
    m.set(u.id, { full_name: u.full_name, board_color: u.board_color ?? null });
  }
  return m;
}

async function lastNotesByJob(jobIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!jobIds.length) return out;
  const ids = [...new Set(jobIds.filter((id) => Number.isFinite(id)))];
  if (!ids.length) return out;
  const notes = await sbJson<any[]>('job_notes', {
    query: {
      select: 'job_id,body,created_at,id',
      job_id: `in.(${ids.join(',')})`,
      order: 'created_at.desc,id.desc',
      limit: String(Math.min(ids.length * 4, 400)),
    },
  });
  for (const n of notes) {
    const jid = Number(n.job_id);
    if (!out.has(jid)) out.set(jid, n.body);
  }
  return out;
}

export async function listJobsCloud(): Promise<JobWithAssigned[]> {
  const rows = await sbJson<any[]>('jobs', {
    query: {
      select: '*',
      archived_at: 'is.null',
      order: 'created_at.desc',
    },
  });
  const users = await userNameMap();
  const notes = await lastNotesByJob(rows.map((r) => Number(r.id)));
  return rows.map((r) => mapJob(r, users, notes.get(Number(r.id)) ?? null));
}

export async function listArchivedJobsCloud(): Promise<JobWithAssigned[]> {
  const rows = await sbJson<any[]>('jobs', {
    query: {
      select: '*',
      archived_at: 'not.is.null',
      order: 'archived_at.desc',
    },
  });
  const users = await userNameMap();
  const notes = await lastNotesByJob(rows.map((r) => Number(r.id)));
  return rows.map((r) => mapJob(r, users, notes.get(Number(r.id)) ?? null));
}

export async function getJobCloud(id: number): Promise<JobWithAssigned | undefined> {
  const rows = await sbJson<any[]>('jobs', {
    query: { select: '*', id: `eq.${id}`, limit: '1' },
  });
  if (!rows[0]) return undefined;
  const users = await userNameMap();
  const notes = await lastNotesByJob([id]);
  return mapJob(rows[0], users, notes.get(id) ?? null);
}

export async function createJobCloud(data: {
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
}): Promise<JobWithAssigned> {
  const payload = {
    job_no: data.job_no,
    job_name: data.job_name,
    client: data.client,
    contact_name: data.contact_name ?? null,
    contact_phone: data.contact_phone ?? null,
    contact_email: data.contact_email ?? null,
    stage: data.stage ?? 'new',
    assigned_to: data.assigned_to ?? null,
    due_date: data.due_date ?? null,
    scope_notes: data.scope_notes ?? null,
    job_kind: data.job_kind ?? null,
    designer_status: serializeDesignerStatuses(
      Array.isArray(data.designer_status)
        ? data.designer_status
        : parseDesignerStatuses(data.designer_status)
    ),
    created_by: data.created_by,
    version: 1,
  };
  const rows = await sbJson<any[]>('jobs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  const job = await getJobCloud(Number(created.id));
  if (!job) throw new Error('Failed to load created job.');
  return job;
}

export async function updateJobSafeCloud(
  id: number,
  expectedVersion: number,
  fields: Record<string, unknown>
): Promise<JobUpdateResult | undefined> {
  const current = await getJobCloud(id);
  if (!current) return undefined;
  if (current.version !== expectedVersion) {
    return { conflict: true, serverJob: current };
  }
  const patch: Record<string, unknown> = { ...fields, version: expectedVersion + 1 };
  if ('designer_status' in patch) {
    patch.designer_status = serializeDesignerStatuses(
      Array.isArray(patch.designer_status)
        ? (patch.designer_status as DesignerStatus[])
        : parseDesignerStatuses(patch.designer_status)
    );
  }
  const res = await sbFetch('jobs', {
    method: 'PATCH',
    query: { id: `eq.${id}`, version: `eq.${expectedVersion}` },
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`update job ${res.status}: ${text}`);
  const rows = text ? JSON.parse(text) : [];
  if (!rows.length) {
    const fresh = await getJobCloud(id);
    if (!fresh) return undefined;
    return { conflict: true, serverJob: fresh };
  }
  return (await getJobCloud(id))!;
}

export async function moveStageCloud(
  jobId: number,
  toStage: StageKey,
  expectedVersion: number,
  changedBy: number,
  note?: string | null
): Promise<JobUpdateResult | undefined> {
  const current = await getJobCloud(jobId);
  if (!current) return undefined;
  if (current.version !== expectedVersion) {
    return { conflict: true, serverJob: current };
  }
  const fromStage = current.stage;
  const updated = await updateJobSafeCloud(jobId, expectedVersion, { stage: toStage });
  if (!updated || 'conflict' in updated) return updated;
  await sbFetch('stage_history', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      job_id: jobId,
      from_stage: fromStage,
      to_stage: toStage,
      changed_by: changedBy,
      note: note ?? null,
    }),
  });
  return updated;
}

export async function archiveJobCloud(
  id: number,
  expectedVersion: number
): Promise<JobUpdateResult | undefined> {
  return updateJobSafeCloud(id, expectedVersion, {
    archived_at: new Date().toISOString(),
  });
}

export async function unarchiveJobCloud(
  id: number,
  expectedVersion: number
): Promise<JobUpdateResult | undefined> {
  return updateJobSafeCloud(id, expectedVersion, { archived_at: null });
}

export async function recordStageChangeCloud(
  jobId: number,
  fromStage: string | null,
  toStage: string,
  changedBy: number,
  note?: string | null
): Promise<void> {
  await sbFetch('stage_history', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      job_id: jobId,
      from_stage: fromStage,
      to_stage: toStage,
      changed_by: changedBy,
      note: note ?? null,
    }),
  });
}

export async function deleteJobCloud(
  id: number,
  expectedVersion: number
): Promise<{ ok: true } | { conflict: true } | { error: string }> {
  const current = await getJobCloud(id);
  if (!current) return { error: 'Job not found or already deleted.' };
  if (current.version !== expectedVersion) return { conflict: true };

  // Clean share proof files before CASCADE deletes meta rows
  try {
    const { listProofsCloud, deleteProofFilesCloud } = await import('./proofsCloud');
    const proofs = await listProofsCloud(id);
    for (const p of proofs) deleteProofFilesCloud(p.id);
  } catch {
    // share briefly unavailable — DB delete still proceeds
  }

  const res = await sbFetch('jobs', {
    method: 'DELETE',
    query: { id: `eq.${id}`, version: `eq.${expectedVersion}` },
    headers: { Prefer: 'return=representation' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`delete job ${res.status}: ${text}`);
  const rows = text ? JSON.parse(text) : [];
  if (!Array.isArray(rows) || rows.length === 0) {
    const fresh = await getJobCloud(id);
    if (!fresh) return { error: 'Job not found or already deleted.' };
    return { conflict: true };
  }
  return { ok: true };
}

/** Global quick search — mirrors SQLite searchJobs (incl. archived + contact/assignee). */
export async function searchJobsCloud(query: string, limit = 25): Promise<JobWithAssigned[]> {
  const q = query.trim();
  if (!q) return [];
  const safe = q.replace(/[%(),]/g, '');
  const users = await userNameMap();

  const textRows = await sbJson<any[]>('jobs', {
    query: {
      select: '*',
      or: `(job_no.ilike.%${safe}%,job_name.ilike.%${safe}%,client.ilike.%${safe}%,contact_name.ilike.%${safe}%)`,
      order: 'updated_at.desc',
      limit: String(limit),
    },
  });

  const byId = new Map<number, any>();
  for (const r of textRows) byId.set(Number(r.id), r);

  const qLower = q.toLowerCase();
  const assigneeIds = [...users.entries()]
    .filter(([, u]) => u.full_name.toLowerCase().includes(qLower))
    .map(([id]) => id);

  if (assigneeIds.length) {
    const byAssignee = await sbJson<any[]>('jobs', {
      query: {
        select: '*',
        assigned_to: `in.(${assigneeIds.join(',')})`,
        order: 'updated_at.desc',
        limit: String(limit),
      },
    });
    for (const r of byAssignee) byId.set(Number(r.id), r);
  }

  const all = [...byId.values()];
  all.sort((a, b) => {
    const aArch = a.archived_at ? 1 : 0;
    const bArch = b.archived_at ? 1 : 0;
    if (aArch !== bArch) return aArch - bArch;
    return String(b.updated_at).localeCompare(String(a.updated_at));
  });

  const sliced = all.slice(0, limit);
  const notes = await lastNotesByJob(sliced.map((r) => Number(r.id)));
  return sliced.map((r) => mapJob(r, users, notes.get(Number(r.id)) ?? null));
}

export async function listNotesCloud(jobId: number) {
  const rows = await sbJson<any[]>('job_notes', {
    query: {
      select: 'id,job_id,author_id,body,created_at',
      job_id: `eq.${Number(jobId)}`,
      order: 'created_at.desc,id.desc',
      limit: '200',
    },
  });
  await ensureUserCache();
  return rows.map((n) => ({
    id: Number(n.id),
    job_id: Number(n.job_id),
    author_id: Number(n.author_id),
    author_name: findUserByIdCloudCached(Number(n.author_id))?.full_name || 'Unknown',
    body: n.body,
    created_at: n.created_at,
  }));
}

export async function addNoteCloud(jobId: number, authorId: number, body: string) {
  const rows = await sbJson<any[]>('job_notes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ job_id: jobId, author_id: authorId, body }),
  });
  const n = Array.isArray(rows) ? rows[0] : rows;
  await ensureUserCache();
  return {
    id: Number(n.id),
    job_id: Number(n.job_id),
    author_id: Number(n.author_id),
    author_name: findUserByIdCloudCached(Number(n.author_id))?.full_name || 'Unknown',
    body: n.body,
    created_at: n.created_at,
  };
}

export async function updateNoteCloud(noteId: number, body: string) {
  const rows = await sbJson<any[]>('job_notes', {
    method: 'PATCH',
    query: { id: `eq.${noteId}` },
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ body }),
  });
  const n = Array.isArray(rows) ? rows[0] : rows;
  if (!n) return null;
  await ensureUserCache();
  return {
    id: Number(n.id),
    job_id: Number(n.job_id),
    author_id: Number(n.author_id),
    author_name: findUserByIdCloudCached(Number(n.author_id))?.full_name || 'Unknown',
    body: n.body,
    created_at: n.created_at,
  };
}

export async function deleteNoteCloud(noteId: number): Promise<boolean> {
  const existing = await sbJson<any[]>('job_notes', {
    query: { select: 'id', id: `eq.${noteId}`, limit: '1' },
  });
  if (!existing[0]) return false;
  await sbFetch('job_notes', {
    method: 'DELETE',
    query: { id: `eq.${noteId}` },
    headers: { Prefer: 'return=minimal' },
  });
  return true;
}

/** Bump due date from the vehicle calendar. Ignores version so a booking still lands. */
export async function setJobDueDateCloud(jobId: number, dueDate: string): Promise<void> {
  const rows = await sbJson<any[]>('jobs', {
    query: { select: 'id,version', id: `eq.${jobId}`, archived_at: 'is.null', limit: '1' },
  });
  const current = rows[0];
  if (!current) return;
  await sbFetch('jobs', {
    method: 'PATCH',
    query: { id: `eq.${jobId}` },
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      due_date: dueDate,
      version: Number(current.version ?? 1) + 1,
    }),
  });
}

export async function getStageHistoryCloud(jobId: number) {
  const rows = await sbJson<any[]>('stage_history', {
    query: {
      select: '*',
      job_id: `eq.${jobId}`,
      order: 'changed_at.asc',
    },
  });
  await ensureUserCache();
  return rows.map((h) => ({
    id: Number(h.id),
    job_id: Number(h.job_id),
    from_stage: h.from_stage,
    to_stage: h.to_stage,
    changed_by: Number(h.changed_by),
    changed_name: findUserByIdCloudCached(Number(h.changed_by))?.full_name || 'Unknown',
    changed_at: h.changed_at,
    note: h.note ?? null,
  }));
}
