/**
 * Build is expected to have already run (npm run dist).
 * Copies the new installer to the network share and moves older
 * installers + blockmaps into "Old versions".
 *
 * Run: npm run publish:share
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const productName = pkg.build?.productName || 'Joblio';

const UPDATE_DIR = '\\\\server\\D\\Joblio DB\\Jobtracker\\updates';
const ARCHIVE_DIR = path.join(UPDATE_DIR, 'Old versions');

const installerName = `${productName} Setup ${version}.exe`;
const blockmapName = `${installerName}.blockmap`;

const releaseDir = path.join(root, process.env.RELEASE_DIR || 'release');
const localInstaller = path.join(releaseDir, installerName);
const localBlockmap = path.join(releaseDir, blockmapName);
const localLatest = path.join(releaseDir, 'latest.yml');

function die(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function isInstallerFile(name) {
  return (
    (name.startsWith(`${productName} Setup `) ||
      name.startsWith('Signage Job Tracker Setup ')) &&
    (name.endsWith('.exe') || name.endsWith('.exe.blockmap'))
  );
}

function versionFromInstallerName(name) {
  const m = name.match(new RegExp(`^${productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Setup ([\\d.]+(?:-[^.]+)?)\\.exe`));
  return m?.[1] ?? null;
}

function moveToArchive(fileName) {
  const src = path.join(UPDATE_DIR, fileName);
  const dest = path.join(ARCHIVE_DIR, fileName);
  if (!fs.existsSync(src)) return;

  ensureDir(ARCHIVE_DIR);
  if (fs.existsSync(dest)) {
    console.log(`  skip (already archived): ${fileName}`);
    fs.unlinkSync(src);
    return;
  }

  try {
    fs.renameSync(src, dest);
    console.log(`  archived: ${fileName}`);
  } catch {
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
    console.log(`  archived (copy): ${fileName}`);
  }
}

function copyFile(src, destName) {
  const dest = path.join(UPDATE_DIR, destName);
  fs.copyFileSync(src, dest);
  console.log(`  published: ${destName}`);
}

// ---- Preflight ----
for (const [label, p] of [
  ['Installer', localInstaller],
  ['Blockmap', localBlockmap],
  ['latest.yml', localLatest],
]) {
  if (!fs.existsSync(p)) die(`${label} not found: ${p}\nRun npm run dist first.`);
}

if (!fs.existsSync(UPDATE_DIR)) {
  die(`Update share not reachable: ${UPDATE_DIR}`);
}

console.log(`Publishing v${version} to ${UPDATE_DIR}`);

// ---- Archive older installers still in the updates root ----
console.log('\nArchiving previous versions…');
const entries = fs.readdirSync(UPDATE_DIR, { withFileTypes: true });
for (const ent of entries) {
  if (!ent.isFile()) continue;
  if (!isInstallerFile(ent.name)) continue;
  if (ent.name === installerName || ent.name === blockmapName) continue;
  moveToArchive(ent.name);
}

// ---- Publish new release ----
console.log('\nCopying new release…');
copyFile(localInstaller, installerName);
copyFile(localBlockmap, blockmapName);
copyFile(localLatest, 'latest.yml');

// ---- Verify ----
const latestOnShare = fs.readFileSync(path.join(UPDATE_DIR, 'latest.yml'), 'utf8');
if (!latestOnShare.includes(`version: ${version}`)) {
  die('latest.yml on share does not match expected version.');
}

console.log('\n✓ Done.');
console.log(`  Current: ${UPDATE_DIR}\\${installerName}`);
console.log(`  Archive: ${ARCHIVE_DIR}`);
