import type { Role } from '../preload';
import { getDatabase } from '../db/connection';
import { createDbHelpers } from '../db/helpers';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  full_name: string;
  active: number;
  can_archive: number;
  can_move_any: number;
  can_edit_rigging: number;
  can_edit_vehicle_bookings: number;
  can_create_orders: number;
  can_manage_orders: number;
  can_use_ai: number;
  can_delete_notes: number;
  can_manage_quote_sizes: number;
  board_color: string | null;
  created_at: string;
}

export function findUserByUsername(username: string): UserRow | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const normalized = username.trim();
  if (!normalized) return undefined;
  return h.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [normalized]) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.get('SELECT * FROM users WHERE id = ?', [id]) as UserRow | undefined;
}

export function listUsers(): Omit<UserRow, 'password_hash'>[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    'SELECT id, username, role, full_name, active, can_archive, can_move_any, can_edit_rigging, can_edit_vehicle_bookings, can_create_orders, can_manage_orders, can_use_ai, can_delete_notes, can_manage_quote_sizes, board_color, created_at FROM users ORDER BY full_name'
  ) as Omit<UserRow, 'password_hash'>[];
}

export function listStaff(): { id: number; full_name: string }[] {
  const db = getDatabase();
  const h = createDbHelpers(db);
  return h.all(
    "SELECT id, full_name FROM users WHERE active = 1 AND role IN ('admin','staff') ORDER BY full_name"
  ) as { id: number; full_name: string }[];
}

export function createUser(
  username: string,
  passwordHash: string,
  fullName: string,
  role: Role
): Omit<UserRow, 'password_hash'> {
  const db = getDatabase();
  const h = createDbHelpers(db);
  const result = h.run(
    'INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)',
    [username, passwordHash, role, fullName]
  );
  return {
    id: result.lastInsertRowid,
    username,
    role,
    full_name: fullName,
    active: 1,
    can_archive: 0,
    can_move_any: 0,
    can_edit_rigging: 0,
    can_edit_vehicle_bookings: 0,
    can_create_orders: 0,
    can_manage_orders: 0,
    can_use_ai: 0,
    can_delete_notes: 0,
    can_manage_quote_sizes: 0,
    board_color: null,
    created_at: new Date().toISOString(),
  };
}

export function updateUser(
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
): void {
  const db = getDatabase();
  const h = createDbHelpers(db);

  const sets: string[] = [];
  const params: any[] = [];

  if (fields.full_name !== undefined) {
    sets.push('full_name = ?');
    params.push(fields.full_name);
  }
  if (fields.role !== undefined) {
    sets.push('role = ?');
    params.push(fields.role);
  }
  if (fields.active !== undefined) {
    sets.push('active = ?');
    params.push(fields.active ? 1 : 0);
  }
  if (fields.can_archive !== undefined) {
    sets.push('can_archive = ?');
    params.push(fields.can_archive ? 1 : 0);
  }
  if (fields.can_move_any !== undefined) {
    sets.push('can_move_any = ?');
    params.push(fields.can_move_any ? 1 : 0);
  }
  if (fields.can_edit_rigging !== undefined) {
    sets.push('can_edit_rigging = ?');
    params.push(fields.can_edit_rigging ? 1 : 0);
  }
  if (fields.can_edit_vehicle_bookings !== undefined) {
    sets.push('can_edit_vehicle_bookings = ?');
    params.push(fields.can_edit_vehicle_bookings ? 1 : 0);
  }
  if (fields.can_create_orders !== undefined) {
    sets.push('can_create_orders = ?');
    params.push(fields.can_create_orders ? 1 : 0);
  }
  if (fields.can_manage_orders !== undefined) {
    sets.push('can_manage_orders = ?');
    params.push(fields.can_manage_orders ? 1 : 0);
  }
  if (fields.can_use_ai !== undefined) {
    sets.push('can_use_ai = ?');
    params.push(fields.can_use_ai ? 1 : 0);
  }
  if (fields.can_delete_notes !== undefined) {
    sets.push('can_delete_notes = ?');
    params.push(fields.can_delete_notes ? 1 : 0);
  }
  if (fields.can_manage_quote_sizes !== undefined) {
    sets.push('can_manage_quote_sizes = ?');
    params.push(fields.can_manage_quote_sizes ? 1 : 0);
  }
  if (fields.board_color !== undefined) {
    sets.push('board_color = ?');
    params.push(fields.board_color);
  }
  if (fields.password_hash !== undefined) {
    sets.push('password_hash = ?');
    params.push(fields.password_hash);
  }

  if (sets.length === 0) return;
  params.push(id);
  h.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
}

export function deleteUser(id: number): void {
  const db = getDatabase();
  const h = createDbHelpers(db);
  h.run('DELETE FROM users WHERE id = ?', [id]);
}
