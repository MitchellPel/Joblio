import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Job } from '@/shared-types';
import { STAGES } from '../data/stages';

export default function GlobalSearch() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setActive(0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        close();
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('joblio:open-search', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('joblio:open-search', onOpen);
    };
  }, [close, open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !token) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const result = await window.tracker.searchJobs(token, query.trim());
      if (Array.isArray(result)) {
        setResults(result);
        setActive(0);
      }
      setLoading(false);
    }, 160);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, query, token]);

  function goTo(job: Job) {
    close();
    navigate(`/jobs/${job.id}`);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      goTo(results[active]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="jt-anim-overlay fixed inset-0 z-[120] flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={close}
    >
      <div
        className="jt-anim-panel w-full max-w-xl overflow-hidden rounded-2xl bg-card shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ink-10 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-ink-40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search jobs by number, name, client…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-40"
          />
          <kbd className="hidden rounded border border-ink-10 bg-ink-6 px-1.5 py-0.5 text-[10px] text-ink-40 sm:inline">
            Esc
          </kbd>
          <button type="button" onClick={close} className="rounded-lg p-1 text-ink-40 hover:bg-ink-6 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="jt-scroll max-h-[50vh] overflow-y-auto">
          {loading && (
            <p className="px-4 py-6 text-center text-sm text-ink-40">Searching…</p>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-40">No jobs found</p>
          )}
          {!loading && !query.trim() && (
            <p className="px-4 py-6 text-center text-sm text-ink-40">
              Type to search · press <span className="font-medium text-ink-55">Ctrl+K</span> anytime
            </p>
          )}
          {results.map((job, i) => {
            const stage = STAGES.find((s) => s.key === job.stage);
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => goTo(job)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === active ? 'bg-ink-6' : 'hover:bg-ink-6'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-brand">{job.job_no}</span>
                    {job.archived_at && (
                      <span className="rounded bg-ink-6 px-1.5 py-0.5 text-[10px] uppercase text-ink-40">
                        Archived
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-ink">{job.job_name}</p>
                  <p className="truncate text-xs text-ink-40">
                    {job.client || '—'}
                    {job.assigned_name ? ` · ${job.assigned_name}` : ''}
                  </p>
                </div>
                {stage && (
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${stage.color} ${stage.textColor}`}>
                    {stage.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
