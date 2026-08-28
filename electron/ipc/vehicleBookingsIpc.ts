import type { IpcMain } from 'electron';
import { requireAuth } from './authIpc';
import { validateSession } from '../services/authService';
import { scheduleSave } from '../db/connection';
import { isSelfHostMode } from '../db/backendMode';
import {
  ensureVehicleBookingMonths,
  listArchivedVehicleMonths,
  listBookingsForMonth,
  addBooking,
  updateBooking,
  removeBooking,
  searchJobsForVehicles,
  listUnbookedVehicleJobs,
  currentYearMonth,
  yearMonthFromDate,
  isArchivedVehicleMonth,
} from '../repositories/vehicleBookingsRepo';
import {
  ensureVehicleBookingMonthsCloud,
  listArchivedVehicleMonthsCloud,
  listBookingsForMonthCloud,
  addBookingCloud,
  updateBookingCloud,
  removeBookingCloud,
  searchJobsForVehiclesCloud,
  listUnbookedVehicleJobsCloud,
  isArchivedVehicleMonthCloud,
} from '../selfhost/vehicleBookingsCloud';
import { setJobDueDate } from '../repositories/jobsRepo';
import { setJobDueDateCloud } from '../selfhost/jobsCloud';

async function canEditVehicleBookings(
  token: string
): Promise<{ ok: true; userId: number } | { error: string }> {
  const user = await validateSession(token);
  if (!user) return { error: 'Not authenticated or session expired.' };
  if (user.role === 'admin' || user.can_edit_vehicle_bookings) {
    return { ok: true, userId: user.id };
  }
  return { error: 'You do not have permission to edit vehicle bookings.' };
}

async function syncJobDueDate(jobId: number, scheduledDate: string): Promise<void> {
  try {
    if (isSelfHostMode()) {
      await setJobDueDateCloud(jobId, scheduledDate);
    } else {
      setJobDueDate(jobId, scheduledDate);
    }
  } catch {
    // Booking still succeeds if the due-date write fails.
  }
}

export function registerVehicleBookingsIpc(ipcMain: IpcMain): void {
  ipcMain.handle('vehicles:getCurrentMonth', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      await ensureVehicleBookingMonthsCloud();
      return { year_month: currentYearMonth() };
    }
    ensureVehicleBookingMonths();
    return { year_month: currentYearMonth() };
  });

  ipcMain.handle('vehicles:listArchivedMonths', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      await ensureVehicleBookingMonthsCloud();
      return listArchivedVehicleMonthsCloud();
    }
    ensureVehicleBookingMonths();
    return listArchivedVehicleMonths();
  });

  ipcMain.handle('vehicles:listBookings', async (_event, token: string, yearMonth: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return { error: 'Invalid month format.' };
    if (isSelfHostMode()) {
      await ensureVehicleBookingMonthsCloud();
      return listBookingsForMonthCloud(yearMonth);
    }
    ensureVehicleBookingMonths();
    return listBookingsForMonth(yearMonth);
  });

  ipcMain.handle('vehicles:searchJobs', async (_event, token: string, query: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (!query?.trim()) return [];
    if (isSelfHostMode()) return searchJobsForVehiclesCloud(query.trim());
    return searchJobsForVehicles(query.trim());
  });

  ipcMain.handle('vehicles:listUnbookedJobs', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listUnbookedVehicleJobsCloud();
    return listUnbookedVehicleJobs();
  });

  ipcMain.handle(
    'vehicles:addBooking',
    async (
      _event,
      token: string,
      data: { job_id: number; scheduled_date: string; note?: string | null }
    ) => {
      const auth = await canEditVehicleBookings(token);
      if ('error' in auth) return { error: auth.error };
      if (!data.job_id || !data.scheduled_date) {
        return { error: 'Job and date are required.' };
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.scheduled_date)) {
        return { error: 'Invalid date format.' };
      }
      const month = yearMonthFromDate(data.scheduled_date);
      if (
        isSelfHostMode() ? await isArchivedVehicleMonthCloud(month) : isArchivedVehicleMonth(month)
      ) {
        return { error: 'That month is archived and cannot be edited.' };
      }
      try {
        if (isSelfHostMode()) {
          await ensureVehicleBookingMonthsCloud();
          const booking = await addBookingCloud(data.job_id, data.scheduled_date, auth.userId, data.note);
          await syncJobDueDate(booking.job_id, data.scheduled_date);
          return booking;
        }
        ensureVehicleBookingMonths();
        const booking = addBooking(data.job_id, data.scheduled_date, auth.userId, data.note);
        syncJobDueDate(booking.job_id, data.scheduled_date);
        scheduleSave();
        return booking;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('UNIQUE') || msg.toLowerCase().includes('unique') || msg.includes('23505')) {
          return { error: 'That job is already on the vehicle calendar.' };
        }
        return { error: msg || 'Failed to add booking.' };
      }
    }
  );

  ipcMain.handle(
    'vehicles:updateBooking',
    async (
      _event,
      token: string,
      data: { id: number; scheduled_date?: string; note?: string | null }
    ) => {
      const auth = await canEditVehicleBookings(token);
      if ('error' in auth) return { error: auth.error };
      if (!data.id) return { error: 'Booking id is required.' };
      if (data.scheduled_date !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.scheduled_date)) {
          return { error: 'Invalid date format.' };
        }
        const month = yearMonthFromDate(data.scheduled_date);
        if (
          isSelfHostMode()
            ? await isArchivedVehicleMonthCloud(month)
            : isArchivedVehicleMonth(month)
        ) {
          return { error: 'That month is archived and cannot be edited.' };
        }
      }
      try {
        if (isSelfHostMode()) {
          const booking = await updateBookingCloud(data.id, {
            scheduled_date: data.scheduled_date,
            note: data.note,
          });
          if (booking && data.scheduled_date) {
            await syncJobDueDate(booking.job_id, data.scheduled_date);
          }
          return booking;
        }
        const booking = updateBooking(data.id, {
          scheduled_date: data.scheduled_date,
          note: data.note,
        });
        if (data.scheduled_date) {
          syncJobDueDate(booking.job_id, data.scheduled_date);
        }
        scheduleSave();
        return booking;
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : 'Failed to update booking.' };
      }
    }
  );

  ipcMain.handle('vehicles:removeBooking', async (_event, token: string, id: number) => {
    const auth = await canEditVehicleBookings(token);
    if ('error' in auth) return { error: auth.error };
    try {
      if (isSelfHostMode()) {
        await removeBookingCloud(id);
        return { ok: true };
      }
      removeBooking(id);
      scheduleSave();
      return { ok: true };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : 'Failed to remove booking.' };
    }
  });

  ipcMain.handle('vehicles:canEdit', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const edit = await canEditVehicleBookings(token);
    return { can_edit: !('error' in edit) };
  });
}
