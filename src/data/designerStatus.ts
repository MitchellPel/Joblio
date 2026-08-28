import type { DesignerStatus } from '@/shared-types';

/** Designer + production/addon status options shown on board and job form. */
export const DESIGNER_STATUS_OPTIONS: {
  key: DesignerStatus;
  label: string;
  /** Short board label */
  short: string;
  pillClass: string;
}[] = [
  {
    key: 'urgent',
    label: 'Urgent',
    short: 'Urgent',
    pillClass: 'bg-danger text-white',
  },
  {
    key: 'proofing',
    label: 'Proofing',
    short: 'Proofing',
    pillClass: 'bg-[#fde68a] text-[#854d0e] dark:bg-[#854d0e]/45 dark:text-[#fde68a]',
  },
  {
    key: 'on_hold',
    label: 'On hold',
    short: 'On hold',
    pillClass: 'bg-[#e2e8f0] text-[#334155] dark:bg-[#475569]/55 dark:text-[#e2e8f0]',
  },
  {
    key: 'waiting_client',
    label: 'Waiting for client',
    short: 'Waiting client',
    pillClass: 'bg-[#a5f3fc] text-[#0e7490] dark:bg-[#155e75]/50 dark:text-[#a5f3fc]',
  },
  {
    key: 'approved',
    label: 'Approved',
    short: 'Approved',
    pillClass: 'bg-[#bbf7d0] text-[#166534] dark:bg-[#14532d]/50 dark:text-[#86efac]',
  },
  {
    key: 'ordered',
    label: 'Ordered',
    short: 'Ordered',
    pillClass: 'bg-[#c7d2fe] text-[#3730a3] dark:bg-[#312e81]/50 dark:text-[#c7d2fe]',
  },
  {
    key: 'printed',
    label: 'Printed',
    short: 'Printed',
    pillClass: 'bg-[#ddd6fe] text-[#6d28d9] dark:bg-[#5b21b6]/45 dark:text-[#ddd6fe]',
  },
  {
    key: 'cut',
    label: 'Cut',
    short: 'Cut',
    pillClass: 'bg-[#fed7aa] text-[#9a3412] dark:bg-[#7c2d12]/50 dark:text-[#fdba74]',
  },
  {
    key: 'welded',
    label: 'Welded',
    short: 'Welded',
    pillClass: 'bg-[#99f6e4] text-[#0f766e] dark:bg-[#115e59]/50 dark:text-[#99f6e4]',
  },
  {
    key: 'application',
    label: 'Application',
    short: 'Application',
    pillClass: 'bg-[#fbcfe8] text-[#9d174d] dark:bg-[#9d174d]/45 dark:text-[#f9a8d4]',
  },
];

export function isDesignerStatus(v: unknown): v is DesignerStatus {
  return DESIGNER_STATUS_OPTIONS.some((o) => o.key === v);
}

/** Parse DB value: legacy single string, JSON array, or real array. */
export function parseDesignerStatuses(v: unknown): DesignerStatus[] {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v.filter(isDesignerStatus);
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) return parsed.filter(isDesignerStatus);
      } catch {
        // fall through
      }
    }
    return isDesignerStatus(trimmed) ? [trimmed] : [];
  }
  return [];
}

export function serializeDesignerStatuses(statuses: DesignerStatus[] | null | undefined): string | null {
  if (!statuses?.length) return null;
  const unique = [...new Set(statuses.filter(isDesignerStatus))];
  if (!unique.length) return null;
  return JSON.stringify(unique);
}

export function designerStatusLabel(status: DesignerStatus | null | undefined): string {
  if (!status) return '';
  return DESIGNER_STATUS_OPTIONS.find((o) => o.key === status)?.label ?? status;
}

export function designerStatusShort(status: DesignerStatus | null | undefined): string {
  if (!status) return '';
  return DESIGNER_STATUS_OPTIONS.find((o) => o.key === status)?.short ?? status;
}

export function designerStatusPillClass(status: DesignerStatus | null | undefined): string {
  if (!status) return '';
  return (
    DESIGNER_STATUS_OPTIONS.find((o) => o.key === status)?.pillClass ??
    'bg-ink-6 text-ink-55'
  );
}

export function jobHasUrgent(statuses: DesignerStatus[] | null | undefined): boolean {
  return !!statuses?.includes('urgent');
}
