/**
 * Creates (or updates) a GitHub Release for the current package.json version
 * and uploads the Windows installer. Shop auto-update still uses the office share.
 *
 * Run: npm run publish:github
 * Auth: GH_TOKEN / GITHUB_TOKEN, `gh auth token`, or Git Credential Manager.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const productName = pkg.build?.productName || 'Joblio';
const tag = `v${version}`;
const installerName = `${productName} Setup ${version}.exe`;
const releaseDir = path.join(root, process.env.RELEASE_DIR || 'release');
const localInstaller = path.join(releaseDir, installerName);
const ownerRepo = process.env.GITHUB_REPOSITORY || 'MitchellPel/Joblio';
const api = 'https://api.github.com';

function die(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function notesFromChangelog() {
  const src = fs.readFileSync(path.join(root, 'src/data/changelog.ts'), 'utf8');
  const idx = src.indexOf(`version: '${version}'`);
  const fallback = [
    `# Joblio ${version}`,
    '',
    'Download the Setup .exe. On first launch choose **Start on this PC**.',
    'Login: `admin` / `admin123` — change that password after you get in.',
  ].join('\n');
  if (idx < 0) return fallback;
  const slice = src.slice(idx, idx + 2000);
  const h = slice.match(/highlights:\s*\[([\s\S]*?)\]/);
  if (!h) return fallback;
  const items = [...h[1].matchAll(/'((?:\\'|[^'])*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  return [
    `# Joblio ${version}`,
    '',
    ...items.map((i) => `- ${i}`),
    '',
    'Download **Joblio Setup**. On first launch choose **Start on this PC**.',
    'Login: `admin` / `admin123` — change that password after you get in.',
    '',
    'Shop computers should use **Restart & Install** from the office update share.',
  ].join('\n');
}

function gitCredentialToken() {
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const m = out.match(/^password=(.+)$/m);
    return m?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

function ghCliToken() {
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function token() {
  return (
    process.env.GH_TOKEN?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    ghCliToken() ||
    gitCredentialToken()
  );
}

async function gh(pathname, opts = {}) {
  const t = token();
  if (!t) {
    die(
      'No GitHub token. Set GH_TOKEN, run `gh auth login`, or sign in with Git Credential Manager.'
    );
  }
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${t}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'joblio-publish-github-release',
    ...opts.headers,
  };
  const url = pathname.startsWith('http') ? pathname : `${api}${pathname}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || text || res.statusText;
    die(`GitHub API ${res.status} ${pathname}: ${msg}`);
  }
  return json;
}

if (!fs.existsSync(localInstaller)) {
  die(`Installer not found: ${localInstaller}\nRun npm run dist first.`);
}

const t = token();
if (!t) {
  die(
    'No GitHub token. Set GH_TOKEN, run `gh auth login`, or sign in with Git Credential Manager.'
  );
}

console.log(`Publishing GitHub Release ${tag} (${installerName})`);

const existing = await fetch(`${api}/repos/${ownerRepo}/releases/tags/${tag}`, {
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${t}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'joblio-publish-github-release',
  },
});

let release;
if (existing.ok) {
  release = await existing.json();
  console.log(`  existing release ${tag} (id ${release.id})`);
} else if (existing.status === 404) {
  release = await gh(`/repos/${ownerRepo}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      name: `Joblio ${version}`,
      body: notesFromChangelog(),
      target_commitish: 'main',
      draft: false,
      prerelease: false,
    }),
  });
  console.log(`  created release ${tag} (id ${release.id})`);
} else {
  const errText = await existing.text();
  die(`Could not look up release ${tag}: ${existing.status} ${errText}`);
}

const sameName = (release.assets || []).find((a) => a.name === installerName);
if (sameName) {
  console.log(`  replacing existing asset ${installerName}`);
  await gh(`/repos/${ownerRepo}/releases/assets/${sameName.id}`, { method: 'DELETE' });
}

const uploadBase = String(release.upload_url).replace(/\{.*\}$/, '');
const stat = fs.statSync(localInstaller);
const file = fs.readFileSync(localInstaller);
const uploaded = await gh(`${uploadBase}?name=${encodeURIComponent(installerName)}`, {
  method: 'POST',
  headers: {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(stat.size),
  },
  body: file,
});

console.log(`\n✓ GitHub Release ${tag}`);
console.log(`  ${uploaded.browser_download_url || release.html_url}`);
console.log(`  ${release.html_url}`);
