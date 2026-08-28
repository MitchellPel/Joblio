/**
 * Compact chat state for Joblio AI — not chat history.
 * Follow-ups like “how much did we charge?” use currentJobId instead of
 * asking Llama to infer it from previous messages.
 */

import { needsLiveLookup } from './joblioAiLiveLookup';

export { isWeatherQuestion, wantsExplicitWeb } from './joblioAiLiveLookup';

export type AiChatSession = {
  currentJobId: number | null;
  currentJobNo: string | null;
  currentJobName: string | null;
  currentContact: string | null;
  currentMaterial: string | null;
  currentSupplier: string | null;
  lastSearchTerms: string[];
};

export const EMPTY_AI_SESSION: AiChatSession = {
  currentJobId: null,
  currentJobNo: null,
  currentJobName: null,
  currentContact: null,
  currentMaterial: null,
  currentSupplier: null,
  lastSearchTerms: [],
};

export function sanitizeAiSession(raw: unknown): AiChatSession {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = Number(o.currentJobId);
  return {
    currentJobId: Number.isFinite(id) && id > 0 ? Math.floor(id) : null,
    currentJobNo: strOrNull(o.currentJobNo, 40),
    currentJobName: strOrNull(o.currentJobName, 120),
    currentContact: strOrNull(o.currentContact, 80),
    currentMaterial: strOrNull(o.currentMaterial, 80),
    currentSupplier: strOrNull(o.currentSupplier, 80),
    lastSearchTerms: Array.isArray(o.lastSearchTerms)
      ? o.lastSearchTerms.map((t) => String(t).slice(0, 60)).filter(Boolean).slice(0, 6)
      : [],
  };
}

function strOrNull(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

export function wantsPriceContext(q: string): boolean {
  return /\b(price|cost|rand|zar|r\d|how much|how many|supplier|vinyl|acrylic|aluminium|aluminum|dibond|perspex|banner|laminate|ink|sheet|per m|sqm|calculate|total|sum)\b/i.test(
    q
  );
}

export function wantsJobContext(q: string): boolean {
  if (needsLiveLookup(q) && !extractJobNumber(q)) return false;
  const jobNo = extractJobNumber(q);
  if (jobNo) return true;
  if (
    wantsPriceContext(q) &&
    !/\b(job\s*(?:no\.?|number|#)|on the board|in joblio|what stage|who('s| is) (assigned|working))\b/i.test(q)
  ) {
    return false;
  }
  if (/\bjobs?\b/i.test(q)) return true;
  if (/\b(job number|job no\.?|job #|on the board|in joblio)\b/i.test(q)) return true;
  if (wantsShowJobFastPath(q)) return true;
  if (
    /\b(what stage|which stage|who('s| is| has)|assigned to|due date|when is .+ due|archived|on hold|proofing|quoted|charged|scope|brief|notes on)\b/i.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(status of|find|look up|lookup|search for|tell me about|show me|open)\b/i.test(q) && !wantsPriceContext(q)) {
    return true;
  }
  return false;
}

export function extractJobNumber(question: string): string | null {
  const m = question.match(
    /\b(?:job\s*(?:no\.?|number|#)?\s*)([A-Za-z]{0,4}\d{3,6}[A-Za-z]?)\b/i
  );
  if (m?.[1]) return m[1];
  const bare = question.match(/\b([A-Za-z]{0,4}\d{3,6}[A-Za-z]?)\b/);
  if (!bare?.[1]) return null;
  // R + digits = Rands (currency), not a job number
  if (/^[Rr]\d/.test(bare[1]) && /\b(price|cost|rand|zar|vat|pay|paid|ex\s*vat|incl|excl|per|sqm|roll|meter|metre)\b/i.test(question)) {
    return null;
  }
  return bare[1];
}

export function wantsShowJobFastPath(q: string): boolean {
  return /\b(show|open|pull up|bring up)\s+(me\s+)?(job\s*)?#?\s*[A-Za-z]{0,4}\d{3,6}/i.test(q);
}

/** New named search — don't reuse the previous job. */
export function isNewJobSearch(q: string): boolean {
  if (wantsShowJobFastPath(q)) return true;
  return /\b(find|look up|lookup|search for|another|different)\b/i.test(q) &&
    !/\b(that job|this job|that one|this one|it|them)\b/i.test(q);
}

/**
 * Reuse currentJobId for follow-ups unless the user is clearly switching jobs.
 */
export function shouldReuseCurrentJob(q: string, session: AiChatSession): boolean {
  if (!session.currentJobId) return false;
  if (needsLiveLookup(q) && !extractJobNumber(q)) return false;
  const num = extractJobNumber(q);
  if (num && session.currentJobNo && !sameJobNo(num, session.currentJobNo)) return false;
  if (isNewJobSearch(q) && !num) return false;
  return true;
}

export function sameJobNo(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function sessionFromJob(
  job: {
    id: number;
    job_no: string;
    job_name: string;
    contact_name?: string | null;
  },
  prev: AiChatSession,
  searchTerms?: string[]
): AiChatSession {
  return {
    ...prev,
    currentJobId: job.id,
    currentJobNo: job.job_no || prev.currentJobNo,
    currentJobName: job.job_name || prev.currentJobName,
    currentContact: job.contact_name ?? prev.currentContact,
    lastSearchTerms: searchTerms?.length ? searchTerms.slice(0, 6) : prev.lastSearchTerms,
  };
}

export function formatSessionBlock(session: AiChatSession): string {
  if (!session.currentJobId && !session.currentMaterial && !session.currentSupplier) return '';
  const lines = [
    session.currentJobId
      ? `current job: ${session.currentJobNo || session.currentJobId} ${session.currentJobName || ''}`.trim()
      : '',
    session.currentContact ? `contact: ${session.currentContact}` : '',
    session.currentMaterial ? `material in this chat: ${session.currentMaterial}` : '',
    session.currentSupplier ? `supplier in this chat: ${session.currentSupplier}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}
