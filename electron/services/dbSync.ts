import { BrowserWindow } from 'electron';
import { reloadFromDiskIfChangedAsync, getDbPath } from '../db/connection';
import { checkMentions } from './mentionNotifier';
import { checkOrders } from './orderNotifier';
import { checkFeedback } from './feedbackNotifier';
import { checkQuoteSizes } from './quoteSizeNotifier';

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;
let tickInFlight = false;

/** Was 2.5s — too aggressive on a proof-heavy SMB database (UI Not Responding). */
const POLL_MS = 7000;

function notifyAllWindows(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('db:changed');
    }
  }
}

function scheduleNext(delay = POLL_MS): void {
  if (stopped) return;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    void tick();
  }, delay);
}

async function tick(): Promise<void> {
  if (stopped) return;
  if (tickInFlight) {
    scheduleNext();
    return;
  }

  tickInFlight = true;
  try {
    if (!getDbPath()) return;
    const changed = await reloadFromDiskIfChangedAsync();
    if (changed) {
      notifyAllWindows();
      try {
        checkMentions();
      } catch {
        // ignore
      }
      try {
        checkOrders();
      } catch {
        // ignore
      }
      try {
        checkFeedback();
      } catch {
        // ignore
      }
      try {
        checkQuoteSizes();
      } catch {
        // ignore
      }
    }
  } catch {
    // network share temporarily unavailable, etc.
  } finally {
    tickInFlight = false;
    scheduleNext();
  }
}

export function startDbSync(): void {
  stopDbSync();
  stopped = false;
  scheduleNext(3000);
}

export function stopDbSync(): void {
  stopped = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  tickInFlight = false;
}
