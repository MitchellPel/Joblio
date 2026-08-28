import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';

export interface MentionRow {
  id: number;
  note_id: number;
  job_id: number;
  mentioned_user_id: number;
  created_by: number;
  created_at: string;
  seen: number;
  job_no: string;
  job_name: string;
  author_name: string;
  note_body: string;
}

/** Store mentions for a note. Self-mentions are ignored. */
export function addMentions(
  noteId: number,
  jobId: number,
  mentionedUserIds: number[],
  createdBy: number
): void {
  const ids = [...new Set(mentionedUserIds)].filter((id) => id !== createdBy);
  if (ids.length === 0) return;

  const db = getDatabase();
  const h = createDbHelpers(db);
  for (const userId of ids) {
    h.run(
      'INSERT INTO note_mentions (note_id, job_id, mentioned_user_id, created_by) VALUES (?, ?, ?, ?)',
      [noteId, jobId, userId, createdBy]
    );
  }
}

/** Unseen mentions for a user, newest first, with everything the UI needs. */
export function listUnseenMentions(userId: number): MentionRow[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT m.*, j.job_no, j.job_name, u.full_name AS author_name, n.body AS note_body
     FROM note_mentions m
     JOIN jobs j ON m.job_id = j.id
     JOIN job_notes n ON m.note_id = n.id
     LEFT JOIN users u ON m.created_by = u.id
     WHERE m.mentioned_user_id = ? AND m.seen = 0
     ORDER BY m.created_at DESC`,
    [userId]
  ) as MentionRow[];
}

/** Mark all of a user's mentions on one job as seen. Returns number marked. */
export function markMentionsSeen(userId: number, jobId: number): number {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const result = h.run(
    'UPDATE note_mentions SET seen = 1 WHERE mentioned_user_id = ? AND job_id = ? AND seen = 0',
    [userId, jobId]
  );
  return result.changes;
}

/** Job ids that currently have an unseen @mention for this user (board badges). */
export function listUnseenMentionJobIds(userId: number): number[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const rows = h.all(
    `SELECT DISTINCT job_id FROM note_mentions
     WHERE mentioned_user_id = ? AND seen = 0`,
    [userId]
  ) as { job_id: number }[];
  return rows.map((r) => r.job_id);
}

/** Unseen mentions on one job for this user (attention banner before marking seen). */
export function listUnseenMentionsForJob(userId: number, jobId: number): MentionRow[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT m.*, j.job_no, j.job_name, u.full_name AS author_name, n.body AS note_body
     FROM note_mentions m
     JOIN jobs j ON m.job_id = j.id
     JOIN job_notes n ON m.note_id = n.id
     LEFT JOIN users u ON m.created_by = u.id
     WHERE m.mentioned_user_id = ? AND m.job_id = ? AND m.seen = 0
     ORDER BY m.created_at DESC`,
    [userId, jobId]
  ) as MentionRow[];
}
