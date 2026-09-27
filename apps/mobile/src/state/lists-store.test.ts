import { describe, it, expect, vi } from 'vitest';
import { createFakeDb } from '../test/fakeExpoSqlite';
import type { ListDto, PersonRef } from '@lupira/tasks-api/models';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => holder.db }));
vi.mock('../debug/log', () => ({ logDebug: vi.fn() }));

const ME: PersonRef = { principalId: 'me-p', email: 'me@x', displayName: 'Me' };
const T0 = '2026-01-01T00:00:00.000Z';

function list(id: string, over: Partial<ListDto> = {}): ListDto {
  return {
    id, name: `List ${id}`, kind: 'Todo', color: null, simplePriority: true,
    owner: ME, access: 'Owner', isArchived: false, createdAt: T0, updatedAt: T0, tags: [], members: [], ...over,
  };
}

async function load() {
  vi.resetModules();
  holder.db = createFakeDb();
  const store = await import('./lists-store');
  const dbm = await import('../data/db');
  const { bumpMirror } = await import('../sync/syncStatus');
  const db = await dbm.getDb();
  const seed = (id: string, over: Partial<ListDto> = {}) =>
    dbm.putListDoc(db, { id, archived: over.isArchived ?? false, updatedAt: T0, doc: list(id, over) });
  return { ...store, bumpMirror, seed };
}

async function waitFor(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (cond()) return;
    await new Promise(r => setTimeout(r, 1));
  }
  throw new Error('condition not met');
}

describe('lists store', () => {
  it('is not loaded until the first mirror read lands', async () => {
    const c = await load();
    expect(c.useListsStore.getState().loaded).toBe(false);
    await c.reloadLists();
    expect(c.useListsStore.getState()).toMatchObject({ loaded: true, active: [], archived: [] });
  });

  it('splits active from archived', async () => {
    const c = await load();
    await c.seed('A');
    await c.seed('B', { isArchived: true });
    await c.reloadLists();
    const s = c.useListsStore.getState();
    expect(s.active.map(l => l.id)).toEqual(['A']);
    expect(s.archived.map(l => l.id)).toEqual(['B']);
  });

  it('reloads on a mirror bump once started', async () => {
    const c = await load();
    c.startListsStore();
    await waitFor(() => c.useListsStore.getState().loaded);
    await c.seed('A');
    c.bumpMirror();
    await waitFor(() => c.useListsStore.getState().active.length === 1);
  });

  it('keeps the same array when a reload reads identical rows', async () => {
    const c = await load();
    await c.seed('A');
    await c.reloadLists();
    const before = c.useListsStore.getState().active;
    await c.reloadLists();
    expect(c.useListsStore.getState().active).toBe(before);
  });

  it('drops a read superseded by a newer one', async () => {
    const c = await load();
    const older = c.reloadLists();
    await c.seed('A');
    const newer = c.reloadLists();
    await Promise.all([older, newer]);
    expect(c.useListsStore.getState().active.map(l => l.id)).toEqual(['A']);
  });
});
