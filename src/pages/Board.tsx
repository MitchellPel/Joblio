import { useState, useEffect, useCallback, useMemo } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import type { Job, StageKey } from '@/shared-types';
import { useAuth } from '../context/AuthContext';
import { userCanArchiveJobs } from '../utils/permissions';
import { useDbSync } from '../hooks/useDbSync';
import { mergeList } from '../utils/mergeList';
import { STAGES } from '../data/stages';
import KanbanColumn from '../components/KanbanColumn';
import JobFormModal from '../components/JobFormModal';
import BulkActionsBar from '../components/BulkActionsBar';
import JobDetail from './JobDetail';
import {
  User as UserIcon,
  Calendar,
  AlertCircle,
  Plus,
  Activity,
  CheckSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type FilterMode = 'all' | 'mine' | 'thisWeek' | 'overdue';

interface StaffOption {
  id: number;
  full_name: string;
}

export default function Board() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [mentionedJobIds, setMentionedJobIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [staff, setStaff] = useState<StaffOption[]>([]);

  const canArchive = userCanArchiveJobs(user);

  const loadMentionBadges = useCallback(async () => {
    if (!token) {
      setMentionedJobIds(new Set());
      return;
    }
    const result = await window.tracker.listUnseenMentionJobIds(token);
    if (Array.isArray(result)) {
      setMentionedJobIds(new Set(result));
    }
  }, [token]);

  const loadJobs = useCallback(async (silent = false) => {
    if (!token) return;
    try {
      if (!silent) setLoading(true);
      const result = await window.tracker.listJobs(token);
      if ('error' in result) {
        setError(result.error);
      } else {
        setJobs((prev) => mergeList(prev, result as Job[]));
        setError('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadJobs();
      loadMentionBadges();
    }
  }, [token, loadJobs, loadMentionBadges]);

  useDbSync(() => {
    loadJobs(true);
    loadMentionBadges();
  }, !!token);

  useEffect(() => {
    const unsub = window.tracker.onMentionsChanged(() => loadMentionBadges());
    const onRefresh = () => loadMentionBadges();
    window.addEventListener('joblio:mentions-refresh', onRefresh);
    return () => {
      unsub();
      window.removeEventListener('joblio:mentions-refresh', onRefresh);
    };
  }, [loadMentionBadges]);

  useEffect(() => {
    if (!token) return;
    window.tracker.listStaff(token).then((result) => {
      if (Array.isArray(result)) {
        setStaff(result.map((s) => ({ id: s.id, full_name: s.full_name })));
      }
    });
  }, [token]);

  const filteredJobs = useMemo(() => {
    let list = [...jobs];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (filterMode) {
      case 'mine':
        list = list.filter((j) => j.assigned_to === user?.id);
        break;
      case 'thisWeek': {
        const endOfWeek = new Date(today);
        endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
        list = list.filter((j) => {
          if (!j.due_date) return false;
          const due = new Date(j.due_date);
          return due >= today && due <= endOfWeek;
        });
        break;
      }
      case 'overdue':
        list = list.filter((j) => {
          if (!j.due_date || j.stage === 'completed') return false;
          const due = new Date(j.due_date);
          due.setHours(0, 0, 0, 0);
          return due < today;
        });
        break;
    }

    return list;
  }, [jobs, filterMode, user?.id]);

  const jobsByStage = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const stage of STAGES) map.set(stage.key, []);
    for (const job of filteredJobs) map.get(job.stage)?.push(job);
    return map;
  }, [filteredJobs]);

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const jobId = parseInt(draggableId.replace('job-', ''), 10);
    const toStage = destination.droppableId as StageKey;

    const job = jobs.find((j) => j.id === jobId);
    const currentVersion = job?.version ?? 1;

    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, stage: toStage } : j))
    );

    if (!token) return;

    const moveResult = await window.tracker.moveStage(token, jobId, toStage, currentVersion);
    if ('error' in moveResult) {
      setError(moveResult.error);
      loadJobs();
    } else {
      setError('');
    }
  }

  function handleNewJob(_stage: string) {
    setSelectedJob(null);
    setFormOpen(true);
  }

  const handleJobClick = useCallback((job: Job) => {
    setSelectedJob(job);
    setDetailOpen(true);
  }, []);

  const isDragDisabled = useCallback((job: Job) => {
    if (!user) return true;
    if (user.role === 'admin') return false;
    if (user.can_move_any) return false;
    return job.assigned_to !== null && job.assigned_to !== user.id;
  }, [user]);

  const toggleSelect = useCallback((jobId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function bulkReassign(userId: number | null) {
    if (!token || selectedIds.size === 0) return;
    setBulkBusy(true);
    const errors: string[] = [];
    for (const id of selectedIds) {
      const job = jobs.find((j) => j.id === id);
      if (!job) continue;
      const result = await window.tracker.updateJob(token, {
        id,
        version: job.version,
        assigned_to: userId,
      });
      if ('error' in result) errors.push(`${job.job_no}: ${result.error}`);
    }
    setBulkBusy(false);
    await loadJobs();
    if (errors.length) setError(errors.slice(0, 3).join(' · '));
    else {
      setError('');
      exitSelectMode();
    }
  }

  async function bulkMoveStage(stage: StageKey) {
    if (!token || selectedIds.size === 0) return;
    setBulkBusy(true);
    const errors: string[] = [];
    for (const id of selectedIds) {
      const job = jobs.find((j) => j.id === id);
      if (!job) continue;
      const result = await window.tracker.moveStage(token, id, stage, job.version);
      if ('error' in result) errors.push(`${job.job_no}: ${result.error}`);
    }
    setBulkBusy(false);
    await loadJobs();
    if (errors.length) setError(errors.slice(0, 3).join(' · '));
    else {
      setError('');
      exitSelectMode();
    }
  }

  async function bulkArchive() {
    if (!token || selectedIds.size === 0) return;
    setBulkBusy(true);
    const errors: string[] = [];
    let archived = 0;
    for (const id of selectedIds) {
      const job = jobs.find((j) => j.id === id);
      if (!job) continue;
      if (job.stage !== 'completed') {
        errors.push(`${job.job_no}: only completed jobs can be archived`);
        continue;
      }
      const result = await window.tracker.archiveJob(token, id, job.version);
      if ('error' in result) errors.push(`${job.job_no}: ${result.error}`);
      else archived += 1;
    }
    setBulkBusy(false);
    await loadJobs();
    if (errors.length) {
      setError(
        (archived ? `Archived ${archived}. ` : '') + errors.slice(0, 3).join(' · ')
      );
    } else {
      setError('');
      exitSelectMode();
    }
  }

  const totalCount = jobs.length;
  const shownCount = filteredJobs.length;

  return (
    <div className="relative flex h-full flex-col bg-canvas">
      {error && (
        <div className="flex items-center gap-2 border-b border-danger/20 bg-danger/10 px-4 py-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="shrink-0 border-b border-ink-10 bg-canvas px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-0.5 rounded-lg bg-surface p-0.5">
            {[
              { key: 'all' as FilterMode, label: 'All', icon: null },
              { key: 'mine' as FilterMode, label: 'My Jobs', icon: UserIcon },
              { key: 'thisWeek' as FilterMode, label: 'This Week', icon: Calendar },
              { key: 'overdue' as FilterMode, label: 'Overdue', icon: AlertCircle },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilterMode(f.key)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 sm:px-3 sm:text-sm ${
                  filterMode === f.key
                    ? 'bg-card text-ink shadow-ring'
                    : 'text-ink-55 hover:text-ink'
                }`}
              >
                {f.icon && <f.icon className="h-3.5 w-3.5" />}
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/activity')}
            className="jt-btn-ghost !py-1.5 !text-xs"
            title="Recent activity"
          >
            <Activity className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Activity</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-ink-40 sm:inline">
              {shownCount === totalCount
                ? `${totalCount} jobs`
                : `${shownCount} of ${totalCount} jobs`}
            </span>
            <button
              type="button"
              onClick={() => {
                if (selectMode) exitSelectMode();
                else setSelectMode(true);
              }}
              className={`jt-btn-ghost !py-1.5 !text-xs ${selectMode ? '!bg-brand/10 !text-brand' : ''}`}
              title="Select multiple jobs"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{selectMode ? 'Selecting' : 'Select'}</span>
            </button>
            <button type="button" onClick={() => handleNewJob('new')} className="jt-btn-accent">
              <Plus className="h-4 w-4" />
              New Job
            </button>
          </div>
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
        <BulkActionsBar
          count={selectedIds.size}
          staff={staff}
          canArchive={canArchive}
          busy={bulkBusy}
          onClear={exitSelectMode}
          onReassign={bulkReassign}
          onMoveStage={bulkMoveStage}
          onArchive={bulkArchive}
        />
      )}

      {loading ? (
        <div className="flex flex-1 shrink-0 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-10 border-t-brand" />
            <p className="text-sm text-ink-40">Loading jobs…</p>
          </div>
        </div>
      ) : shownCount === 0 && !loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-ink-40">
          <p className="text-lg text-ink-55">
            No jobs {filterMode !== 'all' ? 'in this filter' : 'yet'}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setFilterMode('all');
              }}
              className="jt-btn-ghost"
            >
              Clear filters
            </button>
            <button onClick={() => handleNewJob('new')} className="jt-btn-accent">
              <Plus className="h-4 w-4" />
              Create first job
            </button>
          </div>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-1">
            <div className="flex h-full min-h-0 w-full min-w-0 flex-1 gap-1.5">
              {STAGES.map((stage) => (
                <KanbanColumn
                  key={stage.key}
                  stage={stage}
                  jobs={jobsByStage.get(stage.key) ?? []}
                  onJobClick={handleJobClick}
                  isDragDisabled={isDragDisabled}
                  mentionedJobIds={mentionedJobIds}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                />
              ))}
            </div>
          </div>
        </DragDropContext>
      )}

      <JobFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setSelectedJob(null);
        }}
        onSaved={loadJobs}
        editJob={null}
      />

      {detailOpen && selectedJob && (
        <div
          className="jt-anim-overlay absolute inset-0 z-[100] flex min-h-0 items-stretch justify-center bg-ink/40 p-2 sm:p-3 md:p-4"
          onMouseDown={(e) => {
            (e.currentTarget as HTMLElement).dataset.backdropPress =
              e.target === e.currentTarget ? '1' : '0';
          }}
          onClick={(e) => {
            if (
              (e.currentTarget as HTMLElement).dataset.backdropPress === '1' &&
              e.target === e.currentTarget
            ) {
              setDetailOpen(false);
            }
          }}
        >
          <div
            className="jt-anim-panel jt-sheet flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-canvas shadow-raised"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <JobDetail
                jobId={selectedJob.id}
                onClose={() => {
                  setDetailOpen(false);
                  loadMentionBadges();
                }}
                onUpdated={(updatedJob) => {
                  if (updatedJob.archived_at) {
                    setJobs((prev) => prev.filter((j) => j.id !== updatedJob.id));
                    setSelectedJob(null);
                    setDetailOpen(false);
                  } else {
                    setJobs((prev) =>
                      prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
                    );
                    setSelectedJob((prev) =>
                      prev?.id === updatedJob.id ? updatedJob : prev
                    );
                  }
                  loadMentionBadges();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
