import fs from 'node:fs';
import path from 'node:path';
import { getSettings } from '../services/settingsService';
import {
  compressProofImage,
  makeProofThumb,
  type JobProof,
  type JobProofWithData,
} from '../repositories/proofsRepo';
import { findUserByIdCloudCached, ensureUserCache } from './usersCloud';
import { sbFetch, sbJson, getSelfHostEnv } from './rest';
import { officeChild } from '../utils/officeShare';

function mapMeta(row: any): JobProof {
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    file_name: row.file_name,
    mime_type: row.mime_type,
    size: Number(row.size) || 0,
    uploaded_by: Number(row.uploaded_by),
    uploaded_name: row.uploaded_name ?? null,
    created_at: row.created_at,
  };
}

/** Proof images live on the Windows share — try every known folder (old + current). */
function listProofsDirs(): string[] {
  const out: string[] = [];
  const push = (d: string | null | undefined) => {
    if (!d) return;
    const n = d.replace(/[\\/]+$/, '');
    if (n && !out.includes(n)) out.push(n);
  };
  try {
    push(getSelfHostEnv().proofsDir);
  } catch {
    // env not ready
  }
  push(process.env.JOBLIO_PROOFS_DIR);
  try {
    const settings = getSettings();
    if (settings.path) push(path.join(path.dirname(settings.path), 'proofs'));
  } catch {
    // ignore
  }
  for (const d of officeChild('proofs')) push(d);
  return out;
}

function resolveProofsDir(): string | null {
  const dirs = listProofsDirs();
  for (const dir of dirs) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {
      // UNC existsSync can flake — keep looking
    }
  }
  return dirs[0] || null;
}

function ensureProofsDirWritable(): string {
  const dir = resolveProofsDir();
  if (!dir) {
    throw new Error(
      'Proofs folder not found. Set JOBLIO_PROOFS_DIR or point Joblio at the share that contains the proofs folder.'
    );
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeShareProofFiles(id: number, data: Uint8Array, thumb: Uint8Array | null): void {
  const dir = ensureProofsDirWritable();
  fs.writeFileSync(path.join(dir, `${id}.img`), Buffer.from(data));
  if (thumb && thumb.length > 0) {
    fs.writeFileSync(path.join(dir, `${id}.thumb.jpg`), Buffer.from(thumb));
  }
}

function deleteShareProofFiles(id: number): void {
  for (const dir of listProofsDirs()) {
    for (const name of [`${id}.img`, `${id}.thumb.jpg`]) {
      const p = path.join(dir, name);
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        // ignore
      }
    }
  }
}

function readShareBytes(id: number, suffix: string): Uint8Array | null {
  for (const dir of listProofsDirs()) {
    const full = path.join(dir, `${id}${suffix}`);
    try {
      if (fs.existsSync(full)) return new Uint8Array(fs.readFileSync(full));
    } catch {
      // try next folder
    }
  }
  return null;
}

function readProofFile(id: number): Uint8Array | null {
  return readShareBytes(id, '.img');
}

function readThumbFile(id: number): Uint8Array | null {
  return readShareBytes(id, '.thumb.jpg');
}

export async function listProofsCloud(jobId: number): Promise<JobProof[]> {
  const rows = await sbJson<any[]>('job_proofs', {
    query: {
      select: 'id,job_id,file_name,mime_type,size,uploaded_by,uploaded_name,created_at',
      job_id: `eq.${jobId}`,
      order: 'created_at.desc',
    },
  });
  return rows.map(mapMeta);
}

async function getProofRow(id: number): Promise<any | null> {
  const rows = await sbJson<any[]>('job_proofs', {
    query: {
      select: 'id,job_id,file_name,mime_type,size,storage_path,thumb_path,uploaded_by,uploaded_name,created_at',
      id: `eq.${id}`,
      limit: '1',
    },
  });
  return rows[0] || null;
}

export async function getProofCloud(id: number): Promise<JobProofWithData | undefined> {
  const row = await getProofRow(id);
  if (!row) return undefined;
  const data = readProofFile(id);
  if (!data) return undefined;
  return { ...mapMeta(row), data };
}

export async function getProofThumbCloud(id: number): Promise<JobProofWithData | undefined> {
  const row = await getProofRow(id);
  if (!row) return undefined;
  let data = readThumbFile(id);
  if (!data) {
    const full = readProofFile(id);
    if (!full) return undefined;
    data = makeProofThumb(full) || full;
  }
  return { ...mapMeta(row), mime_type: 'image/jpeg', data };
}

export async function addProofCloud(input: {
  job_id: number;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by: number;
  uploaded_name: string | null;
  data: Uint8Array;
}): Promise<JobProof> {
  await ensureUserCache();
  const compressed = compressProofImage(input.data, input.mime_type);
  const thumb = makeProofThumb(compressed.data);

  const rows = await sbJson<any[]>('job_proofs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      job_id: input.job_id,
      file_name: input.file_name,
      mime_type: compressed.mime_type,
      size: compressed.size,
      storage_path: 'share',
      thumb_path: null,
      uploaded_by: input.uploaded_by,
      uploaded_name:
        input.uploaded_name ?? findUserByIdCloudCached(input.uploaded_by)?.full_name ?? null,
    }),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  const id = Number(created.id);

  try {
    writeShareProofFiles(id, compressed.data, thumb);
    await sbFetch('job_proofs', {
      method: 'PATCH',
      query: { id: `eq.${id}` },
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        storage_path: `share/${id}.img`,
        thumb_path: thumb && thumb.length > 0 ? `share/${id}.thumb.jpg` : null,
      }),
    });
  } catch (err) {
    deleteShareProofFiles(id);
    await sbFetch('job_proofs', {
      method: 'DELETE',
      query: { id: `eq.${id}` },
      headers: { Prefer: 'return=minimal' },
    });
    throw err;
  }

  return {
    id,
    job_id: input.job_id,
    file_name: input.file_name,
    mime_type: compressed.mime_type,
    size: compressed.size,
    uploaded_by: input.uploaded_by,
    uploaded_name:
      input.uploaded_name ?? findUserByIdCloudCached(input.uploaded_by)?.full_name ?? null,
    created_at: created.created_at,
  };
}

/** Delete proof image files on the share (meta rows cascade with the job). */
export function deleteProofFilesCloud(id: number): void {
  deleteShareProofFiles(id);
}

export async function deleteProofCloud(id: number): Promise<void> {
  const row = await getProofRow(id);
  if (!row) return;
  deleteShareProofFiles(id);
  await sbFetch('job_proofs', {
    method: 'DELETE',
    query: { id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
  });
}
