import type { StageKey } from '../preload';
import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';

export function recordStageChange(
  jobId: number,
  fromStage: StageKey | null,
  toStage: StageKey,
  changedBy: number,
  note?: string | null
): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run(
    'INSERT INTO stage_history (job_id, from_stage, to_stage, changed_by, note) VALUES (?, ?, ?, ?, ?)',
    [jobId, fromStage, toStage, changedBy, note ?? null]
  );
}

export function getStageHistory(jobId: number): {
  id: number;
  job_id: number;
  from_stage: StageKey | null;
  to_stage: StageKey;
  changed_by: number;
  changed_name: string;
  changed_at: string;
  note: string | null;
}[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT h.*, u.full_name AS changed_name
     FROM stage_history h
     LEFT JOIN users u ON h.changed_by = u.id
     WHERE h.job_id = ?
     ORDER BY h.changed_at ASC`,
    [jobId]
  ) as any[];
}

export function addNote(
  jobId: number,
  authorId: number,
  body: string
): {
  id: number;
  job_id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
} {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const result = h.run(
    'INSERT INTO job_notes (job_id, author_id, body) VALUES (?, ?, ?)',
    [jobId, authorId, body]
  );
  const row = h.get(
    `SELECT n.*, u.full_name AS author_name
     FROM job_notes n
     LEFT JOIN users u ON n.author_id = u.id
     WHERE n.id = ?`,
    [result.lastInsertRowid]
  );
  return row as any;
}

export function updateNote(
  noteId: number,
  authorId: number,
  body: string,
  opts?: { allowAnyAuthor?: boolean }
): {
  id: number;
  job_id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
} | null {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const existing = h.get('SELECT id, author_id FROM job_notes WHERE id = ?', [noteId]) as
    | { id: number; author_id: number }
    | undefined;
  if (!existing) return null;
  if (!opts?.allowAnyAuthor && existing.author_id !== authorId) return null;

  h.run('UPDATE job_notes SET body = ? WHERE id = ?', [body, noteId]);
  const row = h.get(
    `SELECT n.*, u.full_name AS author_name
     FROM job_notes n
     LEFT JOIN users u ON n.author_id = u.id
     WHERE n.id = ?`,
    [noteId]
  );
  return (row as any) || null;
}

export function deleteNote(noteId: number): boolean {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const existing = h.get('SELECT id FROM job_notes WHERE id = ?', [noteId]) as { id: number } | undefined;
  if (!existing) return false;
  h.run('DELETE FROM note_mentions WHERE note_id = ?', [noteId]);
  h.run('DELETE FROM job_notes WHERE id = ?', [noteId]);
  return true;
}

export function listNotes(jobId: number): {
  id: number;
  job_id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
}[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    `SELECT n.*, u.full_name AS author_name
     FROM job_notes n
     LEFT JOIN users u ON n.author_id = u.id
     WHERE n.job_id = ?
     ORDER BY n.created_at DESC`,
    [jobId]
  ) as any[];
}
