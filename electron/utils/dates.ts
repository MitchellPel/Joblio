/** Local calendar-date helpers (YYYY-MM-DD). Avoid UTC so office dates stay on the intended day. */

export function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function clampDurationDays(n: unknown): 1 | 3 {
  return Number(n) === 3 ? 3 : 1;
}

export function installSpanDates(start: string, durationDays?: number | null): string[] {
  const n = clampDurationDays(durationDays);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addCalendarDays(start, i));
  return out;
}

/** Inclusive range so 3-day installs that started up to 2 days before the month still overlap. */
export function monthOverlapRange(yearMonth: string): { from: string; to: string } {
  const from = addCalendarDays(`${yearMonth}-01`, -2);
  const [y, m] = yearMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from, to: `${yearMonth}-${String(last).padStart(2, '0')}` };
}
