import fs from 'node:fs';
import path from 'node:path';
import { dialog, BrowserWindow } from 'electron';
import { getAiDataDir } from './settingsService';
import { resolveAiRuntime, type AiRuntime } from './aiSettings';
import { isSelfHostMode } from '../db/backendMode';
import { searchJobs, getJob } from '../repositories/jobsRepo';
import { searchJobsCloud, getJobCloud, listNotesCloud } from '../selfhost/jobsCloud';
import { listNotes } from '../repositories/auditRepo';
import {
  formatContextBlock,
  loadJoblioAiIntelligenceForInference,
  polishAiReply,
} from './joblioAiIntelligence';
import {
  EMPTY_AI_SESSION,
  extractJobNumber,
  formatSessionBlock,
  sanitizeAiSession,
  sessionFromJob,
  shouldReuseCurrentJob,
  wantsJobContext,
  wantsPriceContext,
  wantsShowJobFastPath,
  type AiChatSession,
} from './joblioAiSession';
import {
  classifyLiveLookup,
  fetchLiveLookup,
  needsLiveLookup,
  webSearch,
} from './joblioAiLiveLookup';

const DEFAULT_MODEL = 'auto';

/** Model preference order when config says "auto" — first available wins. */
const MODEL_PREFERENCE = [
  'qwen3.5',
  'qwen3',
  'phi3:medium-128k',
  'phi3:medium',
  'phi3:mini',
  'phi3',
  'llama3.2:3b',
  'llama3.2:1b',
  'llama3.1:8b',
  'llama3:8b',
  'mistral',
  'gemma2:2b',
  'qwen2:1.5b',
];

let detectedModel: string | null = null;
let detectPromise: Promise<string | null> | null = null;

export type AiChatMessage = { role: 'user' | 'assistant'; content: string };

export type AiPriceFile = { name: string; size: number; updated_at: string };

type OllamaCfg = {
  url: string;
  model: string;
  num_thread: number;
  num_ctx: number;
};

export type { AiChatSession } from './joblioAiSession';
export { EMPTY_AI_SESSION } from './joblioAiSession';

let activeChatAbort: AbortController | null = null;

export function cancelAiChat(): void {
  activeChatAbort?.abort();
  emitAiStatus(null);
}

function emitAiStatus(label: string | null): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('ai:status', label);
  }
}

function shareRoot(): string {
  return getAiDataDir();
}

function pricesDir(): string {
  return path.join(shareRoot(), 'ai-prices');
}

function ensurePricesDir(): string {
  const dir = pricesDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const readme = path.join(dir, 'readme.txt');
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      'Drop supplier price lists here (xlsx, csv, txt, pdf). Use one file per supplier.\nJoblio AI reads these first. Say “remember …” in chat to store a note for everyone.\n',
      'utf8'
    );
  }
  return dir;
}

function readOllamaCfg(): OllamaCfg {
  const rt = resolveAiRuntime();
  const model = rt.model === 'auto' && detectedModel ? detectedModel : rt.model;
  return {
    url: rt.url.replace(/\/$/, ''),
    model,
    num_thread: rt.num_thread,
    num_ctx: rt.num_ctx,
  };
}

async function autoDetectModel(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: { name: string }[] };
    const installed = (data.models || []).map((m) => m.name);
    if (!installed.length) return null;
    for (const pref of MODEL_PREFERENCE) {
      const match = installed.find(
        (n) => n === pref || n.startsWith(`${pref}:`) || n.startsWith(pref.split(':')[0] + ':')
      );
      if (match) return match;
    }
    return installed[0];
  } catch {
    return null;
  }
}

async function ensureModelDetected(): Promise<void> {
  if (detectedModel) return;
  if (detectPromise) { await detectPromise; return; }
  const rt = resolveAiRuntime();
  if (rt.provider !== 'ollama') {
    detectedModel = rt.model || null;
    return;
  }
  const rawModel = rt.model || DEFAULT_MODEL;
  const url = rt.url;
  if (rawModel !== 'auto') { detectedModel = rawModel; return; }
  detectPromise = autoDetectModel(url);
  const found = await detectPromise;
  detectPromise = null;
  if (found) detectedModel = found;
}

export function listPriceFiles(): AiPriceFile[] {
  const dir = ensurePricesDir();
  return fs
    .readdirSync(dir)
    .filter((n) => {
      const lower = n.toLowerCase();
      return !n.startsWith('.') && lower !== 'readme.txt' && lower !== 'notes.txt';
    })
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, updated_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

function extOf(name: string): string {
  return path.extname(name).toLowerCase();
}

function extractTextFromBuffer(fileName: string, buf: Buffer): string {
  const ext = extOf(fileName);
  if (ext === '.txt' || ext === '.csv' || ext === '.tsv' || ext === '.md') {
    return buf.toString('utf8');
  }
  if (ext === '.xlsx' || ext === '.xls') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx') as {
        read: (b: Buffer, o: object) => { SheetNames: string[]; Sheets: Record<string, unknown> };
        utils: { sheet_to_csv: (s: unknown) => string };
      };
      const wb = XLSX.read(buf, { type: 'buffer' });
      return wb.SheetNames.slice(0, 6)
        .map((n) => `--- ${n} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`)
        .join('\n');
    } catch {
      return '[Could not read Excel — install failed or file is protected.]';
    }
  }
  if (ext === '.pdf') {
    const asLatin = buf.toString('latin1');
    const bits: string[] = [];
    const re = /\((?:\\.|[^\\)]){4,}\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(asLatin)) && bits.length < 400) {
      const inner = m[0]
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')');
      if (/[A-Za-z0-9]/.test(inner)) bits.push(inner);
    }
    const text = bits.join(' ').replace(/\s+/g, ' ').trim();
    return text || '[This PDF has no extractable text. Export to Excel or CSV and upload that.]';
  }
  return buf.toString('utf8');
}

export async function addPriceFileFromDialog(): Promise<{ ok: true; name: string } | { cancelled: true } | { error: string }> {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { cancelled: true };
  const result = await dialog.showOpenDialog(win, {
    title: 'Add supplier price list (Excel, CSV, text, or PDF)',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Price lists', extensions: ['xlsx', 'xls', 'csv', 'txt', 'pdf'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return { cancelled: true };

  const dir = ensurePricesDir();
  let last = '';
  for (const src of result.filePaths) {
    const base = path.basename(src).replace(/[<>:"|?*]/g, '_');
    const dest = path.join(dir, base);
    fs.copyFileSync(src, dest);
    last = base;
  }
  return { ok: true, name: last };
}

export function removePriceFile(name: string): { ok: true } | { error: string } {
  const safe = path.basename(name);
  if (safe.toLowerCase() === 'notes.txt' || safe.toLowerCase() === 'readme.txt') {
    return { error: 'That file is used by Joblio AI and cannot be removed here.' };
  }
  const full = path.join(pricesDir(), safe);
  if (!fs.existsSync(full)) return { error: 'File not found.' };
  fs.unlinkSync(full);
  return { ok: true };
}

function notesPath(): string {
  return path.join(ensurePricesDir(), 'notes.txt');
}

function readNotesRaw(): string {
  const p = notesPath();
  if (!fs.existsSync(p)) return '';
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

export function listSavedNotes(): { count: number; recent: string[] } {
  const lines = readNotesRaw()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  return { count: lines.length, recent: lines.slice(-8).reverse() };
}

function relevantNotes(question: string): string {
  const lines = readNotesRaw()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (!lines.length) {
    return '(No saved notes yet. Staff can say “remember …” to store a supplier price for everyone.)';
  }
  const words = question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const matched = lines
    .map((line) => ({ line, score: scoreHay(line, words) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((x) => x.line);
  const recent = lines.slice(-12);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...matched, ...recent]) {
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out.join('\n').slice(0, 2500);
}

function wantsRemember(q: string): boolean {
  return /\b(remember|don'?t forget|save this|save that|note this|note that|store this|store that|keep this in mind|write this down)\b/i.test(
    q
  );
}

function looksLikeQuestion(q: string): boolean {
  return (
    /\?/.test(q) ||
    /\b(what|how much|how many|price of|cost of|cheaper|calculate|estimate|total|sum)\b/i.test(q)
  );
}

function extractNote(q: string): string {
  let s = q
    .replace(/^(please\s+)?(can you\s+|could you\s+)?/i, '')
    .replace(
      /\b(please\s+)?(remember|don'?t forget|save this|save that|note this|note that|store this|store that|keep this in mind|write this down)\b[:\s-]*/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();
  return (s.length >= 8 ? s : q.trim()).slice(0, 500);
}

function appendNote(text: string): string {
  const line = `[${new Date().toISOString().slice(0, 10)}] ${text}`;
  const p = notesPath();
  let existing = '';
  if (fs.existsSync(p)) existing = fs.readFileSync(p, 'utf8');
  let next = `${existing.endsWith('\n') || !existing ? existing : `${existing}\n`}${line}\n`;
  if (next.length > 100_000) {
    next = next.slice(-80_000);
    const cut = next.indexOf('\n');
    if (cut > 0) next = next.slice(cut + 1);
  }
  fs.writeFileSync(p, next, 'utf8');
  return line;
}

function scoreHay(hay: string, words: string[]): number {
  const h = hay.toLowerCase();
  let n = 0;
  for (const w of words) {
    if (w.length < 3) continue;
    if (h.includes(w)) n += 1;
  }
  return n;
}

function relevantPriceExcerpts(question: string): string {
  const dir = ensurePricesDir();
  const words = question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const files = listPriceFiles();
  const ranked = files
    .map((f) => {
      const text = cachedFileText(dir, f.name);
      return { name: f.name, text, score: scoreHay(f.name + '\n' + text, words) };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const picks = (ranked[0]?.score ? ranked.filter((r) => r.score > 0).slice(0, 2) : ranked.slice(0, 1));
  if (!picks.length) return '(No price lists uploaded yet.)';
  return picks
    .map((p) => `FILE ${p.name}:\n${p.text.slice(0, 1000)}`)
    .join('\n\n');
}

function wantsDepth(q: string): boolean {
  return /\b(explain|break down|step by step|in detail|detailed|walk me through|compare|list all|full breakdown|show (your )?working|how did you|why)\b/i.test(
    q
  );
}

/** Context blocks that mean “nothing usable here”. */
function isEmptyContext(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  return (
    t.startsWith('(No ') ||
    t.startsWith('(Could not') ||
    t.startsWith('(Web search failed') ||
    t.startsWith('(Web search returned')
  );
}

/** Web search only when external facts are needed — not job/price lookups (saves seconds). */
function summarizeLocalForRouter(jobs: string, prices: string, notes: string): string {
  return [
    `jobs on board: ${isEmptyContext(jobs) ? 'no matches' : 'matches found'}`,
    `supplier price lists: ${isEmptyContext(prices) ? 'none matched' : 'matches found'}`,
    `saved team notes: ${isEmptyContext(notes) ? 'none matched' : 'matches found'}`,
  ].join('; ');
}

/** Skip the router when Joblio data clearly covers the question. */
function skipWebRouting(q: string, jobs: string, prices: string, notes: string): 'local' | 'web' | null {
  if (needsLiveLookup(q)) return 'web';
  if (wantsJobContext(q)) return isEmptyContext(jobs) ? null : 'local';
  if (wantsPriceContext(q) || wantsRemember(q)) {
    if (!isEmptyContext(prices) || !isEmptyContext(notes)) return 'local';
  }
  return null;
}

/** One-word model decision: WEB vs LOCAL (after Joblio data is loaded). */
async function modelWantsWebSearch(question: string, localSummary: string): Promise<boolean> {
  const raw = await llmChat(
    [
      {
        role: 'system',
        content: `You route shop questions. Joblio already checked — ${localSummary}. Reply exactly one word: WEB if the answer needs live internet (weather, news, current events, online/market prices not in Joblio, general knowledge). Reply LOCAL if Joblio jobs, supplier lists, or saved notes should answer it.`,
      },
      { role: 'user', content: question.slice(0, 500) },
    ],
    { route: true }
  );
  return /^web\b/i.test(raw.trim());
}

async function decideWebSearch(
  question: string,
  jobs: string,
  prices: string,
  notes: string,
  savedOnly: boolean
): Promise<boolean> {
  if (savedOnly) return false;
  const preset = skipWebRouting(question, jobs, prices, notes);
  if (preset === 'local') return false;
  if (preset === 'web') return true;
  return modelWantsWebSearch(question, summarizeLocalForRouter(jobs, prices, notes));
}

const JOB_SEARCH_STOP = new Set([
  'what',
  'whats',
  'where',
  'when',
  'who',
  'how',
  'is',
  'are',
  'the',
  'a',
  'an',
  'about',
  'tell',
  'me',
  'find',
  'lookup',
  'look',
  'up',
  'for',
  'on',
  'in',
  'joblio',
  'board',
  'status',
  'stage',
  'due',
  'date',
  'assigned',
  'working',
  'jobs',
  'job',
  'number',
  'please',
  'can',
  'you',
  'could',
  'would',
  'show',
  'give',
  'get',
  'any',
  'our',
  'this',
  'that',
  'with',
]);

/** Pull job number, quoted name, or meaningful words — full questions rarely match LIKE search. */
function extractJobSearchTerms(question: string): string[] {
  const terms: string[] = [];
  const q = question.trim();
  if (!q) return terms;

  const numMatches = q.match(/\b[A-Za-z]{0,4}\d{3,}[A-Za-z]?\b/g);
  if (numMatches) terms.push(...numMatches);

  for (const m of q.matchAll(/"([^"]+)"|'([^']+)'/g)) {
    const phrase = (m[1] || m[2] || '').trim();
    if (phrase.length >= 2) terms.push(phrase);
  }

  const words = q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !JOB_SEARCH_STOP.has(w));
  if (words.length) terms.push(words.join(' '));
  if (words.length >= 2) terms.push(words.slice(-2).join(' '));

  terms.push(q.replace(/\?+$/, '').trim());
  return [...new Set(terms.filter((t) => t.length >= 2))];
}

function formatJobLine(j: {
  job_no: string;
  job_name: string;
  client: string;
  stage: string;
  due_date: string | null;
  assigned_name: string | null;
  designer_status: string[];
  archived_at: string | null;
  scope_notes: string | null;
  last_note_preview: string | null;
}): string {
  const scope = (j.scope_notes || '').replace(/\s+/g, ' ').slice(0, 120);
  const note = (j.last_note_preview || '').replace(/\s+/g, ' ').slice(0, 100);
  const flags = j.designer_status?.length ? j.designer_status.join(', ') : '';
  const archived = j.archived_at ? 'archived' : 'active';
  const assignee = j.assigned_name || 'unassigned';
  let line = `- ${j.job_no} | ${j.job_name} | ${j.client || '—'} | ${j.stage} | due ${j.due_date || '—'} | ${assignee} | ${archived}`;
  if (flags) line += ` | ${flags}`;
  if (scope) line += ` | scope: ${scope}`;
  if (note) line += ` | note: ${note}`;
  return line;
}

/** Skip the model when one job clearly matches a simple lookup question. */
function tryDirectJobReply(question: string, jobsBlock: string): string | null {
  if (isEmptyContext(jobsBlock)) return null;
  const lines = jobsBlock.split('\n').filter((l) => l.startsWith('- '));
  if (lines.length !== 1) return null;

  const parts = lines[0].slice(2).split(' | ');
  if (parts.length < 7) return null;
  const [jobNo, jobName, , stage, duePart, assignee, archived] = parts;
  const due = duePart.replace(/^due /, '');
  const q = question.toLowerCase();

  if (/\b(who|assigned|working on)\b/.test(q)) {
    return `${jobNo} ${jobName} — ${assignee}.`;
  }
  if (/\b(stage|status)\b/.test(q)) {
    return `${jobNo} ${jobName} is in ${stage}${archived === 'archived' ? ' (archived)' : ''}.`;
  }
  if (/\b(due|deadline|when)\b/.test(q)) {
    return due === '—'
      ? `${jobNo} ${jobName} has no due date set.`
      : `${jobNo} ${jobName} is due ${due}.`;
  }
  if (/\b(tell me about|info|details|look up|find|what is|what's)\b/.test(q)) {
    return `${jobNo} ${jobName} — ${stage}, due ${due}, ${assignee}${archived === 'archived' ? ', archived' : ''}.`;
  }
  return null;
}

async function findMatchingJobs(question: string): Promise<Awaited<ReturnType<typeof searchJobs>>> {
  const terms = extractJobSearchTerms(question).slice(0, 3);
  const seen = new Set<number>();
  const jobs: Awaited<ReturnType<typeof searchJobs>> = [];

  const batches = await Promise.all(
    terms.map((term) =>
      isSelfHostMode() ? searchJobsCloud(term, 8) : Promise.resolve(searchJobs(term, 8))
    )
  );
  for (const batch of batches) {
    for (const j of batch) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      jobs.push(j);
    }
  }

  const num = extractJobNumber(question);
  if (num) {
    const exact = jobs.filter((j) => j.job_no.toLowerCase() === num.toLowerCase());
    if (exact.length) return exact.slice(0, 8);
  }
  return jobs.slice(0, 8);
}

async function loadJobById(id: number) {
  try {
    if (isSelfHostMode()) return (await getJobCloud(id)) || null;
    return getJob(id) || null;
  } catch {
    return null;
  }
}

async function formatJobNotes(jobId: number): Promise<string> {
  try {
    const notes = isSelfHostMode() ? await listNotesCloud(jobId) : listNotes(jobId);
    if (!notes.length) return '(No notes on this job.)';
    return notes
      .slice(0, 8)
      .map((n) => {
        const who = n.author_name || 'Staff';
        const day = String(n.created_at || '').slice(0, 10);
        const body = (n.body || '').replace(/\s+/g, ' ').slice(0, 220);
        return `- ${who} (${day}): ${body}`;
      })
      .join('\n');
  } catch {
    return '(Could not load job notes.)';
  }
}

const priceTextCache = new Map<string, { mtime: number; text: string }>();

function cachedFileText(dir: string, name: string): string {
  const full = path.join(dir, name);
  const mtime = fs.statSync(full).mtimeMs;
  const hit = priceTextCache.get(full);
  if (hit && hit.mtime === mtime) return hit.text;
  const text = extractTextFromBuffer(name, fs.readFileSync(full)).slice(0, 8000);
  priceTextCache.set(full, { mtime, text });
  return text;
}

async function ollamaChat(
  cfg: OllamaCfg,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { depth?: boolean; route?: boolean }
): Promise<string> {
  const ctrl = new AbortController();
  if (!opts?.route) activeChatAbort = ctrl;
  const t = setTimeout(() => ctrl.abort(), opts?.route ? 15000 : 60000);
  try {
    const res = await fetch(`${cfg.url}/api/chat`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: false,
        think: false,
        keep_alive: '30m',
        options: {
          temperature: opts?.route ? 0 : 0.15,
          num_thread: cfg.num_thread,
          num_ctx: opts?.route ? 768 : cfg.num_ctx,
          num_predict: opts?.route ? 4 : opts?.depth ? 280 : 100,
        },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = JSON.parse(text) as { message?: { content?: string } };
    const raw = (data.message?.content || '').trim();
    if (opts?.route) return raw;
    return raw ? polishAiReply(raw) : "I couldn't form an answer — try asking again in fewer words.";
  } finally {
    clearTimeout(t);
    if (activeChatAbort === ctrl) activeChatAbort = null;
  }
}

function keepModelWarm(cfg: OllamaCfg): void {
  void fetch(`${cfg.url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: 'ok' }],
      stream: false,
      keep_alive: '30m',
      options: { num_predict: 1, num_thread: cfg.num_thread, num_ctx: 512 },
    }),
  }).catch(() => {});
}

async function openaiChat(
  rt: AiRuntime,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { depth?: boolean; route?: boolean }
): Promise<string> {
  if (!rt.apiKey) {
    throw new Error('Cloud AI needs an API key. An admin can add it in Settings → Joblio AI.');
  }
  const ctrl = new AbortController();
  if (!opts?.route) activeChatAbort = ctrl;
  const t = setTimeout(() => ctrl.abort(), opts?.route ? 15000 : 60000);
  try {
    const res = await fetch(`${rt.url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rt.apiKey}`,
      },
      body: JSON.stringify({
        model: rt.model,
        messages,
        temperature: opts?.route ? 0 : 0.15,
        max_tokens: opts?.route ? 8 : opts?.depth ? 280 : 100,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Cloud AI ${res.status}: ${text.slice(0, 220)}`);
    }
    const data = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
    const raw = (data.choices?.[0]?.message?.content || '').trim();
    if (opts?.route) return raw;
    return raw ? polishAiReply(raw) : "I couldn't form an answer — try asking again in fewer words.";
  } finally {
    clearTimeout(t);
    if (activeChatAbort === ctrl) activeChatAbort = null;
  }
}

async function llmChat(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts?: { depth?: boolean; route?: boolean }
): Promise<string> {
  const rt = resolveAiRuntime();
  if (rt.provider === 'off') {
    throw new Error('Joblio AI is off. An admin can enable Local (Ollama) or Cloud in Settings.');
  }
  if (rt.provider === 'openai') return openaiChat(rt, messages, opts);
  return ollamaChat(readOllamaCfg(), messages, opts);
}

export function resetAiModelCache(): void {
  detectedModel = null;
  detectPromise = null;
}

export async function aiStatus(): Promise<{
  ready: boolean;
  model: string;
  url: string;
  provider: 'off' | 'ollama' | 'openai';
  error?: string;
}> {
  const rt = resolveAiRuntime();
  if (rt.provider === 'off') {
    return {
      ready: false,
      model: '',
      url: '',
      provider: 'off',
      error: 'Joblio AI is off. An admin can enable Local (Ollama) or Cloud in Settings.',
    };
  }
  if (rt.provider === 'openai') {
    if (!rt.apiKey) {
      return {
        ready: false,
        model: rt.model,
        url: rt.url,
        provider: 'openai',
        error: 'Cloud AI needs an API key. Add it in Settings → Joblio AI.',
      };
    }
    return { ready: true, model: rt.model, url: rt.url, provider: 'openai' };
  }

  await ensureModelDetected();
  const cfg = readOllamaCfg();
  try {
    const res = await fetch(`${cfg.url}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) {
      return { ready: false, model: cfg.model, url: cfg.url, provider: 'ollama', error: `Ollama HTTP ${res.status}` };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models || []).map((m) => m.name);
    const has = names.some(
      (n) => n === cfg.model || n.startsWith(`${cfg.model}:`) || n.startsWith(cfg.model.split(':')[0])
    );
    if (!has) {
      if (cfg.model === 'auto' || detectedModel === cfg.model) {
        if (names.length) {
          detectedModel = names[0];
          const refreshed = readOllamaCfg();
          keepModelWarm(refreshed);
          return { ready: true, model: refreshed.model, url: refreshed.url, provider: 'ollama' };
        }
      }
      return {
        ready: false,
        model: cfg.model,
        url: cfg.url,
        provider: 'ollama',
        error: `Model ${cfg.model} is not installed. On this PC run: ollama pull ${cfg.model}`,
      };
    }
    keepModelWarm(cfg);
    return { ready: true, model: cfg.model, url: cfg.url, provider: 'ollama' };
  } catch {
    return {
      ready: false,
      model: cfg.model,
      url: cfg.url,
      provider: 'ollama',
      error: `Cannot reach Ollama at ${cfg.url}. Install Ollama, pull a model, then set the URL in Settings → Joblio AI.`,
    };
  }
}

export async function runAiChat(
  messages: AiChatMessage[],
  sessionRaw?: unknown
): Promise<{
  reply: string;
  used_web: boolean;
  saved: boolean;
  model: string;
  session: AiChatSession;
  cancelled?: boolean;
}> {
  await ensureModelDetected();
  const rt = resolveAiRuntime();
  const cfg = readOllamaCfg();
  if (rt.provider === 'ollama') keepModelWarm(cfg);
  const modelLabel = rt.provider === 'openai' ? rt.model : cfg.model;
  if (rt.provider === 'off') {
    return {
      reply: 'Joblio AI is off. An admin can enable Local (Ollama) or Cloud in Settings.',
      used_web: false,
      saved: false,
      model: '',
      session: sanitizeAiSession(sessionRaw ?? EMPTY_AI_SESSION),
    };
  }
  let session = sanitizeAiSession(sessionRaw ?? EMPTY_AI_SESSION);
  const done = (
    reply: string,
    extra?: { used_web?: boolean; saved?: boolean; cancelled?: boolean }
  ) => ({
    reply,
    used_web: extra?.used_web ?? false,
    saved: extra?.saved ?? false,
    model: modelLabel,
    session,
    cancelled: extra?.cancelled,
  });

  const last = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() || '';
  if (!last) {
    emitAiStatus(null);
    return done('Type a message — chat normally, or ask about a job or a price.');
  }

  emitAiStatus('Reading your message…');

  let saved = false;
  let savedLine = '';
  if (wantsRemember(last)) {
    savedLine = appendNote(extractNote(last));
    saved = true;
  }

  if (saved && !looksLikeQuestion(last)) {
    emitAiStatus(null);
    return done(`Saved for everyone:\n${savedLine}`, { saved: true });
  }

  const savedOnly = saved && !looksLikeQuestion(last);

  const live = classifyLiveLookup(last);
  if (live && !extractJobNumber(last)) {
    emitAiStatus(live.status);
    const payload = await fetchLiveLookup(last, live.kind);
    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    const lastUser = [...history].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      lastUser.content = [
        '--- Joblio extras ---',
        formatContextBlock(
          `${live.title} (this is current data — use it; do not say you lack live access)`,
          payload
        ),
        '--- Staff said ---',
        lastUser.content,
      ].join('\n\n');
    }
    try {
      emitAiStatus('Writing a reply…');
      const reply = await llmChat(
        [{ role: 'system', content: loadJoblioAiIntelligenceForInference() }, ...history],
        { depth: wantsDepth(last) }
      );
      emitAiStatus(null);
      return done(reply, { used_web: true, saved });
    } catch (err: unknown) {
      emitAiStatus(null);
      const msg = err instanceof Error ? err.message : String(err);
      if (/abort/i.test(msg)) {
        return done('Stopped.', { used_web: true, saved, cancelled: true });
      }
      throw err;
    }
  }

  const reuseJob = shouldReuseCurrentJob(last, session);
  const needPrices = wantsPriceContext(last) || saved;
  const needJobs = wantsJobContext(last) || reuseJob || wantsShowJobFastPath(last);
  const needNotes = needPrices || saved;

  let matched: Awaited<ReturnType<typeof searchJobs>> = [];
  if (needJobs) emitAiStatus('Looking up jobs…');
  if (reuseJob && session.currentJobId) {
    const one = await loadJobById(session.currentJobId);
    if (one) matched = [one];
  }
  if (!matched.length && needJobs) {
    matched = await findMatchingJobs(last);
  }
  if (matched.length === 1) {
    session = sessionFromJob(matched[0], session, extractJobSearchTerms(last).slice(0, 4));
  }

  const jobs = matched.length ? matched.map(formatJobLine).join('\n') : needJobs ? '(No matching jobs.)' : '';
  const jobNotesPromise =
    session.currentJobId && (reuseJob || matched.length === 1 || wantsJobContext(last))
      ? formatJobNotes(session.currentJobId)
      : Promise.resolve('');

  if (needPrices) emitAiStatus('Checking price lists…');
  const [prices, notes, jobNotes] = await Promise.all([
    needPrices ? Promise.resolve(relevantPriceExcerpts(last)) : Promise.resolve(''),
    needNotes ? Promise.resolve(relevantNotes(last)) : Promise.resolve(''),
    jobNotesPromise,
  ]);

  if (wantsShowJobFastPath(last) && matched.length === 1) {
    const j = matched[0];
    const notesBit = isEmptyContext(jobNotes) ? '' : `\nLatest notes:\n${jobNotes}`;
    emitAiStatus(null);
    return done(
      `${j.job_no} ${j.job_name} — ${j.stage}, due ${j.due_date || '—'}, ${j.assigned_name || 'unassigned'}.${notesBit}`,
      { saved }
    );
  }

  if (needJobs && !isEmptyContext(jobs)) {
    const direct = tryDirectJobReply(last, jobs);
    if (direct) {
      emitAiStatus(null);
      return done(direct, { saved });
    }
  }

  emitAiStatus('Deciding if the web is needed…');
  const usedWeb = await decideWebSearch(last, jobs, prices, notes, savedOnly);
  if (usedWeb) emitAiStatus('Searching the web…');
  const web = usedWeb ? await webSearch(last) : '';

  const extra: string[] = [];
  const sessionBlock = formatSessionBlock(session);
  if (sessionBlock) extra.push(formatContextBlock('Conversation context', sessionBlock));
  if (saved) extra.push(formatContextBlock('Just stored note', savedLine));
  if (notes) extra.push(formatContextBlock('Saved notes', notes));
  if (prices) extra.push(formatContextBlock('Price lists', prices));
  if (jobs) extra.push(formatContextBlock('Jobs', jobs));
  if (jobNotes && !isEmptyContext(jobNotes)) extra.push(formatContextBlock('Notes on current job', jobNotes));
  if (usedWeb && web) {
    extra.push(
      formatContextBlock(
        'Live web search (current data — use it; do not say you lack live access)',
        web
      )
    );
  }

  const history = messages.slice(-8).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  if (extra.length && history.length) {
    const lastUser = [...history].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      lastUser.content = [
        '--- Joblio extras (use these facts when relevant; do not invent jobs or rand amounts) ---',
        extra.join('\n\n'),
        '--- Staff said ---',
        lastUser.content,
      ].join('\n\n');
    }
  }

  try {
    emitAiStatus(usedWeb || extra.length ? 'Writing a reply…' : 'Thinking…');
    const reply = await llmChat(
      [{ role: 'system', content: loadJoblioAiIntelligenceForInference() }, ...history],
      { depth: wantsDepth(last) }
    );
    emitAiStatus(null);
    return done(reply, { used_web: usedWeb, saved });
  } catch (err: unknown) {
    emitAiStatus(null);
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) {
      return done('Stopped.', { used_web: usedWeb, saved, cancelled: true });
    }
    throw err;
  }
}
