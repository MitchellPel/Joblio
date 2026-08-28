import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';
import { makeProofThumb } from './proofsRepo';
import {
  readQuoteSizeImage,
  readQuoteSizeThumb,
  writeQuoteSizeFiles,
  readQuoteSizeNoteImage,
  readQuoteSizeNoteThumb,
  writeQuoteSizeNoteFiles,
  deleteQuoteSizeFiles,
  deleteQuoteSizeNoteFiles,
} from '../utils/quoteSizeStorage';

export type QuoteSizeStatus = 'open' | 'done';

export interface QuoteSizeRow {
  id: number;
  job_name: string;
  scope: string;
  status: QuoteSizeStatus;
  has_image: boolean;
  file_name: string;
  mime_type: string;
  size: number;
  created_by: number;
  created_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
}

export interface QuoteSizeNoteRow {
  id: number;
  quote_size_id: number;
  author_id: number;
  author_name: string;
  body: string;
  has_image: boolean;
  file_name: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface QuoteSizeMentionRow {
  id: number;
  note_id: number;
  quote_size_id: number;
  mentioned_user_id: number;
  created_by: number;
  created_at: string;
  seen: number;
  job_name: string;
  author_name: string;
  note_body: string;
}

function parseStatus(v: unknown): QuoteSizeStatus {
  return v === 'done' ? 'done' : 'open';
}

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === 'true' || v === '1';
}

function mapNote(row: any): QuoteSizeNoteRow {
  return {
    id: Number(row.id),
    quote_size_id: Number(row.quote_size_id),
    author_id: Number(row.author_id),
    author_name: row.author_name || 'Someone',
    body: row.body || '',
    has_image: asBool(row.has_image),
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    size: Number(row.size) || 0,
    created_at: row.created_at,
  };
}

function mapRow(row: any): QuoteSizeRow {
  return {
    id: Number(row.id),
    job_name: row.job_name || '',
    scope: row.scope || '',
    status: parseStatus(row.status),
    has_image: asBool(row.has_image),
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    size: Number(row.size) || 0,
    created_by: Number(row.created_by),
    created_name: row.created_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
    version: row.version ?? 1,
  };
}

const SELECT = `
  SELECT q.*, u.full_name AS created_name
  FROM quote_sizes q
  LEFT JOIN users u ON u.id = q.created_by
`;

export function listActiveQuoteSizes(): QuoteSizeRow[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `${SELECT}
     WHERE q.archived_at IS NULL
     ORDER BY
       CASE q.status WHEN 'open' THEN 0 ELSE 1 END,
       q.created_at DESC`
  );
  return rows.map(mapRow);
}

export function listCompletedQuoteSizes(): QuoteSizeRow[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `${SELECT}
     WHERE q.archived_at IS NOT NULL
     ORDER BY q.archived_at DESC`
  );
  return rows.map(mapRow);
}

export function deleteQuoteSize(id: number): boolean {
  const h = createDbHelpers(getDatabase());
  const notes = h.all(`SELECT id FROM quote_size_notes WHERE quote_size_id = ?`, [id]) as { id: number }[];
  for (const n of notes) deleteQuoteSizeNoteFiles(Number(n.id));
  deleteQuoteSizeFiles(id);
  h.run(`DELETE FROM quote_size_mentions WHERE quote_size_id = ?`, [id]);
  h.run(`DELETE FROM quote_size_seen WHERE quote_size_id = ?`, [id]);
  h.run(`DELETE FROM quote_size_notes WHERE quote_size_id = ?`, [id]);
  const result = h.run(`DELETE FROM quote_sizes WHERE id = ?`, [id]);
  return result.changes > 0;
}

export function getQuoteSize(id: number): QuoteSizeRow | undefined {
  const h = createDbHelpers(getDatabase());
  const row = h.get(`${SELECT} WHERE q.id = ?`, [id]);
  return row ? mapRow(row) : undefined;
}

export function listDoneQuoteSizesForCreator(userId: number): QuoteSizeRow[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `${SELECT}
     WHERE q.archived_at IS NULL AND q.status = 'done' AND q.created_by = ?
     ORDER BY q.updated_at DESC`,
    [userId]
  );
  return rows.map(mapRow);
}

export function createQuoteSize(data: {
  jobName: string;
  scope: string;
  createdBy: number;
  image?: { bytes: Uint8Array; fileName: string; mimeType: string } | null;
}): QuoteSizeRow {
  const h = createDbHelpers(getDatabase());
  const hasImage = Boolean(data.image && data.image.bytes.length > 0);
  const result = h.run(
    `INSERT INTO quote_sizes (job_name, scope, status, has_image, file_name, mime_type, size, created_by)
     VALUES (?, ?, 'open', ?, ?, ?, ?, ?)`,
    [
      data.jobName.trim(),
      data.scope.trim(),
      hasImage ? 1 : 0,
      hasImage ? data.image!.fileName : '',
      hasImage ? data.image!.mimeType : '',
      hasImage ? data.image!.bytes.length : 0,
      data.createdBy,
    ]
  );
  const id = result.lastInsertRowid;
  if (hasImage && data.image) {
    writeQuoteSizeFiles(id, data.image.bytes, makeProofThumb(data.image.bytes));
  }
  return getQuoteSize(id)!;
}

export function updateQuoteSizeSafe(
  id: number,
  expectedVersion: number,
  fields: Partial<{
    job_name: string;
    scope: string;
    status: QuoteSizeStatus;
    has_image?: number | boolean;
    file_name: string;
    mime_type: string;
    size: number;
    archived_at: string | null;
  }>
): { conflict: true; server: QuoteSizeRow } | QuoteSizeRow | undefined {
  const h = createDbHelpers(getDatabase());
  const current = h.get('SELECT version FROM quote_sizes WHERE id = ?', [id]) as
    | { version: number }
    | undefined;
  if (!current) return undefined;
  if (current.version !== expectedVersion) {
    return { conflict: true, server: getQuoteSize(id)! };
  }
  const sets: string[] = ["updated_at = datetime('now')", 'version = version + 1'];
  const params: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    params.push(value === undefined ? null : value);
  }
  params.push(id);
  h.run(`UPDATE quote_sizes SET ${sets.join(', ')} WHERE id = ?`, params);
  return getQuoteSize(id)!;
}

export function listQuoteSizeNotes(quoteSizeId: number): QuoteSizeNoteRow[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `SELECT n.*, u.full_name AS author_name
     FROM quote_size_notes n
     LEFT JOIN users u ON u.id = n.author_id
     WHERE n.quote_size_id = ?
     ORDER BY n.created_at ASC, n.id ASC`,
    [quoteSizeId]
  );
  return rows.map(mapNote);
}

export function addQuoteSizeNote(
  quoteSizeId: number,
  authorId: number,
  body: string,
  image?: { bytes: Uint8Array; fileName: string; mimeType: string } | null
): QuoteSizeNoteRow {
  const h = createDbHelpers(getDatabase());
  const hasImage = Boolean(image && image.bytes.length > 0);
  const result = h.run(
    `INSERT INTO quote_size_notes (quote_size_id, author_id, body, has_image, file_name, mime_type, size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      quoteSizeId,
      authorId,
      body.trim(),
      hasImage ? 1 : 0,
      hasImage ? image!.fileName : '',
      hasImage ? image!.mimeType : '',
      hasImage ? image!.bytes.length : 0,
    ]
  );
  const id = result.lastInsertRowid;
  if (hasImage && image) {
    writeQuoteSizeNoteFiles(id, image.bytes, makeProofThumb(image.bytes));
  }
  const row = h.get(
    `SELECT n.*, u.full_name AS author_name
     FROM quote_size_notes n
     LEFT JOIN users u ON u.id = n.author_id
     WHERE n.id = ?`,
    [id]
  );
  return mapNote(row);
}

export function addQuoteSizeMentions(
  noteId: number,
  quoteSizeId: number,
  mentionedUserIds: number[],
  createdBy: number
): void {
  const ids = [...new Set(mentionedUserIds)].filter((id) => id !== createdBy);
  if (!ids.length) return;
  const h = createDbHelpers(getDatabase());
  for (const userId of ids) {
    h.run(
      `INSERT INTO quote_size_mentions (note_id, quote_size_id, mentioned_user_id, created_by)
       VALUES (?, ?, ?, ?)`,
      [noteId, quoteSizeId, userId, createdBy]
    );
  }
}

export function listUnseenQuoteSizeMentions(userId: number): QuoteSizeMentionRow[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `SELECT m.*, q.job_name, u.full_name AS author_name, n.body AS note_body
     FROM quote_size_mentions m
     JOIN quote_sizes q ON q.id = m.quote_size_id
     JOIN quote_size_notes n ON n.id = m.note_id
     LEFT JOIN users u ON u.id = m.created_by
     WHERE m.mentioned_user_id = ? AND m.seen = 0
     ORDER BY m.created_at DESC`,
    [userId]
  );
  return rows.map((row: any) => ({
    id: Number(row.id),
    note_id: Number(row.note_id),
    quote_size_id: Number(row.quote_size_id),
    mentioned_user_id: Number(row.mentioned_user_id),
    created_by: Number(row.created_by),
    created_at: row.created_at,
    seen: Number(row.seen) || 0,
    job_name: row.job_name || '',
    author_name: row.author_name || 'Someone',
    note_body: row.note_body || '',
  }));
}

export function markQuoteSizeMentionsSeen(userId: number, quoteSizeId: number): number {
  const h = createDbHelpers(getDatabase());
  const result = h.run(
    `UPDATE quote_size_mentions SET seen = 1
     WHERE mentioned_user_id = ? AND quote_size_id = ? AND seen = 0`,
    [userId, quoteSizeId]
  );
  return result.changes;
}

export function listUnseenQuoteSizeIds(userId: number): number[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `SELECT q.id FROM quote_sizes q
     WHERE q.archived_at IS NULL AND q.status = 'open'
       AND NOT EXISTS (
         SELECT 1 FROM quote_size_seen s
         WHERE s.user_id = ? AND s.quote_size_id = q.id
       )
     ORDER BY q.created_at DESC`,
    [userId]
  ) as { id: number }[];
  return rows.map((r) => Number(r.id));
}

export function markQuoteSizesSeen(userId: number, quoteSizeIds?: number[]): number {
  const h = createDbHelpers(getDatabase());
  const ids =
    quoteSizeIds && quoteSizeIds.length
      ? quoteSizeIds
      : (h.all(`SELECT id FROM quote_sizes WHERE archived_at IS NULL`) as { id: number }[]).map((r) =>
          Number(r.id)
        );
  let marked = 0;
  for (const qid of ids) {
    const result = h.run(
      `INSERT OR IGNORE INTO quote_size_seen (user_id, quote_size_id) VALUES (?, ?)`,
      [userId, qid]
    );
    if (result.changes > 0) marked++;
  }
  return marked;
}

export function getQuoteSizeImageBytes(id: number): { mime: string; data: Uint8Array } | null {
  const row = getQuoteSize(id);
  if (!row?.has_image) return null;
  const data = readQuoteSizeImage(id);
  if (!data) return null;
  return { mime: row.mime_type || 'image/jpeg', data };
}

export function getQuoteSizeThumbBytes(id: number): { mime: string; data: Uint8Array } | null {
  const row = getQuoteSize(id);
  if (!row?.has_image) return null;
  const thumb = readQuoteSizeThumb(id);
  if (thumb) return { mime: 'image/jpeg', data: thumb };
  return getQuoteSizeImageBytes(id);
}

export function getQuoteSizeNoteImageBytes(noteId: number): { mime: string; data: Uint8Array } | null {
  const h = createDbHelpers(getDatabase());
  const row = h.get(`SELECT has_image, mime_type FROM quote_size_notes WHERE id = ?`, [noteId]) as
    | { has_image: unknown; mime_type: string }
    | undefined;
  if (!row || !asBool(row.has_image)) return null;
  const data = readQuoteSizeNoteImage(noteId);
  if (!data) return null;
  return { mime: row.mime_type || 'image/jpeg', data };
}

export function getQuoteSizeNoteThumbBytes(noteId: number): { mime: string; data: Uint8Array } | null {
  const h = createDbHelpers(getDatabase());
  const row = h.get(`SELECT has_image FROM quote_size_notes WHERE id = ?`, [noteId]) as
    | { has_image: unknown }
    | undefined;
  if (!row || !asBool(row.has_image)) return null;
  const thumb = readQuoteSizeNoteThumb(noteId);
  if (thumb) return { mime: 'image/jpeg', data: thumb };
  return getQuoteSizeNoteImageBytes(noteId);
}
