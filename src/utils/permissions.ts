import type { Role } from '@/shared-types';

/** Admin always can; staff need the Can Archive permission (also covers Restore). */
export function userCanArchiveJobs(user: {
  role: Role | string;
  can_archive?: boolean | number | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.can_archive) === 1 || user.can_archive === true;
}

/** Admin always can; staff need Use Joblio AI. */
export function userCanUseAi(user: {
  role: Role | string;
  can_use_ai?: boolean | number | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.can_use_ai) === 1 || user.can_use_ai === true;
}

/** Admin always can; staff need Delete notes. */
export function userCanDeleteNotes(user: {
  role: Role | string;
  can_delete_notes?: boolean | number | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.can_delete_notes) === 1 || user.can_delete_notes === true;
}

/** Admin always can; staff need Cut / Print List. */
export function userCanManageQuoteSizes(user: {
  role: Role | string;
  can_manage_quote_sizes?: boolean | number | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.can_manage_quote_sizes) === 1 || user.can_manage_quote_sizes === true;
}
