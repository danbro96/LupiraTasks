// What changed about an item when someone else edited it, so the list can say so instead of
// silently redrawing the row. Ported from the mobile app (src/domain/itemChange.ts) and made
// generic over the item shape — the web's item type lives in data/, which domain can't import.

export type ItemChangeKind = 'added' | 'completed' | 'reopened' | 'renamed' | 'updated';

/** Structurally compatible with the API's PersonRef, without importing it. */
export interface ActorRef {
  principalId?: string;
  email?: string;
  displayName?: string | null;
}

/** The fields a diff reads. Matches what a task row renders, nothing more. */
export interface ChangeableItem {
  id: string;
  title: string;
  completed: boolean;
  notes?: string | null;
  dueAt?: string | null;
  priority?: number | null;
  quantity?: number | null;
  unit?: string | null;
  parentItemId?: string | null;
  tags: string[];
  completedBy?: ActorRef | null;
  createdBy?: ActorRef | null;
}

export interface ItemChange {
  itemId: string;
  kind: ItemChangeKind;
  /** Who did it, when the item records one (completions and adds), else null. */
  actor: ActorRef | null;
}

const SCALARS = ['notes', 'dueAt', 'priority', 'quantity', 'unit', 'parentItemId'] as const;

function visiblyDiffers(a: ChangeableItem, b: ChangeableItem): boolean {
  if (SCALARS.some(k => a[k] !== b[k])) return true;
  // Tags render as chips on the row, so an add/remove is a visible change. Order-insensitive.
  return [...a.tags].sort().join() !== [...b.tags].sort().join();
}

/**
 * Diff a fresh read of a list's items against the previous one. Empty `prev` yields nothing — a
 * first load is not a set of changes. sortOrder is excluded: a remote reorder is self-evident, and
 * highlighting every moved row would drown the real edits.
 */
export function diffItems<T extends ChangeableItem>(
  prev: Map<string, T>,
  next: readonly T[],
): ItemChange[] {
  if (prev.size === 0) return [];
  const out: ItemChange[] = [];
  for (const item of next) {
    const before = prev.get(item.id);
    if (!before) {
      out.push({ itemId: item.id, kind: 'added', actor: item.createdBy ?? null });
      continue;
    }
    if (before.completed !== item.completed) {
      out.push({
        itemId: item.id,
        kind: item.completed ? 'completed' : 'reopened',
        actor: (item.completed ? item.completedBy : before.completedBy) ?? null,
      });
    } else if (before.title !== item.title) {
      out.push({ itemId: item.id, kind: 'renamed', actor: null });
    } else if (visiblyDiffers(before, item)) {
      out.push({ itemId: item.id, kind: 'updated', actor: null });
    }
  }
  return out;
}

const VERB: Record<ItemChangeKind, string> = {
  added: 'added',
  completed: 'completed',
  reopened: 'reopened',
  renamed: 'renamed',
  updated: 'changed',
};

/** First name only — a full name or an email fallback won't fit beside the title. */
function firstName(who: ActorRef): string {
  const raw = who.displayName ?? who.email ?? '';
  return raw.trim().split(/\s+/)[0].split('@')[0];
}

/** Two words at most — the label shares the title's line, so anything longer ellipsises. */
export function changeLabel(kind: ItemChangeKind, who: ActorRef | null): string {
  const verb = VERB[kind];
  const name = who ? firstName(who) : '';
  return name ? `${name} ${verb}` : `${verb[0].toUpperCase()}${verb.slice(1)} elsewhere`;
}
