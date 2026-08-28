import type { DataBackend } from '../db/backendMode';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'data-backend.json';

function filePath(): string {
  return path.join(app.getPath('userData'), FILE);
}

/** Persisted preference (Settings). Default selfhost = Docker cutover. */
export function getStoredDataBackend(): DataBackend {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf-8')) as { backend?: string };
    if (raw.backend === 'selfhost' || raw.backend === 'docker') return 'selfhost';
    if (raw.backend === 'sqlite') return 'sqlite';
  } catch {
    // first run — no file yet
  }
  // New installs + PCs with no preference: Docker self-host
  return 'selfhost';
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
