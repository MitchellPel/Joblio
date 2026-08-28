import type { IpcMain } from 'electron';
import { requireAuth } from './authIpc';
import { isSelfHostMode } from '../db/backendMode';
import { findUserById } from '../repositories/usersRepo';
import {
  listActiveQuoteSizes,
  listCompletedQuoteSizes,
  getQuoteSize,
  createQuoteSize,
  updateQuoteSizeSafe,
  deleteQuoteSize,
  listQuoteSizeNotes,
  addQuoteSizeNote,
  addQuoteSizeMentions,
  listUnseenQuoteSizeIds,
  markQuoteSizesSeen,
  listUnseenQuoteSizeMentions,
  markQuoteSizeMentionsSeen,
  getQuoteSizeImageBytes,
  getQuoteSizeThumbBytes,
  getQuoteSizeNoteImageBytes,
  getQuoteSizeNoteThumbBytes,
  type QuoteSizeStatus,
} from '../repositories/quoteSizesRepo';
import {
  listActiveQuoteSizesCloud,
  listCompletedQuoteSizesCloud,
  getQuoteSizeCloud,
  createQuoteSizeCloud,
  updateQuoteSizeSafeCloud,
  deleteQuoteSizeCloud,
  listQuoteSizeNotesCloud,
  addQuoteSizeNoteCloud,
  addQuoteSizeMentionsCloud,
  listUnseenQuoteSizeIdsCloud,
  markQuoteSizesSeenCloud,
  listUnseenQuoteSizeMentionsCloud,
  markQuoteSizeMentionsSeenCloud,
  getQuoteSizeImageBytesCloud,
  getQuoteSizeThumbBytesCloud,
  getQuoteSizeNoteImageBytesCloud,
  getQuoteSizeNoteThumbBytesCloud,
} from '../selfhost/quoteSizesCloud';
import {
  notifyNewQuoteSize,
  notifyQuoteSizeMentions,
  notifyQuoteSizeDone,
  notifyQuoteSizesChanged,
} from '../services/quoteSizeNotifier';
import { userCanManageQuoteSizes } from '../utils/permissions';
import { makeProofThumb } from '../repositories/proofsRepo';
import { writeQuoteSizeFiles } from '../utils/quoteSizeStorage';

async function loadUser(userId: number) {
  if (isSelfHostMode()) {
    const { findUserByIdCloudFresh } = await import('../selfhost/usersCloud');
    return (await findUserByIdCloudFresh(userId)) || null;
  }
  return findUserById(userId) || null;
}

function isStatus(v: unknown): v is QuoteSizeStatus {
  return v === 'open' || v === 'done';
}

export function registerQuoteSizesIpc(ipcMain: IpcMain): void {
  ipcMain.handle('quoteSizes:list', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    try {
      if (isSelfHostMode()) return await listActiveQuoteSizesCloud();
      return listActiveQuoteSizes();
    } catch (err: any) {
      return { error: err?.message || 'Failed to load quote sizes.' };
    }
  });

  ipcMain.handle('quoteSizes:listCompleted', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    try {
      if (isSelfHostMode()) return await listCompletedQuoteSizesCloud();
      return listCompletedQuoteSizes();
    } catch (err: any) {
      return { error: err?.message || 'Failed to load completed requests.' };
    }
  });

  ipcMain.handle(
    'quoteSizes:create',
    async (
      _event,
      token: string,
      data: {
        job_name: string;
        scope: string;
        image?: { file_name: string; mime_type: string; bytesBase64: string } | null;
      }
    ) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      const user = await loadUser(auth.userId);
      if (!user) return { error: 'User not found.' };
      if (!userCanManageQuoteSizes(user)) {
        return { error: 'You do not have permission to post a Cut / Print List request.' };
      }
      const jobName = (data?.job_name || '').trim();
      const scope = (data?.scope || '').trim();
      if (!jobName) return { error: 'Enter a job name.' };
      if (!scope) return { error: 'Enter the scope of what you need sized.' };

      let image: { bytes: Uint8Array; fileName: string; mimeType: string } | null = null;
      if (data?.image?.bytesBase64) {
        if (!data.image.mime_type?.startsWith('image/')) {
          return { error: 'Only image files can be attached.' };
        }
        const bytes = new Uint8Array(Buffer.from(data.image.bytesBase64, 'base64'));
        if (bytes.length > 8 * 1024 * 1024) return { error: 'Image is too large (max 8 MB).' };
        image = {
          bytes,
          fileName: data.image.file_name || 'request.jpg',
          mimeType: data.image.mime_type,
        };
      }

      try {
        const payload = { jobName, scope, createdBy: auth.userId, image };
        const row = isSelfHostMode()
          ? await createQuoteSizeCloud(payload)
          : createQuoteSize(payload);
        if (isSelfHostMode()) await markQuoteSizesSeenCloud(auth.userId, [row.id]);
        else markQuoteSizesSeen(auth.userId, [row.id]);
        notifyNewQuoteSize(row);
        return row;
      } catch (err: any) {
        return { error: err?.message || 'Failed to create request.' };
      }
    }
  );

  ipcMain.handle(
    'quoteSizes:update',
    async (
      _event,
      token: string,
      data: {
        id: number;
        version: number;
        job_name?: string;
        scope?: string;
        status?: QuoteSizeStatus;
        complete?: boolean;
        image?: { file_name: string; mime_type: string; bytesBase64: string } | null;
      }
    ) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      const user = await loadUser(auth.userId);
      if (!user) return { error: 'User not found.' };
      const current = isSelfHostMode() ? await getQuoteSizeCloud(data.id) : getQuoteSize(data.id);
      if (!current) return { error: 'Request not found.' };

      const canPost = userCanManageQuoteSizes(user);
      const canManage = canPost || current.created_by === auth.userId;
      const wantsEdit =
        data.job_name !== undefined || data.scope !== undefined || Boolean(data.image?.bytesBase64);
      const wantsDone = data.status === 'done';
      const wantsComplete = data.complete === true;

      if (wantsEdit && !canPost) {
        return { error: 'You do not have permission to edit a Cut / Print List request.' };
      }
      if (wantsComplete && !canManage) {
        return { error: 'Only the person who posted this, or someone with permission, can file it as completed.' };
      }
      if (data.status !== undefined && !isStatus(data.status)) return { error: 'Invalid status.' };
      if (data.status === 'open' && !canPost) {
        return { error: 'You do not have permission to reopen a request.' };
      }
      if (wantsComplete && current.status !== 'done') {
        return { error: 'Tick Done first, then file it as Completed.' };
      }
      if (wantsComplete && current.archived_at) {
        return { error: 'This request is already in Completed.' };
      }

      const fields: {
        job_name?: string;
        scope?: string;
        status?: QuoteSizeStatus;
        has_image?: boolean | number;
        file_name?: string;
        mime_type?: string;
        size?: number;
        archived_at?: string | null;
      } = {};
      if (data.job_name !== undefined) {
        const name = data.job_name.trim();
        if (!name) return { error: 'Enter a job name.' };
        fields.job_name = name;
      }
      if (data.scope !== undefined) {
        const scope = data.scope.trim();
        if (!scope) return { error: 'Enter the scope of what you need.' };
        fields.scope = scope;
      }
      if (data.status !== undefined) fields.status = data.status;
      if (wantsComplete) fields.archived_at = new Date().toISOString();

      let imageBytes: Uint8Array | null = null;
      if (data.image?.bytesBase64) {
        if (!data.image.mime_type?.startsWith('image/')) {
          return { error: 'Only image files can be attached.' };
        }
        imageBytes = new Uint8Array(Buffer.from(data.image.bytesBase64, 'base64'));
        if (imageBytes.length > 8 * 1024 * 1024) return { error: 'Image is too large (max 8 MB).' };
        fields.has_image = isSelfHostMode() ? true : 1;
        fields.file_name = data.image.file_name || 'request.jpg';
        fields.mime_type = data.image.mime_type;
        fields.size = imageBytes.length;
      }

      if (!Object.keys(fields).length) {
        return current;
      }
      const updated = isSelfHostMode()
        ? await updateQuoteSizeSafeCloud(data.id, data.version, fields)
        : updateQuoteSizeSafe(data.id, data.version, fields);
      if (!updated) return { error: 'Request not found.' };
      if ('conflict' in updated) {
        return { error: 'CONFLICT: This request was changed by another user. Please try again.' };
      }
      if (imageBytes) {
        writeQuoteSizeFiles(updated.id, imageBytes, makeProofThumb(imageBytes));
      }
      if (wantsDone && current.status !== 'done') {
        notifyQuoteSizeDone(updated, auth.userId);
      } else if (wantsComplete || wantsEdit) {
        notifyQuoteSizesChanged();
      }
      return updated;
    }
  );

  ipcMain.handle(
    'quoteSizes:delete',
    async (_event, token: string, data: { id: number; version: number }) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      const user = await loadUser(auth.userId);
      if (!user) return { error: 'User not found.' };
      const current = isSelfHostMode() ? await getQuoteSizeCloud(data.id) : getQuoteSize(data.id);
      if (!current) return { error: 'Request not found.' };
      if (current.version !== data.version) {
        return { error: 'CONFLICT: This request was changed by another user. Please try again.' };
      }
      const canManage = userCanManageQuoteSizes(user) || current.created_by === auth.userId;
      if (!canManage) {
        return { error: 'Only the person who posted this, or someone with permission, can delete it for everyone.' };
      }
      try {
        if (isSelfHostMode()) await deleteQuoteSizeCloud(data.id);
        else deleteQuoteSize(data.id);
        notifyQuoteSizesChanged();
        return { ok: true };
      } catch (err: any) {
        return { error: err?.message || 'Failed to delete request.' };
      }
    }
  );

  ipcMain.handle('quoteSizes:listNotes', async (_event, token: string, id: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    try {
      if (isSelfHostMode()) return await listQuoteSizeNotesCloud(id);
      return listQuoteSizeNotes(id);
    } catch (err: any) {
      return { error: err?.message || 'Failed to load replies.' };
    }
  });

  ipcMain.handle(
    'quoteSizes:addNote',
    async (
      _event,
      token: string,
      id: number,
      body: string,
      mentions?: number[],
      image?: { file_name: string; mime_type: string; bytesBase64: string } | null
    ) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      let parsedImage: { bytes: Uint8Array; fileName: string; mimeType: string } | null = null;
      if (image?.bytesBase64) {
        if (!image.mime_type?.startsWith('image/')) {
          return { error: 'Only image files can be attached.' };
        }
        const bytes = new Uint8Array(Buffer.from(image.bytesBase64, 'base64'));
        if (bytes.length > 8 * 1024 * 1024) return { error: 'Image is too large (max 8 MB).' };
        parsedImage = {
          bytes,
          fileName: image.file_name || 'chat.jpg',
          mimeType: image.mime_type,
        };
      }
      if (!body?.trim() && !parsedImage) return { error: 'Type a reply or attach an image.' };
      const current = isSelfHostMode() ? await getQuoteSizeCloud(id) : getQuoteSize(id);
      if (!current) return { error: 'Request not found.' };
      try {
        const note = isSelfHostMode()
          ? await addQuoteSizeNoteCloud(id, auth.userId, body || '', parsedImage)
          : addQuoteSizeNote(id, auth.userId, body || '', parsedImage);
        if (mentions?.length) {
          if (isSelfHostMode()) {
            await addQuoteSizeMentionsCloud(note.id, id, mentions, auth.userId);
          } else {
            addQuoteSizeMentions(note.id, id, mentions, auth.userId);
          }
          const mentioned = [...new Set(mentions)].filter((uid) => uid !== auth.userId);
          const rows = [];
          for (const uid of mentioned) {
            const list = isSelfHostMode()
              ? await listUnseenQuoteSizeMentionsCloud(uid)
              : listUnseenQuoteSizeMentions(uid);
            rows.push(...list.filter((m) => m.note_id === note.id));
          }
          notifyQuoteSizeMentions(rows);
        }
        return note;
      } catch (err: any) {
        return { error: err?.message || 'Failed to send reply.' };
      }
    }
  );

  ipcMain.handle('quoteSizes:listUnseenIds', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    try {
      if (isSelfHostMode()) return await listUnseenQuoteSizeIdsCloud(auth.userId);
      return listUnseenQuoteSizeIds(auth.userId);
    } catch {
      return [];
    }
  });

  ipcMain.handle('quoteSizes:markSeen', async (_event, token: string, ids?: number[]) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    try {
      const marked = isSelfHostMode()
        ? await markQuoteSizesSeenCloud(auth.userId, ids)
        : markQuoteSizesSeen(auth.userId, ids);
      return { ok: true, marked };
    } catch (err: any) {
      return { error: err?.message || 'Failed to mark seen.' };
    }
  });

  ipcMain.handle('quoteSizes:listUnseenMentions', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    try {
      if (isSelfHostMode()) return await listUnseenQuoteSizeMentionsCloud(auth.userId);
      return listUnseenQuoteSizeMentions(auth.userId);
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    'quoteSizes:markMentionsSeen',
    async (_event, token: string, quoteSizeId: number) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      try {
        const marked = isSelfHostMode()
          ? await markQuoteSizeMentionsSeenCloud(auth.userId, quoteSizeId)
          : markQuoteSizeMentionsSeen(auth.userId, quoteSizeId);
        return { ok: true, marked };
      } catch (err: any) {
        return { error: err?.message || 'Failed to mark mentions.' };
      }
    }
  );

  ipcMain.handle('quoteSizes:getThumb', async (_event, token: string, id: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const img = isSelfHostMode() ? getQuoteSizeThumbBytesCloud(id) : getQuoteSizeThumbBytes(id);
    if (!img) return { error: 'No image.' };
    return { mime_type: img.mime, dataBase64: Buffer.from(img.data).toString('base64') };
  });

  ipcMain.handle('quoteSizes:getImage', async (_event, token: string, id: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const img = isSelfHostMode() ? getQuoteSizeImageBytesCloud(id) : getQuoteSizeImageBytes(id);
    if (!img) return { error: 'No image.' };
    return { mime_type: img.mime, dataBase64: Buffer.from(img.data).toString('base64') };
  });

  ipcMain.handle('quoteSizes:getNoteThumb', async (_event, token: string, noteId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const img = isSelfHostMode()
      ? getQuoteSizeNoteThumbBytesCloud(noteId)
      : getQuoteSizeNoteThumbBytes(noteId);
    if (!img) return { error: 'No image.' };
    return { mime_type: img.mime, dataBase64: Buffer.from(img.data).toString('base64') };
  });

  ipcMain.handle('quoteSizes:getNoteImage', async (_event, token: string, noteId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const img = isSelfHostMode()
      ? getQuoteSizeNoteImageBytesCloud(noteId)
      : getQuoteSizeNoteImageBytes(noteId);
    if (!img) return { error: 'No image.' };
    return { mime_type: img.mime, dataBase64: Buffer.from(img.data).toString('base64') };
  });
}
