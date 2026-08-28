/** Shared month-grid helpers (Rigging + Vehicle Bookings). */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function parseYearMonth(ym: string): { year: number; month: number } {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m - 1 };
}

export function formatYearMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isWeekend(year: number, monthIndex: number, day: number): boolean {
  const d = new Date(year, monthIndex, day).getDay();
  return d === 0 || d === 6;
}

export function buildCalendarDays(year: number, monthIndex: number): (number | null)[] {
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function formatMonthLabel(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  return `${MONTH_NAMES[month]} ${year}`;
}

export function todayKey(): string {
  const now = new Date();
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

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
