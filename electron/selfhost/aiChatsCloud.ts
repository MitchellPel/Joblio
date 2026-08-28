import { sbFetch, sbJson } from './rest';
import { ensureUserCache, findUserByIdCloudCached } from './usersCloud';

export type AiChatLine = { role: 'user' | 'assistant'; content: string };

export type AiChatSessionPayload = {
  currentJobId: number | null;
  currentJobNo: string | null;
  currentJobName: string | null;
  currentContact: string | null;
  currentMaterial: string | null;
  currentSupplier: string | null;
  lastSearchTerms: string[];
};

export type AiChatThread = {
  id: string;
  title: string;
  messages: AiChatLine[];
  session: AiChatSessionPayload;
  updatedAt: string;
};

export type AiChatInbox = {
  threads: AiChatThread[];
  activeId: string | null;
};

export type StoredAiChat = {
  userId: number;
  threadId: string;
  username: string;
  fullName: string;
  title: string;
  messages: AiChatLine[];
  session: AiChatSessionPayload;
  updatedAt: string | null;
  preview: string;
};

const EMPTY_SESSION: AiChatSessionPayload = {
  currentJobId: null,
  currentJobNo: null,
  currentJobName: null,
  currentContact: null,
  currentMaterial: null,
  currentSupplier: null,
  lastSearchTerms: [],
};

export function isAiChatsTableMissing(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /ai_chats/i.test(m) && /(404|PGRST205|does not exist|schema cache)/i.test(m);
}

function sanitizeMessages(raw: unknown): AiChatLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim()
    )
    .slice(-80)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 4000) }));
}

function sanitizeSession(raw: unknown): AiChatSessionPayload {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = Number(o.currentJobId);
  return {
    currentJobId: Number.isFinite(id) && id > 0 ? Math.floor(id) : null,
    currentJobNo: typeof o.currentJobNo === 'string' ? o.currentJobNo.slice(0, 40) : null,
    currentJobName: typeof o.currentJobName === 'string' ? o.currentJobName.slice(0, 120) : null,
    currentContact: typeof o.currentContact === 'string' ? o.currentContact.slice(0, 80) : null,
    currentMaterial: typeof o.currentMaterial === 'string' ? o.currentMaterial.slice(0, 80) : null,
    currentSupplier: typeof o.currentSupplier === 'string' ? o.currentSupplier.slice(0, 80) : null,
    lastSearchTerms: Array.isArray(o.lastSearchTerms)
      ? o.lastSearchTerms.map((t) => String(t).slice(0, 60)).filter(Boolean).slice(0, 6)
      : [],
  };
}

function parseJson(text: string | null | undefined, fallback: unknown): unknown {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function previewFrom(messages: AiChatLine[]): string {
  const last = [...messages].reverse().find((m) => m.content.trim());
  if (!last) return 'New chat';
  const t = last.content.replace(/\s+/g, ' ').trim();
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}

export function titleFromMessages(messages: AiChatLine[], fallback = 'New chat'): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim());
  if (!first) return fallback;
  const t = first.content.replace(/\s+/g, ' ').trim();
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

function sanitizeThread(raw: unknown): AiChatThread | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id || '').trim().slice(0, 48);
  if (!id) return null;
  const messages = sanitizeMessages(o.messages);
  const existingTitle = typeof o.title === 'string' ? o.title.trim().slice(0, 60) : '';
  return {
    id,
    title: existingTitle || titleFromMessages(messages),
    messages,
    session: sanitizeSession(o.session),
    updatedAt: typeof o.updatedAt === 'string' && o.updatedAt ? o.updatedAt : new Date().toISOString(),
  };
}

export function parseAiInbox(
  messagesJson: string | null | undefined,
  sessionJson: string | null | undefined,
  updatedAt?: string | null
): AiChatInbox {
  const parsed = parseJson(messagesJson, null);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const o = parsed as Record<string, unknown>;
    if (Number(o.v) >= 2 && Array.isArray(o.threads)) {
      const threads = o.threads
        .map(sanitizeThread)
        .filter((t): t is AiChatThread => !!t)
        .slice(0, 40);
      const activeId =
        typeof o.activeId === 'string' && threads.some((t) => t.id === o.activeId)
          ? o.activeId
          : null;
      return { threads, activeId };
    }
  }
  const messages = sanitizeMessages(parsed);
  if (!messages.length) return { threads: [], activeId: null };
  const id = 'legacy';
  return {
    threads: [
      {
        id,
        title: titleFromMessages(messages),
        messages,
        session: sanitizeSession(parseJson(sessionJson, {})),
        updatedAt: updatedAt || new Date().toISOString(),
      },
    ],
    activeId: id,
  };
}

function inboxBody(userId: number, inbox: AiChatInbox) {
  const threads = inbox.threads.slice(0, 40);
  const active = threads.find((t) => t.id === inbox.activeId) || null;
  return {
    user_id: userId,
    messages_json: JSON.stringify({ v: 2, activeId: inbox.activeId, threads }),
    session_json: JSON.stringify(sanitizeSession(active?.session)),
    updated_at: new Date().toISOString(),
  };
}

export async function loadAiInboxCloud(userId: number): Promise<AiChatInbox> {
  const rows = await sbJson<any[]>('ai_chats', {
    query: { select: '*', user_id: `eq.${userId}`, limit: '1' },
  });
  if (!rows[0]) return { threads: [], activeId: null };
  return parseAiInbox(rows[0].messages_json, rows[0].session_json, rows[0].updated_at);
}

export async function saveAiInboxCloud(userId: number, inbox: AiChatInbox): Promise<void> {
  const body = inboxBody(userId, inbox);
  const existing = await sbJson<any[]>('ai_chats', {
    query: { select: 'user_id', user_id: `eq.${userId}`, limit: '1' },
  });
  if (existing[0]) {
    const res = await sbFetch('ai_chats', {
      method: 'PATCH',
      query: { user_id: `eq.${userId}` },
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Self-host ai_chats ${res.status}: ${text}`);
    }
    return;
  }
  await sbJson('ai_chats', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}

export async function upsertAiThreadCloud(
  userId: number,
  threadId: string,
  messages: AiChatLine[],
  session: unknown
): Promise<void> {
  const inbox = await loadAiInboxCloud(userId);
  const id = String(threadId || '').trim().slice(0, 48) || `t-${Date.now()}`;
  const prev = inbox.threads.find((t) => t.id === id);
  const nextMessages = sanitizeMessages(messages);
  const next: AiChatThread = {
    id,
    title: titleFromMessages(nextMessages, prev?.title || 'New chat'),
    messages: nextMessages,
    session: sanitizeSession(session),
    updatedAt: new Date().toISOString(),
  };
  const threads = [next, ...inbox.threads.filter((t) => t.id !== id)].slice(0, 40);
  await saveAiInboxCloud(userId, { threads, activeId: id });
}

export async function loadAiChatCloud(userId: number): Promise<StoredAiChat | null> {
  await ensureUserCache();
  const inbox = await loadAiInboxCloud(userId);
  const thread = inbox.threads.find((t) => t.id === inbox.activeId) || inbox.threads[0];
  if (!thread) return null;
  const u = findUserByIdCloudCached(userId);
  return {
    userId,
    threadId: thread.id,
    username: u?.username || '',
    fullName: u?.full_name || u?.username || `User ${userId}`,
    title: thread.title,
    messages: thread.messages,
    session: thread.session,
    updatedAt: thread.updatedAt,
    preview: previewFrom(thread.messages),
  };
}

export async function saveAiChatCloud(
  userId: number,
  messages: AiChatLine[],
  session: unknown,
  threadId?: string
): Promise<void> {
  await upsertAiThreadCloud(userId, threadId || 'legacy', messages, session);
}

export async function listAiChatsCloud(): Promise<StoredAiChat[]> {
  await ensureUserCache();
  const rows = await sbJson<any[]>('ai_chats', {
    query: { select: '*', order: 'updated_at.desc' },
  });
  const out: StoredAiChat[] = [];
  for (const row of rows) {
    const userId = Number(row.user_id);
    const u = findUserByIdCloudCached(userId);
    const inbox = parseAiInbox(row.messages_json, row.session_json, row.updated_at);
    for (const thread of inbox.threads) {
      if (!thread.messages.length) continue;
      out.push({
        userId,
        threadId: thread.id,
        username: u?.username || '',
        fullName: u?.full_name || u?.username || `User ${userId}`,
        title: thread.title,
        messages: thread.messages,
        session: thread.session,
        updatedAt: thread.updatedAt,
        preview: previewFrom(thread.messages),
      });
    }
  }
  out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return out;
}

export { EMPTY_SESSION, previewFrom };
