/** Board name bubble — #RRGGBB or null. */
export function sanitizeBoardColor(raw: unknown): string | null {
  const s = String(raw || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
  return null;
}
