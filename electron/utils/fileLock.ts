import fs from 'node:fs';

const LOCK_EXTENSION = '.lock';

/** Ref-count so the same process can nest acquire/release safely. */
const lockDepth = new Map<string, number>();

function tryCreateLock(lockPath: string): boolean {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeSync(fd, Buffer.from(String(process.pid), 'utf-8'));
    fs.closeSync(fd);
    return true;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error(`Cannot acquire lock: directory does not exist for ${lockPath}`);
    }
    if (err.code === 'EEXIST') {
      try {
        const stat = fs.statSync(lockPath);
        // Stale lock — older than 45s (large DB writes on slow SMB can take a while)
        if (Date.now() - stat.mtimeMs > 45000) {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      return false;
    }
    throw err;
  }
}

/**
 * Acquire an exclusive file lock by atomically creating a .lock file.
 * Retries until timeout. Works on network shares (SMB).
 * Nested acquires from the same process are ref-counted (reentrant).
 *
 * Prefer acquireLockAsync on the Electron main process when waiting —
 * Atomics.wait freezes the UI until the lock is free.
 */
export function acquireLock(dbPath: string, timeoutMs = 30000): void {
  const lockPath = dbPath + LOCK_EXTENSION;
  const depth = lockDepth.get(lockPath) ?? 0;
  if (depth > 0) {
    lockDepth.set(lockPath, depth + 1);
    return;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (tryCreateLock(lockPath)) {
      lockDepth.set(lockPath, 1);
      return;
    }
    const delay = 40 + Math.random() * 40;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
  }

  throw new Error(
    `Timeout: could not acquire DB lock after ${timeoutMs}ms. Another user may be saving.`
  );
}

/**
 * Non-blocking lock wait — yields to the event loop so the UI stays responsive
 * while another designer finishes writing the shared DB.
 */
export async function acquireLockAsync(dbPath: string, timeoutMs = 30000): Promise<void> {
  const lockPath = dbPath + LOCK_EXTENSION;
  const depth = lockDepth.get(lockPath) ?? 0;
  if (depth > 0) {
    lockDepth.set(lockPath, depth + 1);
    return;
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (tryCreateLock(lockPath)) {
      lockDepth.set(lockPath, 1);
      return;
    }
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 50));
  }

  throw new Error(
    `Timeout: could not acquire DB lock after ${timeoutMs}ms. Another user may be saving.`
  );
}

/**
 * Release a previously acquired file lock (respects nesting).
 */
export function releaseLock(dbPath: string): void {
  const lockPath = dbPath + LOCK_EXTENSION;
  const depth = lockDepth.get(lockPath) ?? 0;
  if (depth <= 0) return;

  if (depth > 1) {
    lockDepth.set(lockPath, depth - 1);
    return;
  }

  lockDepth.delete(lockPath);
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Lock may have been removed already — that's fine
  }
}
