import { sbFetch, sbJson } from './rest';
import { ensureUserCache, findUserByIdCloudCached } from './usersCloud';
import type { OrderRow, OrderStatus } from '../repositories/ordersRepo';

function parseStatus(v: unknown): OrderStatus {
  if (v === 'placed' || v === 'done') return v;
  return 'open';
}

function mapRow(row: any, job?: any): OrderRow {
  const j = job || row.jobs || {};
  const jobId = row.job_id != null ? Number(row.job_id) : null;
  return {
    id: Number(row.id),
    job_id: jobId,
    job_no: j.job_no || row.job_no || '',
    job_name: j.job_name || row.job_name || '',
    client: j.client || row.client || '',
    order_name: row.order_name || '',
    items_body: row.items_body || '',
    status: parseStatus(row.status),
    created_by: Number(row.created_by),
    created_name: findUserByIdCloudCached(Number(row.created_by))?.full_name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
    version: row.version ?? 1,
  };
}

async function attachJobs(rows: any[]): Promise<OrderRow[]> {
  await ensureUserCache();
  if (!rows.length) return [];
  const jobIds = [...new Set(rows.map((r) => Number(r.job_id)).filter((id) => id > 0))];
  const jobs =
    jobIds.length > 0
      ? await sbJson<any[]>('jobs', {
          query: {
            select: 'id,job_no,job_name,client',
            id: `in.(${jobIds.join(',')})`,
          },
        })
      : [];
  const jobMap = new Map(jobs.map((j) => [Number(j.id), j]));
  return rows.map((r) => mapRow(r, r.job_id != null ? jobMap.get(Number(r.job_id)) : undefined));
}

export async function listActiveOrdersCloud(): Promise<OrderRow[]> {
  const rows = await sbJson<any[]>('orders', {
    query: {
      select: '*',
      archived_at: 'is.null',
      order: 'created_at.desc',
    },
  });
  const mapped = await attachJobs(rows);
  mapped.sort((a, b) => {
    const rank = (s: OrderStatus) => (s === 'open' ? 0 : s === 'placed' ? 1 : 2);
    const d = rank(a.status) - rank(b.status);
    if (d !== 0) return d;
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return mapped;
}

export async function listArchivedOrdersCloud(): Promise<OrderRow[]> {
  const rows = await sbJson<any[]>('orders', {
    query: {
      select: '*',
      archived_at: 'not.is.null',
      order: 'archived_at.desc',
    },
  });
  return attachJobs(rows);
}

export async function getOrderCloud(id: number): Promise<OrderRow | undefined> {
  const rows = await sbJson<any[]>('orders', {
    query: { select: '*', id: `eq.${id}`, limit: '1' },
  });
  if (!rows[0]) return undefined;
  const [mapped] = await attachJobs(rows);
  return mapped;
}

export async function createOrderCloud(data: {
  jobId: number | null;
  orderName: string;
  itemsBody: string;
  createdBy: number;
}): Promise<OrderRow> {
  if (data.jobId != null) {
    const jobs = await sbJson<any[]>('jobs', {
      query: { select: 'id', id: `eq.${data.jobId}`, limit: '1' },
    });
    if (!jobs[0]) throw new Error('Job not found.');
  }

  const rows = await sbJson<any[]>('orders', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      job_id: data.jobId,
      order_name: data.orderName.trim(),
      items_body: data.itemsBody.trim(),
      status: 'open',
      created_by: data.createdBy,
      version: 1,
    }),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  const order = await getOrderCloud(Number(created.id));
  if (!order) throw new Error('Failed to load created order.');
  return order;
}

export async function updateOrderSafeCloud(
  id: number,
  expectedVersion: number,
  fields: Partial<{
    job_id: number | null;
    order_name: string;
    items_body: string;
    status: OrderStatus;
    archived_at: string | null;
  }>
): Promise<{ conflict: true; server: OrderRow } | OrderRow | undefined> {
  const current = await getOrderCloud(id);
  if (!current) return undefined;
  if (current.version !== expectedVersion) {
    return { conflict: true, server: current };
  }
  const patch = { ...fields, version: expectedVersion + 1 };
  const res = await sbFetch('orders', {
    method: 'PATCH',
    query: { id: `eq.${id}`, version: `eq.${expectedVersion}` },
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`update order ${res.status}: ${text}`);
  const rows = text ? JSON.parse(text) : [];
  if (!rows.length) {
    const fresh = await getOrderCloud(id);
    if (!fresh) return undefined;
    return { conflict: true, server: fresh };
  }
  return (await getOrderCloud(id))!;
}

export async function listUnseenOrderIdsCloud(userId: number): Promise<number[]> {
  const [active, seen] = await Promise.all([
    sbJson<any[]>('orders', {
      query: { select: 'id', archived_at: 'is.null' },
    }),
    sbJson<any[]>('order_seen', {
      query: { select: 'order_id', user_id: `eq.${userId}` },
    }),
  ]);
  const seenSet = new Set(seen.map((s) => Number(s.order_id)));
  return active.map((o) => Number(o.id)).filter((id) => !seenSet.has(id));
}

export async function markOrdersSeenCloud(userId: number, orderIds?: number[]): Promise<number> {
  let ids = orderIds;
  if (!ids || !ids.length) {
    const active = await sbJson<any[]>('orders', {
      query: { select: 'id', archived_at: 'is.null' },
    });
    ids = active.map((o) => Number(o.id));
  }
  if (!ids.length) return 0;

  const payload = ids.map((order_id) => ({ user_id: userId, order_id }));
  const res = await sbFetch('order_seen', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok && res.status !== 409) {
    throw new Error(`mark orders seen ${res.status}: ${text}`);
  }
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows.length : 0;
}
