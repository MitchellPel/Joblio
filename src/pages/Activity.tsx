import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';
import type { ActivityItem } from '@/shared-types';
import { Activity, Archive, AtSign, FilePlus, MessageSquare, MoveRight } from 'lucide-react';

function formatWhen(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function KindIcon({ kind }: { kind: ActivityItem['kind'] }) {
  const cls = 'h-4 w-4 text-brand';
  switch (kind) {
    case 'stage':
      return <MoveRight className={cls} />;
    case 'note':
      return <MessageSquare className={cls} />;
    case 'mention':
      return <AtSign className={cls} />;
    case 'created':
      return <FilePlus className={cls} />;
    case 'archived':
      return <Archive className={cls} />;
    default:
      return <Activity className={cls} />;
  }
}

export default function ActivityPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    const result = await window.tracker.listActivity(token);
    if (Array.isArray(result)) setItems(result);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useDbSync(load);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-ink-10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/board')}
            className="jt-btn-ghost !py-1.5 text-sm"
          >
            ← Board
          </button>
          <div>
            <h1 className="jt-section-title">Activity</h1>
            <p className="mt-0.5 text-sm text-ink-55">Recent moves, comments, mentions, and archives</p>
          </div>
        </div>
      </div>
      <div className="jt-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && <p className="py-8 text-center text-sm text-ink-40">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-40">No activity yet</p>
        )}
        <ul className="mx-auto max-w-2xl space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => navigate(`/jobs/${item.job_id}`)}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ink-6"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10">
                  <KindIcon kind={item.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">
                    <span className="font-medium">{item.actor_name}</span>
                    {' '}
                    <span className="text-ink-55">{item.summary}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-40">
                    {item.job_no} · {item.job_name}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-40">{formatWhen(item.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
