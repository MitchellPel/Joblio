import { BrowserWindow } from 'electron';
import { showJoblioNotification } from '../utils/joblioNotify';
import { getActiveUserIds } from './authService';
import { isSelfHostMode } from '../db/backendMode';
import {
  listUnseenOrderIds,
  getOrder,
  type OrderRow,
} from '../repositories/ordersRepo';
import { listUnseenOrderIdsCloud, getOrderCloud } from '../selfhost/ordersCloud';

/** Order ids we've already toasted for during this app run (per user). */
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

function orderLabel(order: OrderRow): string {
  if (order.job_id != null) {
    return `${order.client?.trim() || order.job_no || 'Job'}${
      order.job_name ? ` — ${order.job_name}` : ''
    }`;
  }
  return order.order_name.trim() || 'Named order';
}

function showOrderToast(order: OrderRow): void {
  showJoblioNotification({
    title: 'New order',
    body: orderLabel(order),
    onClick: () => {
      const win = focusMainWindow();
      if (win) win.webContents.send('orders:open', { order_id: order.id });
    },
  });
}

/** Broadcast a new order to every open Joblio window on THIS machine + Windows toast. */
export function notifyNewOrder(order: OrderRow): void {
  sendToWindows('orders:new', {
    id: order.id,
    job_id: order.job_id,
    job_no: order.job_no,
    job_name: order.job_name,
    order_name: order.order_name,
    client: order.client,
  });

  // Don't toast the creator's machine again via checkOrders for this id.
  for (const userId of getActiveUserIds()) {
    notifiedKeys.add(`${userId}:${order.id}`);
  }

  showOrderToast(order);
}

/**
 * After background DB sync: find unseen orders for users on this PC and
 * toast + refresh the Orders badge (same pattern as @mentions).
 */
export function checkOrders(): void {
  void checkOrdersAsync();
}

export async function checkOrdersAsync(): Promise<void> {
  try {
    const userIds = getActiveUserIds();
    if (userIds.length === 0) return;

    let anyFresh = false;
    const toToast: OrderRow[] = [];

    for (const userId of userIds) {
      const ids = isSelfHostMode()
        ? await listUnseenOrderIdsCloud(userId)
        : listUnseenOrderIds(userId);
      for (const orderId of ids) {
        const key = `${userId}:${orderId}`;
        if (notifiedKeys.has(key)) continue;
        notifiedKeys.add(key);
        anyFresh = true;
        const order = isSelfHostMode()
          ? await getOrderCloud(orderId)
          : getOrder(orderId);
        if (order) toToast.push(order);
      }
    }

    if (!anyFresh) return;

    // Refresh badge on all windows
    sendToWindows('orders:new', null);

    if (toToast.length === 0) return;
    if (toToast.length > 3) {
      showJoblioNotification({
        title: 'New orders',
        body: `${toToast.length} new orders. Open Orders in Joblio to review.`,
        onClick: () => {
          const win = focusMainWindow();
          if (win) win.webContents.send('orders:open', { order_id: toToast[0].id });
        },
      });
    } else {
      for (const order of toToast) showOrderToast(order);
    }
  } catch {
    // DB/API not ready — next sync retries
  }
}
