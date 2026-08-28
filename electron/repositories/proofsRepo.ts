import { nativeImage } from 'electron';
import { getDatabase, scheduleSave } from '../db/connection';
import { createDbHelpers } from '../db/helpers';
import {
  deleteProofFiles,
  emptyBlob,
  readProofFile,
  readThumbFile,
  writeProofFiles,
  writeProofFilesAsync,
  readProofFileAsync,
} from '../utils/proofStorage';

export interface JobProof {
  id: number;
  job_id: number;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by: number;
  uploaded_name: string | null;
  created_at: string;
}

export interface JobProofWithData extends JobProof {
  data: Uint8Array;
}

function rowMapper(row: any): JobProof {
  return {
    id: row.id,
    job_id: row.job_id,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size: row.size ?? 0,
    uploaded_by: row.uploaded_by,
    uploaded_name: row.uploaded_name ?? null,
    created_at: row.created_at,
  };
}

function blobLen(b: unknown): number {
  if (!b) return 0;
  if (b instanceof Uint8Array) return b.length;
  if (Buffer.isBuffer(b)) return b.length;
  return 0;
}

/** Downscale large camera photos before storage. */
export function compressProofImage(
  data: Uint8Array,
  mimeType: string,
  maxEdge = 1600,
  quality = 78
): { data: Uint8Array; mime_type: string; size: number } {
  try {
    const img = nativeImage.createFromBuffer(Buffer.from(data));
    if (img.isEmpty()) {
      return { data, mime_type: mimeType, size: data.length };
    }
    const { width, height } = img.getSize();
    if (!width || !height) {
      return { data, mime_type: mimeType, size: data.length };
    }
    const edge = Math.max(width, height);
    const scale = edge > maxEdge ? maxEdge / edge : 1;
    const resized =
      scale < 1
        ? img.resize({
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale)),
            quality: 'better',
          })
        : img;
    const jpeg = new Uint8Array(resized.toJPEG(quality));
    if (scale < 1 || jpeg.length < data.length) {
      return { data: jpeg, mime_type: 'image/jpeg', size: jpeg.length };
    }
    return { data, mime_type: mimeType, size: data.length };
  } catch {
    return { data, mime_type: mimeType, size: data.length };
  }
}

export function makeProofThumb(data: Uint8Array): Uint8Array | null {
  try {
    const img = nativeImage.createFromBuffer(Buffer.from(data));
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    if (!width || !height) return null;
    const maxW = 240;
    const scale = width > maxW ? maxW / width : 1;
    const resized = img.resize({
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      quality: 'better',
    });
    return new Uint8Array(resized.toJPEG(70));
  } catch {
    return null;
  }
}

export function listProofs(jobId: number): JobProof[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const rows = h.all(
    `SELECT id, job_id, file_name, mime_type, size, uploaded_by, uploaded_name, created_at
       FROM job_proofs
      WHERE job_id = ?
      ORDER BY created_at DESC`,
    [jobId]
  );
  return rows.map(rowMapper);
}

function loadProofBytes(id: number, blob: unknown): Uint8Array | null {
  const fromFile = readProofFile(id);
  if (fromFile && fromFile.length > 0) return fromFile;
  if (blobLen(blob) > 0) return blob as Uint8Array;
  return null;
}

export function getProof(id: number): JobProofWithData | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const row = h.get(
    `SELECT id, job_id, file_name, mime_type, size, uploaded_by, uploaded_name, created_at, data
       FROM job_proofs
      WHERE id = ?`,
    [id]
  );
  if (!row) return undefined;

  const data = loadProofBytes(id, row.data);
  if (!data) return undefined;

  return {
    ...rowMapper(row),
    data,
  };
}

export function getProofThumb(id: number): JobProofWithData | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const meta = h.get(
    `SELECT id, job_id, file_name, mime_type, size, uploaded_by, uploaded_name, created_at, thumb
       FROM job_proofs
      WHERE id = ?`,
    [id]
  );
  if (!meta) return undefined;

  const fromFile = readThumbFile(id);
  if (fromFile && fromFile.length > 0) {
    return {
      ...rowMapper(meta),
      mime_type: 'image/jpeg',
      data: fromFile,
    };
  }

  if (blobLen(meta.thumb) > 0) {
    return {
      ...rowMapper(meta),
      mime_type: 'image/jpeg',
      data: meta.thumb as Uint8Array,
    };
  }

  const fullRow = h.get(`SELECT data FROM job_proofs WHERE id = ?`, [id]) as
    | { data: Uint8Array }
    | undefined;
  const full = loadProofBytes(id, fullRow?.data);
  if (!full) return undefined;

  const thumb = makeProofThumb(full);
  if (!thumb) return undefined;

  try {
    writeProofFiles(id, full, thumb);
  } catch {
    // still return in-memory thumb
  }

  return {
    ...rowMapper(meta),
    mime_type: 'image/jpeg',
    data: thumb,
  };
}

export function addProof(data: {
  job_id: number;
  file_name: string;
  mime_type: string;
  data: Uint8Array;
  size: number;
  uploaded_by: number;
  uploaded_name?: string | null;
}): JobProof {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const compressed = compressProofImage(data.data, data.mime_type);
  const thumb = makeProofThumb(compressed.data);
  const fileName =
    compressed.mime_type === 'image/jpeg' && !/\.jpe?g$/i.test(data.file_name)
      ? data.file_name.replace(/\.[^.]+$/, '') + '.jpg'
      : data.file_name;

  // Empty BLOBs in SQLite — image bytes live under proofs/ next to jobs.db
  const result = h.run(
    `INSERT INTO job_proofs (job_id, file_name, mime_type, data, size, uploaded_by, uploaded_name, thumb)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.job_id,
      fileName,
      compressed.mime_type,
      emptyBlob(),
      compressed.size,
      data.uploaded_by,
      data.uploaded_name ?? null,
      emptyBlob(),
    ]
  );

  const id = Number(result.lastInsertRowid);
  writeProofFiles(id, compressed.data, thumb);
  scheduleSave(600);

  return listProofs(data.job_id).find((p) => p.id === id) ?? {
    id,
    job_id: data.job_id,
    file_name: fileName,
    mime_type: compressed.mime_type,
    size: compressed.size,
    uploaded_by: data.uploaded_by,
    uploaded_name: data.uploaded_name ?? null,
    created_at: new Date().toISOString(),
  };
}

export function deleteProof(id: number): boolean {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run('DELETE FROM job_proofs WHERE id = ?', [id]);
  deleteProofFiles(id);
  scheduleSave(400);
  return true;
}

/**
 * Idempotent: move proof BLOBs out of SQLite onto the share folder.
 * Shrinks jobs.db so multi-user sync no longer freezes the UI.
 */
export async function migrateProofsToFilesAsync(): Promise<{ moved: number; vacuumed: boolean }> {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const rows = h.all(
    `SELECT id, data, thumb FROM job_proofs WHERE LENGTH(data) > 32`
  ) as Array<{ id: number; data: Uint8Array; thumb: Uint8Array | null }>;

  let moved = 0;
  for (const row of rows) {
    const onDisk = await readProofFileAsync(row.id);
    if (!onDisk || onDisk.length === 0) {
      const thumb =
        blobLen(row.thumb) > 0
          ? (row.thumb as Uint8Array)
          : makeProofThumb(row.data as Uint8Array);
      await writeProofFilesAsync(row.id, row.data as Uint8Array, thumb);
    }

    db.run('UPDATE job_proofs SET data = ?, thumb = ? WHERE id = ?', [
      emptyBlob(),
      emptyBlob(),
      row.id,
    ]);
    moved++;
    await new Promise<void>((r) => setImmediate(r));
  }

  let vacuumed = false;
  if (moved > 0) {
    try {
      // Compact once after extracting blobs — expensive; never do this on a no-op start
      await new Promise<void>((r) => setImmediate(r));
      db.run('VACUUM');
      vacuumed = true;
    } catch (err) {
      console.warn('[proofs] VACUUM failed:', err);
    }
    scheduleSave(200);
  }

  return { moved, vacuumed };
}
