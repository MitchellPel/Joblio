import { memo } from 'react';
import type { Job } from '@/shared-types';
import { stageLabel, stageColor, stageTextColor } from '../data/stages';
import {
  designerStatusShort,
  designerStatusPillClass,
  jobHasUrgent,
  parseDesignerStatuses,
} from '../data/designerStatus';
import { Draggable } from '@hello-pangea/dnd';
import { AtSign, Calendar, Lock, Pin } from 'lucide-react';
import JobKindIcon from './JobKindIcon';
import AssignedNameBubble from './AssignedNameBubble';

interface JobCardProps {
  job: Job;
  index: number;
  onJobClick: (job: Job) => void;
  dragDisabled: boolean;
  mentionedForMe?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (jobId: number) => void;
}

function getDueDateIndicator(dueDate: string | null): { label: string; classes: string } | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}d overdue`, classes: 'bg-danger/10 text-danger' };
  }
  if (diffDays === 0) {
    return { label: 'Due today', classes: 'bg-warn/15 text-[#8a6d10]' };
  }
  if (diffDays === 1) {
    return { label: 'Due tomorrow', classes: 'bg-warn/10 text-[#8a6d10]' };
  }
  if (diffDays <= 7) {
    return { label: `${diffDays}d left`, classes: 'bg-success/10 text-success' };
  }
  return null;
}

function JobCardBody({
  job,
  mentionedForMe,
  selectMode,
  selected,
  onToggleSelect,
  dragDisabled,
  dueIndicator,
  pinned,
  statuses,
}: {
  job: Job;
  mentionedForMe: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect?: (jobId: number) => void;
  dragDisabled: boolean;
  dueIndicator: { label: string; classes: string } | null;
  pinned: string | undefined;
  statuses: ReturnType<typeof parseDesignerStatuses>;
}) {
  return (
    <>
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {selectMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(job.id)}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 shrink-0 accent-[rgb(var(--color-brand))]"
              aria-label={`Select ${job.job_name}`}
            />
          )}
          {job.client?.trim() ? (
            <span
              className="max-w-[46%] shrink-0 truncate font-mono text-[11px] font-medium text-ink-55 sm:text-xs"
              title={job.client.trim()}
            >
              {job.client.trim()}
            </span>
          ) : null}
          <AssignedNameBubble
            name={job.assigned_name}
            color={job.assigned_color}
          />
        </div>
        <div className="flex max-w-[48%] shrink-0 flex-wrap items-center justify-end gap-1">
          <JobKindIcon kind={job.job_kind} />
          {mentionedForMe && (
            <span
              className="inline-flex items-center gap-0.5 rounded-pill bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand"
              title="You were mentioned"
            >
              <AtSign className="h-2.5 w-2.5" />
              You
            </span>
          )}
          {pinned && (
            <Pin className="h-3 w-3 text-stage-production" aria-label="Has pinned brief" />
          )}
          {dragDisabled && !selectMode && (
            <Lock className="h-3 w-3 text-ink-30" aria-label="Assigned to another user" />
          )}
          {dueIndicator && !dragDisabled && (
            <span
              className={`rounded-pill px-1.5 py-0.5 text-[10px] font-semibold ${dueIndicator.classes}`}
            >
              {dueIndicator.label}
            </span>
          )}
        </div>
      </div>

      <h3 className="mb-2 line-clamp-2 text-sm font-medium leading-snug tracking-tight text-ink">
        {job.job_name}
      </h3>

      {pinned && (
        <p className="mb-2 line-clamp-2 rounded-md bg-stage-production/10 px-1.5 py-1 text-[11px] leading-snug text-ink-55">
          {pinned}
        </p>
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {statuses.map((s) => (
            <span
              key={s}
              className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-semibold ${designerStatusPillClass(s)}`}
            >
              {designerStatusShort(s)}
            </span>
          ))}
          {job.due_date && (
            <span className="flex items-center gap-1 text-[11px] text-ink-40">
              <Calendar className="h-2.5 w-2.5" />
              {new Date(job.due_date).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year:
                  new Date(job.due_date).getFullYear() !== new Date().getFullYear()
                    ? 'numeric'
                    : undefined,
              })}
            </span>
          )}
          <span
            className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-caps ${stageColor(job.stage)} ${stageTextColor(job.stage)}`}
          >
            {stageLabel(job.stage)}
          </span>
        </div>
        {job.last_note_preview && (
          <p
            className={`line-clamp-2 text-[11px] leading-snug ${
              mentionedForMe ? 'font-medium text-brand' : 'text-ink-40'
            }`}
            title={job.last_note_preview}
          >
            {job.last_note_preview}
          </p>
        )}
      </div>
    </>
  );
}

function cardClassName({
  urgent,
  mentionedForMe,
  selected,
  dragDisabled,
  selectMode,
  isDragging,
}: {
  urgent: boolean;
  mentionedForMe: boolean;
  selected: boolean;
  dragDisabled: boolean;
  selectMode: boolean;
  isDragging: boolean;
}): string {
  return `min-w-0 overflow-hidden rounded-[10px] border bg-card p-3.5 ${
    isDragging ? '' : 'jt-card-alive'
  } ${
    urgent
      ? 'border-danger bg-danger/[0.08] ring-2 ring-danger/40'
      : mentionedForMe
        ? 'ring-2 ring-brand/40 border-brand/40'
        : ''
  } ${
    selected ? 'border-brand bg-brand/[0.06]' : ''
  } ${
    dragDisabled && !selectMode
      ? 'cursor-default border-ink-6 opacity-70 hover:-translate-y-0'
      : isDragging
        ? 'border-brand/40 shadow-raised cursor-grabbing'
        : urgent
          ? 'cursor-pointer shadow-card hover:border-danger/60'
          : 'cursor-pointer border-ink-10 shadow-card hover:border-brand/30'
  }`;
}

function JobCard({
  job,
  index,
  onJobClick,
  dragDisabled,
  mentionedForMe = false,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: JobCardProps) {
  const dueIndicator = getDueDateIndicator(job.due_date);
  const pinned = job.pinned_brief?.trim();
  const statuses = parseDesignerStatuses(job.designer_status);
  const urgent = jobHasUrgent(statuses);

  function handleClick() {
    if (selectMode) {
      onToggleSelect?.(job.id);
      return;
    }
    onJobClick(job);
  }

  const body = (
    <JobCardBody
      job={job}
      mentionedForMe={mentionedForMe}
      selectMode={selectMode}
      selected={selected}
      onToggleSelect={onToggleSelect}
      dragDisabled={dragDisabled}
      dueIndicator={dueIndicator}
      pinned={pinned}
      statuses={statuses}
    />
  );

  if (selectMode) {
    return (
      <div
        onClick={handleClick}
        className={cardClassName({
          urgent,
          mentionedForMe,
          selected,
          dragDisabled,
          selectMode,
          isDragging: false,
        })}
      >
        {body}
      </div>
    );
  }

  return (
    <Draggable draggableId={`job-${job.id}`} index={index} isDragDisabled={dragDisabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={handleClick}
          className={cardClassName({
            urgent,
            mentionedForMe,
            selected,
            dragDisabled,
            selectMode,
            isDragging: snapshot.isDragging || snapshot.isDropAnimating,
          })}
        >
          {body}
        </div>
      )}
    </Draggable>
  );
}

export default memo(JobCard);
