import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Mention, QuoteSizeMention } from '@/shared-types';
import { useDbSync } from '../hooks/useDbSync';

function formatWhen(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Must sit above Board / DnD stacking — not inside the navbar paint order. */
const PANEL_Z = 20000;

export default function MentionsBell() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [quoteMentions, setQuoteMentions] = useState<QuoteSizeMention[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<{ id: number; job_name: string }[]>([]);
  const [quoteDone, setQuoteDone] = useState<{ id: number; job_name: string }[]>([]);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setMentions([]);
      setQuoteMentions([]);
      setQuoteRequests([]);
      setQuoteDone([]);
      return;
    }
    const [jobMentions, qsMentions, unseenIds, quotes] = await Promise.all([
      window.tracker.listUnseenMentions(token),
      window.tracker.listUnseenQuoteSizeMentions(token),
      window.tracker.listUnseenQuoteSizeIds(token),
      window.tracker.listQuoteSizes(token),
    ]);
    if (Array.isArray(jobMentions)) setMentions(jobMentions);
    if (Array.isArray(qsMentions)) setQuoteMentions(qsMentions);
    const ids = Array.isArray(unseenIds) ? unseenIds : [];
    if (Array.isArray(quotes)) {
      const idSet = new Set(ids);
      setQuoteRequests(
        quotes.filter((q) => idSet.has(q.id)).map((q) => ({ id: q.id, job_name: q.job_name }))
      );
      if (user) {
        setQuoteDone(
          quotes
            .filter((q) => q.status === 'done' && q.created_by === user.id && !q.archived_at)
            .map((q) => ({ id: q.id, job_name: q.job_name }))
        );
      } else {
        setQuoteDone([]);
      }
    } else {
      setQuoteRequests([]);
      setQuoteDone([]);
    }
  }, [token, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useDbSync(() => {
    void refresh();
  }, !!token);

  useEffect(() => {
    const unsubNew = window.tracker.onMentionsChanged(() => {
      refresh();
    });
    const unsubQs = window.tracker.onQuoteSizesChanged(() => {
      refresh();
    });
    const unsubOpen = window.tracker.onMentionOpen((payload) => {
      navigate(`/jobs/${payload.job_id}`);
      setOpen(false);
    });
    const unsubQsOpen = window.tracker.onQuoteSizeOpen((payload) => {
      navigate(`/quote-sizes?id=${payload.quote_size_id}`);
      setOpen(false);
    });
    const onRefresh = () => refresh();
    window.addEventListener('joblio:mentions-refresh', onRefresh);
    return () => {
      unsubNew();
      unsubQs();
      unsubOpen();
      unsubQsOpen();
      window.removeEventListener('joblio:mentions-refresh', onRefresh);
    };
  }, [navigate, refresh]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPanelPos(null);
      return;
    }
    const rect = btnRef.current.getBoundingClientRect();
    setPanelPos({
      top: Math.round(rect.bottom + 4),
      right: Math.round(window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function openMention(m: Mention) {
    setOpen(false);
    navigate(`/jobs/${m.job_id}`);
  }

  function openQuote(id: number) {
    setOpen(false);
    navigate(`/quote-sizes?id=${id}`);
  }

  const count = mentions.length + quoteMentions.length + quoteRequests.length + quoteDone.length;

  const panel =
    open && panelPos
      ? createPortal(
          <div
            ref={panelRef}
            className="jt-anim-panel fixed w-80 overflow-hidden rounded-xl border border-ink-10 bg-card shadow-raised"
            style={{ top: panelPos.top, right: panelPos.right, zIndex: PANEL_Z }}
            role="dialog"
            aria-label="Alerts"
          >
            <div className="border-b border-ink-10 px-3 py-2">
              <p className="text-sm font-medium text-ink">Alerts</p>
              <p className="text-[11px] text-ink-40">
                {count === 0 ? "You're all caught up" : `${count} unread`}
              </p>
            </div>
            <div className="jt-scroll max-h-80 overflow-y-auto">
              {count === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-40">
                  No new mentions or cut / print requests
                </p>
              ) : (
                <>
                  {quoteRequests.length > 0 && (
                    <div className="border-b border-ink-6 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-caps text-ink-40">
                      Cut / Print List
                    </div>
                  )}
                  {quoteRequests.map((q) => (
                    <button
                      key={`qs-${q.id}`}
                      type="button"
                      onClick={() => openQuote(q.id)}
                      className="flex w-full flex-col gap-0.5 border-b border-ink-6 px-3 py-2.5 text-left transition-colors hover:bg-ink-6"
                    >
                      <span className="truncate text-sm font-medium text-ink">{q.job_name}</span>
                      <p className="text-xs text-ink-55">New cut / print request</p>
                    </button>
                  ))}
                  {quoteDone.length > 0 && (
                    <div className="border-b border-ink-6 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-caps text-ink-40">
                      Marked done
                    </div>
                  )}
                  {quoteDone.map((q) => (
                    <button
                      key={`qd-${q.id}`}
                      type="button"
                      onClick={() => openQuote(q.id)}
                      className="flex w-full flex-col gap-0.5 border-b border-ink-6 px-3 py-2.5 text-left transition-colors hover:bg-ink-6"
                    >
                      <span className="truncate text-sm font-medium text-ink">{q.job_name}</span>
                      <p className="text-xs text-ink-55">Staff marked this done — Complete to file it</p>
                    </button>
                  ))}
                  {quoteMentions.map((m) => (
                    <button
                      key={`qm-${m.id}`}
                      type="button"
                      onClick={() => openQuote(m.quote_size_id)}
                      className="flex w-full flex-col gap-0.5 border-b border-ink-6 px-3 py-2.5 text-left transition-colors hover:bg-ink-6"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">
                          {m.author_name} · {m.job_name}
                        </span>
                        <span className="shrink-0 text-[10px] text-ink-40">
                          {formatWhen(m.created_at)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs text-ink-55">{m.note_body}</p>
                    </button>
                  ))}
                  {mentions.length > 0 && (
                    <div className="border-b border-ink-6 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-caps text-ink-40">
                      Mentions
                    </div>
                  )}
                  {mentions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => openMention(m)}
                      className="flex w-full flex-col gap-0.5 border-b border-ink-6 px-3 py-2.5 text-left transition-colors hover:bg-ink-6"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-ink">
                          {m.author_name} · {m.job_no}
                        </span>
                        <span className="shrink-0 text-[10px] text-ink-40">
                          {formatWhen(m.created_at)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs text-ink-55">{m.note_body}</p>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refresh();
        }}
        className="relative rounded-lg p-2 text-ink-55 transition-colors hover:bg-ink-6 hover:text-ink"
        aria-label={count > 0 ? `${count} unread alerts` : 'Alerts'}
        aria-expanded={open}
        title="Mentions and Cut / Print List"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {panel}
    </>
  );
}
