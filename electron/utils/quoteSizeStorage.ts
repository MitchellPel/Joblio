import fs from 'node:fs';
import path from 'node:path';
import { getDbPath } from '../db/connection';
import { getShareRoot, getSettings } from '../services/settingsService';

const DEFAULT_SHARE = '\\\\server\\D\\Joblio DB\\Jobtracker';
const FOLDER = 'quote-sizes';

const SHARE_DIRS = [
  `\\\\server\\D\\Joblio DB\\Jobtracker\\${FOLDER}`,
];

function pushDir(out: string[], d: string | null | undefined): void {
  if (!d) return;
  const n = d.replace(/[\\/]+$/, '');
  if (n && !out.includes(n)) out.push(n);
}

export function listQuoteSizeDirs(): string[] {
  const out: string[] = [];
  pushDir(out, process.env.JOBLIO_QUOTE_SIZES_DIR);
  try {
    const share = getShareRoot() || DEFAULT_SHARE;
    pushDir(out, path.join(share, FOLDER));
  } catch {
    // ignore
  }
  try {
    const settings = getSettings();
    if (settings.path) pushDir(out, path.join(path.dirname(settings.path), FOLDER));
  } catch {
    // ignore
  }
  try {
    const dbPath = getDbPath();
    if (dbPath) pushDir(out, path.join(path.dirname(dbPath), FOLDER));
  } catch {
    // ignore
  }
  for (const d of SHARE_DIRS) pushDir(out, d);
  return out;
}

export function resolveQuoteSizesDir(): string | null {
  const dirs = listQuoteSizeDirs();
  for (const dir of dirs) {
    try {
      if (fs.existsSync(dir)) return dir;
    } catch {
      // UNC existsSync can flake
    }
  }
  return dirs[0] || null;
}

export function ensureQuoteSizesDir(): string {
  const dir = resolveQuoteSizesDir();
  if (!dir) {
    throw new Error(
      'Quote Sizes folder not found. Point Joblio at the Jobtracker share so it can create quote-sizes.'
    );
  }
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function quoteSizeImagePath(id: number): string {
  return path.join(ensureQuoteSizesDir(), `${id}.img`);
}

export function quoteSizeThumbPath(id: number): string {
  return path.join(ensureQuoteSizesDir(), `${id}.thumb.jpg`);
}

export function writeQuoteSizeFiles(id: number, data: Uint8Array, thumb: Uint8Array | null): void {
  fs.writeFileSync(quoteSizeImagePath(id), Buffer.from(data));
  if (thumb && thumb.length > 0) {
    fs.writeFileSync(quoteSizeThumbPath(id), Buffer.from(thumb));
  }
}

export function readQuoteSizeImage(id: number): Uint8Array | null {
  try {
    const p = path.join(resolveQuoteSizesDir() || '', `${id}.img`);
    if (!p || !fs.existsSync(p)) return null;
    return new Uint8Array(fs.readFileSync(p));
  } catch {
    return null;
  }
}

export function readQuoteSizeThumb(id: number): Uint8Array | null {
  try {
    const dir = resolveQuoteSizesDir();
    if (!dir) return null;
    const p = path.join(dir, `${id}.thumb.jpg`);
    if (!fs.existsSync(p)) return null;
    return new Uint8Array(fs.readFileSync(p));
  } catch {
    return null;
  }
}

export function quoteSizeNoteImagePath(noteId: number): string {
  return path.join(ensureQuoteSizesDir(), `n${noteId}.img`);
}

export function quoteSizeNoteThumbPath(noteId: number): string {
  return path.join(ensureQuoteSizesDir(), `n${noteId}.thumb.jpg`);
}

export function writeQuoteSizeNoteFiles(noteId: number, data: Uint8Array, thumb: Uint8Array | null): void {
  fs.writeFileSync(quoteSizeNoteImagePath(noteId), Buffer.from(data));
  if (thumb && thumb.length > 0) {
    fs.writeFileSync(quoteSizeNoteThumbPath(noteId), Buffer.from(thumb));
  }
}

export function readQuoteSizeNoteImage(noteId: number): Uint8Array | null {
  try {
    const dir = resolveQuoteSizesDir();
    if (!dir) return null;
    const p = path.join(dir, `n${noteId}.img`);
    if (!fs.existsSync(p)) return null;
    return new Uint8Array(fs.readFileSync(p));
  } catch {
    return null;
  }
}

export function readQuoteSizeNoteThumb(noteId: number): Uint8Array | null {
  try {
    const dir = resolveQuoteSizesDir();
    if (!dir) return null;
    const p = path.join(dir, `n${noteId}.thumb.jpg`);
    if (!fs.existsSync(p)) return null;
    return new Uint8Array(fs.readFileSync(p));
  } catch {
    return null;
  }
}

function unlinkQuiet(p: string): void {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
}

export function deleteQuoteSizeFiles(id: number): void {
  const dir = resolveQuoteSizesDir();
  if (!dir) return;
  unlinkQuiet(path.join(dir, `${id}.img`));
  unlinkQuiet(path.join(dir, `${id}.thumb.jpg`));
}

export function deleteQuoteSizeNoteFiles(noteId: number): void {
  const dir = resolveQuoteSizesDir();
  if (!dir) return;
  unlinkQuiet(path.join(dir, `n${noteId}.img`));
  unlinkQuiet(path.join(dir, `n${noteId}.thumb.jpg`));
}
