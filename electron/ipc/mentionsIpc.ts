import type { IpcMain } from 'electron';
import { requireAuth } from './authIpc';
import { isSelfHostMode } from '../db/backendMode';
import {
  listUnseenMentions,
  listUnseenMentionJobIds,
  listUnseenMentionsForJob,
  markMentionsSeen,
} from '../repositories/mentionsRepo';
import {
  listUnseenMentionsCloud,
  listUnseenMentionJobIdsCloud,
  listUnseenMentionsForJobCloud,
  markMentionsSeenCloud,
} from '../selfhost/mentionsCloud';

export function registerMentionsIpc(ipcMain: IpcMain): void {
  ipcMain.handle('mentions:listUnseen', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listUnseenMentionsCloud(auth.userId);
    return listUnseenMentions(auth.userId);
  });

  ipcMain.handle('mentions:listUnseenJobIds', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listUnseenMentionJobIdsCloud(auth.userId);
    return listUnseenMentionJobIds(auth.userId);
  });

  ipcMain.handle('mentions:listUnseenForJob', async (_event, token: string, jobId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listUnseenMentionsForJobCloud(auth.userId, jobId);
    return listUnseenMentionsForJob(auth.userId, jobId);
  });

  ipcMain.handle('mentions:markSeen', async (_event, token: string, jobId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      const marked = await markMentionsSeenCloud(auth.userId, jobId);
      return { ok: true, marked };
    }
    const marked = markMentionsSeen(auth.userId, jobId);
    return { ok: true, marked };
  });
}
