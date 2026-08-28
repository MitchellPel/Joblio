import path from 'node:path';
import fs from 'node:fs';

interface Settings {
  dbPath?: string;
  /** Folder that contains joblio-api-key.txt (and usually proofs / endpoint). */
  shareRoot?: string;
}

function getSettingsDir(): string {
  return path.join(
    process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
    'signage-job-tracker'
  );
}

function getSettingsFile(): string {
  return path.join(getSettingsDir(), 'settings.json');
}

function readRaw(): Settings {
  try {
    if (!fs.existsSync(getSettingsFile())) return {};
    return JSON.parse(fs.readFileSync(getSettingsFile(), 'utf-8')) as Settings;
  } catch {
    return {};
  }
}

function writeRaw(data: Settings): void {
  const dir = getSettingsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getSettingsFile(), JSON.stringify(data, null, 2), 'utf-8');
}

export function getSettings(): { configured: boolean; path: string | null } {
  const data = readRaw();
  return { configured: !!data.dbPath, path: data.dbPath || null };
}

export function setDbPath(dbPath: string): void {
  const data = readRaw();
  data.dbPath = dbPath;
  writeRaw(data);
}

export function getLocalDbPath(): string {
  return path.join(getSettingsDir(), 'jobs.db');
}

export function useLocalDb(): string {
  const dbPath = getLocalDbPath();
  setDbPath(dbPath);
  return dbPath;
}

export function getShareRoot(): string | null {
  const root = readRaw().shareRoot?.trim();
  return root || null;
}

/** Save the share folder that holds joblio-api-key.txt. */
export function setShareRoot(shareRoot: string): void {
  const data = readRaw();
  data.shareRoot = shareRoot.trim().replace(/[\\/]+$/, '');
  writeRaw(data);
}
