import { BrowserWindow } from 'electron';
import { showJoblioNotification } from '../utils/joblioNotify';
import { getActiveUserIds } from './authService';
import { isSelfHostMode } from '../db/backendMode';
import {
  listUnseenQuoteSizeIds,
  listUnseenQuoteSizeMentions,
  listDoneQuoteSizesForCreator,
  getQuoteSize,
  type QuoteSizeMentionRow,
  type QuoteSizeRow,
} from '../repositories/quoteSizesRepo';
import {
  listUnseenQuoteSizeIdsCloud,
  listUnseenQuoteSizeMentionsCloud,
  listDoneQuoteSizesForCreatorCloud,
  getQuoteSizeCloud,
} from '../selfhost/quoteSizesCloud';

const notifiedRequestKeys = new Set<string>();
const notifiedMentionIds = new Set<number>();
const notifiedDoneKeys = new Set<string>();

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

function openQuoteSize(id: number): void {
  const win = focusMainWindow();
  if (win) win.webContents.send('quote-sizes:open', { quote_size_id: id });
}

function showToast(title: string, body: string, quoteSizeId: number): void {
  showJoblioNotification({
    title,
    body,
    onClick: () => openQuoteSize(quoteSizeId),
  });
}

export function notifyNewQuoteSize(row: QuoteSizeRow): void {
  sendToWindows('quote-sizes:new', { id: row.id, job_name: row.job_name });
  for (const userId of getActiveUserIds()) {
    notifiedRequestKeys.add(`${userId}:${row.id}`);
  }
  showToast('Cut / Print List', row.job_name, row.id);
}

export function notifyQuoteSizesChanged(): void {
  sendToWindows('quote-sizes:new', null);
}

/** Staff ticked Done — toast the creator on this PC if they are logged in here; other PCs pick it up on poll. */
export function notifyQuoteSizeDone(row: QuoteSizeRow, actorUserId: number): void {
  sendToWindows('quote-sizes:new', { id: row.id, kind: 'done' });
  notifiedDoneKeys.add(`${row.created_by}:${row.id}`);
  if (actorUserId === row.created_by) return;
  if (!getActiveUserIds().includes(row.created_by)) return;
  showToast('Cut / Print List', `${row.job_name} is marked done`, row.id);
}

export function notifyQuoteSizeMentions(mentions: QuoteSizeMentionRow[]): void {
  if (!mentions.length) return;
  sendToWindows('mentions:new', null);
  sendToWindows('quote-sizes:new', null);
  for (const m of mentions) {
    if (notifiedMentionIds.has(m.id)) continue;
    notifiedMentionIds.add(m.id);
    showToast(`@mention · ${m.job_name}`, `${m.author_name}: ${m.note_body.slice(0, 120)}`, m.quote_size_id);
  }
}

export function checkQuoteSizes(): void {
  void checkQuoteSizesAsync();
}

export async function checkQuoteSizesAsync(): Promise<void> {
  try {
    const userIds = getActiveUserIds();
    if (userIds.length === 0) return;

    let anyFresh = false;
    const toToast: QuoteSizeRow[] = [];
    const mentionToasts: QuoteSizeMentionRow[] = [];
    const doneToasts: QuoteSizeRow[] = [];

    for (const userId of userIds) {
      const ids = isSelfHostMode()
        ? await listUnseenQuoteSizeIdsCloud(userId)
        : listUnseenQuoteSizeIds(userId);
      for (const qid of ids) {
        const key = `${userId}:${qid}`;
        if (notifiedRequestKeys.has(key)) continue;
        notifiedRequestKeys.add(key);
        anyFresh = true;
        const row = isSelfHostMode() ? await getQuoteSizeCloud(qid) : getQuoteSize(qid);
        if (row) toToast.push(row);
      }

      const mentions = isSelfHostMode()
        ? await listUnseenQuoteSizeMentionsCloud(userId)
        : listUnseenQuoteSizeMentions(userId);
      for (const m of mentions) {
        if (notifiedMentionIds.has(m.id)) continue;
        notifiedMentionIds.add(m.id);
        anyFresh = true;
        mentionToasts.push(m);
      }

      const doneRows = isSelfHostMode()
        ? await listDoneQuoteSizesForCreatorCloud(userId)
        : listDoneQuoteSizesForCreator(userId);
      const seedKey = `seeded:${userId}`;
      if (!notifiedDoneKeys.has(seedKey)) {
        notifiedDoneKeys.add(seedKey);
        for (const row of doneRows) notifiedDoneKeys.add(`${userId}:${row.id}`);
      } else {
        for (const row of doneRows) {
          const key = `${userId}:${row.id}`;
          if (notifiedDoneKeys.has(key)) continue;
          notifiedDoneKeys.add(key);
          anyFresh = true;
          doneToasts.push(row);
        }
      }
    }

    if (!anyFresh) return;

    sendToWindows('quote-sizes:new', null);
    sendToWindows('mentions:new', null);

    if (toToast.length > 3) {
      showToast(
        'Cut / Print List',
        `${toToast.length} new cut / print requests.`,
        toToast[0].id
      );
    } else {
      for (const row of toToast) {
        showToast('Cut / Print List', row.job_name, row.id);
      }
    }

    if (mentionToasts.length > 3) {
      showToast(
        'Mentions',
        `${mentionToasts.length} new @mentions on Cut / Print List.`,
        mentionToasts[0].quote_size_id
      );
    } else {
      for (const m of mentionToasts) {
        showToast(
          `@mention · ${m.job_name}`,
          `${m.author_name}: ${m.note_body.slice(0, 120)}`,
          m.quote_size_id
        );
      }
    }

    if (doneToasts.length > 3) {
      showToast(
        'Cut / Print List',
        `${doneToasts.length} of your requests are marked done.`,
        doneToasts[0].id
      );
    } else {
      for (const row of doneToasts) {
        showToast('Cut / Print List', `${row.job_name} is marked done`, row.id);
      }
    }
  } catch {
    // Tables may not exist yet on the server — next sync retries
  }
}
