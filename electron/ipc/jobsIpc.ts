import type { IpcMain } from 'electron';
import { requireAuth } from './authIpc';
import { isSelfHostMode } from '../db/backendMode';
import {
  listJobs,
  getJob,
  createJob,
  updateJobSafe,
  archiveJobSafe,
  unarchiveJobSafe,
  listArchivedJobs,
  deleteJobSafe,
  searchJobs,
  listJobsWithDueDates,
} from '../repositories/jobsRepo';
import {
  listJobsCloud,
  listArchivedJobsCloud,
  getJobCloud,
  createJobCloud,
  updateJobSafeCloud,
  moveStageCloud,
  archiveJobCloud,
  unarchiveJobCloud,
  listNotesCloud,
  addNoteCloud,
  updateNoteCloud,
  deleteNoteCloud,
  getStageHistoryCloud,
  deleteJobCloud,
  searchJobsCloud,
  recordStageChangeCloud,
} from '../selfhost/jobsCloud';
import {
  listProofsCloud,
  getProofCloud,
  getProofThumbCloud,
  addProofCloud,
  deleteProofCloud,
} from '../selfhost/proofsCloud';
import {
  ensureJobOnRiggingScheduleCloud,
  syncJobDueDateToRiggingCloud,
} from '../selfhost/riggingCloud';
import { parseDesignerStatuses, serializeDesignerStatuses } from '../utils/designerStatus';
import { describeSelfHostFetchError } from '../selfhost/rest';
import { listRecentActivity } from '../repositories/activityRepo';
import { listRecentActivityCloud } from '../selfhost/activityCloud';
import { addMentionsCloud } from '../selfhost/mentionsCloud';
import { recordStageChange, getStageHistory, addNote, updateNote, deleteNote, listNotes } from '../repositories/auditRepo';
import { addMentions } from '../repositories/mentionsRepo';
import type { StageKey } from '../preload';
import { findUserById } from '../repositories/usersRepo';
import { userCanArchiveJobs, userCanDeleteNotes } from '../utils/permissions';
import {
  listProofs,
  getProof,
  getProofThumb,
  addProof,
  deleteProof,
  type JobProof,
} from '../repositories/proofsRepo';
import {
  ensureJobOnRiggingSchedule,
  syncJobDueDateToRigging,
} from '../repositories/riggingRepo';
import {
  listTemplates,
  createTemplate,
  deleteTemplate,
  listJobChecklist,
  addJobChecklistItem,
  toggleJobChecklistItem,
  deleteJobChecklistItem,
  applyTemplateToJob,
} from '../repositories/checklistRepo';

function cloudOnlyStub(feature: string) {
  return { error: `${feature} is not wired for self-host mode yet.` };
}

export function registerJobsIpc(ipcMain: IpcMain): void {
  ipcMain.handle('jobs:list', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      try {
        return await listJobsCloud();
      } catch (err) {
        return { error: describeSelfHostFetchError(err) };
      }
    }
    return listJobs();
  });

  ipcMain.handle('jobs:search', async (_event, token: string, query: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      return searchJobsCloud(String(query || ''));
    }
    return searchJobs(String(query || ''));
  });

  ipcMain.handle('jobs:listDueDates', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      return (await listJobsCloud())
        .filter((j) => j.due_date)
        .map((j) => ({ id: j.id, job_no: j.job_no, job_name: j.job_name, due_date: j.due_date, stage: j.stage }));
    }
    return listJobsWithDueDates();
  });

  ipcMain.handle('activity:list', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listRecentActivityCloud();
    return listRecentActivity();
  });

  // Checklists
  ipcMain.handle('checklist:listTemplates', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return [];
    return listTemplates();
  });

  ipcMain.handle(
    'checklist:createTemplate',
    async (_event, token: string, data: { name: string; items: string[] }) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      if (isSelfHostMode()) return cloudOnlyStub('Checklists');
      if (!data?.name?.trim()) return { error: 'Template name is required.' };
      return createTemplate(data.name, data.items || [], auth.userId);
    }
  );

  ipcMain.handle('checklist:deleteTemplate', async (_event, token: string, id: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return cloudOnlyStub('Checklists');
    deleteTemplate(id);
    return { ok: true };
  });

  ipcMain.handle('checklist:listForJob', async (_event, token: string, jobId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return [];
    return listJobChecklist(jobId);
  });

  ipcMain.handle('checklist:addItem', async (_event, token: string, jobId: number, body: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return cloudOnlyStub('Checklists');
    if (!body?.trim()) return { error: 'Item text is required.' };
    return addJobChecklistItem(jobId, body);
  });

  ipcMain.handle(
    'checklist:toggleItem',
    async (_event, token: string, id: number, done: boolean) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      if (isSelfHostMode()) return cloudOnlyStub('Checklists');
      const item = toggleJobChecklistItem(id, done);
      if (!item) return { error: 'Item not found.' };
      return item;
    }
  );

  ipcMain.handle('checklist:deleteItem', async (_event, token: string, id: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return cloudOnlyStub('Checklists');
    deleteJobChecklistItem(id);
    return { ok: true };
  });

  ipcMain.handle(
    'checklist:applyTemplate',
    async (_event, token: string, jobId: number, templateId: number) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      if (isSelfHostMode()) return cloudOnlyStub('Checklists');
      return applyTemplateToJob(jobId, templateId);
    }
  );

  ipcMain.handle('jobs:get', async (_event, token: string, id: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return (await getJobCloud(id)) || null;
    return getJob(id) || null;
  });

  ipcMain.handle('jobs:create', async (_event, token: string, data: any) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };

    const jobNo = String(data.job_no || data.client || '').trim();
    if (!jobNo) return { error: 'Job number is required.' };

    try {
      const payload = {
        job_no: jobNo,
        job_name: data.job_name || 'Untitled',
        client: jobNo,
        contact_name: data.contact_name ?? null,
        contact_phone: data.contact_phone ?? null,
        contact_email: data.contact_email ?? null,
        assigned_to: data.assigned_to ?? null,
        due_date: data.due_date ?? null,
        scope_notes: data.scope_notes ?? null,
        job_kind:
          data.job_kind === 'vehicle' || data.job_kind === 'sign' || data.job_kind === 'vinyl'
            ? data.job_kind
            : null,
        designer_status: Array.isArray(data.designer_status)
          ? data.designer_status
          : parseDesignerStatuses(data.designer_status),
        created_by: auth.userId,
      };
      if (isSelfHostMode()) return await createJobCloud(payload);
      return createJob(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.toLowerCase().includes('unique')) {
        return { error: 'That job number already exists.' };
      }
      return { error: msg || 'Failed to create job.' };
    }
  });

  ipcMain.handle('jobs:update', async (_event, token: string, data: any) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };

    const fields: any = {};
    if (data.job_name !== undefined) fields.job_name = data.job_name;
    if (data.job_no !== undefined) {
      const jobNo = String(data.job_no).trim();
      if (!jobNo) return { error: 'Job number is required.' };
      fields.job_no = jobNo;
      fields.client = jobNo;
    } else if (data.client !== undefined) {
      // Legacy: Job Number was stored in client — keep both fields aligned.
      const jobNo = String(data.client).trim();
      if (jobNo) {
        fields.job_no = jobNo;
        fields.client = jobNo;
      } else {
        fields.client = '';
      }
    }
    if (data.contact_name !== undefined) fields.contact_name = data.contact_name;
    if (data.contact_phone !== undefined) fields.contact_phone = data.contact_phone;
    if (data.contact_email !== undefined) fields.contact_email = data.contact_email;
    if (data.assigned_to !== undefined) fields.assigned_to = data.assigned_to;
    if (data.due_date !== undefined) fields.due_date = data.due_date;
    if (data.scope_notes !== undefined) fields.scope_notes = data.scope_notes;
    if (data.pinned_brief !== undefined) fields.pinned_brief = data.pinned_brief;
    if (data.job_kind !== undefined) {
      fields.job_kind =
        data.job_kind === 'vehicle' || data.job_kind === 'sign' || data.job_kind === 'vinyl'
          ? data.job_kind
          : null;
    }
    if (data.designer_status !== undefined) {
      fields.designer_status = Array.isArray(data.designer_status)
        ? data.designer_status
        : parseDesignerStatuses(data.designer_status);
    }

    const expectedVersion = data.version ?? 1;
    try {
      const updated = isSelfHostMode()
        ? await updateJobSafeCloud(data.id, expectedVersion, fields)
        : updateJobSafe(data.id, expectedVersion, fields);
      if (!updated) return { error: 'Job not found.' };
      if ('conflict' in updated) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };

      if (fields.due_date !== undefined) {
        try {
          if (isSelfHostMode()) {
            await syncJobDueDateToRiggingCloud(
              updated.id,
              updated.due_date,
              updated.stage,
              auth.userId
            );
          } else {
            syncJobDueDateToRigging(
              updated.id,
              updated.due_date,
              updated.stage,
              auth.userId
            );
          }
        } catch (syncErr) {
          console.error('[jobs:update] rigging due-date sync failed:', syncErr);
        }
      }
      return updated;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.toLowerCase().includes('unique')) {
        return { error: 'That job number already exists.' };
      }
      return { error: msg || 'Failed to update job.' };
    }
  });

  ipcMain.handle('jobs:moveStage', async (_event, token: string, jobId: number, toStage: StageKey, expectedVersion: number, note?: string | null) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };

    if (isSelfHostMode()) {
      const job = await getJobCloud(jobId);
      if (!job) return { error: 'Job not found.' };
      const { findUserByIdCloudCached, ensureUserCache } = await import('../selfhost/usersCloud');
      await ensureUserCache();
      const user = findUserByIdCloudCached(auth.userId);
      if (!user) return { error: 'User not found.' };
      if (
        user.role !== 'admin' &&
        !user.can_move_any &&
        job.assigned_to !== null &&
        job.assigned_to !== auth.userId
      ) {
        return { error: 'This job is assigned to another team member. Only the assigned person can move it.' };
      }
      const updated = await moveStageCloud(jobId, toStage, expectedVersion, auth.userId, note ?? null);
      if (!updated) return { error: 'Failed to update job stage.' };
      if ('conflict' in updated) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };
      if (toStage === 'install') {
        await ensureJobOnRiggingScheduleCloud(jobId, auth.userId);
      }
      return updated;
    }

    const user = findUserById(auth.userId);
    if (!user) return { error: 'User not found.' };

    const job = getJob(jobId);
    if (!job) return { error: 'Job not found.' };

    // Permission check: only the assigned user, admin, or can_move_any users can move a job
    if (
      user.role !== 'admin' &&
      !user.can_move_any &&
      job.assigned_to !== null &&
      job.assigned_to !== auth.userId
    ) {
      return { error: 'This job is assigned to another team member. Only the assigned person can move it.' };
    }

    const fromStage = job.stage;
    const updated = updateJobSafe(jobId, expectedVersion, { stage: toStage });
    if (!updated) return { error: 'Failed to update job stage.' };
    if ('conflict' in updated) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };

    recordStageChange(jobId, fromStage, toStage, auth.userId, note ?? null);

    // Moving into Install puts the job on the rigging calendar automatically
    if (toStage === 'install') {
      ensureJobOnRiggingSchedule(jobId, auth.userId);
    }
    return updated;
  });

  ipcMain.handle('jobs:delete', async (_event, token: string, jobId: number, expectedVersion: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      const result = await deleteJobCloud(jobId, expectedVersion);
      if ('conflict' in result) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };
      return result;
    }

    const result = deleteJobSafe(jobId, expectedVersion);
    if ('conflict' in result) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };
    return result;
  });

  // Stage history
  ipcMain.handle('jobs:stageHistory', async (_event, token: string, jobId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return getStageHistoryCloud(jobId);
    return getStageHistory(jobId);
  });

  // Notes
  ipcMain.handle(
    'jobs:addNote',
    async (_event, token: string, jobId: number, body: string, mentions?: number[]) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };

      if (!body || !body.trim()) {
        return { error: 'Note body cannot be empty.' };
      }

      if (isSelfHostMode()) {
        const note = await addNoteCloud(jobId, auth.userId, body.trim());
        if (Array.isArray(mentions) && mentions.length > 0) {
          await addMentionsCloud(note.id, jobId, mentions, auth.userId);
        }
        return note;
      }

      const note = addNote(jobId, auth.userId, body.trim());
      if (Array.isArray(mentions) && mentions.length > 0) {
        addMentions(note.id, jobId, mentions, auth.userId);
      }
      return note;
    }
  );

  ipcMain.handle('jobs:listNotes', async (_event, token: string, jobId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listNotesCloud(Number(jobId));
    return listNotes(Number(jobId));
  });

  ipcMain.handle(
    'jobs:updateNote',
    async (_event, token: string, noteId: number, body: string) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      if (!body || !body.trim()) {
        return { error: 'Note body cannot be empty.' };
      }

      if (isSelfHostMode()) {
        const updated = await updateNoteCloud(noteId, body.trim());
        if (!updated) return { error: 'Note not found.' };
        return updated;
      }

      const updated = updateNote(noteId, auth.userId, body.trim(), {
        allowAnyAuthor: true,
      });
      if (!updated) {
        return { error: 'Note not found.' };
      }
      return updated;
    }
  );

  ipcMain.handle('jobs:deleteNote', async (_event, token: string, noteId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };

    if (isSelfHostMode()) {
      const { findUserByIdCloudFresh } = await import('../selfhost/usersCloud');
      const user = await findUserByIdCloudFresh(auth.userId);
      if (!user) return { error: 'User not found.' };
      if (!userCanDeleteNotes(user)) {
        return { error: 'You do not have permission to delete notes.' };
      }
      const ok = await deleteNoteCloud(noteId);
      if (!ok) return { error: 'Note not found.' };
      return { ok: true };
    }

    const user = findUserById(auth.userId);
    if (!user) return { error: 'User not found.' };
    if (!userCanDeleteNotes(user)) {
      return { error: 'You do not have permission to delete notes.' };
    }
    const ok = deleteNote(noteId);
    if (!ok) return { error: 'Note not found.' };
    return { ok: true };
  });

  // Archive
  ipcMain.handle('jobs:archive', async (_event, token: string, jobId: number, expectedVersion: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };

    if (isSelfHostMode()) {
      const { findUserByIdCloudCached, ensureUserCache } = await import('../selfhost/usersCloud');
      await ensureUserCache();
      const user = findUserByIdCloudCached(auth.userId);
      if (!user) return { error: 'User not found.' };
      if (!userCanArchiveJobs(user)) {
        return { error: 'You do not have permission to archive jobs.' };
      }
      const job = await getJobCloud(jobId);
      if (!job) return { error: 'Job not found.' };
      const updated = await archiveJobCloud(jobId, expectedVersion);
      if (!updated) return { error: 'Failed to archive job.' };
      if ('conflict' in updated) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };
      await recordStageChangeCloud(jobId, job.stage, job.stage, auth.userId, 'Archived');
      return updated;
    }

    const user = findUserById(auth.userId);
    if (!user) return { error: 'User not found.' };
    if (!userCanArchiveJobs(user)) {
      return { error: 'You do not have permission to archive jobs.' };
    }

    const job = getJob(jobId);
    if (!job) return { error: 'Job not found.' };

    const updated = archiveJobSafe(jobId, expectedVersion);
    if (!updated) return { error: 'Failed to archive job.' };
    if ('conflict' in updated) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };

    recordStageChange(jobId, job.stage, job.stage, auth.userId, 'Archived');
    return updated;
  });

  ipcMain.handle('jobs:listArchived', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listArchivedJobsCloud();
    return listArchivedJobs();
  });

  ipcMain.handle('jobs:unarchive', async (_event, token: string, jobId: number, expectedVersion: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };

    if (isSelfHostMode()) {
      const { findUserByIdCloudCached, ensureUserCache } = await import('../selfhost/usersCloud');
      await ensureUserCache();
      const user = findUserByIdCloudCached(auth.userId);
      if (!user) return { error: 'User not found.' };
      if (!userCanArchiveJobs(user)) {
        return { error: 'You do not have permission to restore archived jobs.' };
      }
      const job = await getJobCloud(jobId);
      if (!job) return { error: 'Job not found.' };
      if (!job.archived_at) return { error: 'This job is not archived.' };
      const updated = await unarchiveJobCloud(jobId, expectedVersion);
      if (!updated) return { error: 'Failed to restore job.' };
      if ('conflict' in updated) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };
      await recordStageChangeCloud(jobId, job.stage, job.stage, auth.userId, 'Restored');
      return updated;
    }

    const user = findUserById(auth.userId);
    if (!user) return { error: 'User not found.' };
    if (!userCanArchiveJobs(user)) {
      return { error: 'You do not have permission to restore archived jobs.' };
    }

    const job = getJob(jobId);
    if (!job) return { error: 'Job not found.' };
    if (!job.archived_at) return { error: 'This job is not archived.' };

    const updated = unarchiveJobSafe(jobId, expectedVersion);
    if (!updated) return { error: 'Failed to restore job.' };
    if ('conflict' in updated) return { error: 'CONFLICT: This job was changed by another user. Please try again.' };

    recordStageChange(jobId, job.stage, job.stage, auth.userId, 'Restored from archive');
    return updated;
  });

  // ── Job proofs (sent-to-client images) ──────────────────────────────────
  ipcMain.handle('jobs:listProofs', async (_event, token: string, jobId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listProofsCloud(jobId);
    return listProofs(jobId);
  });

  ipcMain.handle('jobs:getProof', async (_event, token: string, proofId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const proof = isSelfHostMode() ? await getProofCloud(proofId) : getProof(proofId);
    if (!proof) return { error: 'Proof not found.' };
    // Base64 is far cheaper over IPC than Array.from → number[] for multi-MB images
    return {
      id: proof.id,
      job_id: proof.job_id,
      file_name: proof.file_name,
      mime_type: proof.mime_type,
      size: proof.size,
      uploaded_by: proof.uploaded_by,
      uploaded_name: proof.uploaded_name,
      created_at: proof.created_at,
      dataBase64: Buffer.from(proof.data).toString('base64'),
    };
  });

  ipcMain.handle('jobs:getProofThumb', async (_event, token: string, proofId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const proof = isSelfHostMode() ? await getProofThumbCloud(proofId) : getProofThumb(proofId);
    if (!proof) return { error: 'Preview unavailable.' };
    return {
      id: proof.id,
      job_id: proof.job_id,
      file_name: proof.file_name,
      mime_type: proof.mime_type,
      size: proof.size,
      uploaded_by: proof.uploaded_by,
      uploaded_name: proof.uploaded_name,
      created_at: proof.created_at,
      dataBase64: Buffer.from(proof.data).toString('base64'),
    };
  });

  ipcMain.handle(
    'jobs:addProof',
    async (_event, token: string, jobId: number, data: { file_name: string; mime_type: string; bytes?: number[]; bytesBase64?: string; size: number }) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      if (!data.mime_type?.startsWith('image/')) {
        return { error: 'Only image files can be attached as proofs.' };
      }
      const bytes = data.bytesBase64
        ? new Uint8Array(Buffer.from(data.bytesBase64, 'base64'))
        : Uint8Array.from(data.bytes || []);
      if (bytes.length > 8 * 1024 * 1024) {
        return { error: 'Image is too large (max 8 MB).' };
      }
      try {
        if (isSelfHostMode()) {
          const { findUserByIdCloudCached, ensureUserCache } = await import('../selfhost/usersCloud');
          await ensureUserCache();
          const user = findUserByIdCloudCached(auth.userId);
          return await addProofCloud({
            job_id: jobId,
            file_name: data.file_name,
            mime_type: data.mime_type,
            size: data.size,
            uploaded_by: auth.userId,
            uploaded_name: user?.full_name ?? null,
            data: bytes,
          });
        }
        const user = findUserById(auth.userId);
        const proof: JobProof = addProof({
          job_id: jobId,
          file_name: data.file_name,
          mime_type: data.mime_type,
          size: data.size,
          uploaded_by: auth.userId,
          uploaded_name: user?.full_name ?? null,
          data: bytes,
        });
        return proof;
      } catch (err: any) {
        console.warn('[proofs] addProof failed:', err?.message || err);
        return { error: 'Failed to save proof. Try a smaller image or try again.' };
      }
    }
  );

  ipcMain.handle('jobs:deleteProof', async (_event, token: string, proofId: number) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      await deleteProofCloud(proofId);
      return { ok: true };
    }
    deleteProof(proofId);
    return { ok: true };
  });
}
