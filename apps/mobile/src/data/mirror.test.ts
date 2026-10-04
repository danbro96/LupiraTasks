import { describe, it, expect } from 'vitest';
import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import type { Db } from '@danbro96/lupira-expo-sqlite/types';
import { emptyItemState, type ItemState } from '../domain/itemState';
import { MIGRATIONS } from './db/schema';
import * as m from './mirror';

async function freshDb(): Promise<Db> {
  const db = openNodeDb();
  await migrate(db, MIGRATIONS);
  return db;
}

const userVersion = async (db: Db) => (await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version;

const op = (listId: string, itemId = 'i') => JSON.stringify({ kind: 'item.rename', listId, itemId, title: 't', commandId: `${listId}-${itemId}`, occurredAt: 't' });

function mkItem(id: string, over: Partial<ItemState> = {}): ItemState {
  return { ...emptyItemState(), id, listId: 'L1', sortOrder: id, updatedAt: '2026-01-01T00:00:00.000Z', ...over };
}

describe('migrations', () => {
  it('creates the schema and stamps user_version', async () => {
    const db = await freshDb();
    expect(await userVersion(db)).toBe(MIGRATIONS.length);
    expect(await m.getListIds(db)).toEqual([]);
  });

  it('wipes a pre-v2 install (user_version 0)', async () => {
    const db = openNodeDb();
    await db.exec(`
      CREATE TABLE lists (id TEXT PRIMARY KEY NOT NULL, doc_json TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
      INSERT INTO lists (id, doc_json) VALUES ('stale', '{}');
    `);
    await migrate(db, MIGRATIONS);
    expect(await m.getListIds(db)).toEqual([]);
    expect(await userVersion(db)).toBe(MIGRATIONS.length);
  });

  it('upgrades a v2 install in place: outbox rows survive and get their list id', async () => {
    const db = openNodeDb();
    await db.exec(`${MIGRATIONS[0]}\nPRAGMA user_version = 2;`);
    await db.run(`INSERT INTO lists (id, doc_json, updated_at) VALUES ('L1', '{}', 't')`);
    await db.run(`INSERT INTO outbox (command_id, op_json, status, attempts, created_at) VALUES ('c1', ?, 'pending', 0, 't')`, [op('L1')]);
    await db.run(`INSERT INTO outbox (command_id, op_json, status, attempts, last_error, created_at) VALUES ('c2', ?, 'parked', 3, 'x', 't')`, [op('L2')]);

    await migrate(db, MIGRATIONS);

    expect(await m.getListIds(db)).toEqual(['L1']);
    expect(await db.all('SELECT command_id, status, attempts, list_id, next_attempt_at FROM outbox ORDER BY seq')).toEqual([
      { command_id: 'c1', status: 'pending', attempts: 0, list_id: 'L1', next_attempt_at: null },
      { command_id: 'c2', status: 'parked', attempts: 3, list_id: 'L2', next_attempt_at: null },
    ]);
    expect(await userVersion(db)).toBe(MIGRATIONS.length);
  });

  it('single-flights concurrent migrations on a virgin database', async () => {
    const db = openNodeDb();
    await Promise.all([migrate(db, MIGRATIONS), migrate(db, MIGRATIONS)]);
    expect(await userVersion(db)).toBe(MIGRATIONS.length);
  });
});

describe('deleteItemsNotIn', () => {
  it('removes the list rows absent from the keep set, other lists untouched', async () => {
    const db = await freshDb();
    for (const id of ['A', 'B', 'C']) await m.putItemState(db, mkItem(id));
    await m.putItemState(db, mkItem('X', { listId: 'L2' }));
    await m.deleteItemsNotIn(db, 'L1', ['A']);
    expect((await m.getItemsByList(db, 'L1')).map(i => i.id)).toEqual(['A']);
    expect((await m.getItemsByList(db, 'L2')).map(i => i.id)).toEqual(['X']);
  });

  it('an empty keep set clears the list', async () => {
    const db = await freshDb();
    await m.putItemState(db, mkItem('A'));
    await m.deleteItemsNotIn(db, 'L1', []);
    expect(await m.getItemsByList(db, 'L1')).toEqual([]);
  });
});

describe('outbox', () => {
  const NOW = '2026-01-01T00:10:00.000Z';
  const PAST = '2026-01-01T00:00:00.000Z';
  const FUTURE = '2026-01-01T01:00:00.000Z';

  async function enqueue(db: Db, id: string, listId: string): Promise<number> {
    await db.exclusive(tx => m.insertOutbox(tx, id, op(listId, id), 't'));
    return (await db.first<{ seq: number }>(`SELECT seq FROM outbox WHERE command_id = ?`, [id]))!.seq;
  }

  it('returns the oldest due row first', async () => {
    const db = await freshDb();
    const a = await enqueue(db, 'a', 'L1');
    await enqueue(db, 'b', 'L1');
    expect((await m.nextDueOutbox(db, NOW))?.seq).toBe(a);
  });

  it('skips a row until its next attempt is due', async () => {
    const db = await freshDb();
    const a = await enqueue(db, 'a', 'L1');
    const b = await enqueue(db, 'b', 'L2');
    await db.exclusive(tx => m.markFailure(tx, a, false, FUTURE, 'offline'));
    expect((await m.nextDueOutbox(db, NOW))?.seq).toBe(b);
    await db.exclusive(tx => m.markFailure(tx, a, false, PAST, 'offline'));
    expect((await m.nextDueOutbox(db, NOW))?.seq).toBe(a);
  });

  it('a parked row holds later rows of its own list only', async () => {
    const db = await freshDb();
    const a = await enqueue(db, 'a', 'L1');
    await enqueue(db, 'b', 'L1');
    const c = await enqueue(db, 'c', 'L2');
    await db.exclusive(tx => m.markFailure(tx, a, true, null, '404'));
    expect((await m.nextDueOutbox(db, NOW))?.seq).toBe(c);
    await db.exclusive(tx => m.deleteOutbox(tx, c));
    expect(await m.nextDueOutbox(db, NOW)).toBeNull();
  });

  it('a backed-off row holds later rows of its own list so order is never overtaken', async () => {
    const db = await freshDb();
    const a = await enqueue(db, 'a', 'L1');
    await enqueue(db, 'b', 'L1');
    await db.exclusive(tx => m.markFailure(tx, a, false, FUTURE, 'offline'));
    expect(await m.nextDueOutbox(db, NOW)).toBeNull();
  });

  it('markFailure counts the attempt and records the error', async () => {
    const db = await freshDb();
    const a = await enqueue(db, 'a', 'L1');
    await db.exclusive(tx => m.markFailure(tx, a, false, FUTURE, 'offline'));
    await db.exclusive(tx => m.markFailure(tx, a, true, null, 'gone'));
    expect(await db.first('SELECT status, attempts, next_attempt_at, last_error FROM outbox')).toEqual({ status: 'parked', attempts: 2, next_attempt_at: null, last_error: 'gone' });
  });

  it('requeueParked resets every parked row and clears its backoff', async () => {
    const db = await freshDb();
    const a = await enqueue(db, 'a', 'L1');
    const b = await enqueue(db, 'b', 'L2');
    await db.exclusive(tx => m.markFailure(tx, a, true, null, 'gone'));
    await db.exclusive(tx => m.markFailure(tx, b, false, FUTURE, 'offline'));
    await db.exclusive(tx => m.requeueParked(tx));
    expect(await db.all('SELECT status, attempts, next_attempt_at, last_error FROM outbox ORDER BY seq')).toEqual([
      { status: 'pending', attempts: 0, next_attempt_at: null, last_error: null },
      { status: 'pending', attempts: 1, next_attempt_at: FUTURE, last_error: 'offline' },
    ]);
  });
});

describe('adoptDbOwner', () => {
  async function seedData() {
    const db = await freshDb();
    await m.putListDoc(db, { id: 'L1', archived: false, updatedAt: 't', doc: { id: 'L1' } });
    await m.putItemState(db, mkItem('A'));
    await db.exclusive(tx => m.insertOutbox(tx, 'c1', op('L1'), 't'));
    return db;
  }

  it('stamps an unowned DB without wiping (pre-stamping installs, same-user relogin)', async () => {
    const db = await seedData();
    await m.adoptDbOwner(db, 'a@example.com');
    expect(await m.getListIds(db)).toEqual(['L1']);
    expect(await m.pendingCount(db)).toBe(1);
  });

  it('is a no-op for the same owner (token rotation, relogin)', async () => {
    const db = await seedData();
    await m.adoptDbOwner(db, 'a@example.com');
    await m.adoptDbOwner(db, 'a@example.com');
    expect(await m.getListIds(db)).toEqual(['L1']);
    expect(await m.pendingCount(db)).toBe(1);
  });

  it('wipes mirror + outbox when a different account signs in', async () => {
    const db = await seedData();
    await m.adoptDbOwner(db, 'a@example.com');
    await m.adoptDbOwner(db, 'b@example.com');
    expect(await m.getListIds(db)).toEqual([]);
    expect(await m.getItemState(db, 'A')).toBeNull();
    expect(await m.pendingCount(db)).toBe(0);
    await m.putItemState(db, mkItem('B'));
    await m.adoptDbOwner(db, 'b@example.com');
    expect(await m.getItemState(db, 'B')).not.toBeNull();
  });
});
