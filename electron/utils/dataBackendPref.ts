import type { DataBackend } from '../db/backendMode';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { reachableOfficeShareRoots, officePathExists } from './officeShare';

const FILE = 'data-backend.json';

function filePath(): string {
  return path.join(app.getPath('userData'), FILE);
}

function officeShareLooksLikeSelfHost(): boolean {
  try {
    for (const root of reachableOfficeShareRoots()) {
      if (officePathExists(path.join(root, 'joblio-api-key.txt'))) return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Persisted preference (Settings). No file = first run / wiped PC. */
export function getStoredDataBackend(): DataBackend {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf-8')) as { backend?: string };
    if (raw.backend === 'selfhost' || raw.backend === 'docker') return 'selfhost';
    if (raw.backend === 'sqlite') return 'sqlite';
  } catch {
    // first run — no file yet
  }
  // Shop PC that can see the share key → Docker. Home / public → SQLite.
  return officeShareLooksLikeSelfHost() ? 'selfhost' : 'sqlite';
}

export function setStoredDataBackend(backend: DataBackend): void {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    filePath(),
    JSON.stringify({ backend, updated_at: new Date().toISOString() }, null, 2),
    'utf-8'
  );
}
