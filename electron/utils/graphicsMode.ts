import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type GraphicsMode = 'soft' | 'hard';

/**
 * Shop laptops often have weak/no discrete GPU. Software rendering is the
 * stable default so Joblio doesn't open blank. Desktops can opt into "hard"
 * from Settings for smoother motion.
 */
const FILE = 'graphics-mode.json';

function graphicsFilePath(): string {
  return path.join(app.getPath('userData'), FILE);
}

export function getGraphicsMode(): GraphicsMode {
  if (process.argv.includes('--joblio-hard-gpu')) return 'hard';
  if (process.argv.includes('--joblio-soft-gpu')) return 'soft';
  try {
    const raw = JSON.parse(fs.readFileSync(graphicsFilePath(), 'utf-8')) as { mode?: string };
    if (raw.mode === 'hard' || raw.mode === 'soft') return raw.mode;
  } catch {
    // first run — no file yet
  }
  return 'soft';
}

export function setGraphicsMode(mode: GraphicsMode): void {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(graphicsFilePath(), JSON.stringify({ mode }, null, 2), 'utf-8');
}

/** Must run before app.whenReady(). */
export function applyGraphicsModeBeforeReady(): GraphicsMode {
  const mode = getGraphicsMode();
  if (mode === 'soft') {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
  }
  return mode;
}

/** After a GPU/display crash, force compatible mode for the next launch. */
export function forceSoftGraphicsAfterCrash(): void {
  try {
    setGraphicsMode('soft');
  } catch {
    // ignore
  }
}
