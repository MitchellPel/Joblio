import { BrowserWindow } from 'electron';
import { showJoblioNotification } from '../utils/joblioNotify';
import { getActiveUserIds } from './authService';
import { listUnseenMentions, type MentionRow } from '../repositories/mentionsRepo';
import { listUnseenMentionsCloud } from '../selfhost/mentionsCloud';
import { isSelfHostMode } from '../db/backendMode';

/**
 * Watches the shared database for @mentions aimed at whoever is logged in on
 * THIS machine, and turns them into Windows notifications + renderer events.
 * Runs after every background DB sync and after each login.
 */

// Mentions we've already shown a native notification for during this app run
// (mentions stay "unseen" in the DB until the user opens the job).
const notifiedIds = new Set<number>();

function sendToWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function focusMainWindow(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0] ?? null;
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return win;
  }
  return null;
}

function notePreview(body: string, max = 90): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function showMentionNotification(mention: MentionRow): void {
  showJoblioNotification({
    title: `${mention.author_name || 'A teammate'} mentioned you`,
    body: `Job ${mention.job_no} — ${notePreview(mention.note_body)}`,
    onClick: () => {
      const win = focusMainWindow();
      if (win) win.webContents.send('mentions:open', { job_id: mention.job_id });
    },
  });
}

function showSummaryNotification(count: number): void {
  showJoblioNotification({
    title: 'Unread mentions',
    body: `You have ${count} unread mentions. Open the bell in Joblio to see them.`,
    onClick: () => {
      focusMainWindow();
    },
  });
}

function notifyFresh(fresh: MentionRow[]): void {
  if (fresh.length === 0) return;
  if (fresh.length > 3) {
    showSummaryNotification(fresh.length);
  } else {
    for (const mention of fresh) showMentionNotification(mention);
  }
  sendToWindows('mentions:new', null);
}

async function collectFreshMentions(userIds: number[]): Promise<MentionRow[]> {
  const fresh: MentionRow[] = [];
  for (const userId of userIds) {
    const rows = isSelfHostMode()
      ? await listUnseenMentionsCloud(userId)
      : listUnseenMentions(userId);
    for (const mention of rows) {
      if (notifiedIds.has(mention.id)) continue;
      notifiedIds.add(mention.id);
      fresh.push(mention);
    }
  }
  return fresh;
}

/**
 * Check for unseen mentions for all users logged in on this machine.
 * New ones get a native notification; the renderer bell is always refreshed.
 * A backlog (e.g. logging in after days away) collapses into one summary
 * notification instead of a popup per mention.
 */
export function checkMentions(): void {
  void checkMentionsAsync();
}

export async function checkMentionsAsync(): Promise<void> {
  try {
    const userIds = getActiveUserIds();
    if (userIds.length === 0) return;
    const fresh = await collectFreshMentions(userIds);
    notifyFresh(fresh);
  } catch {
    // DB/API not ready yet — next sync will retry
  }
}
