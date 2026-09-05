// Render-neutral strings both clients show for a task, so they cannot disagree on what it reads as.

/** "2 kg"-style quantity label for shopping items, or null when there's nothing to show. */
export function qtyLabel(it: { quantity?: number | null; unit?: string | null }): string | null {
  if (it.quantity == null && !it.unit) return null;
  const q = it.quantity != null ? String(it.quantity) : '';
  return `${q}${q && it.unit ? ' ' : ''}${it.unit ?? ''}`.trim() || null;
}

/** A task's priority as text, given the list's mode: a star toggle, or a 0–9 level. */
export function priorityLabel(simple: boolean, value: number): string {
  if (simple) return value > 0 ? 'Starred' : 'Not starred';
  return value <= 0 ? 'None' : `Level ${value}`;
}
