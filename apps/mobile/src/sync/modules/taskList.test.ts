import { describe, expect, it, vi } from 'vitest';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import { createSyncEngine } from '@danbro96/lupira-sync-engine/engine';
import type { FeedPage } from '@danbro96/lupira-sync-engine/types';
import { ListKind, ListRole, type ListDto, type PersonRef } from '@lupira/tasks-api/models';
import { allLists } from '../../data/queries/lists';
import { TASK_LIST, type ListOp } from '../../domain/ops';
import { taskListModule } from './taskList';

vi.mock('../replayOp', () => ({ replayOp: vi.fn().mockRejectedValue(Object.assign(new Error('offline'), { status: 0 })) }));

const ME: PersonRef = { principalId: 'p-me', email: 'me@x', displayName: 'Me' };
const T0 = '2026-06-01T10:00:00.000Z';

function serverList(id: string, over: Partial<ListDto> = {}): ListDto {
  return {
    id, name: id, kind: ListKind.Todo, simplePriority: true, owner: ME, access: ListRole.Owner, isArchived: false,
    createdAt: T0, updatedAt: T0, tags: [], members: [{ principalId: ME.principalId, email: ME.email, displayName: 'Me', role: ListRole.Owner, addedAt: T0, addedBy: null }],
    ...over,
  };
}

function setup() {
  const db = openNodeDb();
  const pages: FeedPage<ListDto>[] = [];
  const module = taskListModule(() => ME);
  const engine = createSyncEngine({
    openDb: async () => db,
    modules: [{ ...module, feed: { ...module.feed, fetch: async () => pages.shift() ?? { cursor: 'c', hasMore: false, reset: false, changed: [], deleted: [] } } }],
    cacheVersion: 1,
    onChange: () => undefined,
  });
  const pull = async (changed: ListDto[]) => {
    pages.push({ cursor: 'c', hasMore: false, reset: false, changed, deleted: [] });
    await engine.sync();
  };
  return { db, engine, pull };
}

let seq = 0;
function op(kind: ListOp['kind'], listId: string, fields: object = {}): ListOp {
  seq++;
  return {
    commandId: `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`, occurredAt: '2026-06-01T11:00:00.000Z',
    aggregate: TASK_LIST, aggregateId: listId, kind, listId, ...fields,
  } as ListOp;
}

describe('taskList module', () => {
  it('shows a list created offline, owned by the signed-in user', async () => {
    const { db, engine } = setup();
    await engine.enqueue(op('list.create', 'l1', { name: 'Groceries', listKind: ListKind.Shopping, color: null }));
    expect(await allLists(db)).toEqual([expect.objectContaining({ id: 'l1', name: 'Groceries', owner: ME, access: ListRole.Owner })]);
  });

  it('keeps a pending rename on top of a pulled doc', async () => {
    const { db, engine, pull } = setup();
    await pull([serverList('l1')]);
    await engine.enqueue(op('list.rename', 'l1', { name: 'Renamed' }));
    await pull([serverList('l1', { color: '#123456' })]);
    expect(await allLists(db)).toEqual([expect.objectContaining({ name: 'Renamed', color: '#123456' })]);
  });

  it('hides a list deleted on this device before the server confirms it', async () => {
    const { db, engine, pull } = setup();
    await pull([serverList('l1'), serverList('l2')]);
    await engine.enqueue(op('list.delete', 'l1'));
    expect((await allLists(db)).map(l => l.id)).toEqual(['l2']);
  });

  it('holds a list\'s ops behind its id', async () => {
    const { db, engine } = setup();
    await engine.enqueue([op('list.create', 'l1', { name: 'A', listKind: ListKind.Todo, color: null }), op('list.archive', 'l1')]);
    expect(await db.all('SELECT hold_key FROM outbox ORDER BY seq')).toEqual([{ hold_key: 'l1' }, { hold_key: 'l1' }]);
  });
});
