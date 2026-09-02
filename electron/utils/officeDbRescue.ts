import fs from 'node:fs';
import path from 'node:path';
import { peekSqliteJobCount } from '../db/connection';
import { getDataBackend, setRuntimeDataBackend } from '../db/backendMode';
import { getLocalDbPath, getSettings } from '../services/settingsService';
import { officeShareHasApiKey, setStoredDataBackend } from './dataBackendPref';

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/**
 * Shop PCs that failed to reach Docker once can stick on sqlite and create an
 * empty jobs.db on the share (or a wrong UNC). If the office API key is
 * visible and that file has no live jobs, switch back to the shop server.
 * Home “Start on this PC” (AppData jobs.db) is left alone.
 */
export async function rescueEmptyOfficeSqlite(): Promise<boolean> {
  const env = (process.env.JOBLIO_DATA_BACKEND || '').trim().toLowerCase();
  if (env === 'sqlite' || env === 'selfhost' || env === 'docker') return false;
  if (getDataBackend() !== 'sqlite') return false;
  if (!officeShareHasApiKey()) return false;

  const dbPath = getSettings().path;
  if (!dbPath) return false;
  if (samePath(dbPath, getLocalDbPath())) return false;

  let count = 0;
  if (fs.existsSync(dbPath)) {
    const peeked = await peekSqliteJobCount(dbPath);
    if (peeked == null) return false;
    count = peeked;
  }
  if (count > 0) return false;

  setStoredDataBackend('selfhost');
  setRuntimeDataBackend('selfhost');
  return true;
}
