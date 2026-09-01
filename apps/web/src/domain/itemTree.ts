import { generateKeyBetween } from 'fractional-indexing';

// Pure helpers for the nested task tree: build the visible (flattened) rows for rendering, the
// cascade-collapse of a node, and the sibling-only reorder target. Ported from the mobile app
// (src/domain/itemTree.ts) and made generic over any item with id/parent/sortOrder/completed, so
// it works on the API's SharedItemDto directly. Framework-free and unit-tested.

export interface TreeItem {
  id: string;
  parentItemId?: string | null;
  sortOrder: string;
  completed: boolean;
  completedAt?: string | null;
}

export interface VisibleRow<T extends TreeItem> {
  item: T;
  depth: number;
  hasChildren: boolean;
}

/** Per-list display of completed tasks: in place, in a section below the open tasks, or hidden. */
export type CompletedMode = 'inline' | 'below' | 'hidden';

const bySort = (a: TreeItem, b: TreeItem) => (a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0);

/** Group items by effective parent (a parent that isn't present → the item is treated as a root,
 *  so nothing disappears if a parent is missing). Each group is sorted by sortOrder. */
function byParent<T extends TreeItem>(items: T[]): Map<string | null, T[]> {
  const ids = new Set(items.map(i => i.id));
  const map = new Map<string | null, T[]>();
  for (const it of items) {
    const parent = it.parentItemId && ids.has(it.parentItemId) ? it.parentItemId : null;
    const arr = map.get(parent);
    if (arr) arr.push(it);
    else map.set(parent, [it]);
  }
  for (const arr of map.values()) arr.sort(bySort);
  return map;
}

/** Flatten the item forest to visible rows (depth-first), descending only into expanded ids.
 *  When hideCompleted is true, completed items are skipped (their incomplete children surface as
 *  roots) — except ids in `keep`, so a task someone else just ticked off can be seen being ticked
 *  off instead of vanishing. */
export function buildVisibleRows<T extends TreeItem>(
  items: T[],
  expanded: Set<string>,
  hideCompleted: boolean,
  keep: ReadonlySet<string> = new Set(),
): VisibleRow<T>[] {
  const src = hideCompleted ? items.filter(i => !i.completed || keep.has(i.id)) : items;
  const children = byParent(src);
  const rows: VisibleRow<T>[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const it of children.get(parentId) ?? []) {
      const kids = children.get(it.id) ?? [];
      rows.push({ item: it, depth, hasChildren: kids.length > 0 });
      if (kids.length > 0 && expanded.has(it.id)) walk(it.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Rendered rows for a completed-display mode. `below` keeps the open-task tree, then gathers the
 *  completed items flat underneath (newest first). Mirrors ListDetailScreen's `rows` memo. */
export function rowsForMode<T extends TreeItem>(
  items: T[],
  expanded: Set<string>,
  mode: CompletedMode,
  keep: ReadonlySet<string> = new Set(),
): VisibleRow<T>[] {
  if (mode !== 'below') return buildVisibleRows(items, expanded, mode === 'hidden', keep);
  const open = buildVisibleRows(items, expanded, true, keep);
  const doneKey = (i: T) => i.completedAt ?? '';
  const done = items
    .filter(i => i.completed && !keep.has(i.id))
    .sort((a, b) => (doneKey(b) < doneKey(a) ? -1 : doneKey(b) > doneKey(a) ? 1 : 0))
    .map(item => ({ item, depth: 0, hasChildren: false }));
  return [...open, ...done];
}

/** Collapse `itemId` and all of its descendants (cascade), so re-expanding shows sublevels collapsed. */
export function collapseDescendants<T extends TreeItem>(expanded: Set<string>, itemId: string, items: T[]): Set<string> {
  const children = byParent(items);
  const next = new Set(expanded);
  const remove = (id: string) => {
    next.delete(id);
    for (const c of children.get(id) ?? []) remove(c.id);
  };
  remove(itemId);
  return next;
}

/** All descendant ids of `itemId` (children, grandchildren, …) — used to delete a whole subtree. */
export function descendantIds<T extends TreeItem>(items: T[], itemId: string): string[] {
  const children = byParent(items);
  const out: string[] = [];
  const walk = (id: string) => {
    for (const c of children.get(id) ?? []) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(itemId);
  return out;
}

/**
 * Sibling-only reorder target. Given the post-drop flattened `rows`, look at the dragged item's
 * siblings (same raw parent) in their new order and return the fractional key between its new
 * neighbors, keeping its parent unchanged. Returns null if it can't produce a valid key.
 */
export function siblingReorder<T extends TreeItem>(
  rows: VisibleRow<T>[],
  draggedId: string,
): { sortOrder: string; parentItemId: string | null } | null {
  const dragged = rows.find(r => r.item.id === draggedId)?.item;
  if (!dragged) return null;
  const parentItemId = dragged.parentItemId ?? null;
  const siblings = rows.filter(r => (r.item.parentItemId ?? null) === parentItemId).map(r => r.item);
  const idx = siblings.findIndex(s => s.id === draggedId);
  if (idx < 0) return null;
  const prev = idx > 0 ? siblings[idx - 1].sortOrder : null;
  const next = idx < siblings.length - 1 ? siblings[idx + 1].sortOrder : null;
  if (prev !== null && next !== null && prev >= next) return null; // neighbors not ordered — bail
  try {
    return { sortOrder: generateKeyBetween(prev, next), parentItemId };
  } catch {
    return null;
  }
}

/** A parent's direct children, in sort order. */
export function childrenOf<T extends TreeItem>(items: T[], parentId: string): T[] {
  return items.filter(i => i.parentItemId === parentId).sort(bySort);
}

/** sortOrder for a new child appended after a parent's existing children. */
export function nextChildSortOrder<T extends TreeItem>(items: T[], parentId: string): string {
  const kids = childrenOf(items, parentId);
  return generateKeyBetween(kids.length ? kids[kids.length - 1].sortOrder : null, null);
}

/** sortOrder for a new top-level task inserted at the top (before the first root). */
export function topSortOrder<T extends TreeItem>(items: T[]): string {
  const topKeys = items.filter(i => (i.parentItemId ?? null) === null).map(i => i.sortOrder).sort();
  return generateKeyBetween(null, topKeys.length ? topKeys[0] : null);
}
