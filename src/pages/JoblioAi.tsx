import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Bot,
  FileSpreadsheet,
  Loader2,
  Plus,
  Send,
  Square,
  StickyNote,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type ChatRole = 'user' | 'assistant';
type ChatLine = { role: ChatRole; content: string };

type AiSession = {
  currentJobId: number | null;
  currentJobNo: string | null;
  currentJobName: string | null;
  currentContact: string | null;
  currentMaterial: string | null;
  currentSupplier: string | null;
  lastSearchTerms: string[];
};

type ChatThread = {
  id: string;
  title: string;
  messages: ChatLine[];
  session: AiSession;
  updatedAt: string;
};

const EMPTY_SESSION: AiSession = {
  currentJobId: null,
  currentJobNo: null,
  currentJobName: null,
  currentContact: null,
  currentMaterial: null,
  currentSupplier: null,
  lastSearchTerms: [],
};

function chatStoreKey(userId: number | undefined): string | null {
  if (!userId) return null;
  return `joblio-ai-chat-${userId}`;
}

function newThreadId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleFromMessages(messages: ChatLine[], fallback = 'New chat'): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim());
  if (!first) return fallback;
  const t = first.content.replace(/\s+/g, ' ').trim();
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

function previewFrom(messages: ChatLine[]): string {
  const last = [...messages].reverse().find((m) => m.content.trim());
  if (!last) return 'New chat';
  const t = last.content.replace(/\s+/g, ' ').trim();
  return t.length > 72 ? `${t.slice(0, 72)}…` : t;
}

function parseLocalInbox(raw: string | null): { threads: ChatThread[]; activeId: string | null } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && Array.isArray(parsed.threads) && Number(parsed.v) >= 2) {
      const threads = (parsed.threads as ChatThread[])
        .filter((t) => t && typeof t.id === 'string')
        .map((t) => ({
          id: t.id,
          title: t.title || titleFromMessages(t.messages || []),
          messages: Array.isArray(t.messages) ? t.messages : [],
          session: { ...EMPTY_SESSION, ...(t.session || {}) },
          updatedAt: t.updatedAt || new Date().toISOString(),
        }));
      const activeId =
        typeof parsed.activeId === 'string' && threads.some((t) => t.id === parsed.activeId)
          ? parsed.activeId
          : null;
      return { threads, activeId };
    }
    const messages = Array.isArray(parsed.messages) ? (parsed.messages as ChatLine[]) : [];
    if (!messages.length) return { threads: [], activeId: null };
    const id = 'legacy';
    return {
      threads: [
        {
          id,
          title: titleFromMessages(messages),
          messages,
          session: parsed.session ? { ...EMPTY_SESSION, ...(parsed.session as AiSession) } : EMPTY_SESSION,
          updatedAt: new Date().toISOString(),
        },
      ],
      activeId: id,
    };
  } catch {
    return null;
  }
}

type PriceFile = { name: string; size: number; updated_at: string };

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function JoblioAi() {
  const { token, isAdmin, user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [status, setStatus] = useState<{ ready: boolean; model: string; url: string; error?: string } | null>(
    null
  );
  const [files, setFiles] = useState<PriceFile[]>([]);
  const [notes, setNotes] = useState<{ count: number; recent: string[] }>({ count: 0, recent: [] });
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [aiSession, setAiSession] = useState<AiSession>(EMPTY_SESSION);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [usedWeb, setUsedWeb] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [aiStep, setAiStep] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [staffChats, setStaffChats] = useState<
    {
      userId: number;
      threadId: string;
      username: string;
      fullName: string;
      title: string;
      updatedAt: string | null;
      preview: string;
    }[]
  >([]);
  const [reviewKey, setReviewKey] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [reviewMessages, setReviewMessages] = useState<ChatLine[]>([]);
  const [serverStored, setServerStored] = useState(false);

  const canUse = isAdmin || !!user?.can_use_ai;
  const activeThread = threads.find((t) => t.id === activeId) || null;

  const persistInbox = useCallback(
    (nextThreads: ChatThread[], nextActive: string | null) => {
      if (token && serverStored && typeof window.tracker.aiSaveInbox === 'function') {
        void window.tracker.aiSaveInbox(token, { threads: nextThreads, activeId: nextActive });
        return;
      }
      const key = chatStoreKey(user?.id);
      if (!key) return;
      try {
        localStorage.setItem(key, JSON.stringify({ v: 2, threads: nextThreads, activeId: nextActive }));
      } catch {
        // quota
      }
    },
    [token, serverStored, user?.id]
  );

  function commitThread(
    threadId: string,
    nextMessages: ChatLine[],
    nextSession: AiSession,
    nextActive: string | null = threadId
  ) {
    const now = new Date().toISOString();
    setThreads((prev) => {
      const current = prev.find((t) => t.id === threadId);
      const next: ChatThread = {
        id: threadId,
        title: titleFromMessages(nextMessages, current?.title || 'New chat'),
        messages: nextMessages,
        session: nextSession,
        updatedAt: now,
      };
      const list = [next, ...prev.filter((t) => t.id !== threadId)];
      persistInbox(list, nextActive);
      return list;
    });
    setActiveId(nextActive);
    setMessages(nextMessages);
    setAiSession(nextSession);
  }

  useEffect(() => {
    if (!token || !user?.id) {
      setThreads([]);
      setActiveId(null);
      setMessages([]);
      setAiSession(EMPTY_SESSION);
      return;
    }
    let cancelled = false;
    void (async () => {
      const loaded = await window.tracker.aiLoadChat(token);
      if (cancelled) return;
      if ('error' in loaded) {
        setError(loaded.error);
        return;
      }
      setServerStored(!!loaded.stored);
      if (Array.isArray(loaded.threads) && loaded.threads.length) {
        const nextThreads = loaded.threads.map((t) => ({
          ...t,
          session: { ...EMPTY_SESSION, ...t.session },
        }));
        setThreads(nextThreads);
        const pick = loaded.activeId && nextThreads.some((t) => t.id === loaded.activeId)
          ? loaded.activeId
          : null;
        setActiveId(pick);
        const active = nextThreads.find((t) => t.id === pick);
        setMessages(active?.messages || []);
        setAiSession(active ? { ...EMPTY_SESSION, ...active.session } : EMPTY_SESSION);
        return;
      }
      const key = chatStoreKey(user.id);
      const local = key ? parseLocalInbox(localStorage.getItem(key)) : null;
      if (!local || !local.threads.length) {
        setThreads([]);
        setActiveId(null);
        setMessages([]);
        setAiSession(EMPTY_SESSION);
        return;
      }
      setThreads(local.threads);
      setActiveId(local.activeId);
      const active = local.threads.find((t) => t.id === local.activeId);
      setMessages(active?.messages || []);
      setAiSession(active?.session || EMPTY_SESSION);
      if (loaded.stored && local.threads.length) {
        await window.tracker.aiSaveInbox(token, local);
        if (key) localStorage.removeItem(key);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.id]);

  const load = useCallback(async () => {
    if (!token) return;
    const perms = await window.tracker.aiPermissions(token);
    if ('error' in perms) {
      setAllowed(false);
      setError(perms.error);
      return;
    }
    setAllowed(!!perms.can_use);
    if (!perms.can_use) return;
    const [st, list, noteList] = await Promise.all([
      window.tracker.aiStatus(token),
      window.tracker.aiListPriceFiles(token),
      window.tracker.aiListNotes(token),
    ]);
    if (!('error' in st)) setStatus(st);
    else setStatus({ ready: false, model: '', url: '', error: st.error });
    if (!('error' in list)) setFiles(list);
    if (!('error' in noteList)) setNotes(noteList);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window.tracker.onAiStatus !== 'function') return;
    return window.tracker.onAiStatus((label) => setAiStep(label));
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, activeId]);

  if (allowed === false && !canUse) {
    return <Navigate to="/board" replace />;
  }

  async function handleAddFiles() {
    if (!token) return;
    setError('');
    const result = await window.tracker.aiAddPriceFiles(token);
    if ('error' in result) setError(result.error);
    else if (!('cancelled' in result)) await load();
  }

  async function handleRemove(name: string) {
    if (!token) return;
    setError('');
    const result = await window.tracker.aiRemovePriceFile(token, name);
    if ('error' in result) setError(result.error);
    else await load();
  }

  function openThread(thread: ChatThread) {
    generation.current += 1;
    if (token && busy) void window.tracker.aiCancelChat(token);
    setBusy(false);
    setError('');
    setUsedWeb(false);
    setSavedNote(false);
    setDraft('');
    setActiveId(thread.id);
    setMessages(thread.messages);
    setAiSession(thread.session);
    persistInbox(threads, thread.id);
  }

  function handleNewChat() {
    generation.current += 1;
    if (token && busy) void window.tracker.aiCancelChat(token);
    const empty = threads.find((t) => t.messages.length === 0);
    if (empty) {
      openThread(empty);
      setBusy(false);
      return;
    }
    const id = newThreadId();
    const thread: ChatThread = {
      id,
      title: 'New chat',
      messages: [],
      session: EMPTY_SESSION,
      updatedAt: new Date().toISOString(),
    };
    const next = [thread, ...threads];
    setThreads(next);
    setActiveId(id);
    setMessages([]);
    setAiSession(EMPTY_SESSION);
    persistInbox(next, id);
    setBusy(false);
    setError('');
    setUsedWeb(false);
    setSavedNote(false);
    setDraft('');
  }

  function handleCloseChat() {
    generation.current += 1;
    if (token && busy) void window.tracker.aiCancelChat(token);
    const kept =
      activeId && messages.length === 0
        ? threads.filter((t) => t.id !== activeId)
        : threads;
    setThreads(kept);
    setActiveId(null);
    setMessages([]);
    setAiSession(EMPTY_SESSION);
    persistInbox(kept, null);
    setBusy(false);
    setError('');
    setUsedWeb(false);
    setSavedNote(false);
    setDraft('');
  }

  function handleDeleteChat(threadId: string) {
    generation.current += 1;
    if (token && busy && activeId === threadId) void window.tracker.aiCancelChat(token);
    const next = threads.filter((t) => t.id !== threadId);
    const nextActive = activeId === threadId ? null : activeId;
    setThreads(next);
    persistInbox(next, nextActive);
    if (activeId === threadId) {
      setActiveId(null);
      setMessages([]);
      setAiSession(EMPTY_SESSION);
      setBusy(false);
      setDraft('');
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!token || busy) return;
    const text = draft.trim();
    if (!text) return;
    const threadId = activeId;
    if (!threadId) {
      handleNewChat();
      return;
    }
    const next: ChatLine[] = [...messages, { role: 'user', content: text }];
    commitThread(threadId, next, aiSession);
    setDraft('');
    setBusy(true);
    setAiStep('Starting…');
    setError('');
    setUsedWeb(false);
    setSavedNote(false);
    const gen = ++generation.current;
    try {
      const result = await window.tracker.aiChat(token, next, aiSession, threadId);
      if (gen !== generation.current) return;
      if ('error' in result) {
        setError(result.error);
      } else if (result.cancelled) {
        commitThread(threadId, next.slice(0, -1), aiSession);
      } else {
        const withReply: ChatLine[] = [...next, { role: 'assistant', content: result.reply }];
        const nextSession = result.session || aiSession;
        commitThread(threadId, withReply, nextSession);
        setUsedWeb(!!result.used_web);
        setSavedNote(!!result.saved);
        if (result.saved) await load();
      }
    } catch (err: unknown) {
      if (gen !== generation.current) return;
      setError(err instanceof Error ? err.message : 'Chat failed.');
    } finally {
      if (gen === generation.current) {
        setBusy(false);
        setAiStep(null);
      }
    }
  }

  async function handleStop() {
    generation.current += 1;
    if (token) void window.tracker.aiCancelChat(token);
    setBusy(false);
    setAiStep(null);
    if (!activeId) return;
    const next =
      messages.length && messages[messages.length - 1]?.role === 'user'
        ? messages.slice(0, -1)
        : messages;
    commitThread(activeId, next, aiSession);
  }

  async function handleOpenReview() {
    if (!token || !isAdmin) return;
    const next = !reviewOpen;
    setReviewOpen(next);
    if (!next) {
      setReviewKey('');
      setReviewMessages([]);
      return;
    }
    const list = await window.tracker.aiListStaffChats(token);
    if ('error' in list) setError(list.error);
    else setStaffChats(list);
  }

  async function handlePickStaff(userId: number, threadId: string) {
    if (!token) return;
    setReviewKey(`${userId}:${threadId}`);
    const row = await window.tracker.aiLoadStaffChat(token, userId, threadId);
    if ('error' in row) {
      setError(row.error);
      return;
    }
    setReviewName(row.fullName || row.username);
    setReviewMessages(row.messages);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 lg:flex-row">
        <aside className="flex max-h-[48%] min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-ink-10 bg-card lg:max-h-none lg:w-72">
          <div className="flex min-h-0 flex-[3] flex-col border-b border-ink-10">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div>
                <h2 className="text-sm font-medium text-ink">Chats</h2>
                <p className="mt-0.5 text-xs text-ink-40">Yours only — start as many as you need</p>
              </div>
              <button type="button" className="jt-btn-ghost !px-2 !py-1 text-xs" onClick={handleNewChat}>
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {threads.length === 0 ? (
                <p className="px-2 py-3 text-xs text-ink-40">No chats yet. New starts a fresh one.</p>
              ) : (
                <ul className="space-y-1">
                  {threads.map((t) => (
                    <li key={t.id}>
                      <div
                        className={`flex items-start gap-1 rounded-xl px-2 py-1.5 ${
                          t.id === activeId ? 'bg-success/15' : 'hover:bg-ink-6'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => openThread(t)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-medium text-ink">{t.title || 'New chat'}</p>
                          <p className="truncate text-[11px] text-ink-40">{previewFrom(t.messages)}</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteChat(t.id)}
                          className="rounded-lg p-1 text-ink-40 hover:bg-danger/10 hover:text-danger"
                          title="Delete chat"
                          aria-label="Delete chat"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-[4] flex-col overflow-hidden">
            <div className="border-b border-ink-10 px-4 py-3">
              <h2 className="text-sm font-medium text-ink">Supplier lists</h2>
              <p className="mt-0.5 text-xs text-ink-40">One Excel per supplier is fine</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {files.length === 0 ? (
                <p className="px-1 py-3 text-xs text-ink-40">
                  No lists yet. Add the costing files you already use.
                </p>
              ) : (
                <ul className="space-y-1">
                  {files.map((f) => (
                    <li
                      key={f.name}
                      className="flex items-start gap-2 rounded-xl px-2 py-1.5 hover:bg-ink-6"
                    >
                      <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-ink-40" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{f.name}</p>
                        <p className="text-[10px] text-ink-40">{formatSize(f.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(f.name)}
                        className="rounded-lg p-1 text-ink-40 hover:bg-danger/10 hover:text-danger"
                        title="Remove from store"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 border-t border-ink-10 pt-3">
                <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-ink">
                  <StickyNote className="h-3.5 w-3.5 text-ink-40" />
                  Saved notes {notes.count ? `(${notes.count})` : ''}
                </p>
                {notes.recent.length === 0 ? (
                  <p className="px-1 pt-2 text-[11px] text-ink-40">
                    In chat, say “remember …” and it is stored for every PC.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {notes.recent.map((line) => (
                      <li key={line} className="px-1 text-[11px] leading-snug text-ink-55">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="border-t border-ink-10 p-3">
              <button type="button" onClick={handleAddFiles} className="jt-btn-ghost w-full justify-center">
                <Plus className="h-4 w-4" />
                Add price file
              </button>
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-ink-10 bg-card">
          <div className="border-b border-ink-10 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 font-display text-lg text-ink">
                  <Bot className="h-5 w-5 shrink-0 text-success" aria-hidden />
                  {activeThread ? activeThread.title : 'Joblio AI'}
                </h1>
                <p className="text-xs text-ink-55">
                  {activeThread
                    ? 'Chatbot for staff — jobs and prices when you need them.'
                    : 'Pick a chat on the left, or start a new one.'}
                </p>
                {activeThread && (aiSession.currentJobNo || aiSession.currentJobName) ? (
                  <p className="mt-1 text-[11px] text-ink-40">
                    Talking about {aiSession.currentJobNo ? `${aiSession.currentJobNo} ` : ''}
                    {aiSession.currentJobName || ''}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right text-[11px] text-ink-40">
                {status?.ready ? (
                  <span>
                    Ready · {status.model}
                    <span className="mt-0.5 block max-w-[16rem] truncate" title={status.url}>
                      {status.url}
                    </span>
                  </span>
                ) : (
                  <span className="text-danger">{status?.error || 'Checking Joblio AI…'}</span>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  {activeThread && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-ink-40 underline-offset-2 hover:text-ink hover:underline"
                      onClick={handleCloseChat}
                    >
                      <X className="h-3 w-3" />
                      Close
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-[11px] text-ink-40 underline-offset-2 hover:text-ink hover:underline"
                      onClick={() => void handleOpenReview()}
                    >
                      {reviewOpen ? 'Hide staff chats' : 'Review staff chats'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-ink-40">
              Your chats are private to your login. Admins can review them if needed.
            </p>
            {reviewOpen && isAdmin && (
              <div className="mt-3 rounded-xl border border-ink-10 bg-canvas p-2">
                <p className="px-1 pb-1 text-[11px] font-medium text-ink">Staff chats (admin only)</p>
                <div className="flex max-h-36 flex-col gap-1 overflow-y-auto">
                  {staffChats.length === 0 ? (
                    <p className="px-1 text-[11px] text-ink-40">No stored chats yet — or the server table is not installed.</p>
                  ) : (
                    staffChats.map((c) => (
                      <button
                        key={`${c.userId}:${c.threadId}`}
                        type="button"
                        onClick={() => void handlePickStaff(c.userId, c.threadId)}
                        className={`rounded-lg px-2 py-1 text-left text-[11px] ${
                          reviewKey === `${c.userId}:${c.threadId}`
                            ? 'bg-ink-10 text-ink'
                            : 'text-ink-55 hover:bg-ink-6'
                        }`}
                      >
                        <span className="font-medium text-ink">{c.fullName || c.username}</span>
                        <span className="mt-0.5 block truncate text-ink-40">
                          {c.title} · {c.preview}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                {reviewMessages.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-ink-10 bg-card p-2">
                    <p className="mb-1 text-[11px] text-ink-40">Read-only · {reviewName}</p>
                    {reviewMessages.map((m, i) => (
                      <p key={`${m.role}-${i}`} className="mb-1.5 whitespace-pre-wrap text-[11px] leading-snug text-ink">
                        <span className="text-ink-40">{m.role === 'user' ? 'Staff' : 'AI'}: </span>
                        {m.content}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!activeThread && (
              <div className="mx-auto max-w-lg space-y-3 py-8 text-center text-sm text-ink-55">
                <p>Your chats live in the list on the left. Nothing is lost when you close one.</p>
                <button type="button" className="jt-btn-accent mx-auto" onClick={handleNewChat}>
                  <Plus className="h-4 w-4" />
                  New chat
                </button>
                <p className="text-xs text-ink-40">
                  Chat like a colleague. Ask about jobs or prices when you need to. remember … saves a note for everyone.
                </p>
              </div>
            )}
            {activeThread && messages.length === 0 && (
              <div className="mx-auto max-w-lg space-y-2 py-8 text-center text-sm text-ink-55">
                <p>Chat like a colleague. Ask anything — including jobs and prices.</p>
                <p>Jobs: “What stage is job 4521?” or “Who is on the Nike sign?”</p>
                <p className="text-xs text-ink-40">
                  remember … saves a supplier note for everyone. Price lists on the left feed ballparks.
                </p>
              </div>
            )}
            {activeThread && (
              <div className="space-y-3">
                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.role === 'user' ? 'ml-auto bg-brand/15 text-ink' : 'bg-surface-soft text-ink'
                    }`}
                  >
                    {m.content}
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-sm text-ink-40">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span>{aiStep || 'Working…'}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="px-4 pb-1 text-sm text-danger">{error}</p>}
          {savedNote && (
            <p className="px-4 pb-1 text-[11px] text-ink-40">Saved on the share for every PC.</p>
          )}
          {usedWeb && (
            <p className="flex items-center gap-1.5 px-4 pb-1 text-[11px] text-ink-40">
              <Wifi className="h-3.5 w-3.5" />
              Included a live web search from this PC.
            </p>
          )}

          {activeThread ? (
            <>
              {busy && (
                <div className="flex items-center gap-2 border-t border-ink-10 bg-surface-soft px-4 py-1.5 text-[11px] text-ink-55">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  <span className="truncate">{aiStep || 'Working…'}</span>
                </div>
              )}
            <form onSubmit={handleSend} className="flex gap-2 border-t border-ink-10 p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Message Joblio AI…"
                className="jt-input min-w-0 flex-1"
                disabled={busy}
              />
              {busy ? (
                <button type="button" className="jt-btn-ghost" onClick={handleStop}>
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!draft.trim()} className="jt-btn-accent disabled:opacity-40">
                  <Send className="h-4 w-4" />
                  Send
                </button>
              )}
            </form>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
