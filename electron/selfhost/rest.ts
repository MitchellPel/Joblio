import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { isSelfHostMode } from '../db/backendMode';
import { getSettings, getShareRoot, setShareRoot } from '../services/settingsService';
import { OFFICE_SHARE_ROOTS, OFFICE_LAN_API_PROBES, officePathExists } from '../utils/officeShare';

type Env = {
  /** Active base URL (LAN or tunnel) — flipped silently. */
  url: string;
  apiKey: string;
  proofsDir: string;
  /** Public tunnel bootstrap (ngrok). */
  bootstrapUrl: string;
  /** Fast office path. */
  lanUrl: string;
};

let cached: Env | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshInFlight: Promise<string> | null = null;

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const API_KEY_FILE = 'joblio-api-key.txt';

function configuredShareRoot(): string | null {
  try {
    return getShareRoot();
  } catch {
    return null;
  }
}

function keyPath(root: string): string {
  return path.join(root.replace(/[\\/]+$/, ''), API_KEY_FILE);
}

function shareHasKey(root: string): boolean {
  return officePathExists(keyPath(root));
}

/** Share folders that actually have joblio-api-key.txt (settings, jobs.db folder, office probes). */
function listShareRoots(): string[] {
  const out: string[] = [];
  const push = (root: string | null | undefined) => {
    if (!root) return;
    const n = root.replace(/[\\/]+$/, '');
    if (n && !out.includes(n)) out.push(n);
  };
  push(configuredShareRoot());
  try {
    const dbPath = getSettings().path;
    if (dbPath) push(path.dirname(dbPath));
  } catch {
    // ignore
  }
  for (const c of OFFICE_SHARE_ROOTS) {
    if (shareHasKey(c)) push(c);
  }
  return out;
}

function readShareApiKey(): string {
  for (const root of listShareRoots()) {
    if (!shareHasKey(root)) continue;
    try {
      const k = fs.readFileSync(keyPath(root), 'utf8').trim();
      if (!k) continue;
      if (!configuredShareRoot()) {
        try {
          setShareRoot(root);
        } catch {
          // still use the key this session
        }
      }
      return k;
    } catch {
      // try next
    }
  }
  return '';
}

/** Drop cached env so a newly chosen share path is picked up immediately. */
export function clearSelfHostEnvCache(): void {
  cached = null;
}

function readCachedTunnelUrl(): string {
  try {
    const p = path.join(app.getPath('userData'), 'selfhost-url-cache.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as { tunnelUrl?: string };
    return raw.tunnelUrl ? stripSlash(raw.tunnelUrl) : '';
  } catch {
    return '';
  }
}

function writeCachedTunnelUrl(tunnelUrl: string): void {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'selfhost-url-cache.json'),
      JSON.stringify({ tunnelUrl: stripSlash(tunnelUrl), updated_at: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch {
    // ignore
  }
}

function isPrivateLanUrl(u: string): boolean {
  return /localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\./.test(u);
}

function readShareEndpointMeta(): { apiUrl: string; lanUrl: string } {
  let apiUrl = '';
  let lanUrl = '';
  const paths = [
    process.env.JOBLIO_ENDPOINT_JSON,
    ...listShareRoots().map((root) => path.join(root, 'joblio-endpoint.json')),
  ].filter(Boolean) as string[];
  for (const p of paths) {
    try {
      if (!fs.existsSync(p)) continue;
      const data = JSON.parse(fs.readFileSync(p, 'utf8')) as {
        api_url?: string;
        lan_url?: string;
        ok?: boolean;
      };
      if (data?.ok === false) continue;
      if (!apiUrl && data?.api_url) apiUrl = stripSlash(data.api_url);
      if (!lanUrl && data?.lan_url) lanUrl = stripSlash(data.lan_url);
      else if (!lanUrl && data?.api_url && isPrivateLanUrl(data.api_url)) {
        lanUrl = stripSlash(data.api_url);
      }
    } catch {
      // continue
    }
  }
  return { apiUrl, lanUrl };
}

function loadFileEnv(): Record<string, string> {
  const candidates = [
    path.join(process.cwd(), '.env.selfhost'),
    path.join(process.cwd(), '.env.supabase'),
    path.join(app.getAppPath(), '..', '.env.selfhost'),
    path.join(app.getAppPath(), '.env.selfhost'),
  ];
  for (const p of candidates) {
    const fileEnv = parseEnvFile(p);
    if (
      fileEnv.JOBLIO_API_URL ||
      fileEnv.JOBLIO_BOOTSTRAP_URL ||
      fileEnv.JOBLIO_LAN_API_URL ||
      fileEnv.JOBLIO_API_KEY ||
      fileEnv.SUPABASE_URL
    ) {
      return fileEnv;
    }
  }
  return {};
}

function stripSlash(u: string): string {
  return u.replace(/\/$/, '');
}

function officeLanProbeUrl(): string {
  return stripSlash(OFFICE_LAN_API_PROBES[0] || '');
}

/** Staff-facing text when Docker / ngrok / LAN cannot be reached. */
export function describeSelfHostFetchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /fetch failed|Failed to fetch|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|abort|AbortError|certificate|gateway 50/i.test(
      msg
    ) ||
    (err instanceof TypeError && /fetch/i.test(msg))
  ) {
    return 'Can’t reach the Joblio server. On the shop network, check the server PC is on. Away from the shop, the tunnel may be down.';
  }
  return msg || 'Can’t reach the Joblio server.';
}

/** Resolve LAN / tunnel / key for packaged + dev builds. */
export function getSelfHostEnv(): Env {
  if (cached) return cached;
  if (!isSelfHostMode()) {
    throw new Error('Self-host env requested while not in self-host mode.');
  }

  const fileEnv = loadFileEnv();
  const shareEp = readShareEndpointMeta();
  const lanUrl = stripSlash(
    process.env.JOBLIO_LAN_API_URL ||
      fileEnv.JOBLIO_LAN_API_URL ||
      shareEp.lanUrl ||
      officeLanProbeUrl() ||
      ''
  );

  const bootstrapUrl = stripSlash(
    process.env.JOBLIO_BOOTSTRAP_URL ||
      fileEnv.JOBLIO_BOOTSTRAP_URL ||
      process.env.JOBLIO_API_URL ||
      fileEnv.JOBLIO_API_URL ||
      (shareEp.apiUrl && !isPrivateLanUrl(shareEp.apiUrl) ? shareEp.apiUrl : '') ||
      shareEp.apiUrl ||
      readCachedTunnelUrl() ||
      ''
  );

  const apiKey =
    process.env.JOBLIO_API_KEY ||
    fileEnv.JOBLIO_API_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    fileEnv.SUPABASE_SECRET_KEY ||
    readShareApiKey();

  const shareRoot = listShareRoots()[0] || configuredShareRoot();
  const proofsDir =
    process.env.JOBLIO_PROOFS_DIR ||
    fileEnv.JOBLIO_PROOFS_DIR ||
    (shareRoot ? path.join(shareRoot, 'proofs') : '');

  if (!lanUrl && !bootstrapUrl) {
    throw new Error('Self-host mode needs a LAN or bootstrap API URL.');
  }
  if (!apiKey) {
    throw new Error(
      'Self-host API key missing. Locate the Joblio share folder that contains joblio-api-key.txt.'
    );
  }

  cached = {
    url: lanUrl || bootstrapUrl,
    apiKey,
    proofsDir,
    bootstrapUrl: bootstrapUrl || lanUrl,
    lanUrl,
  };
  return cached;
}

function setApiUrl(next: string): void {
  const env = getSelfHostEnv();
  const clean = stripSlash(next);
  if (!clean || clean === env.url) return;
  cached = { ...env, url: clean };
  const isLan =
    clean === env.lanUrl ||
    clean.includes('192.168.') ||
    clean.includes('localhost') ||
    clean.includes('127.0.0.1');
  if (!isLan) writeCachedTunnelUrl(clean);
  console.log(`[selfhost] path → ${isLan ? 'LAN' : 'tunnel'}`);
}

async function probeHealth(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${stripSlash(baseUrl)}/health`, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'JoblioSelfHost/1.0',
        'ngrok-skip-browser-warning': 'true',
      },
    });
    if (!res.ok) return false;
    const text = (await res.text()).trim();
    return text.includes('joblio-ok') || res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function resolveTunnelUrl(env: Env): Promise<string | null> {
  // LAN file may list the current ngrok URL (office PCs)
  const sharePaths = [
    process.env.JOBLIO_ENDPOINT_JSON,
    ...listShareRoots().map((root) => path.join(root, 'joblio-endpoint.json')),
  ].filter(Boolean) as string[];

  for (const p of sharePaths) {
    try {
      if (!fs.existsSync(p)) continue;
      const data = JSON.parse(fs.readFileSync(p, 'utf8')) as {
        api_url?: string;
        ok?: boolean;
      };
      if (data?.api_url && data.ok !== false) {
        const url = stripSlash(data.api_url);
        // Share file often lists LAN; tunnel discovery needs the public URL
        if (!isPrivateLanUrl(url)) return url;
      }
    } catch {
      // continue
    }
  }

  const bases = [env.bootstrapUrl, env.url].filter(
    (u, i, arr) => u && u !== env.lanUrl && arr.indexOf(u) === i
  );
  for (const base of bases) {
    try {
      const res = await fetch(`${stripSlash(base)}/endpoint.json`, {
        headers: {
          'User-Agent': 'JoblioSelfHost/1.0',
          'ngrok-skip-browser-warning': 'true',
        },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { api_url?: string; ok?: boolean };
      if (data?.api_url && data.ok !== false) return stripSlash(data.api_url);
    } catch {
      // continue
    }
  }

  return env.bootstrapUrl || null;
}

/**
 * Prefer office LAN when reachable; otherwise public tunnel.
 * Silent — no UI. Safe to call often.
 */
export async function refreshSelfHostApiUrl(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const env = getSelfHostEnv();

    // 1) Office LAN — short timeout so away users aren't delayed
    const lanCandidates = [...new Set([env.lanUrl, ...OFFICE_LAN_API_PROBES.map((u) => stripSlash(u))].filter(Boolean))];
    for (const lan of lanCandidates) {
      if (await probeHealth(lan, 900)) {
        setApiUrl(lan);
        return getSelfHostEnv().url;
      }
    }

    // 2) Tunnel (ngrok) — discover live URL, then confirm health
    const tunnel = await resolveTunnelUrl(env);
    if (tunnel && (await probeHealth(tunnel, 4000))) {
      setApiUrl(tunnel);
      return getSelfHostEnv().url;
    }

    // 3) Keep whatever we had
    return env.url;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Boot + periodic silent path selection (LAN ↔ tunnel). */
export function startSelfHostEndpointWatcher(intervalMs = 45_000): void {
  if (!isSelfHostMode()) return;
  void refreshSelfHostApiUrl();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    void refreshSelfHostApiUrl();
  }, intervalMs);
}

function buildHeaders(init: RequestInit, apiKey: string): Headers {
  const headers = new Headers(init.headers || {});
  headers.set('apikey', apiKey);
  headers.set('X-Joblio-Key', apiKey);
  headers.set('User-Agent', 'JoblioSelfHost/1.0');
  headers.set('ngrok-skip-browser-warning', 'true');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.delete('Authorization');
  return headers;
}

/**
 * PostgREST helper. Uses active path; on transport failure flips LAN↔tunnel once.
 */
export async function sbFetch(
  pathname: string,
  init: RequestInit & { query?: Record<string, string> } = {}
): Promise<Response> {
  const env = getSelfHostEnv();
  const q = init.query
    ? '?' +
      Object.entries(init.query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : '';
  const pathPart = pathname.replace(/^\//, '');
  const headers = buildHeaders(init, env.apiKey);

  const tryUrl = async (base: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      return await fetch(`${stripSlash(base)}/rest/v1/${pathPart}${q}`, {
        ...init,
        headers,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  };

  try {
    const res = await tryUrl(env.url);
    // Tunnel/gateway down
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(`gateway ${res.status}`);
    }
    return res;
  } catch (first) {
    try {
      await refreshSelfHostApiUrl();
      const next = getSelfHostEnv();
      const res = await tryUrl(next.url);
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error(`gateway ${res.status}`);
      }
      return res;
    } catch {
      throw new Error(describeSelfHostFetchError(first));
    }
  }
}

export async function sbJson<T>(
  pathname: string,
  init: RequestInit & { query?: Record<string, string> } = {}
): Promise<T> {
  const res = await sbFetch(pathname, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Self-host ${pathname} ${res.status}: ${text}`);
  }
  if (!text) return [] as T;
  return JSON.parse(text) as T;
}
