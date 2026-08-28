import type { IpcMain } from 'electron';
import { requireAdmin, requireAuth } from './authIpc';
import {
  listUsers,
  createUser,
  updateUser,
  findUserById,
  findUserByUsername,
  deleteUser as deleteUserRepo,
  listStaff as listStaffRepo,
} from '../repositories/usersRepo';
import { hashPassword } from '../services/authService';
import { isSelfHostMode } from '../db/backendMode';
import { sanitizeBoardColor } from '../utils/boardColor';
import {
  listUsersCloud,
  listStaffCloud,
  ensureUserCache,
  findUserByUsernameCloud,
  createUserCloud,
  updateUserCloud,
  deleteUserCloud,
} from '../selfhost/usersCloud';

export function registerUsersIpc(ipcMain: IpcMain): void {
  ipcMain.handle('users:list', async (_event, token: string) => {
    const auth = await requireAdmin(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      await ensureUserCache();
      return listUsersCloud();
    }
    return listUsers();
  });

  ipcMain.handle(
    'users:create',
    async (
      _event,
      token: string,
      data: { username: string; password: string; full_name: string; role: 'admin' | 'staff' }
    ) => {
      const auth = await requireAdmin(token);
      if ('error' in auth) return { error: auth.error };

      const username = data.username.trim();
      if (!username || !data.password) {
        return { error: 'Username and password are required.' };
      }

      if (isSelfHostMode()) {
        const existing = await findUserByUsernameCloud(username);
        if (existing) return { error: 'Username already exists.' };
        const pwHash = hashPassword(data.password);
        return createUserCloud(username, pwHash, data.full_name || username, data.role);
      }

      const existing = findUserByUsername(username);
      if (existing) {
        return { error: 'Username already exists.' };
      }

      const pwHash = hashPassword(data.password);
      return createUser(username, pwHash, data.full_name || username, data.role);
    }
  );

  ipcMain.handle('users:update', async (_event, token: string, data: any) => {
    const auth = await requireAdmin(token);
    if ('error' in auth) return { error: auth.error };

    const fields: any = {};
    if (data.full_name !== undefined) fields.full_name = data.full_name;
    if (data.role !== undefined) fields.role = data.role;
    if (data.active !== undefined) fields.active = data.active;
    if (data.can_archive !== undefined) fields.can_archive = data.can_archive;
    if (data.can_move_any !== undefined) fields.can_move_any = data.can_move_any;
    if (data.can_edit_rigging !== undefined) fields.can_edit_rigging = data.can_edit_rigging;
    if (data.can_edit_vehicle_bookings !== undefined) {
      fields.can_edit_vehicle_bookings = data.can_edit_vehicle_bookings;
    }
    if (data.can_create_orders !== undefined) fields.can_create_orders = data.can_create_orders;
    if (data.can_manage_orders !== undefined) fields.can_manage_orders = data.can_manage_orders;
    if (data.can_use_ai !== undefined) fields.can_use_ai = data.can_use_ai;
    if (data.can_delete_notes !== undefined) fields.can_delete_notes = data.can_delete_notes;
    if (data.can_manage_quote_sizes !== undefined) {
      fields.can_manage_quote_sizes = data.can_manage_quote_sizes;
    }
    if (data.board_color !== undefined) {
      fields.board_color =
        data.board_color === null || data.board_color === ''
          ? null
          : sanitizeBoardColor(data.board_color);
      if (data.board_color && !fields.board_color) {
        return { error: 'Pick a valid colour.' };
      }
    }
    if (data.password) {
      fields.password_hash = hashPassword(data.password);
    }

    if (isSelfHostMode()) {
      try {
        const updated = await updateUserCloud(data.id, fields);
        if (!updated) return { error: 'User not found.' };
        return updated;
      } catch (err: any) {
        return { error: err?.message || 'Failed to update user.' };
      }
    }

    updateUser(data.id, fields);

    const updated = findUserById(data.id);
    if (!updated) return { error: 'User not found.' };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safe } = updated;
    return safe;
  });

  ipcMain.handle('users:staff', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) {
      await ensureUserCache();
      return listStaffCloud();
    }
    return listStaffRepo();
  });

  ipcMain.handle('users:setBoardColor', async (_event, token: string, color: string | null) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };

    const board_color =
      color === null || color === '' ? null : sanitizeBoardColor(color);
    if (color && !board_color) {
      return { error: 'Pick a valid colour.' };
    }

    if (isSelfHostMode()) {
      try {
        const updated = await updateUserCloud(auth.userId, { board_color });
        if (!updated) return { error: 'User not found.' };
        return updated;
      } catch (err: any) {
        return { error: err?.message || 'Failed to save colour.' };
      }
    }

    updateUser(auth.userId, { board_color });
    const updated = findUserById(auth.userId);
    if (!updated) return { error: 'User not found.' };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safe } = updated;
    return { ...safe, board_color: sanitizeBoardColor(safe.board_color) };
  });

  ipcMain.handle('users:delete', async (_event, token: string, userId: number) => {
    const auth = await requireAdmin(token);
    if ('error' in auth) return { error: auth.error };

    if (auth.userId === userId) {
      return { error: 'You cannot delete your own account.' };
    }

    if (isSelfHostMode()) {
      try {
        await deleteUserCloud(userId);
        return { ok: true };
      } catch (err: any) {
        return { error: err?.message || 'Failed to delete user.' };
      }
    }

    deleteUserRepo(userId);
    return { ok: true };
  });
}
