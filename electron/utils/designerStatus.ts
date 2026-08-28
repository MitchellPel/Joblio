import type { DesignerStatus } from '../preload';

const VALID: ReadonlySet<string> = new Set([
  'urgent',
  'proofing',
  'on_hold',
  'waiting_client',
  'approved',
  'ordered',
  'printed',
  'cut',
  'welded',
  'application',
]);

export function isDesignerStatus(v: unknown): v is DesignerStatus {
  return typeof v === 'string' && VALID.has(v);
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

/** @deprecated use parseDesignerStatuses — kept for single-value call sites during transition */
export function parseDesignerStatus(v: unknown): DesignerStatus | null {
  const list = parseDesignerStatuses(v);
  return list[0] ?? null;
}
