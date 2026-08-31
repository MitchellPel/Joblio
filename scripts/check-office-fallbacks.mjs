/**
 * Guardrail: shop PCs must keep working after public-download cleanups.
 * 0.4.24 dropped the office share probe and self-host login broke.
 *
 * Run: npm run lint (includes this) or node scripts/check-office-fallbacks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const officeShare = read('electron/utils/officeShare.ts');
const rest = read('electron/selfhost/rest.ts');
const updater = read('electron/ipc/updaterIpc.ts');

const checks = [
  {
    ok: officeShare.includes('Joblio DB') && officeShare.includes('Jobtracker'),
    msg: 'electron/utils/officeShare.ts must list the current Jobtracker share',
  },
  {
    ok: officeShare.includes('Gary') && officeShare.includes('Job Tracker'),
    msg: 'electron/utils/officeShare.ts must still list the old Gary share',
  },
  {
    ok: rest.includes('OFFICE_SHARE_ROOTS') && rest.includes('joblio-api-key.txt'),
    msg: 'electron/selfhost/rest.ts must probe office shares for joblio-api-key.txt',
  },
  {
    ok: officeShare.includes('192.168.1.107') && officeShare.includes('OFFICE_LAN_API_PROBES'),
    msg: 'electron/utils/officeShare.ts must probe the office LAN API (192.168.1.107)',
  },
  {
    ok: rest.includes('OFFICE_LAN_API_PROBES'),
    msg: 'electron/selfhost/rest.ts must probe office LAN API URLs',
  },
  {
    ok: updater.includes('OFFICE_UPDATES_DIR') && updater.includes('shareReachable'),
    msg: 'electron/ipc/updaterIpc.ts must skip the update share when it is not on this PC',
  },
];

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error('Office fallback check failed (would break shop PCs):');
  for (const f of failed) console.error(`  - ${f.msg}`);
  process.exit(1);
}

console.log('Office fallbacks present (probe if the share exists; do not require it to start).');
