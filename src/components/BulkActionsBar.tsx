import { Archive, CheckSquare, UserRound, X } from 'lucide-react';
import { STAGES, type StageDef } from '../data/stages';
import type { StageKey } from '@/shared-types';

export interface StaffOption {
  id: number;
  full_name: string;
}

interface BulkActionsBarProps {
  count: number;
  staff: StaffOption[];
  canArchive: boolean;
  busy: boolean;
  onClear: () => void;
  onReassign: (userId: number | null) => void;
  onMoveStage: (stage: StageKey) => void;
  onArchive: () => void;
}

export default function BulkActionsBar({
  count,
  staff,
  canArchive,
  busy,
  onClear,
  onReassign,
  onMoveStage,
  onArchive,
}: BulkActionsBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand/8 px-3 py-2">
      <CheckSquare className="h-4 w-4 shrink-0 text-brand" />
      <span className="text-sm font-medium text-ink">
        {count} selected
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-ink-55">
          <UserRound className="h-3.5 w-3.5" />
          <select
            disabled={busy}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') return;
              onReassign(v === 'none' ? null : parseInt(v, 10));
              e.target.value = '';
            }}
            className="jt-input !w-auto !py-1 !text-xs"
            aria-label="Reassign selected jobs"
          >
            <option value="" disabled>
              Reassign…
            </option>
            <option value="none">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </label>

        <select
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value as StageKey | '';
            if (!v) return;
            onMoveStage(v);
            e.target.value = '';
          }}
          className="jt-input !w-auto !py-1 !text-xs"
          aria-label="Move selected jobs"
        >
          <option value="" disabled>
            Move to stage…
          </option>
          {STAGES.map((s: StageDef) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        {canArchive && (
          <button
            type="button"
            disabled={busy}
            onClick={onArchive}
            className="jt-btn-ghost !py-1 !text-xs !text-stage-production"
            title="Archive completed jobs in selection"
          >
            <Archive className="h-3.5 w-3.5" />
            Archive
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto rounded-lg p-1.5 text-ink-40 hover:bg-ink-6 hover:text-ink"
        aria-label="Clear selection"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
