import { memo } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import type { Job } from '@/shared-types';
import type { StageDef } from '../data/stages';
import JobCard from './JobCard';

interface KanbanColumnProps {
  stage: StageDef;
  jobs: Job[];
  onJobClick: (job: Job) => void;
  isDragDisabled: (job: Job) => boolean;
  mentionedJobIds?: Set<number>;
  selectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (jobId: number) => void;
}

function KanbanColumn({
  stage,
  jobs,
  onJobClick,
  isDragDisabled,
  mentionedJobIds,
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: KanbanColumnProps) {
  const hasJobs = jobs.length > 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={`mb-2 flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-200 ${stage.headTint} hover:brightness-[1.03] dark:hover:brightness-110`}
      >
        <div className={stage.dotAlive} />
        <h3 className="truncate text-sm font-medium text-ink">{stage.label}</h3>
        <span className="rounded-pill bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-55">
          {jobs.length}
        </span>
      </div>

      <div className="jt-drop-zone min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <Droppable droppableId={stage.key} isDropDisabled={selectMode}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`w-full shrink-0 rounded-xl border border-transparent p-1.5 transition-colors duration-200 ${
                snapshot.isDraggingOver
                  ? 'border-brand/30 bg-brand/[0.07] ring-2 ring-brand/25'
                  : `${stage.colSurface} hover:brightness-[1.02] dark:hover:brightness-110`
              } ${!hasJobs && snapshot.isDraggingOver ? 'min-h-14' : ''}`}
            >
              <div className="flex flex-col gap-2">
                {jobs.map((job, index) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    index={index}
                    onClick={() => onJobClick(job)}
                    dragDisabled={isDragDisabled(job)}
                    mentionedForMe={mentionedJobIds?.has(job.id)}
                    selectMode={selectMode}
                    selected={selectedIds?.has(job.id)}
                    onToggleSelect={onToggleSelect}
                  />
                ))}
                {provided.placeholder}
                {!hasJobs && !snapshot.isDraggingOver && (
                  <div className="flex h-11 items-center justify-center rounded-lg border border-dashed border-ink-10/80 px-2 text-xs text-ink-40">
                    Drop jobs here
                  </div>
                )}
                {!hasJobs && snapshot.isDraggingOver && (
                  <div className="flex h-11 items-center justify-center rounded-lg border border-dashed border-brand/50 text-xs font-medium text-brand">
                    Release to drop
                  </div>
                )}
              </div>
            </div>
          )}
        </Droppable>
      </div>
    </div>
  );
}

export default memo(KanbanColumn);
