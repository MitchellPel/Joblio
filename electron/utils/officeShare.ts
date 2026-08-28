import fs from 'node:fs';
import path from 'node:path';

/**
 * Shop UNC roots. **Probe only** — if the path does not exist on this PC, skip.
 * Home / public installs must still start. Shop PCs must keep working without
 * anyone re-saving Settings after an update (0.4.24 broke login by dropping this).
 */
export const OFFICE_SHARE_ROOTS = [
  '\\\\server\\D\\Joblio DB\\Jobtracker',
  '\\\\server\\Gary\\Job Tracker',
] as const;

export const OFFICE_UPDATES_DIR = '\\\\server\\D\\Joblio DB\\Jobtracker\\updates';

export function officePathExists(p: string): boolean {
  try {
    return !!p && fs.existsSync(p);
  } catch {
    return false;
  }
}

export function reachableOfficeShareRoots(): string[] {
  const out: string[] = [];
  for (const root of OFFICE_SHARE_ROOTS) {
    if (officePathExists(root) && !out.includes(root)) out.push(root);
  }
  return out;
}

export function officeChild(folder: string): string[] {
  return OFFICE_SHARE_ROOTS.map((root) => path.join(root, folder));
}
