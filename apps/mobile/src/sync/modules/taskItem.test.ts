import { describe, expect, it, vi } from 'vitest';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { FeedPage } from '@danbro96/lupira-sync-engine/types';
import type { ItemGuardsDto, ItemSyncChange } from '@lupira/tasks-api/models';
import { ItemStatus } from '@lupira/tasks-api/models';
import { itemsOfList } from '../../data/queries/items';
import { TASK_ITEM, type ItemOp } from '../../domain/ops';
import { taskItemModule } from './taskItem';

vi.mock('../replayOp', () => ({ replayOp: vi.fn().mockRejectedValue(Object.assign(new Error('offline'), { status: 0 })) }));

const LIST = 'list-1';
const T0 = '2026-06-01T10:00:00.000Z';
const T1 = '2026-06-01T11:00:00.000Z';
const T2 = '2026-06-01T12:00:00.000Z';

const guard = (ts: string) => ({ ts, cmd: '00000000-0000-0000-0000-000000000009' });

function change(id: string, over: { title?: string; notes?: string; guards?: Partial<ItemGuardsDto> } = {}): ItemSyncChange {
  return {
    item: {
      id, listId: LIST, title: over.title ?? id, notes: over.notes ?? null, status: ItemStatus.Open, completed: false,
      priority: 0, tags: [], sortOrder: `a${id}`, createdAt: T0, updatedAt: T0,
    },
    guards: {
      name: guard(T0), notes: guard(T0), assignee: guard(T0), due: guard(T0), qty: guard(T0),
      priority: guard(T0), status: guard(T0), move: guard(T0), metadata: guard(T0), tags: {}, ...over.guards,
    },
  };
}

const page = (changed: ItemSyncChange[], deleted: string[] = []): FeedPage<ItemSyncChange> =>
  ({ cursor: 'c', hasMore: false, reset: false, changed, deleted });

function setup() {
  const db = openNodeDb();
  const pages: FeedPage<ItemSyncChange>[] = [];
  const module = taskItemModule(() => 'me');
  const engine = createSyncEngine({
    openDb: async () => db,
    modules: [{ ...module, feed: { ...module.feed, fetch: async () => pages.shift() ?? page([]) } }],
    cacheVersion: 1,
    onChange: () => undefined,
  });
  return { db, engine, pull: async (p: FeedPage<ItemSyncChange>) => { pages.push(p); await engine.sync(); } };
}

let seq = 0;
function op(kind: ItemOp['kind'], itemId: string, fields: object = {}, occurredAt = T1): ItemOp {
  seq++;
  return {
    commandId: `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`, occurredAt,
    aggregate: TASK_ITEM, aggregateId: itemId, kind, listId: LIST, itemId, ...fields,
  } as ItemOp;
}

describe('taskItem module', () => {
  it('indexes a created item under its list and drops it from the index on delete', async () => {
    const { db, engine } = setup();
    await engine.enqueue(op('item.create', 'x', { title: 'Milk', sortOrder: 'a1', parentItemId: null }));
    expect(await db.all('SELECT id, list_id, sort_order FROM item_index')).toEqual([{ id: 'x', list_id: LIST, sort_order: 'a1' }]);
    expect((await itemsOfList(db, LIST)).map(i => [i.title, i.createdBy])).toEqual([['Milk', 'me']]);

    await engine.enqueue(op('item.delete', 'x', {}, T2));
    expect(await db.all('SELECT id FROM item_index')).toEqual([]);
    expect(await itemsOfList(db, LIST)).toEqual([]);
  });

  it('orders a list by sort key', async () => {
    const { db, pull } = setup();
    await pull(page([change('2'), change('1'), { ...change('3'), item: { ...change('3').item, listId: 'other' } }]));
    expect((await itemsOfList(db, LIST)).map(i => i.id)).toEqual(['1', '2']);
  });

  it('never seeds a ghost from an edit to an item it does not have', async () => {
    const { engine } = setup();
    await engine.enqueue(op('item.rename', 'gone', { title: 'Ghost' }));
    expect(await engine.doc(TASK_ITEM, 'gone')).toBeNull();
  });

  it('rebases a pending edit field by field against the server guards', async () => {
    const { engine, pull } = setup();
    await pull(page([change('x')]));
    await engine.enqueue([op('item.rename', 'x', { title: 'Mine' }, T1), op('item.notes', 'x', { notes: 'my notes' }, T1)]);

    // Someone renamed it after my offline edit; nobody touched the notes since.
    await pull(page([change('x', { title: 'Theirs', guards: { name: guard(T2) } })]));
    const doc = (await engine.doc<{ title: string; notes: string | null }, null>(TASK_ITEM, 'x'))!.doc;
    expect(doc).toMatchObject({ title: 'Theirs', notes: 'my notes' });
  });

  it('removes an item the feed reports deleted', async () => {
    const { db, pull } = setup();
    await pull(page([change('x')]));
    await pull(page([], ['x']));
    expect(await itemsOfList(db, LIST)).toEqual([]);
  });

  it('holds every op of a list behind the list id', async () => {
    const { db, engine } = setup();
    await engine.enqueue([op('item.create', 'a', { title: 'A', sortOrder: 'a0', parentItemId: null }), op('item.complete', 'b')]);
    expect(await db.all('SELECT DISTINCT hold_key FROM outbox')).toEqual([{ hold_key: LIST }]);
  });
});
