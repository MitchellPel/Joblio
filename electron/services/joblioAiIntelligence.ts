import fs from 'node:fs';
import path from 'node:path';
import { getAiDataDir } from './settingsService';

const INTELLIGENCE_FILENAME = 'joblio-ai-intelligence.md';

/**
 * Standing instructions for Joblio AI — same idea as CLAUDE.md for coding agents:
 * signal-dense, structured, loaded every chat. Edit the copy on the share to tune
 * behaviour without rebuilding the app.
 */
export const DEFAULT_JOBLIO_AI_INTELLIGENCE = `# Joblio AI — standing instructions

## Identity
You are Joblio AI — a chatbot for the shop. Talk normally. Joblio extras (job board, supplier price lists, team notes, live web) are attached when they help. You are not limited to those extras.

## Non-negotiable
- Have a normal conversation. Answer questions, acknowledge facts staff tell you, help think through work.
- Job numbers, stages, assignees, due dates: only from attached Jobs / job notes sections. Never invent a job.
- Prices, rand amounts, supplier rates: only from attached price lists, saved notes, or what staff just typed in this chat. Never invent a rate. Say estimate or ballpark — never "quote".
- Weather, news, rates, load shedding, and other live lookups: use the attached Live section. That IS current data — never say you lack live access. If that section says the lookup failed, say so and they can try again.
- Default reply: 1–4 short sentences, or up to 5 tight bullets. Go longer when staff ask to explain or break down.

## Voice
Sound like a competent colleague: calm, professional, plain English. South African context is normal.
- Skip filler: Certainly, Great question, I'd be happy to help, As an AI.
- No legal disclaimers. Do not repeat the question back.
- If something is unknown, say so plainly.

## When extras are attached
Use them. Jobs: job number and name first. Prices: item, qty, rate, total, show maths when totalling.
If staff mentioned a job and no job matched, say you could not find it — then still help with the rest of the message.
`;

export function intelligencePath(): string {
  return path.join(getAiDataDir(), INTELLIGENCE_FILENAME);
}

/** Write default intelligence to the share once if missing (editable like CLAUDE.md). */
export function ensureIntelligenceFile(): void {
  const p = intelligencePath();
  if (fs.existsSync(p)) return;
  try {
    fs.writeFileSync(p, DEFAULT_JOBLIO_AI_INTELLIGENCE, 'utf8');
  } catch {
    // Share may be unavailable on dev PC — baked-in default still applies.
  }
}

let cachedIntel: { mtime: number; text: string } | null = null;

export function loadJoblioAiIntelligence(): string {
  ensureIntelligenceFile();
  const p = intelligencePath();
  try {
    if (fs.existsSync(p)) {
      const st = fs.statSync(p);
      if (cachedIntel && cachedIntel.mtime === st.mtimeMs) return cachedIntel.text;
      const text = fs.readFileSync(p, 'utf8').trim();
      if (text.length >= 80) {
        cachedIntel = { mtime: st.mtimeMs, text };
        return text;
      }
    }
  } catch {
    // fall through
  }
  return DEFAULT_JOBLIO_AI_INTELLIGENCE;
}

/** Short prompt for inference — less tokens = faster on a 3B CPU model over LAN. */
export const COMPACT_JOBLIO_AI_INFERENCE = `You are Joblio AI, a chatbot for the shop. Talk normally. Joblio extras (jobs, prices, notes, live lookups) are attached when useful — use those numbers only, never invent a job or a rand amount. If a Live section is attached (weather, rates, time, or web), that is current data: answer from it and never say you lack live access. If no extras are attached, still have a conversation. 1–4 short sentences. Skip filler. Prices: estimate not quote. Jobs: number and name first.`;

/** Full share file when edited; otherwise compact prompt for speed. */
export function loadJoblioAiIntelligenceForInference(): string {
  const extra =
    ' If a Live section is attached (weather, rates, time, or web), that is current data — never claim you lack live access.';
  const full = loadJoblioAiIntelligence().trim();
  if (full === DEFAULT_JOBLIO_AI_INTELLIGENCE.trim()) return COMPACT_JOBLIO_AI_INFERENCE;
  const clipped = full.length > 1400 ? `${full.slice(0, 1400).trimEnd()}…` : full;
  return clipped.includes('never claim you lack live access') ? clipped : `${clipped}${extra}`;
}

/** Structure injected context like CLAUDE.md: clear headers, no noise. */
export function formatContextBlock(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  return `### ${title}\n${trimmed}`;
}

const BANNED_OPENERS = [
  /^hello[!,.]?\s+/i,
  /^hi[!,.]?\s+/i,
  /^hey[!,.]?\s+/i,
  /^sure[!,.]?\s+/i,
  /^certainly[!,.]?\s+/i,
  /^of course[!,.]?\s+/i,
  /^i'?d be happy to help[!.]?\s+/i,
  /^as an ai[^.!?]*[.!?]\s*/i,
  /^great question[!,.]?\s+/i,
  /^how can i assist[^.!?]*[.!?]\s*/i,
  /^according to (the )?ikwezi[^.!?]*[.!?]\s*/i,
];

const BANNED_WORDS =
  /\b(delve|robust|comprehensive|furthermore|landscape|tapestry|underscore|foster|showcase|intricate|multifaceted|pivotal|nuanced|vibrant|fundamental|interplay|crucial)\b/gi;

export function polishAiReply(raw: string): string {
  let s = raw.trim();
  for (const re of BANNED_OPENERS) s = s.replace(re, '');
  s = s.replace(BANNED_WORDS, '');
  s = s.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return s || raw.trim();
}
