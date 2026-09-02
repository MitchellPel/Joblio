import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from './migrate';
import { acquireLock, acquireLockAsync, releaseLock } from '../utils/fileLock';

let db: SqlJsDatabase | null = null;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let lastKnownMtime = 0;
let lastKnownSize = 0;

let readyWaiters: Array<() => void> = [];

function notifyDbReady(): void {
  const waiters = readyWaiters;
  readyWaiters = [];
  for (const resolve of waiters) resolve();
}

/**
 * Resolves true once the database is initialized (or immediately if it already
 * is), false after the timeout. Lets the window open before DB init finishes
 * without login racing against the network-share load.
 */
export function whenDbReady(timeoutMs = 60000): Promise<boolean> {
  if (db) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    readyWaiters.push(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function getFileFingerprint(dbPath: string): { mtimeMs: number; size: number } | null {
  try {
    const stat = fs.statSync(dbPath);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

async function getFileFingerprintAsync(
  dbPath: string
): Promise<{ mtimeMs: number; size: number } | null> {
  try {
    const stat = await fs.promises.stat(dbPath);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

function updateFingerprint(dbPath?: string): void {
  const p = dbPath || getSettingsPath();
  if (!p) return;
  const fp = getFileFingerprint(p);
  if (fp) {
    lastKnownMtime = fp.mtimeMs;
    lastKnownSize = fp.size;
  }
}

async function updateFingerprintAsync(dbPath?: string): Promise<void> {
  const p = dbPath || getSettingsPath();
  if (!p) return;
  const fp = await getFileFingerprintAsync(p);
  if (fp) {
    lastKnownMtime = fp.mtimeMs;
    lastKnownSize = fp.size;
  }
}

function getSettingsPath(): string | null {
  const settingsFile = path.join(
    process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming'),
    'signage-job-tracker',
    'settings.json'
  );
  try {
    if (!fs.existsSync(settingsFile)) return null;
    const data = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    return data.dbPath || null;
  } catch {
    return null;
  }
}

function writeDbAtomically(savePath: string, buffer: Buffer): void {
  const tmpPath = savePath + '.tmp';
  fs.writeFileSync(tmpPath, buffer);
  try {
    fs.renameSync(tmpPath, savePath);
  } catch {
    try {
      fs.copyFileSync(tmpPath, savePath);
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  }
}

async function writeDbAtomicallyAsync(savePath: string, buffer: Buffer): Promise<void> {
  const tmpPath = savePath + '.tmp';
  // Clean up aborted zero-byte temps from prior freezes
  try {
    const st = await fs.promises.stat(tmpPath);
    if (st.size === 0) await fs.promises.unlink(tmpPath);
  } catch {
    // ignore
  }
  await fs.promises.writeFile(tmpPath, buffer);
  try {
    await fs.promises.rename(tmpPath, savePath);
  } catch {
    try {
      await fs.promises.copyFile(tmpPath, savePath);
    } finally {
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // ignore
      }
    }
  }
}

function yieldMain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function ensureSqlJs(): Promise<NonNullable<typeof SQL>> {
  if (SQL) return SQL;
  const devPath = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmPath = fs.existsSync(devPath)
    ? devPath
    : path.join(__dirname, 'sql-wasm.wasm');
  SQL = await initSqlJs({
    locateFile: (file: string) => {
      const dir = path.dirname(wasmPath);
      return path.join(dir, file);
    },
  });
  return SQL;
}

/** Read-only job count. Does not create or migrate the file. */
export async function peekSqliteJobCount(dbPath: string): Promise<number | null> {
  if (!fs.existsSync(dbPath)) return 0;
  try {
    const engine = await ensureSqlJs();
    const buffer = await fs.promises.readFile(dbPath);
    const peek = new engine.Database(buffer);
    try {
      const stmt = peek.prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='jobs'`
      );
      const hasTable = stmt.step() ? Number(stmt.getAsObject().n || 0) > 0 : false;
      stmt.free();
      if (!hasTable) return 0;
      const count = peek.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE archived_at IS NULL`);
      const n = count.step() ? Number(count.getAsObject().n || 0) : 0;
      count.free();
      return n;
    } finally {
      peek.close();
    }
  } catch {
    return null;
  }
}

export async function initDatabaseAsync(customPath?: string): Promise<SqlJsDatabase> {
  if (db) return db;

  const engine = await ensureSqlJs();

  const dbPath = customPath || getSettingsPath();
  if (!dbPath) {
    throw new Error('Database path not configured. Please set the shared folder path on first run.');
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await acquireLockAsync(dbPath, 45000);
  try {
    const fileExisted = fs.existsSync(dbPath);
    let buffer: Buffer | null = null;
    if (fileExisted) {
      buffer = await fs.promises.readFile(dbPath);
      await yieldMain();
    }

    db = buffer ? new engine.Database(buffer) : new engine.Database();
    db.run('PRAGMA foreign_keys = ON');

    const migrated = migrate(db);
    if (migrated || !fileExisted) {
      await yieldMain();
      const exported = Buffer.from(db.export());
      await yieldMain();
      await writeDbAtomicallyAsync(dbPath, exported);
    }
    await updateFingerprintAsync(dbPath);
  } finally {
    releaseLock(dbPath);
  }

  notifyDbReady();
  return db;
}

export function getDatabase(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function getDbPath(): string | null {
  return getSettingsPath();
}

export function saveToDisk(dbPath?: string): void {
  if (!db) return;
  const savePath = dbPath || getSettingsPath();
  if (!savePath) return;

  acquireLock(savePath);
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    writeDbAtomically(savePath, buffer);
    updateFingerprint(savePath);
  } finally {
    releaseLock(savePath);
  }
}

/**
 * Async save — lock wait + SMB write never block the UI with Atomics.wait /
 * writeFileSync. Export still runs on the main thread (sql.js limitation) but
 * we yield before/after so Windows can paint.
 */
export async function saveToDiskAsync(dbPath?: string): Promise<void> {
  if (!db) return;
  const savePath = dbPath || getSettingsPath();
  if (!savePath) return;

  await yieldMain();
  const data = db.export();
  const buffer = Buffer.from(data);
  await yieldMain();

  await acquireLockAsync(savePath, 45000);
  try {
    await writeDbAtomicallyAsync(savePath, buffer);
    await updateFingerprintAsync(savePath);
  } finally {
    releaseLock(savePath);
  }
}

let pendingSaveTimer: NodeJS.Timeout | null = null;
let saveInFlight = false;
let saveAgain = false;

/**
 * Debounced save: rapid edits (board moves, notes) collapse into one share write.
 * Longer default delay = fewer full-DB freezes while people work.
 */
export function scheduleSave(delayMs = 900): void {
  if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    void (async () => {
      if (saveInFlight) {
        saveAgain = true;
        return;
      }
      saveInFlight = true;
      try {
        await saveToDiskAsync();
      } catch (err) {
        console.warn('[db] Deferred save failed:', err instanceof Error ? err.message : err);
      } finally {
        saveInFlight = false;
        if (saveAgain) {
          saveAgain = false;
          scheduleSave(400);
        }
      }
    })();
  }, delayMs);
}

export function hasPendingSave(): boolean {
  return pendingSaveTimer !== null || saveInFlight;
}

let reloadInFlight = false;
let lastReloadAt = 0;
const RELOAD_COOLDOWN_MS = 4000;

/**
 * Async reload when another PC changed the shared file.
 * Never use sync readFile / Atomics.wait here — that is what makes Windows
 * show "Not Responding" every few seconds on a busy share.
 */
export async function reloadFromDiskIfChangedAsync(): Promise<boolean> {
  if (!db || !SQL) return false;
  if (hasPendingSave() || reloadInFlight) return false;
  if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) return false;

  const dbPath = getSettingsPath();
  if (!dbPath) return false;

  const fpEarly = await getFileFingerprintAsync(dbPath);
  if (!fpEarly) return false;
  if (fpEarly.mtimeMs === lastKnownMtime && fpEarly.size === lastKnownSize) {
    return false;
  }

  reloadInFlight = true;
  try {
    // Short wait — if another client is saving, skip this round
    try {
      await acquireLockAsync(dbPath, 400);
    } catch {
      return false;
    }

    try {
      const fp = await getFileFingerprintAsync(dbPath);
      if (!fp) return false;
      if (fp.mtimeMs === lastKnownMtime && fp.size === lastKnownSize) {
        return false;
      }

      const buffer = await fs.promises.readFile(dbPath);
      await yieldMain();

      let next: SqlJsDatabase;
      try {
        next = new SQL.Database(buffer);
        next.run('PRAGMA foreign_keys = ON');
      } catch (err) {
        console.warn(
          '[db] Failed to load shared database (possibly mid-write). Keeping current copy.',
          err
        );
        return false;
      }

      const old = db;
      db = next;
      try {
        old.close();
      } catch {
        // ignore
      }

      lastKnownMtime = fp.mtimeMs;
      lastKnownSize = fp.size;
      lastReloadAt = Date.now();
      return true;
    } finally {
      releaseLock(dbPath);
    }
  } finally {
    reloadInFlight = false;
  }
}

/** @deprecated Prefer reloadFromDiskIfChangedAsync — sync path freezes the UI. */
export function reloadFromDiskIfChanged(): boolean {
  // Keep a no-op sync stub so nothing accidentally freezes; real work is async.
  return false;
}

export function closeDatabase(): void {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  if (db) {
    try {
      saveToDisk();
    } catch (err: any) {
      console.warn('[db] Final save failed:', err.message);
    }
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
    lastKnownMtime = 0;
    lastKnownSize = 0;
  }
}
