import { useMemo, useRef, useState } from 'react';
import type { ReactNode, KeyboardEvent, ChangeEvent } from 'react';
import { AtSign } from 'lucide-react';

export interface MentionUser {
  id: number;
  full_name: string;
}

/** Users whose "@Full Name" appears in the text — the ids to notify. */
export function extractMentionIds(text: string, users: MentionUser[]): number[] {
  return users.filter((u) => u.full_name && text.includes('@' + u.full_name)).map((u) => u.id);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Render a note body with @mentions highlighted. */
export function renderNoteBody(body: string, users: MentionUser[]): ReactNode {
  const names = users
    .map((u) => u.full_name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return body;

  const pattern = new RegExp(`@(?:${names.map(escapeRegExp).join('|')})`, 'g');
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index));
    parts.push(
      <span
        key={`${match.index}-${match[0]}`}
        className="rounded bg-brand/10 px-1 py-0.5 font-medium text-brand"
      >
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (parts.length === 0) return body;
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return parts;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  users: MentionUser[];
  placeholder?: string;
}

/**
 * Multi-line note composer with an @mention picker.
 * Enter = new line; Ctrl/Cmd+Enter = send. Type "@" to mention.
 */
export default function MentionInput({ value, onChange, onSubmit, users, placeholder }: MentionInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const activeToken = useMemo(() => {
    const before = value.slice(0, caret);
    const match = /(^|\s)@([^@\n]*)$/.exec(before);
    if (!match) return null;
    const query = match[2];
    const start = before.length - query.length - 1;
    return { query, start };
  }, [value, caret]);

  const suggestions = useMemo(() => {
    if (!activeToken) return [];
    const q = activeToken.query.toLowerCase().trim();
    return users
      .filter((u) => u.full_name)
      .filter((u) => q === '' || u.full_name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [activeToken, users]);

  const pickerOpen = !pickerDismissed && activeToken !== null && suggestions.length > 0;

  function syncCaret() {
    setCaret(inputRef.current?.selectionStart ?? 0);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    setPickerDismissed(false);
    setHighlight(0);
    setCaret(e.target.selectionStart ?? e.target.value.length);
  }

  function pick(user: MentionUser) {
    if (!activeToken) return;
    const insertion = '@' + user.full_name + ' ';
    const next = value.slice(0, activeToken.start) + insertion + value.slice(caret);
    onChange(next);
    setPickerDismissed(true);
    const newCaret = activeToken.start + insertion.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCaret, newCaret);
      setCaret(newCaret);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (pickerOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(suggestions[highlight]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPickerDismissed(true);
        return;
      }
    }
    // Ctrl/Cmd+Enter sends; plain Enter inserts a line break (textarea default)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative flex-1">
      {pickerOpen && (
        <div className="jt-anim-panel absolute bottom-full left-0 z-20 mb-1.5 w-64 overflow-hidden rounded-xl border border-ink-10 bg-canvas shadow-raised">
          <div className="flex items-center gap-1.5 border-b border-ink-10 bg-surface-soft/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-caps text-ink-40">
            <AtSign className="h-3 w-3" />
            Mention a teammate
          </div>
          {suggestions.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(u);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                i === highlight ? 'bg-brand/10 text-ink' : 'text-ink-90'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-ink">
                {u.full_name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{u.full_name}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={syncCaret}
        onKeyUp={syncCaret}
        onSelect={syncCaret}
        onBlur={() => setPickerDismissed(true)}
        placeholder={placeholder}
        spellCheck
        rows={2}
        className="jt-input w-full resize-none"
      />
    </div>
  );
}
