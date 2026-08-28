import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, Check, ChevronDown, ImageIcon, Paperclip, Pencil, Plus, Printer, Scissors, Send, Trash2, X } from 'lucide-react';
import type { QuoteSize, QuoteSizeNote } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { userCanManageQuoteSizes } from '../utils/permissions';
import { useDbSync } from '../hooks/useDbSync';
import AppModal from '../components/AppModal';
import MentionInput, { extractMentionIds, renderNoteBody, type MentionUser } from '../components/MentionInput';
import { bytesFromBase64, bytesToBase64, compressImageForUpload } from '../utils/proofBytes';
import { printImageBlob } from '../utils/printImage';

function formatWhen(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function QuoteThumb({
  id,
  token,
  className,
}: {
  id: number;
  token: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    void (async () => {
      const result = await window.tracker.getQuoteSizeThumb(token, id);
      if (!active || 'error' in result) return;
      const blob = new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type });
      const url = URL.createObjectURL(blob);
      revoked = url;
      setSrc(url);
    })();
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [id, token]);
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-surface text-ink-40 ${className || ''}`}>
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }
  return <img src={src} alt="" className={`object-cover ${className || ''}`} />;
}

function NoteThumb({
  noteId,
  token,
  className,
}: {
  noteId: number;
  token: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    void (async () => {
      const result = await window.tracker.getQuoteSizeNoteThumb(token, noteId);
      if (!active || 'error' in result) return;
      const blob = new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type });
      const url = URL.createObjectURL(blob);
      revoked = url;
      setSrc(url);
    })();
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [noteId, token]);
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-surface text-ink-40 ${className || ''}`}>
        <ImageIcon className="h-5 w-5" />
      </div>
    );
  }
  return <img src={src} alt="" className={`object-cover ${className || ''}`} />;
}

export default function QuoteSizes() {
  const { token, user, refreshSession } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<QuoteSize[]>([]);
  const [completed, setCompleted] = useState<QuoteSize[]>([]);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [unseenIds, setUnseenIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState<QuoteSizeNote[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteError, setNoteError] = useState('');
  const [teamUsers, setTeamUsers] = useState<MentionUser[]>([]);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QuoteSize | null>(null);
  const [jobName, setJobName] = useState('');
  const [scope, setScope] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [chatImage, setChatImage] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = useMemo(
    () => items.find((q) => q.id === selectedId) || completed.find((q) => q.id === selectedId) || null,
    [items, completed, selectedId]
  );
  const canPost = userCanManageQuoteSizes(user);
  const canManage = Boolean(user && selected && (canPost || selected.created_by === user.id));
  const isFiled = Boolean(selected?.archived_at);

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      try {
        if (!silent) setLoading(true);
        const [list, doneList, unseen] = await Promise.all([
          window.tracker.listQuoteSizes(token),
          window.tracker.listCompletedQuoteSizes(token),
          window.tracker.listUnseenQuoteSizeIds(token),
        ]);
        if ('error' in list) setError(list.error);
        else {
          setItems(list);
          setError('');
        }
        if (Array.isArray(doneList)) setCompleted(doneList);
        if (Array.isArray(unseen)) setUnseenIds(new Set(unseen));
      } catch (err: any) {
        setError(err?.message || 'Failed to load Cut / Print List');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (!token) return;
    void load();
    window.tracker.listStaff(token).then((result) => {
      if (Array.isArray(result)) setTeamUsers(result);
    });
  }, [token, load]);

  useDbSync(() => {
    void refreshSession();
    void load(true);
  }, !!token);

  useEffect(() => {
    if (!token) return;
    const unsub = window.tracker.onQuoteSizesChanged(() => {
      void load(true);
      window.dispatchEvent(new CustomEvent('joblio:mentions-refresh'));
    });
    return unsub;
  }, [token, load]);

  useEffect(() => {
    const fromUrl = Number(params.get('id') || 0);
    if (fromUrl > 0) setSelectedId(fromUrl);
  }, [params]);

  useEffect(() => {
    if (!token || !selectedId) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await window.tracker.listQuoteSizeNotes(token, selectedId);
      if (cancelled) return;
      if (Array.isArray(result)) setNotes(result);
      await window.tracker.markQuoteSizesSeen(token, [selectedId]);
      const marked = await window.tracker.markQuoteSizeMentionsSeen(token, selectedId);
      setUnseenIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedId);
        return next;
      });
      if (marked && 'marked' in marked && marked.marked > 0) {
        window.dispatchEvent(new CustomEvent('joblio:mentions-refresh'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, selectedId]);

  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [notes.length, selectedId]);

  function openItem(id: number) {
    setSelectedId(id);
    setParams({ id: String(id) }, { replace: true });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!jobName.trim()) {
      setFormError('Enter a job name.');
      return;
    }
    if (!scope.trim()) {
      setFormError('Enter the scope of what you need.');
      return;
    }
    setSaving(true);
    setFormError('');
    let image: { file_name: string; mime_type: string; bytesBase64: string } | null = null;
    if (imageFile) {
      const compressed = await compressImageForUpload(imageFile);
      image = {
        file_name: compressed.file_name,
        mime_type: compressed.mime_type,
        bytesBase64: bytesToBase64(compressed.bytes),
      };
    }
    const result = editing
      ? await window.tracker.updateQuoteSize(token, {
          id: editing.id,
          version: editing.version,
          job_name: jobName.trim(),
          scope: scope.trim(),
          image,
        })
      : await window.tracker.createQuoteSize(token, {
          job_name: jobName.trim(),
          scope: scope.trim(),
          image,
        });
    setSaving(false);
    if ('error' in result) {
      setFormError(result.error);
      return;
    }
    setShowForm(false);
    setEditing(null);
    setJobName('');
    setScope('');
    setImageFile(null);
    void load(true);
    openItem(result.id);
  }

  async function handleAddNote() {
    if (!token || !selectedId || (!noteDraft.trim() && !chatImage)) return;
    const mentionIds = extractMentionIds(noteDraft, teamUsers);
    let image: { file_name: string; mime_type: string; bytesBase64: string } | null = null;
    if (chatImage) {
      const compressed = await compressImageForUpload(chatImage);
      image = {
        file_name: compressed.file_name,
        mime_type: compressed.mime_type,
        bytesBase64: bytesToBase64(compressed.bytes),
      };
    }
    const result = await window.tracker.addQuoteSizeNote(
      token,
      selectedId,
      noteDraft,
      mentionIds,
      image
    );
    if ('error' in result) {
      setNoteError(result.error);
      return;
    }
    setNoteDraft('');
    setChatImage(null);
    setNoteError('');
    setNotes((prev) => [...prev, result]);
  }

  function openCreate() {
    setEditing(null);
    setJobName('');
    setScope('');
    setImageFile(null);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(q: QuoteSize) {
    setEditing(q);
    setJobName(q.job_name);
    setScope(q.scope);
    setImageFile(null);
    setFormError('');
    setShowForm(true);
  }

  async function markDone(target?: QuoteSize) {
    const row = target || selected;
    if (!token || !row || row.status === 'done') return;
    const result = await window.tracker.updateQuoteSize(token, {
      id: row.id,
      version: row.version,
      status: 'done',
    });
    if ('error' in result) {
      setError(result.error);
      return;
    }
    void load(true);
  }

  async function markComplete() {
    if (!token || !selected || selected.status !== 'done' || selected.archived_at) return;
    const result = await window.tracker.updateQuoteSize(token, {
      id: selected.id,
      version: selected.version,
      complete: true,
    });
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setCompletedOpen(true);
    void load(true);
  }

  async function handleDelete() {
    if (!token || !selected) return;
    const result = await window.tracker.deleteQuoteSize(token, {
      id: selected.id,
      version: selected.version,
    });
    if ('error' in result) {
      setError(result.error);
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(false);
    setSelectedId(null);
    setParams({}, { replace: true });
    void load(true);
  }

  async function printRequestImage() {
    if (!token || !selected?.has_image) return;
    const result = await window.tracker.getQuoteSizeImage(token, selected.id);
    if ('error' in result) return;
    printImageBlob(
      new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type }),
      selected.job_name
    );
  }

  async function openFullImage() {
    if (!token || !selected?.has_image) return;
    const result = await window.tracker.getQuoteSizeImage(token, selected.id);
    if ('error' in result) return;
    const blob = new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type });
    setFullImage(URL.createObjectURL(blob));
  }

  async function printNoteImage(note: QuoteSizeNote) {
    if (!token || !note.has_image) return;
    const result = await window.tracker.getQuoteSizeNoteImage(token, note.id);
    if ('error' in result) return;
    printImageBlob(
      new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type }),
      note.file_name || selected?.job_name || 'Cut / Print'
    );
  }

  async function openNoteImage(note: QuoteSizeNote) {
    if (!token || !note.has_image) return;
    const result = await window.tracker.getQuoteSizeNoteImage(token, note.id);
    if ('error' in result) return;
    const blob = new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type });
    setFullImage(URL.createObjectURL(blob));
  }

  return (
    <div className="relative flex h-full min-h-0 bg-canvas">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-ink-10 sm:w-[320px]">
        <div className="flex shrink-0 items-center gap-2 border-b border-ink-10 px-3 py-3">
          <Scissors className="h-4 w-4 text-ink-55" />
          <h1 className="text-sm font-medium text-ink">Cut / Print List</h1>
          <span className="rounded-pill bg-surface px-2 py-0.5 text-xs text-ink-40">{items.length}</span>
          {canPost && (
            <button
              type="button"
              className="jt-btn-accent ml-auto !px-2 !py-1 !text-xs"
              onClick={openCreate}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          )}
        </div>
        {error && <p className="px-3 pt-2 text-xs text-danger">{error}</p>}
        <div className="jt-scroll min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-ink-40">
              No open requests.
              {canPost ? ' Post one so the team can reply with sizes or artwork.' : ''}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((q) => {
                const active = q.id === selectedId;
                const unread = unseenIds.has(q.id);
                const greyed = q.status === 'done';
                return (
                  <div
                    key={q.id}
                    className={`flex w-full min-w-0 items-start gap-1 rounded-[10px] border shadow-card transition-colors ${
                      active
                        ? 'border-brand/40 bg-brand/10'
                        : unread
                          ? 'border-brand/25 bg-card'
                          : 'border-ink-10 bg-card hover:bg-ink-6'
                    } ${greyed ? 'opacity-50' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => openItem(q.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 px-2.5 py-2 text-left"
                    >
                      {q.has_image && token ? (
                        <QuoteThumb
                          id={q.id}
                          token={token}
                          className="h-11 w-11 shrink-0 rounded-md"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface text-ink-40">
                          <Scissors className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink">{q.job_name}</span>
                          {unread && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                          )}
                        </div>
                        <p className="line-clamp-2 text-[11px] text-ink-55">{q.scope}</p>
                        <p className="mt-0.5 truncate text-[10px] text-ink-40">
                          {q.created_name || 'Someone'} · {greyed ? 'Done' : 'Open'}
                        </p>
                      </div>
                    </button>
                    {q.status === 'open' && (
                      <button
                        type="button"
                        className="mr-1.5 mt-2 shrink-0 rounded-md p-1.5 text-ink-40 hover:bg-ink-6 hover:text-ink"
                        title="Mark done — notifies the person who posted this"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markDone(q);
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    {greyed && (
                      <span className="mr-1.5 mt-2 shrink-0 rounded-md p-1.5 text-ink-40" title="Done">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-ink-10">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-ink-6"
            onClick={() => setCompletedOpen((v) => !v)}
            aria-expanded={completedOpen}
          >
            <Archive className="h-3.5 w-3.5 text-ink-40" />
            <span className="font-medium">Completed</span>
            <span className="rounded-pill bg-surface px-2 py-0.5 text-[10px] text-ink-40">
              {completed.length}
            </span>
            <ChevronDown
              className={`ml-auto h-4 w-4 text-ink-40 transition-transform ${completedOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {completedOpen && (
            <div className="jt-scroll max-h-48 overflow-y-auto border-t border-ink-6 p-2">
              {completed.length === 0 ? (
                <p className="px-1 py-3 text-center text-[11px] text-ink-40">
                  Tick Done first, then Complete to file a request here.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {completed.map((q) => {
                    const active = q.id === selectedId;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => openItem(q.id)}
                        className={`flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left ${
                          active ? 'bg-brand/10' : 'hover:bg-ink-6'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-ink-55">{q.job_name}</span>
                          <span className="block truncate text-[10px] text-ink-40">
                            {q.created_name || 'Someone'}
                            {q.archived_at ? ` · ${formatWhen(q.archived_at)}` : ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 text-ink-40">
            <Scissors className="h-10 w-10 opacity-40" />
            <p className="text-sm">Select a request to reply with sizes or artwork</p>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-ink-10 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className={`min-w-0 ${selected.status === 'done' && !isFiled ? 'opacity-50' : ''}`}>
                  <h2 className="truncate text-base font-medium text-ink">{selected.job_name}</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-90">{selected.scope}</p>
                  <p className="mt-1 text-[11px] text-ink-40">
                    {selected.created_name || 'Someone'} · {formatWhen(selected.created_at)}
                    {selected.status === 'done' && !isFiled ? ' · Done' : ''}
                    {isFiled ? ' · Completed' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {canPost && !isFiled && (
                    <button
                      type="button"
                      className="jt-btn-ghost shrink-0 !py-1.5"
                      onClick={() => openEdit(selected)}
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                  )}
                  {selected.status !== 'done' && (
                    <button
                      type="button"
                      className="jt-btn-ghost shrink-0 !py-1.5"
                      onClick={() => void markDone()}
                    >
                      <Check className="h-4 w-4" />
                      Done
                    </button>
                  )}
                  {canManage && selected.status === 'done' && !isFiled && (
                    <button
                      type="button"
                      className="jt-btn-accent shrink-0 !py-1.5"
                      onClick={() => void markComplete()}
                    >
                      <Archive className="h-4 w-4" />
                      Complete
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      className="jt-btn-ghost shrink-0 !py-1.5 !text-danger"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
              {selected.has_image && token && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void openFullImage()}
                    className="overflow-hidden rounded-lg border border-ink-10"
                    title="Open image"
                  >
                    <QuoteThumb id={selected.id} token={token} className="max-h-48 w-full" />
                  </button>
                  <button
                    type="button"
                    className="jt-btn-ghost mt-2 !py-1 !text-xs"
                    onClick={() => void printRequestImage()}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print image
                  </button>
                </div>
              )}
            </div>

            <div className="jt-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
              {notes.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-40">
                  Type sizes below, or attach a picture / artwork frame. @mention if they should see it in the bell.
                </p>
              ) : (
                notes.map((note) => {
                  const mine = user && note.author_id === user.id;
                  return (
                    <div key={note.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[92%] rounded-2xl border border-ink-10 bg-card px-3 py-2">
                        <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-ink-40">
                          <span className="font-medium text-ink-55">{mine ? 'You' : note.author_name}</span>
                          <span className="ml-auto">{formatWhen(note.created_at)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-ink">
                          {note.body ? renderNoteBody(note.body, teamUsers) : null}
                        </p>
                        {note.has_image && token && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() => void openNoteImage(note)}
                              className="overflow-hidden rounded-lg border border-ink-10"
                            >
                              <NoteThumb noteId={note.id} token={token} className="max-h-48 w-full" />
                            </button>
                            <button
                              type="button"
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-ink-40 hover:text-ink"
                              onClick={() => void printNoteImage(note)}
                            >
                              <Printer className="h-3 w-3" />
                              Print
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={notesEndRef} />
            </div>

            <div className="shrink-0 border-t border-ink-10 bg-canvas p-3">
              {noteError ? <p className="mb-2 text-xs text-danger">{noteError}</p> : null}
              {chatImage && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-ink-10 bg-surface px-2 py-1.5 text-xs text-ink-55">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{chatImage.name}</span>
                  <button
                    type="button"
                    className="ml-auto rounded p-0.5 hover:bg-ink-6 hover:text-ink"
                    onClick={() => setChatImage(null)}
                    title="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={chatFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    setChatImage(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="jt-btn-ghost shrink-0 !px-2.5"
                  title="Attach image or artwork frame"
                  onClick={() => chatFileRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <MentionInput
                    value={noteDraft}
                    onChange={setNoteDraft}
                    onSubmit={() => void handleAddNote()}
                    users={teamUsers}
                    placeholder="Reply with sizes or a note… Enter for a new line, Ctrl+Enter to send. @ to mention"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddNote()}
                  disabled={!noteDraft.trim() && !chatImage}
                  className="jt-btn-accent shrink-0 !px-3 disabled:opacity-40"
                  title="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <AppModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        title={editing ? 'Edit request' : 'New cut / print request'}
        subtitle="Name the job, describe what you need, and attach a picture if you have one."
        footer={
          <>
            <button
              type="button"
              className="jt-btn-ghost"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="quote-size-form"
              className="jt-btn-accent"
              disabled={saving}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Post request'}
            </button>
          </>
        }
      >
        <form id="quote-size-form" onSubmit={handleCreate} className="space-y-3">
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-55">Job name</span>
            <input
              className="jt-input"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              placeholder="e.g. Nando’s fascia"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-55">Scope</span>
            <textarea
              className="jt-input min-h-[88px] resize-y"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="What should we cut, print, or size?"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-55">
              {editing ? 'Replace image (optional)' : 'Image (optional)'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="block w-full text-sm text-ink-55 file:mr-2 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
          </label>
        </form>
      </AppModal>

      <AppModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this request?"
        subtitle="It will be removed for everyone — not only on this PC."
        footer={
          <>
            <button type="button" className="jt-btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="jt-btn-danger" onClick={() => void handleDelete()}>
              Delete for everyone
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-90">
          {selected ? (
            <>
              <span className="font-medium text-ink">{selected.job_name}</span> and all replies will be gone.
            </>
          ) : (
            'This cannot be undone.'
          )}
        </p>
      </AppModal>

      {fullImage && (
        <button
          type="button"
          className="jt-below-titlebar fixed inset-x-0 bottom-0 z-[10000] flex items-center justify-center bg-ink/70 p-6"
          onClick={() => {
            URL.revokeObjectURL(fullImage);
            setFullImage(null);
          }}
        >
          <img src={fullImage} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </button>
      )}
    </div>
  );
}
