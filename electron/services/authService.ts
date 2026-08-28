import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { findUserByUsername, findUserById } from '../repositories/usersRepo';
import { isSelfHostMode } from '../db/backendMode';
import {
  findUserByUsernameCloud,
  findUserByIdCloudCached,
  ensureUserCache,
  findUserByIdCloud,
} from '../selfhost/usersCloud';
import { sanitizeBoardColor } from '../utils/boardColor';

// Simple in-memory token store (lost on app restart; admin logs back in)
const sessions = new Map<string, { userId: number; expiresAt: number }>();

const SALT_ROUNDS = 10;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

function toPublicUser(user: {
  id: number;
  username: string;
  full_name: string;
  role: string;
  active: boolean | number;
  can_archive: boolean | number;
  can_move_any: boolean | number;
  can_edit_rigging: boolean | number;
  can_edit_vehicle_bookings: boolean | number;
  can_create_orders?: boolean | number;
  can_manage_orders?: boolean | number;
  can_use_ai?: boolean | number;
  can_delete_notes?: boolean | number;
  can_manage_quote_sizes?: boolean | number;
  board_color?: string | null;
  created_at: string;
}) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    active: !!user.active,
    can_archive: !!user.can_archive,
    can_move_any: !!user.can_move_any,
    can_edit_rigging: !!user.can_edit_rigging,
    can_edit_vehicle_bookings: !!user.can_edit_vehicle_bookings,
    can_create_orders: !!user.can_create_orders,
    can_manage_orders: !!user.can_manage_orders,
    can_use_ai: !!user.can_use_ai,
    can_delete_notes: !!user.can_delete_notes,
    can_manage_quote_sizes: !!user.can_manage_quote_sizes,
    board_color: sanitizeBoardColor(user.board_color),
    created_at: user.created_at,
  };
}

export async function login(
  username: string,
  password: string
): Promise<{ token: string; user: ReturnType<typeof toPublicUser> } | null> {
  const user = isSelfHostMode()
    ? await findUserByUsernameCloud(username)
    : findUserByUsername(username);
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.password_hash)) return null;

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });

  return {
    token,
    user: toPublicUser(user),
  };
}

export function logout(token: string): void {
  sessions.delete(token);
}

export async function validateSession(
  token: string
): Promise<ReturnType<typeof toPublicUser> | null> {
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  let user;
  if (isSelfHostMode()) {
    await ensureUserCache();
    user = findUserByIdCloudCached(session.userId) || (await findUserByIdCloud(session.userId));
  } else {
    user = findUserById(session.userId);
  }

  if (!user || !user.active) {
    sessions.delete(token);
    return null;
  }

  return toPublicUser(user);
}

export async function requireAdminUser(token: string): Promise<boolean> {
  const user = await validateSession(token);
  return user !== null && user.role === 'admin';
}

/** Active logged-in user IDs on this machine (for rigging alerts). */
export function getActiveUserIds(): number[] {
  const now = Date.now();
  const ids = new Set<number>();
  for (const session of sessions.values()) {
    if (session.expiresAt >= now) ids.add(session.userId);
  }
  return [...ids];
}
