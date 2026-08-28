import type { Role } from '../preload';
import type { UserRow } from '../repositories/usersRepo';
import { sbJson, sbFetch } from './rest';
import { sanitizeBoardColor } from '../utils/boardColor';

function mapUser(row: any): UserRow {
  return {
    id: Number(row.id),
    username: row.username,
    password_hash: row.password_hash,
    role: row.role as Role,
    full_name: row.full_name || '',
    active: row.active ? 1 : 0,
    can_archive: row.can_archive ? 1 : 0,
    can_move_any: row.can_move_any ? 1 : 0,
    can_edit_rigging: row.can_edit_rigging ? 1 : 0,
    can_edit_vehicle_bookings: row.can_edit_vehicle_bookings ? 1 : 0,
    can_create_orders: row.can_create_orders ? 1 : 0,
    can_manage_orders: row.can_manage_orders ? 1 : 0,
    can_use_ai: row.can_use_ai ? 1 : 0,
    can_delete_notes: row.can_delete_notes ? 1 : 0,
    can_manage_quote_sizes: row.can_manage_quote_sizes ? 1 : 0,
    board_color: sanitizeBoardColor(row.board_color),
    created_at: row.created_at,
  };
}

const userCache = new Map<number, UserRow>();
let cacheLoaded = false;

export async function refreshUserCache(): Promise<void> {
  const rows = await sbJson<any[]>('users', {
    query: { select: '*', order: 'id' },
  });
  userCache.clear();
  for (const r of rows) {
    const u = mapUser(r);
    userCache.set(u.id, u);
  }
  cacheLoaded = true;
}

export async function ensureUserCache(): Promise<void> {
  if (!cacheLoaded) await refreshUserCache();
}

export function findUserByIdCloudCached(id: number): UserRow | undefined {
  return userCache.get(id);
}

export function getCachedUsers(): UserRow[] {
  return [...userCache.values()];
}

export async function findUserByUsernameCloud(username: string): Promise<UserRow | undefined> {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return undefined;
  await ensureUserCache();
  for (const u of userCache.values()) {
    if (u.username.toLowerCase() === normalized) return u;
  }
  // Cache miss / stale — refresh once
  await refreshUserCache();
  for (const u of userCache.values()) {
    if (u.username.toLowerCase() === normalized) return u;
  }
  return undefined;
}

export async function findUserByIdCloud(id: number): Promise<UserRow | undefined> {
  await ensureUserCache();
  if (userCache.has(id)) return userCache.get(id);
  return findUserByIdCloudFresh(id);
}

/** Always hit PostgREST — use for permission checks so Admin flag changes apply without re-login. */
export async function findUserByIdCloudFresh(id: number): Promise<UserRow | undefined> {
  const rows = await sbJson<any[]>('users', {
    query: { select: '*', id: `eq.${id}`, limit: '1' },
  });
  if (!rows[0]) return undefined;
  const u = mapUser(rows[0]);
  userCache.set(u.id, u);
  return u;
}

export async function listUsersCloud(): Promise<Omit<UserRow, 'password_hash'>[]> {
  const rows = await sbJson<any[]>('users', {
    query: {
      select: '*',
      order: 'full_name',
    },
  });
  return rows.map((r) => {
    const { password_hash: _, ...rest } = mapUser({ ...r, password_hash: '' });
    return {
      ...rest,
      active: r.active ? 1 : 0,
      can_archive: r.can_archive ? 1 : 0,
      can_move_any: r.can_move_any ? 1 : 0,
      can_edit_rigging: r.can_edit_rigging ? 1 : 0,
      can_edit_vehicle_bookings: r.can_edit_vehicle_bookings ? 1 : 0,
      can_create_orders: r.can_create_orders ? 1 : 0,
      can_manage_orders: r.can_manage_orders ? 1 : 0,
      can_use_ai: r.can_use_ai ? 1 : 0,
      can_delete_notes: r.can_delete_notes ? 1 : 0,
      can_manage_quote_sizes: r.can_manage_quote_sizes ? 1 : 0,
    };
  });
}

export async function listStaffCloud(): Promise<{ id: number; full_name: string }[]> {
  const rows = await sbJson<any[]>('users', {
    query: {
      select: 'id,full_name',
      active: 'eq.true',
      order: 'full_name',
    },
  });
  return rows.map((r) => ({ id: Number(r.id), full_name: r.full_name }));
}

export async function createUserCloud(
  username: string,
  passwordHash: string,
  fullName: string,
  role: Role
): Promise<Omit<UserRow, 'password_hash'>> {
  const rows = await sbJson<any[]>('users', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      username,
      password_hash: passwordHash,
      role,
      full_name: fullName,
      active: true,
      can_archive: false,
      can_move_any: false,
      can_edit_rigging: false,
      can_edit_vehicle_bookings: false,
      can_create_orders: false,
      can_manage_orders: false,
      can_use_ai: false,
      can_delete_notes: false,
      can_manage_quote_sizes: false,
    }),
  });
  const created = Array.isArray(rows) ? rows[0] : rows;
  await refreshUserCache();
  const { password_hash: _, ...safe } = mapUser(created);
  return safe;
}

export async function updateUserCloud(
  id: number,
  fields: {
    full_name?: string;
    role?: Role;
    active?: boolean;
    can_archive?: boolean;
    can_move_any?: boolean;
    can_edit_rigging?: boolean;
    can_edit_vehicle_bookings?: boolean;
    can_create_orders?: boolean;
    can_manage_orders?: boolean;
    can_use_ai?: boolean;
    can_delete_notes?: boolean;
    can_manage_quote_sizes?: boolean;
    board_color?: string | null;
    password_hash?: string | null;
  }
): Promise<Omit<UserRow, 'password_hash'> | null> {
  const patch: Record<string, unknown> = {};
  if (fields.full_name !== undefined) patch.full_name = fields.full_name;
  if (fields.role !== undefined) patch.role = fields.role;
  if (fields.active !== undefined) patch.active = fields.active;
  if (fields.can_archive !== undefined) patch.can_archive = fields.can_archive;
  if (fields.can_move_any !== undefined) patch.can_move_any = fields.can_move_any;
  if (fields.can_edit_rigging !== undefined) patch.can_edit_rigging = fields.can_edit_rigging;
  if (fields.can_edit_vehicle_bookings !== undefined) {
    patch.can_edit_vehicle_bookings = fields.can_edit_vehicle_bookings;
  }
  if (fields.can_create_orders !== undefined) patch.can_create_orders = fields.can_create_orders;
  if (fields.can_manage_orders !== undefined) patch.can_manage_orders = fields.can_manage_orders;
  if (fields.can_use_ai !== undefined) patch.can_use_ai = fields.can_use_ai;
  if (fields.can_delete_notes !== undefined) patch.can_delete_notes = fields.can_delete_notes;
  if (fields.can_manage_quote_sizes !== undefined) {
    patch.can_manage_quote_sizes = fields.can_manage_quote_sizes;
  }
  if (fields.board_color !== undefined) patch.board_color = fields.board_color;
  if (fields.password_hash !== undefined && fields.password_hash !== null) {
    patch.password_hash = fields.password_hash;
  }
  if (Object.keys(patch).length === 0) {
    const u = await findUserByIdCloud(id);
    if (!u) return null;
    const { password_hash: _, ...safe } = u;
    return safe;
  }

  try {
    const rows = await sbJson<any[]>('users', {
      method: 'PATCH',
      query: { id: `eq.${id}` },
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    const updated = Array.isArray(rows) ? rows[0] : rows;
    if (!updated) return null;
    await refreshUserCache();
    const { password_hash: _, ...safe } = mapUser(updated);
    return safe;
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/can_manage_quote_sizes/i.test(msg)) {
      throw new Error(
        'Cut / Print List permission needs a one-time server update (add_quote_size_permission.sql). Ask whoever runs the Joblio server.'
      );
    }
    if (/board_color/i.test(msg) || /column .* does not exist/i.test(msg)) {
      throw new Error(
        'Board colour needs a one-time server update (add_user_board_color.sql). Ask whoever runs the Joblio server.'
      );
    }
    throw err;
  }
}

export async function deleteUserCloud(id: number): Promise<void> {
  // Clear alert rows that block user delete (no ON DELETE CASCADE on alerts)
  await sbFetch('rigging_alerts_sent', {
    method: 'DELETE',
    query: { user_id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
  });

  const res = await sbFetch('users', {
    method: 'DELETE',
    query: { id: `eq.${id}` },
    headers: { Prefer: 'return=minimal' },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 409 || /foreign key|violates/i.test(text)) {
      throw new Error(
        'Cannot delete this user — they still have jobs, notes, or other records. Deactivate them instead.'
      );
    }
    throw new Error(`delete user ${res.status}: ${text}`);
  }
  await refreshUserCache();
}
