/** Board name bubble — #RRGGBB or null. */
export function sanitizeBoardColor(raw: unknown): string | null {
  const s = String(raw || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
  return null;
}

export function boardColorText(bg: string): string {
  const r = parseInt(bg.slice(1, 3), 16) / 255;
  const g = parseInt(bg.slice(3, 5), 16) / 255;
  const b = parseInt(bg.slice(5, 7), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.58 ? '#1A1A1A' : '#FFFFFF';
}

export const BOARD_COLOR_PRESETS = [
  '#2563EB',
  '#0D9488',
  '#16A34A',
  '#CA8A04',
  '#EA580C',
  '#DC2626',
  '#DB2777',
  '#7C3AED',
  '#4B5563',
];
