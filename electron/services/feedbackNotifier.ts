import { BrowserWindow } from 'electron';
import { showJoblioNotification } from '../utils/joblioNotify';
import { getActiveUserIds } from './authService';
import { isSelfHostMode } from '../db/backendMode';
import { findUserById } from '../repositories/usersRepo';
import {
  listUnseenFeedbackIds,
  getFeedback,
  type FeedbackRow,
} from '../repositories/feedbackRepo';
import {
  listUnseenFeedbackIdsCloud,
  getFeedbackCloud,
} from '../selfhost/feedbackCloud';

const notifiedKeys = new Set<string>();

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

async function isAdminUser(userId: number): Promise<boolean> {
  if (isSelfHostMode()) {
    const { findUserByIdCloudFresh } = await import('../selfhost/usersCloud');
    const u = await findUserByIdCloudFresh(userId);
    return u?.role === 'admin';
  }
  return findUserById(userId)?.role === 'admin';
}

function preview(body: string, max = 90): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function kindLabel(kind: FeedbackRow['kind']): string {
  return kind === 'change' ? 'Change request' : 'Bug';
}

function showToast(item: FeedbackRow): void {
  showJoblioNotification({
    title: kindLabel(item.kind),
    body: `${item.created_name || 'Staff'}: ${preview(item.body)}`,
    onClick: () => {
      const win = focusMainWindow();
      if (win) win.webContents.send('feedback:open', { id: item.id });
    },
  });
}

export function notifyNewFeedback(item: FeedbackRow): void {
  sendToWindows('feedback:new', {
    id: item.id,
    kind: item.kind,
    created_by: item.created_by,
  });

  for (const userId of getActiveUserIds()) {
    notifiedKeys.add(`${userId}:${item.id}`);
  }

  void (async () => {
    for (const userId of getActiveUserIds()) {
      if (userId === item.created_by) continue;
      if (await isAdminUser(userId)) {
        showToast(item);
        return;
      }
    }
  })();
}

export function checkFeedback(): void {
  void checkFeedbackAsync();
}

export async function checkFeedbackAsync(): Promise<void> {
  try {
    const userIds = getActiveUserIds();
    if (userIds.length === 0) return;

    let anyFresh = false;
    const toToast: FeedbackRow[] = [];

    for (const userId of userIds) {
      if (!(await isAdminUser(userId))) continue;
      const ids = isSelfHostMode()
        ? await listUnseenFeedbackIdsCloud(userId)
        : listUnseenFeedbackIds(userId);
      for (const fid of ids) {
        const key = `${userId}:${fid}`;
        if (notifiedKeys.has(key)) continue;
        notifiedKeys.add(key);
        anyFresh = true;
        const item = isSelfHostMode() ? await getFeedbackCloud(fid) : getFeedback(fid);
        if (item) toToast.push(item);
      }
    }

    if (!anyFresh) return;

    sendToWindows('feedback:new', null);

    if (toToast.length === 0) return;
    if (toToast.length > 3) {
      showJoblioNotification({
        title: 'Bugs & changes',
        body: `${toToast.length} new reports. Open Settings to review.`,
        onClick: () => {
          const win = focusMainWindow();
          if (win) win.webContents.send('feedback:open', { id: toToast[0].id });
        },
      });
    } else {
      for (const item of toToast) showToast(item);
    }
  } catch {
    // table or API not ready
  }
}
