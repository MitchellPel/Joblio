import type { IpcMain } from 'electron';
import { requireAuth } from './authIpc';
import { isSelfHostMode } from '../db/backendMode';
import { findUserById } from '../repositories/usersRepo';
import {
  listActiveOrders,
  listArchivedOrders,
  createOrder,
  updateOrderSafe,
  getOrder,
  listUnseenOrderIds,
  markOrdersSeen,
  type OrderStatus,
} from '../repositories/ordersRepo';
import {
  listActiveOrdersCloud,
  listArchivedOrdersCloud,
  createOrderCloud,
  updateOrderSafeCloud,
  getOrderCloud,
  listUnseenOrderIdsCloud,
  markOrdersSeenCloud,
} from '../selfhost/ordersCloud';
import { notifyNewOrder } from '../services/orderNotifier';

async function loadUser(userId: number) {
  if (isSelfHostMode()) {
    const { findUserByIdCloudFresh } = await import('../selfhost/usersCloud');
    return (await findUserByIdCloudFresh(userId)) || null;
  }
  return findUserById(userId) || null;
}

function canCreateOrders(user: {
  role: string;
  can_create_orders?: boolean | number | null;
  can_manage_orders?: boolean | number | null;
}): boolean {
  if (user.role === 'admin') return true;
  return (
    user.can_create_orders === true ||
    user.can_create_orders === 1 ||
    user.can_manage_orders === true ||
    user.can_manage_orders === 1
  );
}

function canManageOrders(user: {
  role: string;
  can_manage_orders?: boolean | number | null;
}): boolean {
  if (user.role === 'admin') return true;
  return user.can_manage_orders === true || user.can_manage_orders === 1;
}

function isOrderStatus(v: unknown): v is OrderStatus {
  return v === 'open' || v === 'placed' || v === 'done';
}

export function registerOrdersIpc(ipcMain: IpcMain): void {
  ipcMain.handle('orders:list', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listActiveOrdersCloud();
    return listActiveOrders();
  });

  ipcMain.handle('orders:listArchived', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listArchivedOrdersCloud();
    return listArchivedOrders();
  });

  ipcMain.handle(
    'orders:create',
    async (
      _event,
      token: string,
      data: { job_id?: number | null; order_name?: string; items_body: string }
    ) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      const user = await loadUser(auth.userId);
      if (!user) return { error: 'User not found.' };
      if (!canCreateOrders(user)) return { error: 'You do not have permission to create orders.' };

      const jobId =
        data?.job_id != null && Number(data.job_id) > 0 ? Number(data.job_id) : null;
      const orderName = (data?.order_name || '').trim();
      if (!jobId && !orderName) {
        return { error: 'Link a job or enter a name for this order.' };
      }
      if (!data.items_body?.trim()) return { error: 'Add at least one item line.' };

      try {
        const payload = {
          jobId,
          orderName,
          itemsBody: data.items_body,
          createdBy: auth.userId,
        };
        const order = isSelfHostMode()
          ? await createOrderCloud(payload)
          : createOrder(payload);
        if (isSelfHostMode()) await markOrdersSeenCloud(auth.userId, [order.id]);
        else markOrdersSeen(auth.userId, [order.id]);
        notifyNewOrder(order);
        return order;
      } catch (err: any) {
        return { error: err?.message || 'Failed to create order.' };
      }
    }
  );

  ipcMain.handle(
    'orders:update',
    async (
      _event,
      token: string,
      data: {
        id: number;
        version: number;
        job_id?: number | null;
        order_name?: string;
        items_body?: string;
        status?: OrderStatus;
      }
    ) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      const user = await loadUser(auth.userId);
      if (!user) return { error: 'User not found.' };

      const current = isSelfHostMode() ? await getOrderCloud(data.id) : getOrder(data.id);
      if (!current) return { error: 'Order not found.' };

      const fields: {
        job_id?: number | null;
        order_name?: string;
        items_body?: string;
        status?: OrderStatus;
      } = {};

      if (
        data.job_id !== undefined ||
        data.order_name !== undefined ||
        data.items_body !== undefined
      ) {
        if (!canCreateOrders(user) && !canManageOrders(user)) {
          return { error: 'You do not have permission to edit orders.' };
        }
        if (data.job_id !== undefined) {
          fields.job_id =
            data.job_id != null && Number(data.job_id) > 0 ? Number(data.job_id) : null;
        }
        if (data.order_name !== undefined) fields.order_name = data.order_name.trim();
        if (data.items_body !== undefined) {
          if (!data.items_body.trim()) return { error: 'Add at least one item line.' };
          fields.items_body = data.items_body.trim();
        }

        const nextJob =
          fields.job_id !== undefined ? fields.job_id : current.job_id;
        const nextName =
          fields.order_name !== undefined ? fields.order_name : current.order_name;
        if (!nextJob && !String(nextName || '').trim()) {
          return { error: 'Link a job or enter a name for this order.' };
        }
      }

      if (data.status !== undefined) {
        if (!isOrderStatus(data.status)) return { error: 'Invalid status.' };
        if (!canManageOrders(user)) {
          return { error: 'You do not have permission to change order status.' };
        }
        fields.status = data.status;
      }

      if (Object.keys(fields).length === 0) return current;

      const updated = isSelfHostMode()
        ? await updateOrderSafeCloud(data.id, data.version, fields)
        : updateOrderSafe(data.id, data.version, fields);
      if (!updated) return { error: 'Order not found.' };
      if ('conflict' in updated) {
        return { error: 'CONFLICT: This order was changed by another user. Please try again.' };
      }
      return updated;
    }
  );

  ipcMain.handle(
    'orders:archive',
    async (_event, token: string, id: number, version: number) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      const user = await loadUser(auth.userId);
      if (!user) return { error: 'User not found.' };
      if (!canManageOrders(user)) return { error: 'You do not have permission to archive orders.' };

      const updated = isSelfHostMode()
        ? await updateOrderSafeCloud(id, version, {
            archived_at: new Date().toISOString(),
          })
        : updateOrderSafe(id, version, {
            archived_at: new Date().toISOString(),
          });
      if (!updated) return { error: 'Order not found.' };
      if ('conflict' in updated) {
        return { error: 'CONFLICT: This order was changed by another user. Please try again.' };
      }
      return updated;
    }
  );

  ipcMain.handle(
    'orders:unarchive',
    async (_event, token: string, id: number, version: number) => {
      const auth = await requireAuth(token);
      if ('error' in auth) return { error: auth.error };
      const user = await loadUser(auth.userId);
      if (!user) return { error: 'User not found.' };
      if (!canManageOrders(user)) return { error: 'You do not have permission to restore orders.' };

      const updated = isSelfHostMode()
        ? await updateOrderSafeCloud(id, version, { archived_at: null })
        : updateOrderSafe(id, version, { archived_at: null });
      if (!updated) return { error: 'Order not found.' };
      if ('conflict' in updated) {
        return { error: 'CONFLICT: This order was changed by another user. Please try again.' };
      }
      return updated;
    }
  );

  ipcMain.handle('orders:listUnseenIds', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    if (isSelfHostMode()) return listUnseenOrderIdsCloud(auth.userId);
    return listUnseenOrderIds(auth.userId);
  });

  ipcMain.handle('orders:markSeen', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const marked = isSelfHostMode()
      ? await markOrdersSeenCloud(auth.userId)
      : markOrdersSeen(auth.userId);
    return { ok: true, marked };
  });

  ipcMain.handle('orders:permissions', async (_event, token: string) => {
    const auth = await requireAuth(token);
    if ('error' in auth) return { error: auth.error };
    const user = await loadUser(auth.userId);
    if (!user) return { error: 'User not found.' };
    return {
      can_create: canCreateOrders(user),
      can_manage: canManageOrders(user),
    };
  });
}
