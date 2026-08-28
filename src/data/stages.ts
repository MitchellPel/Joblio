import type { StageKey } from '@/shared-types';

export interface StageDef {
  key: StageKey;
  label: string;
  color: string;       // Tailwind bg color class
  borderColor: string; // Tailwind border
  textColor: string;   // Tailwind text color
  dot: string;         // solid dot for column headers
  headTint: string;    // themed background wash for the column header
  colSurface: string;  // themed tinted surface for the drop zone
  dotAlive: string;    // stage dot with colored ring
}

export const STAGES: StageDef[] = [
  {
    key: 'new',
    label: 'New Job',
    color: 'bg-surface-deep',
    borderColor: 'border-ink-55',
    textColor: 'text-ink',
    dot: 'bg-stage-new',
    headTint: 'jt-col-head-new',
    colSurface: 'jt-col-new',
    dotAlive: 'jt-stage-dot jt-stage-dot-new',
  },
  {
    key: 'design',
    label: 'Design',
    color: 'bg-stage-col-design',
    borderColor: 'border-stage-design',
    textColor: 'text-stage-design',
    dot: 'bg-stage-design',
    headTint: 'jt-col-head-design',
    colSurface: 'jt-col-design',
    dotAlive: 'jt-stage-dot jt-stage-dot-design',
  },
  {
    key: 'production',
    label: 'Production',
    color: 'bg-stage-col-production',
    borderColor: 'border-stage-production',
    textColor: 'text-stage-production',
    dot: 'bg-stage-production',
    headTint: 'jt-col-head-production',
    colSurface: 'jt-col-production',
    dotAlive: 'jt-stage-dot jt-stage-dot-production',
  },
  {
    key: 'install',
    label: 'Install',
    color: 'bg-stage-col-install',
    borderColor: 'border-stage-install',
    textColor: 'text-stage-install',
    dot: 'bg-stage-install',
    headTint: 'jt-col-head-install',
    colSurface: 'jt-col-install',
    dotAlive: 'jt-stage-dot jt-stage-dot-install',
  },
  {
    key: 'collection',
    label: 'Collection',
    color: 'bg-stage-col-collection',
    borderColor: 'border-stage-collection',
    textColor: 'text-stage-collection',
    dot: 'bg-stage-collection',
    headTint: 'jt-col-head-collection',
    colSurface: 'jt-col-collection',
    dotAlive: 'jt-stage-dot jt-stage-dot-collection',
  },
  {
    key: 'completed',
    label: 'Completed',
    color: 'bg-surface',
    borderColor: 'border-ink-10',
    textColor: 'text-ink-55',
    dot: 'bg-stage-completed',
    headTint: 'jt-col-head-completed',
    colSurface: 'jt-col-completed',
    dotAlive: 'jt-stage-dot jt-stage-dot-completed',
  },
];

export const stageLabel = (key: StageKey): string =>
  STAGES.find((s) => s.key === key)?.label ?? key;

export const stageColor = (key: StageKey): string =>
  STAGES.find((s) => s.key === key)?.color ?? 'bg-surface-deep';

export const stageTextColor = (key: StageKey): string =>
  STAGES.find((s) => s.key === key)?.textColor ?? 'text-ink';

export const stageBorderColor = (key: StageKey): string =>
  STAGES.find((s) => s.key === key)?.borderColor ?? 'border-ink-55';

export const stageDot = (key: StageKey): string =>
  STAGES.find((s) => s.key === key)?.dot ?? 'bg-stage-new';

export const stageHeadTint = (key: StageKey): string =>
  STAGES.find((s) => s.key === key)?.headTint ?? 'jt-col-head-new';

export const stageColSurface = (key: StageKey): string =>
  STAGES.find((s) => s.key === key)?.colSurface ?? 'jt-col-new';

export const stageDotAlive = (key: StageKey): string =>
  STAGES.find((s) => s.key === key)?.dotAlive ?? 'jt-stage-dot jt-stage-dot-new';
