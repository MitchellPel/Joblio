/** Admin always can; staff need can_archive (also covers restore from archive). */
export function userCanArchiveJobs(user: {
  role: string;
  can_archive?: boolean | number | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.can_archive) === 1 || user.can_archive === true;
}

/** Admin always can; staff need can_use_ai. */
export function userCanUseAi(user: {
  role: string;
  can_use_ai?: boolean | number | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.can_use_ai) === 1 || user.can_use_ai === true;
}

/** Admin always can; staff need can_delete_notes. */
export function userCanDeleteNotes(user: {
  role: string;
  can_delete_notes?: boolean | number | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.can_delete_notes) === 1 || user.can_delete_notes === true;
}

/** Admin always can; staff need can_manage_quote_sizes. */
export function userCanManageQuoteSizes(user: {
  role: string;
  can_manage_quote_sizes?: boolean | number | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.can_manage_quote_sizes) === 1 || user.can_manage_quote_sizes === true;
}
