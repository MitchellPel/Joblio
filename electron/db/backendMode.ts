/**
 * Data backend switch.
 *
 * Default / published builds: sqlite (shared jobs.db) — staff unaffected.
 * Self-host (Docker) when:
 *   1) JOBLIO_DATA_BACKEND=selfhost|docker (dev script override), or
 *   2) Settings preference on this PC (data-backend.json)
 */
import { getStoredDataBackend } from '../utils/dataBackendPref';

export type DataBackend = 'sqlite' | 'selfhost';

let storedOverride: DataBackend | null = null;

/** Used after Settings change within the same process; boot reads disk. */
export function setRuntimeDataBackend(backend: DataBackend): void {
  storedOverride = backend;
}

export function getDataBackend(): DataBackend {
  if (storedOverride) return storedOverride;

  const env = (process.env.JOBLIO_DATA_BACKEND || '').trim().toLowerCase();
  if (env === 'selfhost' || env === 'docker') return 'selfhost';
  if (env === 'sqlite') return 'sqlite';

  return getStoredDataBackend();
}

/** True when talking to office Docker Postgres (not staff SQLite). */
export function isSelfHostMode(): boolean {
  return getDataBackend() === 'selfhost';
}

/** @deprecated use isSelfHostMode */
export function isCloudTestMode(): boolean {
  return isSelfHostMode();
}

export function assertSelfHostTestOnly(): void {
  if (process.env.NODE_ENV === 'production' && isSelfHostMode()) {
    console.warn(
      '[backend] self-host mode in a production build — ensure this PC is meant to use Docker'
    );
  }
}
