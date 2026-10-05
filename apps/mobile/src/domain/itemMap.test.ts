import { describe, it, expect } from 'vitest';
import type { ItemDto, ItemGuardsDto } from '@lupira/tasks-api/models';
import { ItemStatus } from '@lupira/tasks-api/models';
import { itemFromWire } from './itemMap';

const TS = '2026-06-01T10:00:00.000Z';

const guard = (n: number) => ({ ts: `2026-05-0${n}T00:00:00.1234567+00:00`, cmd: `0000000${n}-0000-0000-0000-000000000000` });

const GUARDS: ItemGuardsDto = {
  name: guard(1), notes: guard(2), assignee: guard(3), due: guard(4), qty: guard(5),
  priority: guard(6), status: guard(7), move: guard(8), metadata: guard(9), tags: {},
};

function toState(over: Partial<ItemDto> = {}, guards: ItemGuardsDto = GUARDS) {
  return itemFromWire({ item: makeResponse(over), guards });
}

function makeResponse(over: Partial<ItemDto> = {}): ItemDto {
  return {
    id: 'item-1', listId: 'list-1',
    title: 'Buy milk', status: ItemStatus.Open, completed: false, priority: 0,
    tags: [], sortOrder: 'a0',
    createdAt: '2026-05-01T00:00:00.000Z', updatedAt: TS,
    ...over,
  };
}

describe('itemFromWire', () => {
  it('copies core fields and marks the item not-deleted', () => {
    const s = toState({ title: 'Eggs', completed: true, sortOrder: 'b2' });
    expect(s.id).toBe('item-1');
    expect(s.listId).toBe('list-1');
    expect(s.title).toBe('Eggs');
    expect(s.completed).toBe(true);
    expect(s.sortOrder).toBe('b2');
    expect(s.deleted).toBe(false);
  });

  it('takes each field guard from the server, status as the completion guard', () => {
    const s = toState();
    expect([s.nameTs, s.notesTs, s.assigneeTs, s.dueTs, s.qtyTs, s.priorityTs, s.completedTs, s.moveTs])
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => guard(n).ts));
    expect([s.nameCmd, s.notesCmd, s.assigneeCmd, s.dueCmd, s.qtyCmd, s.priorityCmd, s.completedCmd, s.moveCmd])
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => guard(n).cmd));
  });

  it('maps absent optional fields to null', () => {
    const s = toState();
    expect(s.parentItemId).toBeNull();
    expect(s.notes).toBeNull();
    expect(s.completedAt).toBeNull();
    expect(s.completedBy).toBeNull();
    expect(s.assignedTo).toBeNull();
    expect(s.dueAt).toBeNull();
    expect(s.quantity).toBeNull();
    expect(s.unit).toBeNull();
    expect(s.createdBy).toBeNull();
  });

  it('extracts the principal id from each identity PersonRef', () => {
    const s = toState({
      assignee: { principalId: 'p-assignee', email: 'a@x', displayName: 'Ann' },
      createdBy: { principalId: 'p-creator', email: 'c@x', displayName: null },
      completed: true,
      completedBy: { principalId: 'p-completer', email: 'd@x' },
    });
    expect(s.assignedTo).toBe('p-assignee');
    expect(s.createdBy).toBe('p-creator');
    expect(s.completedBy).toBe('p-completer');
  });

  it('maps quantity, defaulting a missing one to null', () => {
    expect(toState({ quantity: 5 }).quantity).toBe(5);
    expect(toState().quantity).toBeNull();
  });

  it('maps priority, defaulting a missing one to 0', () => {
    expect(toState().priority).toBe(0);
    expect(toState({ priority: 4 }).priority).toBe(4);
  });

  it('copies tags into a fresh array and keeps the guards of removed tags', () => {
    const r = makeResponse({ tags: ['t1'] });
    const s = itemFromWire({ item: r, guards: { ...GUARDS, tags: { t1: guard(1), t2: guard(2) } } });
    expect(s.tags).toEqual(['t1']);
    expect(s.tags).not.toBe(r.tags);
    expect(s.tagTs).toEqual({ t1: guard(1).ts, t2: guard(2).ts });
    expect(s.tagCmd).toEqual({ t1: guard(1).cmd, t2: guard(2).cmd });
  });
});
