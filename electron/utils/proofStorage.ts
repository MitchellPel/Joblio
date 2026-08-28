import fs from 'node:fs';
import path from 'node:path';
import { getDbPath } from '../db/connection';

const EMPTY = new Uint8Array(0);

/** Folder next to jobs.db: `\\server\...\Job Tracker\proofs\` */
export function getProofsDir(): string | null {
  const dbPath = getDbPath();
  if (!dbPath) return null;
  return path.join(path.dirname(dbPath), 'proofs');
}

export function ensureProofsDir(): string | null {
  const dir = getProofsDir();
  if (!dir) return null;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function proofFilePath(id: number): string | null {
  const dir = getProofsDir();
  if (!dir) return null;
  return path.join(dir, `${id}.img`);
}

export function thumbFilePath(id: number): string | null {
  const dir = getProofsDir();
  if (!dir) return null;
  return path.join(dir, `${id}.thumb.jpg`);
}

export function writeProofFiles(
  id: number,
  data: Uint8Array,
  thumb: Uint8Array | null
): void {
  const dir = ensureProofsDir();
  if (!dir) throw new Error('Database path not configured.');
  const full = proofFilePath(id)!;
  fs.writeFileSync(full, Buffer.from(data));
  if (thumb && thumb.length > 0) {
    fs.writeFileSync(thumbFilePath(id)!, Buffer.from(thumb));
  }
}

export async function writeProofFilesAsync(
  id: number,
  data: Uint8Array,
  thumb: Uint8Array | null
): Promise<void> {
  const dir = ensureProofsDir();
  if (!dir) throw new Error('Database path not configured.');
  await fs.promises.writeFile(proofFilePath(id)!, Buffer.from(data));
  if (thumb && thumb.length > 0) {
    await fs.promises.writeFile(thumbFilePath(id)!, Buffer.from(thumb));
  }
}

export function readProofFile(id: number): Uint8Array | null {
  const p = proofFilePath(id);
  if (!p || !fs.existsSync(p)) return null;
  return new Uint8Array(fs.readFileSync(p));
}

export async function readProofFileAsync(id: number): Promise<Uint8Array | null> {
  const p = proofFilePath(id);
  if (!p) return null;
  try {
    return new Uint8Array(await fs.promises.readFile(p));
  } catch {
    return null;
  }
}

export function readThumbFile(id: number): Uint8Array | null {
  const p = thumbFilePath(id);
  if (!p || !fs.existsSync(p)) return null;
  return new Uint8Array(fs.readFileSync(p));
}

export async function readThumbFileAsync(id: number): Promise<Uint8Array | null> {
  const p = thumbFilePath(id);
  if (!p) return null;
  try {
    return new Uint8Array(await fs.promises.readFile(p));
  } catch {
    return null;
  }
}

export function deleteProofFiles(id: number): void {
  for (const p of [proofFilePath(id), thumbFilePath(id)]) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
}

export function emptyBlob(): Uint8Array {
  return EMPTY;
}
