import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';

export type FeedbackKind = 'bug' | 'change';
export type FeedbackStatus = 'open' | 'done';

export interface FeedbackRow {
  id: number;
  kind: FeedbackKind;
  body: string;
  status: FeedbackStatus;
  created_by: number;
  created_name: string | null;
  created_at: string;
  updated_at: string;
  done_by: number | null;
  done_name: string | null;
  done_at: string | null;
  version: number;
}

function parseKind(v: unknown): FeedbackKind {
  return v === 'change' ? 'change' : 'bug';
}

function parseStatus(v: unknown): FeedbackStatus {
  return v === 'done' ? 'done' : 'open';
}

function mapRow(row: any): FeedbackRow {
  return {
    id: Number(row.id),
    kind: parseKind(row.kind),
    body: String(row.body || ''),
    status: parseStatus(row.status),
    created_by: Number(row.created_by),
    created_name: row.created_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    done_by: row.done_by != null ? Number(row.done_by) : null,
    done_name: row.done_name ?? null,
    done_at: row.done_at ?? null,
    version: row.version ?? 1,
  };
}

const SELECT = `
  SELECT f.*,
    cu.full_name AS created_name,
    du.full_name AS done_name
  FROM app_feedback f
  LEFT JOIN users cu ON cu.id = f.created_by
  LEFT JOIN users du ON du.id = f.done_by
`;

export function listFeedback(opts: { userId: number; isAdmin: boolean }): FeedbackRow[] {
  const h = createDbHelpers(getDatabase());
  const rows = opts.isAdmin
    ? h.all(
        `${SELECT}
         ORDER BY CASE f.status WHEN 'open' THEN 0 ELSE 1 END, f.created_at DESC`
      )
    : h.all(
        `${SELECT}
         WHERE f.created_by = ?
         ORDER BY CASE f.status WHEN 'open' THEN 0 ELSE 1 END, f.created_at DESC`,
        [opts.userId]
      );
  return rows.map(mapRow);
}

export function getFeedback(id: number): FeedbackRow | undefined {
  const h = createDbHelpers(getDatabase());
  const row = h.get(`${SELECT} WHERE f.id = ?`, [id]);
  return row ? mapRow(row) : undefined;
}

export function createFeedback(data: {
  kind: FeedbackKind;
  body: string;
  created_by: number;
}): FeedbackRow {
  const h = createDbHelpers(getDatabase());
  const result = h.run(
    `INSERT INTO app_feedback (kind, body, created_by) VALUES (?, ?, ?)`,
    [data.kind, data.body, data.created_by]
  );
  return getFeedback(result.lastInsertRowid)!;
}

export function markFeedbackDone(id: number, adminId: number): FeedbackRow | undefined {
  const h = createDbHelpers(getDatabase());
  const existing = getFeedback(id);
  if (!existing) return undefined;
  if (existing.status === 'done') return existing;
  h.run(
    `UPDATE app_feedback
     SET status = 'done', done_by = ?, done_at = datetime('now'),
         updated_at = datetime('now'), version = version + 1
     WHERE id = ?`,
    [adminId, id]
  );
  return getFeedback(id);
}

export function listUnseenFeedbackIds(adminId: number): number[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `SELECT f.id FROM app_feedback f
     WHERE f.status = 'open'
       AND f.created_by != ?
       AND NOT EXISTS (
         SELECT 1 FROM feedback_seen s
         WHERE s.user_id = ? AND s.feedback_id = f.id
       )
     ORDER BY f.created_at DESC`,
    [adminId, adminId]
  ) as { id: number }[];
  return rows.map((r) => Number(r.id));
}

export function markFeedbackSeen(adminId: number, feedbackIds?: number[]): number {
  const h = createDbHelpers(getDatabase());
  const ids =
    feedbackIds && feedbackIds.length
      ? feedbackIds
      : (h.all(`SELECT id FROM app_feedback WHERE status = 'open'`) as { id: number }[]).map((r) =>
          Number(r.id)
        );
  let marked = 0;
  for (const fid of ids) {
    const result = h.run(
      `INSERT OR IGNORE INTO feedback_seen (user_id, feedback_id) VALUES (?, ?)`,
      [adminId, fid]
    );
    if (result.changes > 0) marked++;
  }
  return marked;
}
