import type { StageHistoryEntry } from '@/shared-types';
import { stageColor, stageTextColor, stageLabel, stageDot } from '../data/stages';
import { Clock } from 'lucide-react';

interface StageTimelineProps {
  history: StageHistoryEntry[];
}

export default function StageTimeline({ history }: StageTimelineProps) {
  if (history.length === 0) {
    return (
      <div className="py-6 text-center text-sm italic text-ink-40">
        No stage changes recorded yet.
      </div>
    );
  }

  return (
    <div className="relative space-y-0">
      {history.map((entry, i) => {
        const isLast = i === history.length - 1;
        const fromLabel = entry.from_stage ? stageLabel(entry.from_stage) : 'Created';
        const toLabel = stageLabel(entry.to_stage);

        return (
          <div key={entry.id} className="flex gap-3">
            <div className="flex shrink-0 flex-col items-center">
              <div className={`z-10 h-3 w-3 rounded-full ${stageDot(entry.to_stage)} ring-2 ring-canvas`} />
              {!isLast && <div className="my-0.5 w-px flex-1 bg-ink-10" />}
            </div>

            <div className="pb-5">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-ink-55">
                  {entry.changed_name || 'Unknown'}
                </span>
                <span className="flex items-center gap-1 text-xs text-ink-40">
                  <Clock className="h-3 w-3" />
                  {new Date(entry.changed_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-ink-90">
                {entry.from_stage ? (
                  <>
                    Moved from{' '}
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${stageColor(entry.from_stage)} ${stageTextColor(entry.from_stage)}`}
                    >
                      {fromLabel}
                    </span>{' '}
                    to{' '}
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${stageColor(entry.to_stage)} ${stageTextColor(entry.to_stage)}`}
                    >
                      {toLabel}
                    </span>
                  </>
                ) : (
                  <>
                    Created in{' '}
                    <span
                      className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${stageColor(entry.to_stage)} ${stageTextColor(entry.to_stage)}`}
                    >
                      {toLabel}
                    </span>
                  </>
                )}
              </p>
              {entry.note && (
                <p className="mt-1.5 rounded-lg bg-surface-soft px-2.5 py-1.5 text-sm italic text-ink-55">
                  &ldquo;{entry.note}&rdquo;
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
