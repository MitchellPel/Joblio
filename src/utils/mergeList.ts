/**
 * Merge a freshly fetched list into the previous state, reusing object
 * references for unchanged rows. If nothing changed at all, the previous
 * array is returned untouched so React state consumers skip re-rendering —
 * this is what stops background sync from repainting the whole page.
 */
export function mergeList<T extends { id: number }>(prev: T[], next: T[]): T[] {
  const prevById = new Map<number, T>();
  for (const item of prev) prevById.set(item.id, item);

  let changed = prev.length !== next.length;
  const merged = next.map((item, i) => {
    const existing = prevById.get(item.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(item)) {
      if (!changed && prev[i] !== existing) changed = true; // reordered
      return existing;
    }
    changed = true;
    return item;
  });

  return changed ? merged : prev;
}
