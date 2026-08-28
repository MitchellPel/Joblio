import type { BrowserWindow, IpcMain } from 'electron';
import { requireAuth } from './authIpc';
import { validateSession } from '../services/authService';
import { findUserById } from '../repositories/usersRepo';
import { scheduleSave } from '../db/connection';
import { isSelfHostMode } from '../db/backendMode';
import {
  ensureRiggingMonths,
  listArchivedMonths,
  listInstallsForMonth,
  listInstallsForDate,
  addInstall,
  updateInstall,
  removeInstall,
  searchJobsForRigging,
  currentYearMonth,
  yearMonthFromDate,
  isArchivedMonth,
  syncInstallJobsToRigging,
} from '../repositories/riggingRepo';
import {
  ensureRiggingMonthsCloud,
  listArchivedMonthsCloud,
  listInstallsForMonthCloud,
  listInstallsForDateCloud,
  addInstallCloud,
  updateInstallCloud,
  removeInstallCloud,
  searchJobsForRiggingCloud,
  isArchivedMonthCloud,
  syncInstallJobsToRiggingCloud,
} from '../selfhost/riggingCloud';

async function canEditRigging(
  token: string
): Promise<{ ok: true; userId: number } | { error: string }> {
  const user = await validateSession(token);
  if (!user) return { error: 'Not authenticated or session expired.' };
  if (user.role === 'admin' || user.can_edit_rigging) {
    return { ok: true, userId: user.id };
  }
  return { error: 'You do not have permission to edit the rigging schedule.' };
}

export function registerRiggingIpc(ipcMain: IpcMain): void {
  ipcMain.handle('rigging:getCurrentMonth', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      await ensureRiggingMonthsCloud();
      return { year_month: currentYearMonth() };
    }
    ensureRiggingMonths();
    return { year_month: currentYearMonth() };
  });

  ipcMain.handle('rigging:listArchivedMonths', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      await ensureRiggingMonthsCloud();
      return listArchivedMonthsCloud();
    }
    ensureRiggingMonths();
    return listArchivedMonths();
  });

  ipcMain.handle('rigging:listInstalls', async (_event, token: string, yearMonth: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return { error: 'Invalid month format.' };
    }
    if (isSelfHostMode()) {
      await ensureRiggingMonthsCloud();
      await syncInstallJobsToRiggingCloud(auth.userId);
      return listInstallsForMonthCloud(yearMonth);
    }
    ensureRiggingMonths();
    syncInstallJobsToRigging(auth.userId);
    return listInstallsForMonth(yearMonth);
  });

  ipcMain.handle('rigging:listInstallsForDate', async (_event, token: string, date: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: 'Invalid date format.' };
    }
    if (isSelfHostMode()) {
      await ensureRiggingMonthsCloud();
      await syncInstallJobsToRiggingCloud(auth.userId);
      return listInstallsForDateCloud(date);
    }
    ensureRiggingMonths();
    syncInstallJobsToRigging(auth.userId);
    return listInstallsForDate(date);
  });

  ipcMain.handle('rigging:searchJobs', async (_event, token: string, query: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (!query?.trim()) return [];
    if (isSelfHostMode()) return searchJobsForRiggingCloud(query.trim());
    return searchJobsForRigging(query.trim());
  });

  ipcMain.handle(
    'rigging:addInstall',
    async (_event, token: string, data: { job_id: number; scheduled_date: string; note?: string | null; duration_days?: number | null }) => {
      const auth = await canEditRigging(token);
      if ('error' in auth) return { error: auth.error };

      if (!data.job_id || !data.scheduled_date) {
        return { error: 'Job and date are required.' };
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.scheduled_date)) {
        return { error: 'Invalid date format.' };
      }

      const month = yearMonthFromDate(data.scheduled_date);
      if (isSelfHostMode() ? await isArchivedMonthCloud(month) : isArchivedMonth(month)) {
        return { error: 'That month is archived and cannot be edited.' };
      }

      try {
        if (isSelfHostMode()) {
          await ensureRiggingMonthsCloud();
          return await addInstallCloud(data.job_id, data.scheduled_date, auth.userId, data.note, data.duration_days);
        }
        ensureRiggingMonths();
        const install = addInstall(data.job_id, data.scheduled_date, auth.userId, data.note, data.duration_days);
        scheduleSave();
        return install;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') || msg.toLowerCase().includes('unique') || msg.includes('23505')) {
          return { error: 'This job is already on the rigging schedule.' };
        }
        return { error: msg || 'Failed to add install.' };
      }
    }
  );

  ipcMain.handle(
    'rigging:updateInstall',
    async (
      _event,
      token: string,
      data: { id: number; scheduled_date?: string; note?: string | null; duration_days?: number | null }
    ) => {
      const auth = await canEditRigging(token);
      if ('error' in auth) return { error: auth.error };

      if (data.scheduled_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.scheduled_date)) {
        return { error: 'Invalid date format.' };
      }
      if (data.scheduled_date) {
        const month = yearMonthFromDate(data.scheduled_date);
        if (isSelfHostMode() ? await isArchivedMonthCloud(month) : isArchivedMonth(month)) {
          return { error: 'That month is archived and cannot be edited.' };
        }
      }

      if (isSelfHostMode()) {
        const updated = await updateInstallCloud(data.id, {
          scheduled_date: data.scheduled_date,
          note: data.note,
          duration_days: data.duration_days,
        });
        if (!updated) return { error: 'Install not found.' };
        return updated;
      }

      const updated = updateInstall(data.id, {
        scheduled_date: data.scheduled_date,
        note: data.note,
        duration_days: data.duration_days,
      });
      if (!updated) return { error: 'Install not found.' };
      scheduleSave();
      return updated;
    }
  );

  ipcMain.handle('rigging:removeInstall', async (_event, token: string, id: number) => {
    const auth = await canEditRigging(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      await removeInstallCloud(id);
      return { ok: true };
    }
    removeInstall(id);
    scheduleSave();
    return { ok: true };
  });

  ipcMain.handle('rigging:canEdit', async (_event, token: string) => {
    const user = await validateSession(token);
    if (!user) return { can_edit: false };
    if (isSelfHostMode()) {
      return { can_edit: user.role === 'admin' || !!user.can_edit_rigging };
    }
    const full = findUserById(user.id);
    return {
      can_edit: user.role === 'admin' || !!full?.can_edit_rigging,
    };
  });
}

let alertWindow: BrowserWindow | null = null;

export function setRiggingAlertWindow(win: BrowserWindow | null): void {
  alertWindow = win;
}

/** Bring Joblio forward when an alert fires (no always-on-top flicker). */
export function raiseAlertWindow(): void {
  const win = alertWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export function emitRiggingAlert(payload: {
  alert_type: string;
  message: string;
  install_id: number;
  scheduled_date: string;
  job_no: string;
}): void {
  raiseAlertWindow();
  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.webContents.send('rigging:alert', payload);
  }
}
