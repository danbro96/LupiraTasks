// Render-neutral on the API (a list carries a `simplePriority` flag, items a 0–9 `priority`); the
// client turns that into either a star (0↔1) or a 0–9 scale. This is the small shared mapping.

/** A human label for a task's priority given the list's mode. */
export function priorityLabel(simple: boolean, value: number): string {
  if (value <= 0) return 'None';
  return simple ? 'Starred' : `Priority ${value}`;
}
