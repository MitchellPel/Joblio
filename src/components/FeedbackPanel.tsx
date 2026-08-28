import { useCallback, useEffect, useState } from 'react';
import { Bug, Check, Megaphone, Send } from 'lucide-react';
import type { AppFeedback, FeedbackKind } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';

function kindLabel(kind: FeedbackKind): string {
  return kind === 'change' ? 'Change' : 'Bug';
}

function when(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function FeedbackPanel() {
  const { token, isAdmin, user } = useAuth();
  const [items, setItems] = useState<AppFeedback[]>([]);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      try {
        const result = await window.tracker.listFeedback(token);
        if ('error' in result) {
          if (!silent) setError(result.error);
          return;
        }
        setItems(result);
        setError('');
        if (isAdmin) {
          await window.tracker.markFeedbackSeen(token);
          window.dispatchEvent(new Event('joblio:feedback-refresh'));
        }
      } catch (err: unknown) {
        if (!silent) setError(err instanceof Error ? err.message : 'Could not load reports.');
      }
    },
    [token, isAdmin]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useDbSync(() => {
    void load(true);
  }, !!token);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || saving) return;
    const text = body.trim();
    if (text.length < 4) {
      setError('Please describe the bug or change.');
      return;
    }
    setSaving(true);
    setError('');
    const result = await window.tracker.createFeedback(token, { kind, body: text });
    setSaving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setBody('');
    await load();
  }

  async function handleDone(id: number) {
    if (!token) return;
    const result = await window.tracker.markFeedbackDone(token, id);
    if ('error' in result) setError(result.error);
    else await load();
  }

  const shown = items.filter((item) => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  return (
    <div className="jt-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-ink-55" />
        <h2 className="text-base font-medium text-ink">Bugs &amp; changes</h2>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-ink-55">
        {isAdmin
          ? 'Staff reports land here. Mark one done when you have shipped or declined it.'
          : 'Report a bug or a change you want. You only see your own posts. Admin is notified.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="inline-flex rounded-lg border border-ink-10 bg-surface-soft p-1">
          <button
            type="button"
            onClick={() => setKind('bug')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              kind === 'bug' ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
            }`}
          >
            <Bug className="h-3.5 w-3.5" />
            Bug
          </button>
          <button
            type="button"
            onClick={() => setKind('change')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              kind === 'change' ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:text-ink'
            }`}
          >
            Change
          </button>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={kind === 'bug' ? 'What went wrong, and where?' : 'What should change?'}
          className="jt-input min-h-[4.5rem] resize-y"
        />
        <div className="flex justify-end">
          <button type="submit" disabled={saving || !body.trim()} className="jt-btn-accent disabled:opacity-40">
            <Send className="h-4 w-4" />
            {saving ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-5 border-t border-ink-10 pt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-40">
            {isAdmin ? 'All reports' : 'Your reports'}
          </p>
          <div className="inline-flex rounded-lg border border-ink-10 bg-surface-soft p-0.5 text-xs">
            {(['open', 'done', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-md px-2 py-1 capitalize ${
                  filter === f ? 'bg-card text-ink shadow-ring' : 'text-ink-55'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="py-3 text-sm text-ink-40">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((item) => (
              <li key={item.id} className="rounded-xl border border-ink-10 bg-surface-soft px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-pill px-1.5 py-0.5 text-[10px] font-medium ${
                          item.kind === 'bug'
                            ? 'bg-danger/10 text-danger'
                            : 'bg-brand/15 text-brand'
                        }`}
                      >
                        {kindLabel(item.kind)}
                      </span>
                      <span
                        className={`rounded-pill px-1.5 py-0.5 text-[10px] font-medium ${
                          item.status === 'done'
                            ? 'bg-success/10 text-success'
                            : 'bg-ink-6 text-ink-55'
                        }`}
                      >
                        {item.status === 'done' ? 'Done' : 'Open'}
                      </span>
                      {isAdmin && item.created_by !== user?.id && (
                        <span className="text-[11px] text-ink-40">{item.created_name || 'Staff'}</span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-ink">{item.body}</p>
                    <p className="mt-1 text-[11px] text-ink-40">
                      {when(item.created_at)}
                      {item.status === 'done' && item.done_name ? ` · done by ${item.done_name}` : ''}
                    </p>
                  </div>
                  {isAdmin && item.status === 'open' && (
                    <button
                      type="button"
                      onClick={() => handleDone(item.id)}
                      className="jt-btn-ghost shrink-0 !py-1 text-xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Done
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
