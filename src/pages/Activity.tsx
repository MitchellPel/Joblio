import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDbSync } from '../hooks/useDbSync';
import type { ActivityItem, User } from '@/shared-types';
import AssignedNameBubble from '../components/AssignedNameBubble';
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

function kindLabel(kind: ActivityItem['kind']): string {
  switch (kind) {
    case 'stage':
      return 'Stage';
    case 'note':
      return 'Comment';
    case 'mention':
      return 'Mention';
    case 'created':
      return 'New job';
    case 'archived':
      return 'Archive';
    default:
      return 'Activity';
  }
}

function KindIcon({ kind }: { kind: ActivityItem['kind'] }) {
  const cls = 'h-3.5 w-3.5 text-brand';
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

const EVERYONE = '__everyone__';

export default function ActivityPage() {
  const { token, user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [colorByName, setColorByName] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [person, setPerson] = useState(EVERYONE);

  const load = useCallback(async () => {
    if (!token) return;
    const result = await window.tracker.listActivity(token);
    if (Array.isArray(result)) setItems(result);
    if (isAdmin) {
      const users = await window.tracker.listUsers(token);
      if (Array.isArray(users)) {
        const map: Record<string, string | null> = {};
        for (const u of users as User[]) {
          map[u.full_name.trim().toLowerCase()] = u.board_color;
        }
        setColorByName(map);
      }
    } else if (user?.full_name) {
      setColorByName({ [user.full_name.trim().toLowerCase()]: user.board_color });
    }
    setLoading(false);
  }, [token, isAdmin, user?.full_name, user?.board_color]);

  useEffect(() => {
    load();
  }, [load]);

  useDbSync(load);

  const people = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const name = item.actor_name.trim() || 'Someone';
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  useEffect(() => {
    if (person !== EVERYONE && !people.some(([name]) => name === person)) {
      setPerson(EVERYONE);
    }
  }, [people, person]);

  const hasPickedDefault = useRef(false);

  useEffect(() => {
    if (hasPickedDefault.current || !user?.full_name || items.length === 0) return;
    const mine = user.full_name.trim();
    if (people.some(([name]) => name === mine)) {
      setPerson(mine);
      hasPickedDefault.current = true;
    }
  }, [items.length, people, user?.full_name]);

  const visible = person === EVERYONE ? items : items.filter((i) => i.actor_name.trim() === person);

  function colorFor(name: string): string | null {
    return colorByName[name.trim().toLowerCase()] ?? null;
  }

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
            <p className="mt-0.5 text-sm text-ink-55">What each person has been doing</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav
          className="jt-scroll w-52 shrink-0 overflow-y-auto border-r border-ink-10 bg-surface-soft/60 px-2 py-3"
          aria-label="People"
        >
          <p className="jt-eyebrow mb-2 px-2">People</p>
          <button
            type="button"
            onClick={() => setPerson(EVERYONE)}
            className={`mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
              person === EVERYONE ? 'bg-card text-ink shadow-ring' : 'text-ink-55 hover:bg-ink-6 hover:text-ink'
            }`}
          >
            <span className="font-medium">Everyone</span>
            <span className="text-[11px] text-ink-40">{items.length}</span>
          </button>
          <ul className="space-y-0.5">
            {people.map(([name, count]) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => setPerson(name)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    person === name ? 'bg-card shadow-ring' : 'hover:bg-ink-6'
                  }`}
                >
                  <AssignedNameBubble name={name} color={colorFor(name)} className="!text-[11px]" />
                  <span className="shrink-0 text-[11px] text-ink-40">{count}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="jt-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && <p className="py-8 text-center text-sm text-ink-40">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-40">No activity yet</p>
          )}
          {!loading && items.length > 0 && visible.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-40">Nothing for this person yet</p>
          )}
          <ul className="mx-auto max-w-2xl">
            {visible.map((item, index) => {
              const prev = visible[index - 1];
              const showName = person === EVERYONE && prev?.actor_name !== item.actor_name;
              return (
                <li key={item.id} className={index === 0 ? '' : 'border-t border-ink-10/80'}>
                  {showName && (
                    <div className="pb-1 pt-4 first:pt-0">
                      <AssignedNameBubble name={item.actor_name} color={colorFor(item.actor_name)} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(`/jobs/${item.job_id}`)}
                    className="flex w-full items-start gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-ink-6"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10">
                      <KindIcon kind={item.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="mb-0.5 inline-block text-[10px] font-medium uppercase tracking-caps text-ink-40">
                        {kindLabel(item.kind)}
                      </span>
                      <span className="block text-sm text-ink">
                        {person !== EVERYONE ? (
                          <span className="text-ink-90">{item.summary}</span>
                        ) : (
                          <>
                            <span className="font-medium">{item.actor_name}</span>
                            {' '}
                            <span className="text-ink-55">{item.summary}</span>
                          </>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-40">
                        {item.job_no ? `${item.job_no} · ` : ''}
                        {item.job_name}
                      </span>
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-ink-40">
                      {formatWhen(item.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
