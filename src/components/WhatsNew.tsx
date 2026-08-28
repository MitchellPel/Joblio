import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { CHANGELOG, latestChangelog, type ChangelogEntry } from '../data/changelog';

const SEEN_KEY = 'joblio-whats-new-seen';

interface Props {
  /** When true, always show (e.g. opened from Settings). */
  forceOpen?: boolean;
  onClose?: () => void;
}

export default function WhatsNew({ forceOpen = false, onClose }: Props) {
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = await window.tracker.getVersion().catch(() => '');
      if (cancelled) return;
      setVersion(v);
      const match = CHANGELOG.find((e) => e.version === v) || latestChangelog();
      setEntry(match);
      if (forceOpen) {
        setOpen(true);
        return;
      }
      const seen = localStorage.getItem(SEEN_KEY);
      if (seen !== v) setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [forceOpen]);

  function dismiss() {
    if (version) localStorage.setItem(SEEN_KEY, version);
    setOpen(false);
    onClose?.();
  }

  if (!open || !entry) return null;

  return (
    <div
      className="jt-anim-overlay fixed inset-0 z-[130] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="jt-anim-panel w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-10 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15">
              <Sparkles className="h-4 w-4 text-brand" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">What&apos;s New</p>
              <p className="text-xs text-ink-40">
                Joblio {entry.version}
                {entry.date ? ` · ${entry.date}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-1 text-ink-40 hover:bg-ink-6 hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="jt-scroll max-h-[50vh] space-y-2 overflow-y-auto px-5 py-4">
          {entry.highlights.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-ink-90">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-ink-10 px-5 py-3">
          <button type="button" className="jt-btn-accent w-full" onClick={dismiss}>
            Got it — I&apos;ll test these
          </button>
        </div>
      </div>
    </div>
  );
}
