import path from 'node:path';
import fs from 'node:fs';

export type AiProvider = 'off' | 'ollama' | 'openai';

export interface StoredAiSettings {
  provider: AiProvider;
  ollamaUrl: string;
  ollamaModel: string;
  openaiUrl: string;
  openaiModel: string;
  openaiApiKey: string;
}

interface Settings {
  dbPath?: string;
  /** Folder that contains joblio-api-key.txt (and usually proofs / endpoint). */
  shareRoot?: string;
  ai?: Partial<StoredAiSettings>;
}

export function getSettingsDir(): string {
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

export const DEFAULT_AI_SETTINGS: StoredAiSettings = {
  provider: 'off',
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: 'auto',
  openaiUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini',
  openaiApiKey: '',
};

export function hasExplicitAiProvider(): boolean {
  const p = readRaw().ai?.provider;
  return p === 'off' || p === 'ollama' || p === 'openai';
}

export function getStoredAiSettings(): StoredAiSettings {
  const raw = readRaw().ai || {};
  const provider: AiProvider =
    raw.provider === 'ollama' || raw.provider === 'openai' || raw.provider === 'off'
      ? raw.provider
      : 'off';
  return {
    provider,
    ollamaUrl: String(raw.ollamaUrl || DEFAULT_AI_SETTINGS.ollamaUrl).replace(/\/$/, ''),
    ollamaModel: String(raw.ollamaModel || DEFAULT_AI_SETTINGS.ollamaModel).trim() || 'auto',
    openaiUrl: String(raw.openaiUrl || DEFAULT_AI_SETTINGS.openaiUrl).replace(/\/$/, ''),
    openaiModel: String(raw.openaiModel || DEFAULT_AI_SETTINGS.openaiModel).trim() || 'gpt-4o-mini',
    openaiApiKey: String(raw.openaiApiKey || ''),
  };
}

/** Pass openaiApiKey only when the admin typed a new key; blank keeps the saved one. */
export function setStoredAiSettings(
  next: Omit<StoredAiSettings, 'openaiApiKey'> & { openaiApiKey?: string }
): StoredAiSettings {
  const current = getStoredAiSettings();
  const merged: StoredAiSettings = {
    provider: next.provider,
    ollamaUrl: next.ollamaUrl.replace(/\/$/, '') || DEFAULT_AI_SETTINGS.ollamaUrl,
    ollamaModel: next.ollamaModel.trim() || 'auto',
    openaiUrl: next.openaiUrl.replace(/\/$/, '') || DEFAULT_AI_SETTINGS.openaiUrl,
    openaiModel: next.openaiModel.trim() || DEFAULT_AI_SETTINGS.openaiModel,
    openaiApiKey:
      next.openaiApiKey !== undefined && next.openaiApiKey.trim()
        ? next.openaiApiKey.trim()
        : current.openaiApiKey,
  };
  const data = readRaw();
  data.ai = merged;
  writeRaw(data);
  return merged;
}

/** Folder for AI extras (prices, intelligence) when there is no share. */
export function getAiDataDir(): string {
  const share = getShareRoot();
  if (share) return share;
  const db = getSettings().path;
  if (db) return path.dirname(db);
  return getSettingsDir();
}
