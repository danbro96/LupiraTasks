import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { migrate } from '@danbro96/lupira-expo-sqlite/migrate';
import { openNodeDb } from '@danbro96/lupira-expo-sqlite/node';
import { MIGRATIONS } from '../data/db/schema';
import { emptyItemState } from '../domain/itemState';
import type { ClientOp } from '../domain/ops';
import type { PersonRef } from '@lupira/tasks-api/models';

// Enqueue/drain tests over a real in-memory SQLite (node:sqlite) with replayOp mocked. One module
// graph for the whole file — enqueue kicks fire-and-forget drains, so per-test module resets would
// let a stale drain resolve against the next test's mocks. Tests join in-flight drains and clean
// the tables instead.

vi.mock('@sentry/react-native', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }));
vi.mock('@danbro96/lupira-expo-diagnostics/log', () => ({ logDebug: vi.fn() }));
vi.mock('./replayOp', () => ({ replayOp: vi.fn() }));
vi.mock('../data/db/expoDb', () => ({ getDb: vi.fn() }));

const ME: PersonRef = { principalId: 'me-p', email: 'me@x', displayName: 'Me' };
const T1 = '2026-02-01T00:00:00.000Z';

const createOp = (commandId: string, itemId: string, listId = 'L1'): ClientOp =>
  ({ commandId, occurredAt: T1, kind: 'item.create', listId, itemId, title: `Task ${itemId}`, sortOrder: itemId, parentItemId: null });
const completeOp = (commandId: string, itemId: string): ClientOp =>
  ({ commandId, occurredAt: T1, kind: 'item.complete', listId: 'L1', itemId });

async function load() {
  const db = openNodeDb();
  await migrate(db, MIGRATIONS);
  const { setAuthPort } = await import('../data/api/authProvider');
  setAuthPort({
    getApiUrl: () => 'https://api.test',
    getAuthMode: () => 'oidc' as const,
    getToken: () => 'tok',
    getActor: () => 'me-p',
    getSelf: () => ME,
    refresh: async () => 'tok',
    applyProfile: async () => {},
    onSignIn: () => () => {},
  });
  const outbox = await import('./outbox');
  const dbm = await import('../data/mirror');
  const { useSyncStatus } = await import('./syncStatus');
  const { ApiError } = await import('@danbro96/lupira-http/apiError');
  const { replayOp } = await import('./replayOp');
  return { outbox, dbm, db, useSyncStatus, ApiError, replayOp: vi.mocked(replayOp) };
}

let c: Awaited<ReturnType<typeof load>>;

beforeAll(async () => {
  c = await load();
});

beforeEach(async () => {
  // Join any drain (and its queued rerun) a previous test's enqueue fired off, then reset.
  await c.outbox.drain(c.db);
  c.replayOp.mockReset();
  await c.db.run('DELETE FROM outbox');
  await c.db.run('DELETE FROM items');
  await c.db.run('DELETE FROM lists');
  c.useSyncStatus.setState({ pending: 0, failed: 0, serverReachable: true, lastError: null });
});

async function waitFor(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (cond()) return;
    await new Promise(r => setTimeout(r, 1));
  }
  throw new Error('condition not met');
}

async function seedRow(op: ClientOp) {
  await c.dbm.insertOutbox(c.db, op.commandId, JSON.stringify(op), op.occurredAt);
}

describe('enqueue', () => {
  it('applies optimistically and keeps the row when the push fails offline', async () => {
    c.replayOp.mockRejectedValue(new c.ApiError(0, 'offline'));

    await c.outbox.enqueue(c.db, createOp('c1', 'X'));
    await c.outbox.drain(c.db);

    expect((await c.dbm.getItemState(c.db, 'X'))?.title).toBe('Task X');
    expect(await c.dbm.pendingCount(c.db)).toBe(1);
    expect(c.useSyncStatus.getState().pending).toBe(1);
  });

  it('a mid-batch failure rolls back the mirror AND the outbox together', async () => {
    c.replayOp.mockRejectedValue(new c.ApiError(0, 'offline'));

    // Duplicate commandId trips the outbox UNIQUE constraint on the second op.
    await expect(c.outbox.enqueueMany(c.db, [createOp('dup', 'A'), createOp('dup', 'B')])).rejects.toThrow();

    expect(await c.dbm.getItemState(c.db, 'A')).toBeNull();
    expect(await c.dbm.getItemState(c.db, 'B')).toBeNull();
    expect(await c.dbm.pendingCount(c.db)).toBe(0);
  });

  it('commits alongside a concurrent pull-shaped transaction (exclusive serialization)', async () => {
    c.replayOp.mockRejectedValue(new c.ApiError(0, 'offline'));
    await c.dbm.putItemState(c.db, { ...emptyItemState(), id: 'X', listId: 'L1', sortOrder: 'a' });

    const pull = c.db.exclusive(async tx => {
      await c.dbm.putListDoc(tx, { id: 'L1', archived: false, updatedAt: T1, doc: { id: 'L1' } });
      await new Promise(r => setTimeout(r, 10)); // hold the txn open across awaits
      await c.dbm.putItemState(tx, { ...emptyItemState(), id: 'Y', listId: 'L1', sortOrder: 'b' });
    });
    const tap = c.outbox.enqueue(c.db, completeOp('c1', 'X'));
    await Promise.all([pull, tap]);

    expect((await c.dbm.getItemState(c.db, 'X'))?.completed).toBe(true);
    expect(await c.dbm.getItemState(c.db, 'Y')).not.toBeNull();
    expect(await c.dbm.getListDoc(c.db, 'L1')).not.toBeNull();
    expect(await c.dbm.pendingCount(c.db)).toBe(1);
  });
});

describe('drainOutbox', () => {
  it('replays FIFO and deletes acked rows', async () => {
    c.replayOp.mockResolvedValue(undefined);
    await seedRow(createOp('c1', 'A'));
    await seedRow(createOp('c2', 'B'));

    await c.outbox.drain(c.db);

    expect(c.replayOp.mock.calls.map(([op]) => op.commandId)).toEqual(['c1', 'c2']);
    expect(await c.dbm.pendingCount(c.db)).toBe(0);
  });

  it('parks a 4xx op and continues with the next', async () => {
    c.replayOp.mockImplementation(async op => {
      if (op.commandId === 'c1') throw new c.ApiError(403, 'forbidden');
    });
    await seedRow(createOp('c1', 'A', 'L1'));
    await seedRow(createOp('c2', 'B', 'L2'));

    await c.outbox.drain(c.db);

    expect(await c.dbm.parkedCount(c.db)).toBe(1);
    expect(await c.dbm.pendingCount(c.db)).toBe(0);
    expect(c.useSyncStatus.getState().failed).toBe(1);
    expect(c.replayOp).toHaveBeenCalledTimes(2);
  });

  it('a parked op holds the later ops of its own list', async () => {
    c.replayOp.mockImplementation(async op => {
      if (op.commandId === 'c1') throw new c.ApiError(404, 'gone');
    });
    await seedRow(createOp('c1', 'A', 'L1'));
    await seedRow(createOp('c2', 'B', 'L1'));
    await seedRow(createOp('c3', 'C', 'L2'));

    await c.outbox.drain(c.db);

    expect(c.replayOp.mock.calls.map(([op]) => op.commandId)).toEqual(['c1', 'c3']);
    expect(await c.dbm.parkedCount(c.db)).toBe(1);
    expect(await c.dbm.pendingCount(c.db)).toBe(1);
  });

  it('stops on a network error, leaving every row pending', async () => {
    c.replayOp.mockRejectedValue(new c.ApiError(0, 'offline'));
    await seedRow(createOp('c1', 'A'));
    await seedRow(createOp('c2', 'B'));

    await c.outbox.drain(c.db);

    expect(c.replayOp).toHaveBeenCalledTimes(1);
    expect(await c.dbm.pendingCount(c.db)).toBe(2);
    expect(c.useSyncStatus.getState().serverReachable).toBe(false);
  });

  it('a row enqueued during an active drain is still drained', async () => {
    let releaseFirst!: () => void;
    c.replayOp
      .mockImplementationOnce(() => new Promise<void>(r => { releaseFirst = () => r(); }))
      .mockResolvedValue(undefined);
    await seedRow(createOp('c1', 'A'));

    const first = c.outbox.drain(c.db);
    await waitFor(() => c.replayOp.mock.calls.length === 1); // first replay in flight
    await seedRow(createOp('c2', 'B'));
    const second = c.outbox.drain(c.db); // lands mid-drain — must not be stranded
    releaseFirst();
    await Promise.all([first, second]);
    await c.outbox.drain(c.db); // let any queued rerun finish

    expect(await c.dbm.pendingCount(c.db)).toBe(0);
    expect(c.replayOp).toHaveBeenCalledTimes(2);
  });
});

describe('backoff', () => {
  const at = (ms: number) => ({ now: () => new Date(Date.parse(T1) + ms), rand: () => 0.5 });
  const nextAttempt = async () => (await c.db.first<{ next_attempt_at: string | null }>('SELECT next_attempt_at FROM outbox'))?.next_attempt_at;

  it('a transient failure defers the row instead of retrying on every trigger', async () => {
    c.replayOp.mockRejectedValue(new c.ApiError(503, 'unavailable'));
    await seedRow(createOp('c1', 'A'));

    await c.outbox.drain(c.db, at(0));
    expect(await nextAttempt()).toBe(new Date(Date.parse(T1) + 5_000).toISOString());

    await c.outbox.drain(c.db, at(1_000));
    expect(c.replayOp).toHaveBeenCalledTimes(1);

    await c.outbox.drain(c.db, at(6_000));
    expect(c.replayOp).toHaveBeenCalledTimes(2);
    expect(await nextAttempt()).toBe(new Date(Date.parse(T1) + 6_000 + 10_000).toISOString());
  });

  it('a backed-off op holds the later ops of its list but not other lists', async () => {
    c.replayOp.mockImplementation(async op => {
      if (op.commandId === 'c1') throw new c.ApiError(503, 'unavailable');
    });
    await seedRow(createOp('c1', 'A', 'L1'));
    await seedRow(createOp('c2', 'B', 'L1'));
    await seedRow(createOp('c3', 'C', 'L2'));

    await c.outbox.drain(c.db, at(0));
    await c.outbox.drain(c.db, at(1_000));

    expect(c.replayOp.mock.calls.map(([op]) => op.commandId)).toEqual(['c1', 'c3']);
  });

  it('parks the op after the last allowed attempt', async () => {
    c.replayOp.mockRejectedValue(new c.ApiError(0, 'offline'));
    await seedRow(createOp('c1', 'A'));
    await c.db.run('UPDATE outbox SET attempts = 7');

    await c.outbox.drain(c.db, at(0));

    expect(await c.dbm.parkedCount(c.db)).toBe(1);
    expect(await nextAttempt()).toBeNull();
  });

  it('retryParked makes parked ops due again and drains them', async () => {
    c.replayOp.mockRejectedValueOnce(new c.ApiError(403, 'forbidden')).mockResolvedValue(undefined);
    await seedRow(createOp('c1', 'A'));
    await c.outbox.drain(c.db, at(0));
    expect(await c.dbm.parkedCount(c.db)).toBe(1);

    await c.outbox.retryParked(c.db, at(0));
    await c.outbox.drain(c.db, at(0));

    expect(await c.dbm.pendingCount(c.db)).toBe(0);
    expect(await c.dbm.parkedCount(c.db)).toBe(0);
  });
});
