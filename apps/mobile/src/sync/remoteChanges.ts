// Which item ids a pull (someone else's edit) changed, so the list can announce them; numbered so each reader
// sees every pull exactly once without consuming it from the others.

let latest = 0;
const pulledAt = new Map<string, number>();

export function notePulled(ids: readonly string[]): void {
  latest++;
  for (const id of ids) pulledAt.set(id, latest);
}

export function pullSeq(): number {
  return latest;
}

/** Ids changed by a pull after `seq`. */
export function pulledSince(seq: number): Set<string> {
  const ids = new Set<string>();
  for (const [id, at] of pulledAt) if (at > seq) ids.add(id);
  return ids;
}
