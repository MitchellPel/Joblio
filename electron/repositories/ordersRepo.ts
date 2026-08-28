import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';

export type OrderStatus = 'open' | 'placed' | 'done';

export interface OrderRow {
  id: number;
  job_id: number | null;
  job_no: string;
  job_name: string;
  client: string;
  order_name: string;
  items_body: string;
  status: OrderStatus;
  created_by: number;
  created_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
}

function parseStatus(v: unknown): OrderStatus {
  if (v === 'placed' || v === 'done') return v;
  return 'open';
}

function mapRow(row: any): OrderRow {
  const jobId = row.job_id != null ? Number(row.job_id) : null;
  const orderName = row.order_name || '';
  return {
    id: Number(row.id),
    job_id: jobId,
    job_no: row.job_no || '',
    job_name: row.job_name || '',
    client: row.client || '',
    order_name: orderName,
    items_body: row.items_body || '',
    status: parseStatus(row.status),
    created_by: Number(row.created_by),
    created_name: row.created_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
    version: row.version ?? 1,
  };
}

const ORDER_SELECT = `
  SELECT o.*,
    IFNULL(j.job_no, '') AS job_no,
    IFNULL(j.job_name, '') AS job_name,
    IFNULL(j.client, '') AS client,
    u.full_name AS created_name
  FROM orders o
  LEFT JOIN jobs j ON j.id = o.job_id
  LEFT JOIN users u ON u.id = o.created_by
`;

export function listActiveOrders(): OrderRow[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `${ORDER_SELECT}
     WHERE o.archived_at IS NULL
     ORDER BY
       CASE o.status WHEN 'open' THEN 0 WHEN 'placed' THEN 1 ELSE 2 END,
       o.created_at DESC`
  );
  return rows.map(mapRow);
}

export function listArchivedOrders(): OrderRow[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `${ORDER_SELECT}
     WHERE o.archived_at IS NOT NULL
     ORDER BY o.archived_at DESC`
  );
  return rows.map(mapRow);
}

export function getOrder(id: number): OrderRow | undefined {
  const h = createDbHelpers(getDatabase());
  const row = h.get(`${ORDER_SELECT} WHERE o.id = ?`, [id]);
  return row ? mapRow(row) : undefined;
}

export function createOrder(data: {
  jobId: number | null;
  orderName: string;
  itemsBody: string;
  createdBy: number;
}): OrderRow {
  const h = createDbHelpers(getDatabase());
  if (data.jobId != null) {
    const job = h.get('SELECT id FROM jobs WHERE id = ?', [data.jobId]) as { id: number } | undefined;
    if (!job) throw new Error('Job not found.');
  }
  const result = h.run(
    `INSERT INTO orders (job_id, order_name, items_body, status, created_by)
     VALUES (?, ?, ?, 'open', ?)`,
    [data.jobId, data.orderName.trim(), data.itemsBody.trim(), data.createdBy]
  );
  return getOrder(result.lastInsertRowid)!;
}

export function updateOrderSafe(
  id: number,
  expectedVersion: number,
  fields: Partial<{
    job_id: number | null;
    order_name: string;
    items_body: string;
    status: OrderStatus;
    archived_at: string | null;
  }>
): { conflict: true; server: OrderRow } | OrderRow | undefined {
  const h = createDbHelpers(getDatabase());
  const current = h.get('SELECT version FROM orders WHERE id = ?', [id]) as
    | { version: number }
    | undefined;
  if (!current) return undefined;
  if (current.version !== expectedVersion) {
    return { conflict: true, server: getOrder(id)! };
  }

  const sets: string[] = ["updated_at = datetime('now')", 'version = version + 1'];
  const params: any[] = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    params.push(value === undefined ? null : value);
  }
  params.push(id);
  h.run(`UPDATE orders SET ${sets.join(', ')} WHERE id = ?`, params);
  return getOrder(id)!;
}

export function listUnseenOrderIds(userId: number): number[] {
  const h = createDbHelpers(getDatabase());
  const rows = h.all(
    `SELECT o.id FROM orders o
     WHERE o.archived_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM order_seen s
         WHERE s.user_id = ? AND s.order_id = o.id
       )
     ORDER BY o.created_at DESC`,
    [userId]
  ) as { id: number }[];
  return rows.map((r) => Number(r.id));
}

export function markOrdersSeen(userId: number, orderIds?: number[]): number {
  const h = createDbHelpers(getDatabase());
  const ids =
    orderIds && orderIds.length
      ? orderIds
      : (
          h.all(`SELECT id FROM orders WHERE archived_at IS NULL`) as { id: number }[]
        ).map((r) => Number(r.id));
  let marked = 0;
  for (const oid of ids) {
    const result = h.run(
      `INSERT OR IGNORE INTO order_seen (user_id, order_id) VALUES (?, ?)`,
      [userId, oid]
    );
    if (result.changes > 0) marked++;
  }
  return marked;
}
