import { useState, useEffect, useCallback, useRef } from 'react';
import type { Job, StageHistoryEntry, JobNote, StageKey, JobProof, Mention, DesignerStatus } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { userCanArchiveJobs, userCanDeleteNotes } from '../utils/permissions';
import StageTimeline from '../components/StageTimeline';
import JobFormModal from '../components/JobFormModal';
import { STAGES } from '../data/stages';
import {
  ArrowLeft,
  Send,
  Archive,
  ArchiveRestore,
  Pencil,
  Upload,
  Download,
  Trash2,
  ImageIcon,
  FileText,
  AlertTriangle,
  ZoomIn,
  Printer,
  AtSign,
  Pin,
  Check,
  X,
} from 'lucide-react';
import ProofLightbox from '../components/ProofLightbox';
import MentionInput, { extractMentionIds, renderNoteBody, type MentionUser } from '../components/MentionInput';
import JobKindIcon, { jobKindLabel } from '../components/JobKindIcon';
import AssignedNameBubble from '../components/AssignedNameBubble';
import {
  DESIGNER_STATUS_OPTIONS,
  designerStatusLabel,
  designerStatusPillClass,
  parseDesignerStatuses,
} from '../data/designerStatus';
import { printJobSheet } from '../utils/printJobSheet';
import { printImageBlob } from '../utils/printImage';
import { bytesFromBase64, bytesToBase64, compressImageForUpload, createAsyncQueue } from '../utils/proofBytes';

const proofThumbQueue = createAsyncQueue(2);
const proofUploadQueue = createAsyncQueue(1);

interface JobDetailProps {
  jobId: number;
  onClose: () => void;
  onUpdated?: (job: Job) => void;
}

function ProofThumb({
  proof,
  token,
  onOpen,
}: {
  proof: JobProof;
  token: string | null;
  onOpen: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    async function load() {
      if (!token) {
        setState('error');
        return;
      }
      const result = await proofThumbQueue.run(() =>
        window.tracker.getProofThumb(token, proof.id)
      );
      if (!active) return;
      if ('error' in result) {
        setState('error');
        return;
      }
      const blob = new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type });
      const url = URL.createObjectURL(blob);
      revoked = url;
      setSrc(url);
      setState('ready');
    }
    load();
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [proof.id, token]);

  if (state === 'error') {
    return (
      <button onClick={onOpen} className="flex flex-col items-center gap-1 text-ink-40">
        <ZoomIn className="h-5 w-5" />
        <span className="text-[11px]">View proof</span>
      </button>
    );
  }

  return (
    <button
      onClick={onOpen}
      className="group/thumb relative flex h-full w-full items-center justify-center"
      title={`View ${proof.file_name}`}
    >
      {src ? (
        <img src={src} alt={proof.file_name} className="h-full w-full object-cover" />
      ) : (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition-all duration-150 group-hover/thumb:bg-ink/30 group-hover/thumb:opacity-100">
        <ZoomIn className="h-5 w-5 text-white drop-shadow" />
      </span>
    </button>
  );
}

export default function JobDetail({ jobId, onClose, onUpdated }: JobDetailProps) {
  const { token, user } = useAuth();
  const canArchive = userCanArchiveJobs(user);
  const canDeleteNotes = userCanDeleteNotes(user);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState('');
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<JobNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const [loadedUpdatedAt, setLoadedUpdatedAt] = useState<string | null>(null);

  async function handleDeleteJob() {
    if (!token || !job) return;
    const result = await window.tracker.deleteJob(token, jobId, job.version);
    if ('error' in result) {
      setError(result.error);
    } else {
      onClose();
    }
    setDeleteConfirmOpen(false);
  }

  const [proofs, setProofs] = useState<JobProof[]>([]);
  const [uploading, setUploading] = useState(false);
  const [proofError, setProofError] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [teamUsers, setTeamUsers] = useState<MentionUser[]>([]);
  const [attentionMentions, setAttentionMentions] = useState<Mention[]>([]);
  const [attentionNoteIds, setAttentionNoteIds] = useState<Set<number>>(new Set());
  const [pinEditing, setPinEditing] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const notesEndRef = useRef<HTMLDivElement>(null);
  const notesScrollRef = useRef<HTMLDivElement>(null);

  // Team list for the @mention picker and note highlighting
  useEffect(() => {
    if (!token) return;
    window.tracker.listStaff(token).then((result) => {
      if (Array.isArray(result)) setTeamUsers(result);
    });
  }, [token]);

  // Load @attention notes first, then mark seen so the bell clears
  useEffect(() => {
    if (!token || !jobId) return;
    let cancelled = false;
    (async () => {
      const unseen = await window.tracker.listUnseenMentionsForJob(token, jobId);
      if (cancelled) return;
      if (Array.isArray(unseen) && unseen.length > 0) {
        setAttentionMentions(unseen);
        setAttentionNoteIds(new Set(unseen.map((m) => m.note_id)));
      } else {
        setAttentionMentions([]);
        setAttentionNoteIds(new Set());
      }
      const result = await window.tracker.markMentionsSeen(token, jobId);
      if (result && 'marked' in result && result.marked > 0) {
        window.dispatchEvent(new CustomEvent('joblio:mentions-refresh'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, jobId]);

  const loadData = useCallback(async (silent = false) => {
    if (!token) return;
    try {
      if (!silent) setLoading(true);
      const [jobData, stageData, notesData] = await Promise.all([
        window.tracker.getJob(token, jobId),
        window.tracker.getStageHistory(token, jobId),
        window.tracker.listNotes(token, jobId),
      ]);
      if (jobData && !('error' in jobData)) {
        setJob(jobData as Job);
        setLoadedUpdatedAt((jobData as Job).updated_at);
      }
      if (!('error' in stageData)) setHistory(stageData as StageHistoryEntry[]);
      if (!('error' in notesData)) setNotes(notesData as JobNote[]);
      else setNotes([]);
      const proofData = await window.tracker.listProofs(token, jobId);
      if (!('error' in proofData)) setProofs(proofData as JobProof[]);
      else setProofs([]);
      setExternalChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to load job');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, jobId]);

  useEffect(() => {
    if (token && jobId) loadData();
  }, [token, jobId, loadData]);

  // Keep notes chat scrolled to the latest message when the thread loads
  useEffect(() => {
    if (!loading && notes.length > 0) {
      notesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [loading, jobId]);

  // Detect external changes without auto-reloading
  useEffect(() => {
    if (!token || !jobId) return;
    const unsubscribe = window.tracker.onDbChanged(async () => {
      const fresh = await window.tracker.getJob(token!, jobId);
      if (fresh && !('error' in fresh) && (fresh as Job).updated_at !== loadedUpdatedAt) {
        setExternalChange(true);
      }
    });
    return unsubscribe;
  }, [token, jobId, loadedUpdatedAt]);

  async function handleAddNote() {
    if (!token || !newNote.trim()) return;
    setNoteError('');
    const mentionIds = extractMentionIds(newNote, teamUsers);
    const result = await window.tracker.addNote(token, jobId, newNote.trim(), mentionIds);
    if ('error' in result) {
      setNoteError(result.error);
      return;
    }
    setNotes((prev) => [result as JobNote, ...prev]);
    setNewNote('');
    requestAnimationFrame(() => {
      notesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  async function handleSaveNoteEdit() {
    if (!token || editingNoteId == null || !editingNoteBody.trim()) return;
    setNoteError('');
    const result = await window.tracker.updateNote(token, editingNoteId, editingNoteBody.trim());
    if ('error' in result) {
      setNoteError(result.error);
      return;
    }
    const updated = result as JobNote;
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    setEditingNoteId(null);
    setEditingNoteBody('');
  }

  async function handleDeleteNote() {
    if (!token || !deleteNoteTarget) return;
    setNoteError('');
    const result = await window.tracker.deleteNote(token, deleteNoteTarget.id);
    if ('error' in result) {
      setNoteError(result.error);
      setDeleteNoteTarget(null);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== deleteNoteTarget.id));
    if (editingNoteId === deleteNoteTarget.id) {
      setEditingNoteId(null);
      setEditingNoteBody('');
    }
    setDeleteNoteTarget(null);
  }

  async function handleMoveStage(toStage: StageKey) {
    if (!token || !job) return;
    const result = await window.tracker.moveStage(token, jobId, toStage, job.version);
    if ('error' in result) {
      setError(result.error);
      loadData();
    } else {
      const updated = result as Job;
      setJob(updated);
      onUpdated?.(updated);
      loadData();
    }
  }

  async function handleArchive() {
    if (!token || !job) return;
    const result = await window.tracker.archiveJob(token, jobId, job.version);
    if ('error' in result) {
      setError(result.error);
      loadData();
    } else {
      const updated = result as Job;
      setJob(updated);
      onUpdated?.(updated);
      onClose();
    }
  }

  async function handleUnarchive() {
    if (!token || !job) return;
    const result = await window.tracker.unarchiveJob(token, jobId, job.version);
    if ('error' in result) {
      setError(result.error);
      loadData();
    } else {
      const updated = result as Job;
      setJob(updated);
      onUpdated?.(updated);
      onClose();
    }
  }

  async function savePinnedBrief(brief: string | null) {
    if (!token || !job) return;
    const result = await window.tracker.updateJob(token, {
      id: jobId,
      version: job.version,
      pinned_brief: brief,
    });
    if ('error' in result) {
      setError(result.error);
      loadData();
      return;
    }
    const updated = result as Job;
    setJob(updated);
    onUpdated?.(updated);
    setPinEditing(false);
  }

  async function toggleDesignerStatus(status: DesignerStatus) {
    if (!token || !job) return;
    const current = parseDesignerStatuses(job.designer_status);
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status];
    const result = await window.tracker.updateJob(token, {
      id: jobId,
      version: job.version,
      designer_status: next,
    });
    if ('error' in result) {
      setError(result.error);
      loadData();
      return;
    }
    const updated = result as Job;
    setJob(updated);
    onUpdated?.(updated);
  }

  async function handleUploadProof(file: File) {
    if (!token || !job) return;
    setProofError('');
    if (!file.type.startsWith('image/')) {
      setProofError('Only image files can be attached as proofs.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setProofError('Image is too large (max 12 MB before compression).');
      return;
    }
    try {
      setUploading(true);
      await proofUploadQueue.run(async () => {
        const compressed = await compressImageForUpload(file);
        if (compressed.size > 4 * 1024 * 1024) {
          setProofError('Image is still too large after compression (max 4 MB). Try a smaller file.');
          return;
        }
        const bytesBase64 = bytesToBase64(compressed.bytes);
        const result = await window.tracker.addProof(token, jobId, {
          file_name: compressed.file_name,
          mime_type: compressed.mime_type,
          bytesBase64,
          size: compressed.size,
        });
        if ('error' in result) {
          setProofError(result.error);
        } else {
          setProofs((prev) => [result as JobProof, ...prev]);
        }
      });
    } catch (err: any) {
      setProofError(err.message || 'Failed to upload proof.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadProof(proof: JobProof) {
    if (!token) return;
    const result = await window.tracker.getProof(token, proof.id);
    if ('error' in result) {
      setProofError(result.error);
      return;
    }
    const bytes = bytesFromBase64(result.dataBase64);
    const blob = new Blob([bytes], { type: result.mime_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handlePrintProof(proof: JobProof) {
    if (!token) return;
    const result = await window.tracker.getProof(token, proof.id);
    if ('error' in result) {
      setProofError(result.error);
      return;
    }
    printImageBlob(
      new Blob([bytesFromBase64(result.dataBase64)], { type: result.mime_type }),
      `${job?.job_no || ''} ${proof.file_name}`.trim()
    );
  }

  async function handleDeleteProof(proofId: number) {
    if (!token) return;
    const result = await window.tracker.deleteProof(token, proofId);
    if ('error' in result) {
      setProofError(result.error);
    } else {
      setProofs((prev) => prev.filter((p) => p.id !== proofId));
    }
  }

  function handleSaved() {
    setExternalChange(false);
    loadData();
    if (job && onUpdated) {
      window.tracker.getJob(token!, jobId).then((j) => {
        if (j && !('error' in j)) onUpdated(j as Job);
      });
    }
  }

  const stageIndex = STAGES.findIndex((s) => s.key === job?.stage);
  const nextStage = stageIndex < STAGES.length - 1 ? STAGES[stageIndex + 1] : null;
  const currentStage = STAGES.find((s) => s.key === job?.stage);

  const canMove = !!user && (
    user.role === 'admin' ||
    !!user.can_move_any ||
    !job?.assigned_to ||
    job?.assigned_to === user.id
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
      </div>
    );
  }

  if (!job) {
    return <div className="p-6 text-danger">Job not found.</div>;
  }

  const hasContact =
    !!(job.contact_name?.trim() || job.contact_phone?.trim() || job.contact_email?.trim());
  const jobNumberLabel = job.client?.trim() || job.job_no;

  return (
    <div className="jt-sheet flex h-full min-h-0 flex-col bg-canvas">
      {/* Header */}
      <div className="shrink-0 border-b border-ink-10 px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 shrink-0 rounded-lg p-1.5 text-ink-40 hover:bg-ink-6 hover:text-ink"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-medium tracking-display text-ink sm:text-xl">
              {job.job_name}
            </h2>
            <div className="mt-1 flex min-w-0 items-center gap-x-2">
              <span className="max-w-[46%] shrink-0 truncate font-mono text-xs font-medium text-ink-55" title={jobNumberLabel}>
                {jobNumberLabel}
              </span>
              <AssignedNameBubble
                name={job.assigned_name}
                color={job.assigned_color}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {job.job_kind && (
                <span className="inline-flex items-center gap-1 rounded-md bg-ink-6 px-1.5 py-0.5 text-[11px] font-medium text-ink-55">
                  <JobKindIcon kind={job.job_kind} size="sm" />
                  {jobKindLabel(job.job_kind)}
                </span>
              )}
              {parseDesignerStatuses(job.designer_status).map((s) => (
                <span
                  key={s}
                  className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${designerStatusPillClass(s)}`}
                >
                  {designerStatusLabel(s)}
                </span>
              ))}
              <span
                className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${currentStage?.color || 'bg-surface'} ${currentStage?.textColor || 'text-ink'}`}
              >
                {currentStage?.label || job.stage}
              </span>
              {job.due_date && (
                <span className="text-xs text-ink-40">
                  Due {new Date(job.due_date).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex min-w-0 max-w-[min(100%,20rem)] shrink-0 flex-wrap items-center justify-end gap-1.5">
            <button type="button" onClick={() => setEditOpen(true)} className="jt-btn-ghost !py-1.5 !text-xs">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (!job) return;
                printJobSheet({ job });
              }}
              className="jt-btn-ghost !py-1.5 !text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            {canArchive && job.stage === 'completed' && !job.archived_at && (
              <button
                type="button"
                onClick={handleArchive}
                className="jt-btn-ghost !py-1.5 !text-xs !text-stage-production"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
            )}
            {canArchive && !!job.archived_at && (
              <button
                type="button"
                onClick={handleUnarchive}
                className="jt-btn-ghost !py-1.5 !text-xs !text-stage-production"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Restore
              </button>
            )}
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="jt-btn-ghost !py-1.5 !text-xs !text-danger"
              title="Delete job"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {error && <div className="shrink-0 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>}

      {externalChange && (
        <div className="flex shrink-0 items-center gap-3 border-b border-brand/20 bg-brand/8 px-4 py-3 sm:px-5">
          <div className="flex-1 text-sm text-ink-55">
            This job was changed by another team member.
          </div>
          <button
            type="button"
            onClick={() => {
              loadData();
              setExternalChange(false);
            }}
            className="jt-btn-accent !py-1.5 !text-xs"
          >
            View changes
          </button>
        </div>
      )}

      {attentionMentions.length > 0 && (
        <div className="shrink-0 border-b border-brand/25 bg-brand/10 px-4 py-3 sm:px-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-brand">
            <AtSign className="h-4 w-4" />
            You were mentioned
          </div>
          <div className="space-y-2">
            {attentionMentions.map((m) => (
              <div key={m.id} className="rounded-xl border border-brand/20 bg-card px-3 py-2.5">
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink-55">{m.author_name}</span>
                  <span className="text-[10px] text-ink-40">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="break-words whitespace-pre-wrap text-sm text-ink">
                  {renderNoteBody(m.note_body, teamUsers)}
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setAttentionMentions([]);
              setAttentionNoteIds(new Set());
            }}
            className="mt-2 text-xs font-medium text-ink-40 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Body: job details + notes chat */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Main job panel */}
        <div className="jt-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-2xl space-y-7 p-4 sm:p-5">
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div className="min-w-0">
                  <p className="jt-eyebrow mb-1">Job number</p>
                  <p className="break-words font-medium text-ink">{jobNumberLabel}</p>
                </div>
                <div className="min-w-0">
                  <p className="jt-eyebrow mb-1">Assigned</p>
                  <AssignedNameBubble
                    name={job.assigned_name}
                    color={job.assigned_color}
                  />
                </div>
                <div className="min-w-0">
                  <p className="jt-eyebrow mb-1">Due</p>
                  <p className="font-medium text-ink">
                    {job.due_date ? new Date(job.due_date).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="jt-eyebrow mb-1">Created by</p>
                  <p className="break-words font-medium text-ink">{job.created_name || '—'}</p>
                </div>
              </div>

              {(hasContact || job.scope_notes?.trim()) && (
                <div className="space-y-3 border-t border-ink-10 pt-4">
                  {hasContact && (
                    <div className="min-w-0">
                      <p className="jt-eyebrow mb-1">Contact</p>
                      <div className="space-y-0.5 text-sm">
                        {job.contact_name?.trim() && (
                          <p className="break-words font-medium text-ink">{job.contact_name}</p>
                        )}
                        {job.contact_phone?.trim() && (
                          <p className="break-words text-ink-55">{job.contact_phone}</p>
                        )}
                        {job.contact_email?.trim() && (
                          <p className="break-all text-ink-55">{job.contact_email}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {job.scope_notes?.trim() && (
                    <div className="min-w-0">
                      <p className="jt-eyebrow mb-1">Scope</p>
                      <p className="break-words whitespace-pre-wrap text-sm text-ink-90">{job.scope_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section>
              <h3 className="jt-eyebrow mb-2 block">Status</h3>
              <div className="flex flex-wrap gap-1.5">
                {DESIGNER_STATUS_OPTIONS.map((opt) => {
                  const active = parseDesignerStatuses(job.designer_status).includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleDesignerStatus(opt.key)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                        active
                          ? opt.pillClass + ' ring-1 ring-ink-20'
                          : 'bg-ink-6 text-ink-55 hover:bg-ink-10 hover:text-ink'
                      }`}
                      title={active ? 'Click again to remove' : `Add ${opt.label}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-40">
                Pick one or more. Urgent turns the board card red.
              </p>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="jt-eyebrow flex items-center gap-1.5">
                  <Pin className="h-3 w-3 text-stage-production" />
                  Pinned brief
                </h3>
                {!pinEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setPinDraft(job.pinned_brief || '');
                      setPinEditing(true);
                    }}
                    className="text-xs font-medium text-ink-55 hover:text-brand"
                  >
                    {job.pinned_brief?.trim() ? 'Edit' : 'Add'}
                  </button>
                )}
              </div>
              {pinEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={pinDraft}
                    onChange={(e) => setPinDraft(e.target.value)}
                    rows={3}
                    spellCheck
                    className="jt-input resize-none text-sm"
                    placeholder="Short note the whole team should see…"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => savePinnedBrief(pinDraft.trim() || null)}
                      className="jt-btn-accent !py-1.5 !text-xs"
                    >
                      Save
                    </button>
                    {job.pinned_brief?.trim() && (
                      <button
                        type="button"
                        onClick={() => savePinnedBrief(null)}
                        className="jt-btn-ghost !py-1.5 !text-xs !text-danger"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPinEditing(false)}
                      className="jt-btn-ghost !py-1.5 !text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : job.pinned_brief?.trim() ? (
                <p className="break-words whitespace-pre-wrap rounded-xl border border-stage-production/20 bg-stage-production/5 px-3.5 py-3 text-sm text-ink">
                  {job.pinned_brief}
                </p>
              ) : (
                <p className="text-sm text-ink-40">No pinned brief.</p>
              )}
            </section>

            {(nextStage || (!canMove && job.assigned_to)) && (
              <section>
                <h3 className="jt-eyebrow mb-2 block">Move stage</h3>
                {nextStage && canMove && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleMoveStage(nextStage.key)}
                      className="jt-btn-accent"
                    >
                      {nextStage.label} →
                    </button>
                    {STAGES.filter((s) => s.key !== job.stage && s.key !== nextStage.key).map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => handleMoveStage(s.key)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 ${s.color} ${s.textColor}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
                {nextStage && !canMove && job.assigned_to && (
                  <p className="rounded-xl border border-ink-10 bg-surface-soft/60 px-3.5 py-3 text-sm text-ink-55">
                    Assigned to{' '}
                    <strong className="text-ink">{job.assigned_name || 'another team member'}</strong>.
                    Only they can move stages.
                  </p>
                )}
              </section>
            )}

            <div className="border-t border-ink-10" />

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="jt-eyebrow flex items-center gap-2">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Proofs
                  {proofs.length > 0 && (
                    <span className="rounded-pill bg-surface px-1.5 py-0.5 text-[11px] font-medium normal-case tracking-normal text-ink-55">
                      {proofs.length}
                    </span>
                  )}
                </h3>
                <label className="jt-btn-ghost !cursor-pointer !py-1.5 !text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading…' : 'Add'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadProof(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              {proofError && (
                <div className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{proofError}</div>
              )}

              {proofs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-10 py-8 text-ink-40">
                  <FileText className="h-5 w-5 opacity-60" />
                  <p className="text-sm">No proofs yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {proofs.map((proof, i) => (
                    <div
                      key={proof.id}
                      className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-ink-10 bg-card"
                    >
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-soft">
                        <ProofThumb proof={proof} token={token} onOpen={() => setLightboxIndex(i)} />
                      </div>
                      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-ink" title={proof.file_name}>
                            {proof.file_name}
                          </p>
                          <p className="truncate text-[11px] text-ink-40">
                            {proof.uploaded_name || 'Staff'} ·{' '}
                            {new Date(proof.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleDownloadProof(proof)}
                            className="rounded-md p-1.5 text-ink-40 hover:bg-ink-6 hover:text-ink"
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintProof(proof)}
                            className="rounded-md p-1.5 text-ink-40 hover:bg-ink-6 hover:text-ink"
                            title="Print proof"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProof(proof.id)}
                            className="rounded-md p-1.5 text-ink-40 hover:bg-danger/10 hover:text-danger"
                            title="Delete proof"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="border-t border-ink-10" />

            <section>
              <details className="group">
                <summary className="jt-eyebrow flex cursor-pointer list-none items-center gap-2 marker:content-none [&::-webkit-details-marker]:hidden">
                  Stage history
                  <span className="font-normal normal-case tracking-normal text-ink-40">
                    ({history.length})
                  </span>
                </summary>
                <div className="mt-3">
                  <StageTimeline history={history} />
                </div>
              </details>
            </section>
          </div>
        </div>

        {/* Notes chat panel */}
        <aside className="flex min-h-0 w-full max-h-[42%] flex-1 flex-col border-t border-ink-10 bg-surface-soft/40 lg:max-h-none lg:w-[340px] lg:flex-none lg:border-l lg:border-t-0 xl:w-[380px]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-ink-10 px-4 py-3">
            <div>
              <h3 className="text-sm font-medium text-ink">Notes</h3>
              <p className="text-[11px] text-ink-40">
                {notes.length === 0 ? 'Team chat for this job' : `${notes.length} message${notes.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>

          <div
            ref={notesScrollRef}
            className="jt-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-3"
          >
            {notes.length === 0 ? (
              <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-1 px-4 text-center">
                <p className="text-sm text-ink-40">No notes yet</p>
                <p className="text-xs text-ink-40">Type below to start the conversation</p>
              </div>
            ) : (
              [...notes].reverse().map((note) => {
                const mine = user && note.author_id === user.id;
                const attention = attentionNoteIds.has(note.id);
                const isEditing = editingNoteId === note.id;
                return (
                  <div
                    key={note.id}
                    className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl border px-3 py-2 ${
                        attention
                          ? 'border-brand/30 bg-brand/10'
                          : 'border-ink-10 bg-card'
                      }`}
                    >
                      <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-ink-40">
                        <span className="font-medium text-ink-55">{mine ? 'You' : note.author_name}</span>
                        {attention && (
                          <span className="inline-flex items-center gap-0.5 rounded-pill bg-brand/15 px-1.5 py-0.5 font-semibold text-brand">
                            <AtSign className="h-2.5 w-2.5" />
                            You
                          </span>
                        )}
                        <span className="ml-auto">
                          {new Date(note.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingNoteBody(note.body);
                              setNoteError('');
                            }}
                            className="rounded p-0.5 text-ink-40 hover:bg-ink-6 hover:text-ink"
                            title="Edit note"
                            aria-label="Edit note"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                        {!isEditing && canDeleteNotes && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteNoteTarget(note);
                              setNoteError('');
                            }}
                            className="rounded p-0.5 text-ink-40 hover:bg-danger/10 hover:text-danger"
                            title="Delete note"
                            aria-label="Delete note"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingNoteBody}
                            onChange={(e) => setEditingNoteBody(e.target.value)}
                            rows={3}
                            className="jt-input resize-none text-sm"
                            autoFocus
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(null);
                                setEditingNoteBody('');
                              }}
                              className="jt-btn-ghost !px-2 !py-1 !text-xs"
                            >
                              <X className="h-3.5 w-3.5" />
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveNoteEdit}
                              disabled={!editingNoteBody.trim()}
                              className="jt-btn-accent !px-2 !py-1 !text-xs disabled:opacity-40"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="break-words whitespace-pre-wrap text-sm leading-snug text-ink-90">
                          {renderNoteBody(note.body, teamUsers)}
                        </p>
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
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <MentionInput
                  value={newNote}
                  onChange={setNewNote}
                  onSubmit={handleAddNote}
                  users={teamUsers}
                  placeholder="Write a note… Enter for new line, Ctrl+Enter to send. @ to mention"
                />
              </div>
              <button
                type="button"
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className="jt-btn-accent shrink-0 !px-3 disabled:opacity-40"
                title="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>
      </div>

      <JobFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={handleSaved}
        editJob={job}
      />

      {deleteConfirmOpen && (
        <div
          className="jt-anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="jt-anim-panel jt-sheet w-full max-w-md rounded-2xl bg-canvas p-6 shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10">
                <AlertTriangle className="h-7 w-7 text-danger" />
              </div>
              <h3 className="text-lg font-semibold text-ink">
                Delete job <span className="font-mono text-brand">{jobNumberLabel}</span>?
              </h3>
              <p className="text-sm text-ink-55">
                This will permanently remove &ldquo;{job.job_name}&rdquo; and all its notes, proofs, and
                history.
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="jt-btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteJob}
                className="jt-btn-primary flex-1 !bg-danger hover:!bg-danger/90"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete job
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteNoteTarget && (
        <div
          className="jt-anim-overlay fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          onClick={() => setDeleteNoteTarget(null)}
        >
          <div
            className="jt-anim-panel jt-sheet w-full max-w-md rounded-2xl bg-canvas p-6 shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10">
                <AlertTriangle className="h-7 w-7 text-danger" />
              </div>
              <h3 className="text-lg font-semibold text-ink">Delete this note?</h3>
              <p className="text-sm text-ink-55">This cannot be undone.</p>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteNoteTarget(null)}
                className="jt-btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteNote}
                className="jt-btn-primary flex-1 !bg-danger hover:!bg-danger/90"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete note
              </button>
            </div>
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <ProofLightbox
          proofs={proofs}
          startIndex={lightboxIndex}
          token={token}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
