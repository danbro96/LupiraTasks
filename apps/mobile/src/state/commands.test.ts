import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/react-native', () => ({ captureException: vi.fn() }));
vi.mock('@danbro96/lupira-expo-feedback/toast', () => ({ toast: vi.fn() }));
vi.mock('../sync/engine', () => ({
  engine: { enqueue: vi.fn().mockResolvedValue(undefined), discard: vi.fn().mockResolvedValue(undefined) },
}));

import { toast } from '@danbro96/lupira-expo-feedback/toast';
import type { ClientOp } from '../domain/ops';
import { engine } from '../sync/engine';
import { deleteItems, importList, renameItem, setDue, UNDO_MS } from './commands';

const queued = (call = 0) => [vi.mocked(engine.enqueue).mock.calls[call][0]].flat() as ClientOp[];

beforeEach(() => vi.clearAllMocks());

describe('commands', () => {
  it('stamps each op with the aggregate it changes', async () => {
    await renameItem('l1', 'i1', 'Milk');
    expect(queued()).toEqual([expect.objectContaining({ aggregate: 'task.item', aggregateId: 'i1', kind: 'item.rename', listId: 'l1', title: 'Milk' })]);
  });

  it('imports a list with nested tasks parented by level, in one enqueue', async () => {
    await importList('Trip', 'Todo', [
      { level: 0, title: 'Pack', completed: false, notes: null, quantity: null, unit: null, dueOn: '2026-06-20', dueAt: null },
      { level: 1, title: 'Socks', completed: true, notes: null, quantity: null, unit: null, dueOn: null, dueAt: null },
    ]);
    const [create, pack, packDue, socks, complete] = queued();
    expect(create).toMatchObject({ kind: 'list.create', aggregate: 'task.list', name: 'Trip' });
    expect(pack).toMatchObject({ kind: 'item.create', listId: create.listId, parentItemId: null });
    expect(packDue).toMatchObject({ kind: 'item.due', itemId: (pack as { itemId: string }).itemId, dueOn: '2026-06-20', dueAt: null });
    expect(socks).toMatchObject({ kind: 'item.create', parentItemId: (pack as { itemId: string }).itemId });
    expect(complete).toMatchObject({ kind: 'item.complete', itemId: (socks as { itemId: string }).itemId });
  });

  it('queues a due with both fields, the unset one null', async () => {
    await setDue('l1', 'i1', { dueOn: null, dueAt: '2026-06-20T14:30:00.000Z' });
    expect(queued()).toEqual([expect.objectContaining({ kind: 'item.due', itemId: 'i1', dueOn: null, dueAt: '2026-06-20T14:30:00.000Z' })]);
  });

  it('holds deletes for the undo window, and Undo discards them', async () => {
    await deleteItems('l1', ['a', 'b']);
    expect(vi.mocked(engine.enqueue).mock.calls[0][1]).toEqual({ holdMs: UNDO_MS });
    const ops = queued();
    expect(ops.map(o => o.kind)).toEqual(['item.delete', 'item.delete']);

    const [label, options] = vi.mocked(toast).mock.calls[0];
    expect(label).toBe('2 items deleted');
    options!.action!.onPress();
    expect(vi.mocked(engine.discard).mock.calls.map(c => c[0])).toEqual(ops.map(o => o.commandId));
  });
});
