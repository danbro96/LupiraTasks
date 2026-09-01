import { describe, it, expect } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import {
  buildVisibleRows,
  rowsForMode,
  collapseDescendants,
  descendantIds,
  siblingReorder,
  childrenOf,
  nextChildSortOrder,
  topSortOrder,
  type TreeItem,
} from './itemTree';

// Generate n ascending, *valid* fractional-index keys (the library validates key format, so we
// can't just use 'a0','b0',… — only generateKeyBetween output is well-formed).
function keys(n: number): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = generateKeyBetween(prev, null);
    out.push(prev);
  }
  return out;
}

const [K0, K1, K2] = keys(3); // root keys, K0 < K1 < K2
const [C0, C1] = keys(2); // child keys, C0 < C1

function item(partial: Partial<TreeItem> & { id: string; sortOrder: string }): TreeItem {
  return { parentItemId: null, completed: false, ...partial };
}

// Three roots a<b<c, with b having two children b1<b2.
function fixture(): TreeItem[] {
  return [
    item({ id: 'a', sortOrder: K0 }),
    item({ id: 'b', sortOrder: K1 }),
    item({ id: 'c', sortOrder: K2 }),
    item({ id: 'b1', parentItemId: 'b', sortOrder: C0 }),
    item({ id: 'b2', parentItemId: 'b', sortOrder: C1 }),
  ];
}

describe('buildVisibleRows', () => {
  it('orders roots by sortOrder and hides collapsed children', () => {
    const rows = buildVisibleRows(fixture(), new Set(), false);
    expect(rows.map(r => r.item.id)).toEqual(['a', 'b', 'c']);
    expect(rows.find(r => r.item.id === 'b')?.hasChildren).toBe(true);
  });

  it('descends into expanded parents with increasing depth', () => {
    const rows = buildVisibleRows(fixture(), new Set(['b']), false);
    expect(rows.map(r => r.item.id)).toEqual(['a', 'b', 'b1', 'b2', 'c']);
    expect(rows.find(r => r.item.id === 'b1')?.depth).toBe(1);
  });

  it('hides completed items when asked', () => {
    const items = fixture().map(i => (i.id === 'a' ? { ...i, completed: true } : i));
    const rows = buildVisibleRows(items, new Set(['b']), true);
    expect(rows.map(r => r.item.id)).toEqual(['b', 'b1', 'b2', 'c']);
  });

  it('treats items whose parent is missing as roots (nothing disappears)', () => {
    const orphan = [item({ id: 'x', parentItemId: 'gone', sortOrder: K0 })];
    const rows = buildVisibleRows(orphan, new Set(), false);
    expect(rows.map(r => r.item.id)).toEqual(['x']);
    expect(rows[0].depth).toBe(0);
  });
});

describe('rowsForMode', () => {
  const items = fixture().map(i =>
    i.id === 'a' ? { ...i, completed: true, completedAt: '2026-01-02T00:00:00Z' } : i,
  );

  it('inline shows everything in tree order', () => {
    const rows = rowsForMode(items, new Set(['b']), 'inline');
    expect(rows.map(r => r.item.id)).toEqual(['a', 'b', 'b1', 'b2', 'c']);
  });

  it('hidden drops completed items', () => {
    const rows = rowsForMode(items, new Set(), 'hidden');
    expect(rows.map(r => r.item.id)).not.toContain('a');
  });

  it('below puts open tasks first, completed flat underneath', () => {
    const rows = rowsForMode(items, new Set(), 'below');
    expect(rows.map(r => r.item.id)).toEqual(['b', 'c', 'a']);
  });

  it('a held completed item stays visible in hidden mode', () => {
    const rows = rowsForMode(items, new Set(), 'hidden', new Set(['a']));
    expect(rows.map(r => r.item.id)).toContain('a');
  });

  it('a held completed item keeps its tree position in below mode, not the COMPLETED block', () => {
    const rows = rowsForMode(items, new Set(), 'below', new Set(['a']));
    // 'a' sorts first among the roots — held, it stays there instead of moving to the end.
    expect(rows.map(r => r.item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('collapseDescendants / descendantIds', () => {
  it('descendantIds returns the whole subtree', () => {
    expect(descendantIds(fixture(), 'b').sort()).toEqual(['b1', 'b2']);
  });

  it('collapseDescendants removes the node and its children from expanded', () => {
    const next = collapseDescendants(new Set(['b', 'b1']), 'b', fixture());
    expect(next.has('b')).toBe(false);
    expect(next.has('b1')).toBe(false);
  });
});

describe('childrenOf / nextChildSortOrder / topSortOrder', () => {
  it('childrenOf returns direct children in sort order', () => {
    expect(childrenOf(fixture(), 'b').map(i => i.id)).toEqual(['b1', 'b2']);
  });

  it('nextChildSortOrder sorts after the last existing child', () => {
    const key = nextChildSortOrder(fixture(), 'b');
    expect(key > C1).toBe(true);
  });

  it('topSortOrder sorts before the first root', () => {
    const key = topSortOrder(fixture());
    expect(key < K0).toBe(true);
  });

  it('topSortOrder on an empty list returns a valid first key', () => {
    expect(typeof topSortOrder([])).toBe('string');
  });
});

describe('siblingReorder', () => {
  it('produces a key between the dragged item new neighbors among same-parent siblings', () => {
    // Post-drop order: move 'c' between 'a' and 'b' at root level.
    const reordered = [
      { item: item({ id: 'a', sortOrder: K0 }), depth: 0, hasChildren: false },
      { item: item({ id: 'c', sortOrder: K2 }), depth: 0, hasChildren: false },
      { item: item({ id: 'b', sortOrder: K1 }), depth: 0, hasChildren: false },
    ];
    const target = siblingReorder(reordered, 'c');
    expect(target).not.toBeNull();
    expect(target!.parentItemId).toBeNull();
    expect(target!.sortOrder > K0 && target!.sortOrder < K1).toBe(true);
  });

  it('keeps the dragged item parent and only considers its siblings', () => {
    const [a, b] = keys(2);
    const reordered = [
      { item: item({ id: 'p', sortOrder: K0 }), depth: 0, hasChildren: true },
      { item: item({ id: 'c2', parentItemId: 'p', sortOrder: b }), depth: 1, hasChildren: false },
      { item: item({ id: 'c1', parentItemId: 'p', sortOrder: a }), depth: 1, hasChildren: false },
    ];
    const target = siblingReorder(reordered, 'c2');
    expect(target!.parentItemId).toBe('p');
    expect(target!.sortOrder < a).toBe(true); // c2 moved before c1
  });
});
