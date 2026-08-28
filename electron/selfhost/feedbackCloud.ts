import { sbFetch, sbJson } from './rest';
import { ensureUserCache, findUserByIdCloudCached } from './usersCloud';
import type { FeedbackKind, FeedbackRow, FeedbackStatus } from '../repositories/feedbackRepo';

function parseKind(v: unknown): FeedbackKind {
  return v === 'change' ? 'change' : 'bug';
}

function parseStatus(v: unknown): FeedbackStatus {
  return v === 'done' ? 'done' : 'open';
}

function mapRow(row: any): FeedbackRow {
  const createdBy = Number(row.created_by);
  const doneBy = row.done_by != null ? Number(row.done_by) : null;
  return {
    id: Number(row.id),
    kind: parseKind(row.kind),
    body: String(row.body || ''),
    status: parseStatus(row.status),
    created_by: createdBy,
    created_name: findUserByIdCloudCached(createdBy)?.full_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    done_by: doneBy,
    done_name: doneBy != null ? findUserByIdCloudCached(doneBy)?.full_name ?? null : null,
    done_at: row.done_at ?? null,
    version: row.version ?? 1,
  };
}

function sortRows(rows: FeedbackRow[]): FeedbackRow[] {
  return [...rows].sort((a, b) => {
    const d = (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1);
    if (d !== 0) return d;
    return String(b.created_at).localeCompare(String(a.created_at));
  });
}

export async function listFeedbackCloud(opts: {
  userId: number;
  isAdmin: boolean;
}): Promise<FeedbackRow[]> {
  await ensureUserCache();
  const query: Record<string, string> = {
    select: '*',
    order: 'created_at.desc',
  };
  if (!opts.isAdmin) query.created_by = `eq.${opts.userId}`;
  const rows = await sbJson<any[]>('app_feedback', { query });
  return sortRows(rows.map(mapRow));
}

export async function getFeedbackCloud(id: number): Promise<FeedbackRow | undefined> {
  await ensureUserCache();
  const rows = await sbJson<any[]>('app_feedback', {
    query: { select: '*', id: `eq.${id}`, limit: '1' },
  });
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createFeedbackCloud(data: {
  kind: FeedbackKind;
  body: string;
  created_by: number;
}): Promise<FeedbackRow> {
  const rows = await sbJson<any[]>('app_feedback', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      kind: data.kind,
      body: data.body,
      created_by: data.created_by,
      status: 'open',
    }),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  await ensureUserCache();
  return mapRow(created);
}

export async function markFeedbackDoneCloud(
  id: number,
  adminId: number
): Promise<FeedbackRow | undefined> {
  const existing = await getFeedbackCloud(id);
  if (!existing) return undefined;
  if (existing.status === 'done') return existing;
  const rows = await sbJson<any[]>('app_feedback', {
    method: 'PATCH',
    query: { id: `eq.${id}` },
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'done',
      done_by: adminId,
      done_at: new Date().toISOString(),
      version: existing.version + 1,
    }),
  });
  const updated = Array.isArray(rows) ? rows[0] : rows;
  if (!updated) return undefined;
  await ensureUserCache();
  return mapRow(updated);
}

export async function listUnseenFeedbackIdsCloud(adminId: number): Promise<number[]> {
  const [openRows, seen] = await Promise.all([
    sbJson<any[]>('app_feedback', {
      query: { select: 'id,created_by', status: 'eq.open' },
    }),
    sbJson<any[]>('feedback_seen', {
      query: { select: 'feedback_id', user_id: `eq.${adminId}` },
    }),
  ]);
  const seenSet = new Set(seen.map((s) => Number(s.feedback_id)));
  return openRows
    .filter((r) => Number(r.created_by) !== adminId && !seenSet.has(Number(r.id)))
    .map((r) => Number(r.id));
}

export async function markFeedbackSeenCloud(
  adminId: number,
  feedbackIds?: number[]
): Promise<number> {
  let ids = feedbackIds;
  if (!ids || !ids.length) {
    const openRows = await sbJson<any[]>('app_feedback', {
      query: { select: 'id', status: 'eq.open' },
    });
    ids = openRows.map((r) => Number(r.id));
  }
  if (!ids.length) return 0;
  const payload = ids.map((feedback_id) => ({ user_id: adminId, feedback_id }));
  const res = await sbFetch('feedback_seen', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok && res.status !== 409) {
    throw new Error(`mark feedback seen ${res.status}: ${text}`);
  }
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows.length : 0;
}
