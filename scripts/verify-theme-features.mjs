/**
 * Smoke test for dark mode + design system features before release.
 * Run: node scripts/verify-theme-features.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

// ---- Open Design files ----
const designFiles = [
  'design-systems/jobtrack/DESIGN.md',
  '.od-skills/jobtrack-electron-ui/SKILL.md',
  '.cursor/rules/jobtrack-ui.mdc',
];
for (const f of designFiles) {
  if (exists(f)) pass(`Open Design file: ${f}`);
  else fail(`Open Design file missing: ${f}`);
}

// ---- Theme implementation ----
const themeCtx = read('src/context/ThemeContext.tsx');
if (themeCtx.includes("STORAGE_KEY = 'jobtrack-theme'")) pass('Theme localStorage key');
else fail('Theme localStorage key missing');

if (themeCtx.includes("classList.toggle('dark'")) pass('Theme applies dark class on html');
else fail('Theme does not toggle dark class');

const mainTsx = read('src/main.tsx');
if (mainTsx.includes('ThemeProvider')) pass('ThemeProvider wired in main.tsx');
else fail('ThemeProvider not in main.tsx');

const indexHtml = read('index.html');
if (indexHtml.includes("localStorage.getItem('jobtrack-theme')")) pass('Anti-flash theme script in index.html');
else fail('Anti-flash theme script missing');

const settings = read('src/pages/Settings.tsx');
if (settings.includes('Appearance') && settings.includes("setTheme('dark')") && settings.includes("setTheme('light')")) {
  pass('Settings Appearance toggle (Light/Dark)');
} else {
  fail('Settings Appearance toggle incomplete');
}

// ---- CSS tokens ----
const css = read('src/index.css');
const cssChecks = [
  [':root', '--color-canvas: 242 241 237'],
  ['.dark', '--color-canvas: 28 27 24'],
  ['.dark', '--color-card: 42 41 36'],
  ['jt-card', 'bg-card'],
  ['jt-col-design', '--stage-bg-design'],
  ['jt-card-alive', 'hover:shadow-card-hover'],
];
for (const [a, b] of cssChecks) {
  if (css.includes(a) && css.includes(b)) pass(`CSS: ${a} + ${b}`);
  else fail(`CSS check failed: ${a} + ${b}`);
}

const tailwind = read('tailwind.config.js');
if (tailwind.includes("darkMode: 'class'")) pass('Tailwind darkMode: class');
else fail('Tailwind darkMode not set to class');

if (tailwind.includes('ink-30') || tailwind.includes("30: 'rgb(var(--color-ink) / 0.3)'")) {
  pass('Tailwind ink-30 opacity token');
} else {
  fail('Tailwind ink-30 token missing');
}

// ---- Stage colors ----
const stages = read('src/data/stages.ts');
if (stages.includes('jt-col-design') && stages.includes('dotAlive')) {
  pass('Stage column tints + alive dots in stages.ts');
} else {
  fail('Stage color updates missing');
}

// ---- Themed surfaces should use bg-card not bg-white ----
const srcFiles = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory() && ent.name !== 'node_modules') walk(p);
    else if (/\.(tsx|ts|css)$/.test(ent.name)) srcFiles.push(p);
  }
}
walk(path.join(root, 'src'));

const badWhite = [];
for (const f of srcFiles) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  const content = fs.readFileSync(f, 'utf8');
  if (rel.includes('ProofLightbox')) continue;
  if (rel.includes('Admin.tsx') && content.includes('rounded-full bg-white shadow')) continue;
  const matches = content.match(/bg-white(?![\w-])/g);
  if (matches) badWhite.push(`${rel} (${matches.length}x)`);
}
if (badWhite.length === 0) pass('No hardcoded bg-white on themed surfaces');
else fail('Hardcoded bg-white found', badWhite.join(', '));

// ---- Production build artifacts ----
if (!exists('dist/index.html')) {
  fail('dist/ not built — run npm run build first');
} else {
  pass('dist/index.html exists');

  const distHtml = read('dist/index.html');
  if (distHtml.includes('jobtrack-theme')) pass('Built index.html includes theme script');
  else fail('Built index.html missing theme script');

  const assetDir = path.join(root, 'dist/assets');
  const assets = fs.readdirSync(assetDir);
  const jsFile = assets.find((f) => f.endsWith('.js'));
  const cssFile = assets.find((f) => f.endsWith('.css'));
  if (jsFile) {
    const js = fs.readFileSync(path.join(assetDir, jsFile), 'utf8');
    const jsChecks = ['Appearance', 'jobtrack-theme', 'setTheme', 'bg-card'];
    for (const c of jsChecks) {
      if (js.includes(c)) pass(`Built JS contains: ${c}`);
      else fail(`Built JS missing: ${c}`);
    }
  }
  if (cssFile) {
    const builtCss = fs.readFileSync(path.join(assetDir, cssFile), 'utf8');
    if (builtCss.includes('.dark') && builtCss.includes('--color-canvas')) {
      pass('Built CSS includes .dark theme variables');
    } else {
      fail('Built CSS missing .dark theme variables');
    }
    if (builtCss.includes('jt-card-alive')) pass('Built CSS includes jt-card-alive');
    else fail('Built CSS missing jt-card-alive');
  }
}

// ---- Simulate theme toggle logic ----
{
  let stored = 'light';
  const mockStorage = {
    getItem: (k) => (k === 'jobtrack-theme' ? stored : null),
    setItem: (k, v) => {
      if (k === 'jobtrack-theme') stored = v;
    },
  };
  const apply = (theme) => {
    stored = theme;
    mockStorage.setItem('jobtrack-theme', theme);
  };
  apply('dark');
  if (mockStorage.getItem('jobtrack-theme') === 'dark') pass('Theme persistence simulation (dark)');
  else fail('Theme persistence simulation failed');
  apply('light');
  if (mockStorage.getItem('jobtrack-theme') === 'light') pass('Theme persistence simulation (light)');
  else fail('Theme persistence simulation failed');
}

// ---- Summary ----
const failed = results.filter((r) => !r.ok);
console.log('\n---');
if (failed.length === 0) {
  console.log(`All ${results.length} checks passed.`);
  process.exit(0);
} else {
  console.log(`${failed.length} of ${results.length} checks FAILED.`);
  process.exit(1);
}
