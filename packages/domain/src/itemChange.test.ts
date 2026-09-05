import { describe, it, expect } from 'vitest';
import { changeLabel, diffItems, type ChangeableItem } from './itemChange';

function item(id: string, over: Partial<ChangeableItem> = {}): ChangeableItem {
  return { id, title: id, completed: false, tags: [], ...over };
}

const prevOf = <T extends ChangeableItem>(items: T[]) => new Map(items.map(i => [i.id, i]));

const ANNA = { principalId: 'anna-p', email: 'anna@example.com', displayName: 'Anna Svensson' };

describe('diffItems', () => {
  it('reports nothing on a first load (no previous read to compare against)', () => {
    expect(diffItems(new Map(), [item('A'), item('B')])).toEqual([]);
  });

  it('reports a completion with the actor the item records, whatever its type', () => {
    expect(diffItems(prevOf([item('A')]), [item('A', { completed: true, completedBy: ANNA })])).toEqual([
      { itemId: 'A', kind: 'completed', actor: ANNA },
    ]);
    expect(diffItems(prevOf([item('A')]), [item('A', { completed: true, completedBy: 'anna-p' })])).toEqual([
      { itemId: 'A', kind: 'completed', actor: 'anna-p' },
    ]);
  });

  it('attributes a reopen to whoever had completed it (the new state has cleared it)', () => {
    const before = [item('A', { completed: true, completedBy: ANNA })];
    const after = [item('A', { completed: false, completedBy: null })];

    expect(diffItems(prevOf(before), after)).toEqual([
      { itemId: 'A', kind: 'reopened', actor: ANNA },
    ]);
  });

  it('classifies a rename, an added item and any other visible edit', () => {
    const before = [item('A'), item('B')];
    const after = [item('A', { title: 'New name' }), item('B', { priority: 5 }), item('C', { createdBy: ANNA })];

    expect(diffItems(prevOf(before), after)).toEqual([
      { itemId: 'A', kind: 'renamed', actor: null },
      { itemId: 'B', kind: 'updated', actor: null },
      { itemId: 'C', kind: 'added', actor: ANNA },
    ]);
  });

  it('counts a reassignment as a change (the row renders the assignee)', () => {
    const before = [item('A', { assignedTo: 'anna-p' })];
    const after = [item('A', { assignedTo: 'bob-p' })];

    expect(diffItems(prevOf(before), after)).toEqual([{ itemId: 'A', kind: 'updated', actor: null }]);
  });

  it('counts a tag add or removal as a change (the row renders tag chips)', () => {
    const before = [item('A', { tags: ['t1'] }), item('B', { tags: ['t1', 't2'] })];
    const after = [item('A', { tags: ['t1', 't2'] }), item('B', { tags: ['t2'] })];

    expect(diffItems(prevOf(before), after).map(c => [c.itemId, c.kind])).toEqual([
      ['A', 'updated'],
      ['B', 'updated'],
    ]);
  });

  it('ignores a reordered tag list — the chips look the same', () => {
    const before = [item('A', { tags: ['t1', 't2'] })];
    const after = [item('A', { tags: ['t2', 't1'] })];

    expect(diffItems(prevOf(before), after)).toEqual([]);
  });

  it('ignores what the row does not render (sortOrder, updatedAt, LWW guards)', () => {
    const before = [item('A')];
    const after = [{ ...item('A'), sortOrder: 'zz', updatedAt: '2026-07-29T00:00:00.000Z', nameCmd: 'c1' }];

    expect(diffItems(prevOf(before), after)).toEqual([]);
  });

  it('reports each changed item once, and skips the unchanged ones', () => {
    const before = [item('A'), item('B'), item('C')];
    const after = [item('A'), item('B', { completed: true }), item('C', { dueAt: '2026-08-01T00:00:00.000Z' })];

    expect(diffItems(prevOf(before), after).map(c => c.itemId)).toEqual(['B', 'C']);
  });
});

describe('changeLabel', () => {
  it('keeps only the first name, from a PersonRef or a plain string', () => {
    expect(changeLabel('completed', ANNA)).toBe('Anna completed');
    expect(changeLabel('completed', 'Anna Svensson')).toBe('Anna completed');
  });

  it('falls back to the local part of an email', () => {
    expect(changeLabel('renamed', { email: 'bob@example.com' })).toBe('bob renamed');
    expect(changeLabel('renamed', 'anna@example.com')).toBe('anna renamed');
  });

  it('says the change came from elsewhere when nobody is recorded', () => {
    expect(changeLabel('completed', null)).toBe('Completed elsewhere');
    expect(changeLabel('updated', null)).toBe('Changed elsewhere');
  });

  it('treats a blank display name as unknown', () => {
    expect(changeLabel('added', { displayName: '  ' })).toBe('Added elsewhere');
    expect(changeLabel('added', '  ')).toBe('Added elsewhere');
  });
});
