import { sbFetch, sbJson } from './rest';
import { ensureUserCache, findUserByIdCloudCached } from './usersCloud';
import { makeProofThumb } from '../repositories/proofsRepo';
import {
  writeQuoteSizeFiles,
  readQuoteSizeImage,
  readQuoteSizeThumb,
  writeQuoteSizeNoteFiles,
  readQuoteSizeNoteImage,
  readQuoteSizeNoteThumb,
  deleteQuoteSizeFiles,
  deleteQuoteSizeNoteFiles,
} from '../utils/quoteSizeStorage';
import type {
  QuoteSizeMentionRow,
  QuoteSizeNoteRow,
  QuoteSizeRow,
  QuoteSizeStatus,
} from '../repositories/quoteSizesRepo';

function parseStatus(v: unknown): QuoteSizeStatus {
  return v === 'done' ? 'done' : 'open';
}

function asBool(v: unknown): boolean {
  return v === true || v === 1 || v === 'true' || v === '1';
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
    created_name: findUserByIdCloudCached(Number(row.created_by))?.full_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
    version: row.version ?? 1,
  };
}

async function attachNames(rows: any[]): Promise<QuoteSizeRow[]> {
  await ensureUserCache();
  return rows.map(mapRow);
}

export async function listActiveQuoteSizesCloud(): Promise<QuoteSizeRow[]> {
  const rows = await sbJson<any[]>('quote_sizes', {
    query: {
      select: '*',
      archived_at: 'is.null',
      order: 'created_at.desc',
    },
  });
  const mapped = await attachNames(rows);
  mapped.sort((a, b) => {
    const d = (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1);
    if (d !== 0) return d;
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return mapped;
}

export async function listCompletedQuoteSizesCloud(): Promise<QuoteSizeRow[]> {
  const rows = await sbJson<any[]>('quote_sizes', {
    query: {
      select: '*',
      archived_at: 'not.is.null',
      order: 'archived_at.desc',
    },
  });
  return attachNames(rows);
}

export async function deleteQuoteSizeCloud(id: number): Promise<boolean> {
  const notes = await listQuoteSizeNotesCloud(id);
  for (const n of notes) deleteQuoteSizeNoteFiles(n.id);
  deleteQuoteSizeFiles(id);
  const res = await sbFetch('quote_sizes', {
    method: 'DELETE',
    query: { id: `eq.${id}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`delete quote size ${res.status}: ${text}`);
  }
  return true;
}

export async function listDoneQuoteSizesForCreatorCloud(userId: number): Promise<QuoteSizeRow[]> {
  const rows = await sbJson<any[]>('quote_sizes', {
    query: {
      select: '*',
      archived_at: 'is.null',
      status: 'eq.done',
      created_by: `eq.${userId}`,
      order: 'updated_at.desc',
    },
  });
  return attachNames(rows);
}

export async function getQuoteSizeCloud(id: number): Promise<QuoteSizeRow | undefined> {
  const rows = await sbJson<any[]>('quote_sizes', {
    query: { select: '*', id: `eq.${id}`, limit: '1' },
  });
  if (!rows[0]) return undefined;
  const [mapped] = await attachNames(rows);
  return mapped;
}

export async function createQuoteSizeCloud(data: {
  jobName: string;
  scope: string;
  createdBy: number;
  image?: { bytes: Uint8Array; fileName: string; mimeType: string } | null;
}): Promise<QuoteSizeRow> {
  const hasImage = Boolean(data.image && data.image.bytes.length > 0);
  const rows = await sbJson<any[]>('quote_sizes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      job_name: data.jobName.trim(),
      scope: data.scope.trim(),
      status: 'open',
      has_image: hasImage,
      file_name: hasImage ? data.image!.fileName : '',
      mime_type: hasImage ? data.image!.mimeType : '',
      size: hasImage ? data.image!.bytes.length : 0,
      created_by: data.createdBy,
      version: 1,
    }),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  const id = Number(created.id);
  if (hasImage && data.image) {
    writeQuoteSizeFiles(id, data.image.bytes, makeProofThumb(data.image.bytes));
  }
  const row = await getQuoteSizeCloud(id);
  if (!row) throw new Error('Failed to load created quote size.');
  return row;
}

export async function updateQuoteSizeSafeCloud(
  id: number,
  expectedVersion: number,
  fields: Partial<{
    job_name: string;
    scope: string;
    status: QuoteSizeStatus;
    has_image?: boolean | number;
    file_name: string;
    mime_type: string;
    size: number;
    archived_at: string | null;
  }>
): Promise<{ conflict: true; server: QuoteSizeRow } | QuoteSizeRow | undefined> {
  const current = await getQuoteSizeCloud(id);
  if (!current) return undefined;
  if (current.version !== expectedVersion) {
    return { conflict: true, server: current };
  }
  const patch = { ...fields, version: expectedVersion + 1 };
  const res = await sbFetch('quote_sizes', {
    method: 'PATCH',
    query: { id: `eq.${id}`, version: `eq.${expectedVersion}` },
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`update quote size ${res.status}: ${text}`);
  const rows = text ? JSON.parse(text) : [];
  if (!rows.length) {
    const fresh = await getQuoteSizeCloud(id);
    if (!fresh) return undefined;
    return { conflict: true, server: fresh };
  }
  return (await getQuoteSizeCloud(id))!;
}

export async function listQuoteSizeNotesCloud(quoteSizeId: number): Promise<QuoteSizeNoteRow[]> {
  await ensureUserCache();
  const rows = await sbJson<any[]>('quote_size_notes', {
    query: {
      select: '*',
      quote_size_id: `eq.${quoteSizeId}`,
      order: 'created_at.asc,id.asc',
    },
  });
  return rows.map((row) => ({
    id: Number(row.id),
    quote_size_id: Number(row.quote_size_id),
    author_id: Number(row.author_id),
    author_name: findUserByIdCloudCached(Number(row.author_id))?.full_name || 'Someone',
    body: row.body || '',
    has_image: asBool(row.has_image),
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    size: Number(row.size) || 0,
    created_at: row.created_at,
  }));
}

export async function addQuoteSizeNoteCloud(
  quoteSizeId: number,
  authorId: number,
  body: string,
  image?: { bytes: Uint8Array; fileName: string; mimeType: string } | null
): Promise<QuoteSizeNoteRow> {
  const hasImage = Boolean(image && image.bytes.length > 0);
  const rows = await sbJson<any[]>('quote_size_notes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      quote_size_id: quoteSizeId,
      author_id: authorId,
      body: body.trim(),
      has_image: hasImage,
      file_name: hasImage ? image!.fileName : '',
      mime_type: hasImage ? image!.mimeType : '',
      size: hasImage ? image!.bytes.length : 0,
    }),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  if (hasImage && image) {
    writeQuoteSizeNoteFiles(Number(created.id), image.bytes, makeProofThumb(image.bytes));
  }
  await ensureUserCache();
  return {
    id: Number(created.id),
    quote_size_id: Number(created.quote_size_id),
    author_id: Number(created.author_id),
    author_name: findUserByIdCloudCached(Number(created.author_id))?.full_name || 'Someone',
    body: created.body || '',
    has_image: asBool(created.has_image) || hasImage,
    file_name: created.file_name || (hasImage ? image!.fileName : ''),
    mime_type: created.mime_type || (hasImage ? image!.mimeType : ''),
    size: Number(created.size) || (hasImage ? image!.bytes.length : 0),
    created_at: created.created_at,
  };
}

export async function addQuoteSizeMentionsCloud(
  noteId: number,
  quoteSizeId: number,
  mentionedUserIds: number[],
  createdBy: number
): Promise<void> {
  const ids = [...new Set(mentionedUserIds)].filter((id) => id !== createdBy);
  if (!ids.length) return;
  const payload = ids.map((userId) => ({
    note_id: noteId,
    quote_size_id: quoteSizeId,
    mentioned_user_id: userId,
    created_by: createdBy,
    seen: false,
  }));
  const res = await sbFetch('quote_size_mentions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`quote size mentions ${res.status}: ${text}`);
  }
}

function asBoolSeen(v: unknown): number {
  return v === true || v === 1 || v === 'true' ? 1 : 0;
}

export async function listUnseenQuoteSizeMentionsCloud(userId: number): Promise<QuoteSizeMentionRow[]> {
  const rows = await sbJson<any[]>('quote_size_mentions', {
    query: {
      select: '*',
      mentioned_user_id: `eq.${userId}`,
      seen: 'eq.false',
      order: 'created_at.desc',
    },
  });
  if (!rows.length) return [];
  await ensureUserCache();
  const qsIds = [...new Set(rows.map((r) => Number(r.quote_size_id)))];
  const noteIds = [...new Set(rows.map((r) => Number(r.note_id)))];
  const [quotes, notes] = await Promise.all([
    qsIds.length
      ? sbJson<any[]>('quote_sizes', {
          query: { select: 'id,job_name', id: `in.(${qsIds.join(',')})` },
        })
      : Promise.resolve([] as any[]),
    noteIds.length
      ? sbJson<any[]>('quote_size_notes', {
          query: { select: 'id,body', id: `in.(${noteIds.join(',')})` },
        })
      : Promise.resolve([] as any[]),
  ]);
  const qMap = new Map(quotes.map((q) => [Number(q.id), q]));
  const nMap = new Map(notes.map((n) => [Number(n.id), n]));
  return rows.map((m) => ({
    id: Number(m.id),
    note_id: Number(m.note_id),
    quote_size_id: Number(m.quote_size_id),
    mentioned_user_id: Number(m.mentioned_user_id),
    created_by: Number(m.created_by),
    created_at: m.created_at,
    seen: asBoolSeen(m.seen),
    job_name: qMap.get(Number(m.quote_size_id))?.job_name || '',
    author_name: findUserByIdCloudCached(Number(m.created_by))?.full_name || 'Someone',
    note_body: nMap.get(Number(m.note_id))?.body || '',
  }));
}

export async function markQuoteSizeMentionsSeenCloud(
  userId: number,
  quoteSizeId: number
): Promise<number> {
  const res = await sbFetch('quote_size_mentions', {
    method: 'PATCH',
    query: {
      mentioned_user_id: `eq.${userId}`,
      quote_size_id: `eq.${quoteSizeId}`,
      seen: 'eq.false',
    },
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ seen: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`mark quote mentions ${res.status}: ${text}`);
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows.length : 0;
}

export async function listUnseenQuoteSizeIdsCloud(userId: number): Promise<number[]> {
  const [active, seen] = await Promise.all([
    sbJson<any[]>('quote_sizes', {
      query: { select: 'id', archived_at: 'is.null', status: 'eq.open' },
    }),
    sbJson<any[]>('quote_size_seen', {
      query: { select: 'quote_size_id', user_id: `eq.${userId}` },
    }),
  ]);
  const seenSet = new Set(seen.map((s) => Number(s.quote_size_id)));
  return active.map((o) => Number(o.id)).filter((id) => !seenSet.has(id));
}

export async function markQuoteSizesSeenCloud(
  userId: number,
  quoteSizeIds?: number[]
): Promise<number> {
  let ids = quoteSizeIds;
  if (!ids || !ids.length) {
    const active = await sbJson<any[]>('quote_sizes', {
      query: { select: 'id', archived_at: 'is.null' },
    });
    ids = active.map((o) => Number(o.id));
  }
  if (!ids.length) return 0;
  const payload = ids.map((quote_size_id) => ({ user_id: userId, quote_size_id }));
  const res = await sbFetch('quote_size_seen', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`mark quote sizes seen ${res.status}: ${text}`);
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows.length : 0;
}

export function getQuoteSizeImageBytesCloud(id: number): { mime: string; data: Uint8Array } | null {
  const data = readQuoteSizeImage(id);
  if (!data) return null;
  return { mime: 'image/jpeg', data };
}

export function getQuoteSizeThumbBytesCloud(id: number): { mime: string; data: Uint8Array } | null {
  const thumb = readQuoteSizeThumb(id);
  if (thumb) return { mime: 'image/jpeg', data: thumb };
  return getQuoteSizeImageBytesCloud(id);
}

export function getQuoteSizeNoteImageBytesCloud(noteId: number): { mime: string; data: Uint8Array } | null {
  const data = readQuoteSizeNoteImage(noteId);
  if (!data) return null;
  return { mime: 'image/jpeg', data };
}

export function getQuoteSizeNoteThumbBytesCloud(noteId: number): { mime: string; data: Uint8Array } | null {
  const thumb = readQuoteSizeNoteThumb(noteId);
  if (thumb) return { mime: 'image/jpeg', data: thumb };
  return getQuoteSizeNoteImageBytesCloud(noteId);
}
