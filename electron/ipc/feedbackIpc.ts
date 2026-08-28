import type { IpcMain } from 'electron';
import { requireAuth } from './authIpc';
import { isSelfHostMode } from '../db/backendMode';
import { findUserById } from '../repositories/usersRepo';
import {
  listFeedback,
  createFeedback,
  markFeedbackDone,
  listUnseenFeedbackIds,
  markFeedbackSeen,
  type FeedbackKind,
} from '../repositories/feedbackRepo';
import {
  listFeedbackCloud,
  createFeedbackCloud,
  markFeedbackDoneCloud,
  listUnseenFeedbackIdsCloud,
  markFeedbackSeenCloud,
} from '../selfhost/feedbackCloud';
import { notifyNewFeedback } from '../services/feedbackNotifier';

async function loadUser(userId: number) {
  if (isSelfHostMode()) {
    const { findUserByIdCloudFresh } = await import('../selfhost/usersCloud');
    return (await findUserByIdCloudFresh(userId)) || null;
  }
  return findUserById(userId) || null;
}

function isAdmin(user: { role: string } | null): boolean {
  return user?.role === 'admin';
}

function parseKind(v: unknown): FeedbackKind | null {
  if (v === 'bug' || v === 'change') return v;
  return null;
}

export function registerFeedbackIpc(ipcMain: IpcMain): void {
  ipcMain.handle('feedback:list', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const user = await loadUser(auth.userId);
    if (!user) return { error: 'Not signed in.' };
    const opts = { userId: auth.userId, isAdmin: isAdmin(user) };
    try {
      return isSelfHostMode() ? await listFeedbackCloud(opts) : listFeedback(opts);
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Could not load reports.' };
    }
  });

  ipcMain.handle(
    'feedback:create',
    async (_event, token: string, data: { kind?: string; body?: string }) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      const kind = parseKind(data?.kind);
      if (!kind) return { error: 'Choose Bug or Change.' };
      const body = String(data?.body || '').trim();
      if (body.length < 4) return { error: 'Please describe the bug or change.' };
      if (body.length > 2000) return { error: 'Keep it under 2000 characters.' };
      try {
        const item = isSelfHostMode()
          ? await createFeedbackCloud({ kind, body, created_by: auth.userId })
          : createFeedback({ kind, body, created_by: auth.userId });
        notifyNewFeedback(item);
        return item;
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : 'Could not save.' };
      }
    }
  );

  ipcMain.handle('feedback:markDone', async (_event, token: string, id: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const user = await loadUser(auth.userId);
    if (!isAdmin(user)) return { error: 'Only an admin can mark this done.' };
    const fid = Number(id);
    if (!Number.isFinite(fid)) return { error: 'Invalid report.' };
    try {
      const item = isSelfHostMode()
        ? await markFeedbackDoneCloud(fid, auth.userId)
        : markFeedbackDone(fid, auth.userId);
      if (!item) return { error: 'Report not found.' };
      return item;
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Could not update.' };
    }
  });

  ipcMain.handle('feedback:unseenCount', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const user = await loadUser(auth.userId);
    if (!isAdmin(user)) return { count: 0 };
    try {
      const ids = isSelfHostMode()
        ? await listUnseenFeedbackIdsCloud(auth.userId)
        : listUnseenFeedbackIds(auth.userId);
      return { count: ids.length };
    } catch {
      return { count: 0 };
    }
  });

  ipcMain.handle('feedback:markSeen', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const user = await loadUser(auth.userId);
    if (!isAdmin(user)) return { ok: true, marked: 0 };
    try {
      const marked = isSelfHostMode()
        ? await markFeedbackSeenCloud(auth.userId)
        : markFeedbackSeen(auth.userId);
      return { ok: true, marked };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Could not mark seen.' };
    }
  });
}
