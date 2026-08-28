import { BrowserWindow } from 'electron';
import { sbJson } from '../selfhost/rest';
import { checkMentions } from './mentionNotifier';
import { checkOrders } from './orderNotifier';
import { checkFeedback } from './feedbackNotifier';
import { checkQuoteSizes } from './quoteSizeNotifier';
import { refreshUserCache, getCachedUsers } from '../selfhost/usersCloud';

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = true;
let tickInFlight = false;
let lastFingerprint = '';

/** Match office SQLite feel (~7s). LAN PostgREST is cheap enough. */
const POLL_MS = 5000;

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

async function readFingerprint(): Promise<string> {
  const [jobs, notes, mentions, stages, proofs, installs, bookings, orders] = await Promise.all([
    sbJson<any[]>('jobs', {
      query: {
        select: 'updated_at,id',
        order: 'updated_at.desc',
        limit: '1',
      },
    }),
    sbJson<any[]>('job_notes', {
      query: { select: 'id', order: 'id.desc', limit: '1' },
    }),
    sbJson<any[]>('note_mentions', {
      query: { select: 'id', order: 'id.desc', limit: '1' },
    }),
    sbJson<any[]>('stage_history', {
      query: { select: 'id', order: 'id.desc', limit: '1' },
    }),
    sbJson<any[]>('job_proofs', {
      query: { select: 'id', order: 'id.desc', limit: '1' },
    }),
    sbJson<any[]>('rigging_installs', {
      query: { select: 'id,scheduled_date', order: 'id.desc', limit: '20' },
    }),
    sbJson<any[]>('vehicle_bookings', {
      query: { select: 'id,scheduled_date', order: 'id.desc', limit: '20' },
    }),
    sbJson<any[]>('orders', {
      query: { select: 'id,updated_at,status', order: 'id.desc', limit: '20' },
    }),
  ]);

  let feedbackFp = '0';
  try {
    const feedback = await sbJson<any[]>('app_feedback', {
      query: { select: 'id,updated_at,status', order: 'id.desc', limit: '20' },
    });
    feedbackFp = feedback.map((r) => `${r.id}:${r.updated_at}:${r.status}`).join(',') || '0';
  } catch {
    feedbackFp = '0';
  }

  let quoteFp = '0';
  try {
    const quotes = await sbJson<any[]>('quote_sizes', {
      query: { select: 'id,updated_at,status,archived_at', order: 'id.desc', limit: '20' },
    });
    quoteFp = quotes.map((r) => `${r.id}:${r.updated_at}:${r.status}:${r.archived_at || ''}`).join(',') || '0';
  } catch {
    quoteFp = '0';
  }

  let quoteNoteFp = '0';
  try {
    const qnotes = await sbJson<any[]>('quote_size_notes', {
      query: { select: 'id', order: 'id.desc', limit: '1' },
    });
    quoteNoteFp = String(qnotes[0]?.id ?? 0);
  } catch {
    quoteNoteFp = '0';
  }

  let quoteMentionFp = '0';
  try {
    const qmentions = await sbJson<any[]>('quote_size_mentions', {
      query: { select: 'id', order: 'id.desc', limit: '1' },
    });
    quoteMentionFp = String(qmentions[0]?.id ?? 0);
  } catch {
    quoteMentionFp = '0';
  }

  const usersFp = getCachedUsers()
    .map((u) => `${u.id}:${u.board_color || ''}:${u.full_name}:${u.can_manage_quote_sizes || 0}`)
    .join(',');

  const installFp = installs.map((r) => `${r.id}:${r.scheduled_date}`).join(',');
  const bookingFp = bookings.map((r) => `${r.id}:${r.scheduled_date}`).join(',');
  const orderFp = orders.map((r) => `${r.id}:${r.updated_at}:${r.status}`).join(',');

  return [
    jobs[0] ? `${jobs[0].id}:${jobs[0].updated_at}` : '0',
    notes[0]?.id ?? 0,
    mentions[0]?.id ?? 0,
    stages[0]?.id ?? 0,
    proofs[0]?.id ?? 0,
    installFp || '0',
    bookingFp || '0',
    orderFp || '0',
    feedbackFp,
    quoteFp,
    quoteNoteFp,
    quoteMentionFp,
    usersFp || '0',
  ].join('|');
}

async function tick(): Promise<void> {
  if (stopped) return;
  if (tickInFlight) {
    scheduleNext();
    return;
  }

  tickInFlight = true;
  try {
    try {
      await refreshUserCache();
    } catch {
      // users API briefly unreachable
    }
    const fp = await readFingerprint();
    if (lastFingerprint && fp !== lastFingerprint) {
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
    lastFingerprint = fp;
  } catch {
    // API briefly unreachable — next tick retries
  } finally {
    tickInFlight = false;
    scheduleNext();
  }
}

export function startSelfHostSync(): void {
  stopSelfHostSync();
  stopped = false;
  lastFingerprint = '';
  scheduleNext(2000);
}

export function stopSelfHostSync(): void {
  stopped = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  tickInFlight = false;
}
