import * as Sentry from '@sentry/react-native';
import type { Db, Tx } from '@danbro96/lupira-expo-sqlite/types';
import { PARK_AFTER_ATTEMPTS, nextAttemptDelayMs } from '@danbro96/lupira-sync-core/backoff';
import { authPort } from '../data/api/authProvider';
import { classifyReplayError, type ReplayDecision } from '../domain/replayError';
import { applyItemEvent } from '../domain/itemLww';
import { emptyItemState } from '../domain/itemState';
import {
  getItemState, putItemState, putListDoc, insertOutbox,
  nextDueOutbox, pendingCount, deleteOutbox, markFailure, parkedCount, parkedOutbox, requeueParked,
  getListDoc, deleteListLocal,
} from '../data/mirror';
import { type ClientOp, opToEvents } from '../domain/ops';
import { applyListOp } from '../domain/listDoc';
import type { ListDto, PersonRef } from '@lupira/tasks-api/models';
import { useSyncStatus, bumpMirror } from './syncStatus';
import { replayOp } from './replayOp';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

export type OutboxDeps = {
  replay: (op: ClientOp) => Promise<void>;
  now: () => Date;
  rand: () => number;
};

const realDeps: OutboxDeps = { replay: replayOp, now: () => new Date(), rand: Math.random };

export async function refreshPending(db: Db): Promise<void> {
  useSyncStatus.getState().setPending(await pendingCount(db));
}

export async function refreshFailed(db: Db): Promise<void> {
  useSyncStatus.getState().setFailed(await parkedCount(db));
}

/** A parked op surfaced to the "Sync issues" recovery UI: its id, the action, and why it failed. */
export interface ParkedOp {
  seq: number;
  op: ClientOp;
  lastError: string | null;
}

export async function listParked(db: Db): Promise<ParkedOp[]> {
  return (await parkedOutbox(db)).map(r => ({ seq: r.seq, op: JSON.parse(r.op_json) as ClientOp, lastError: r.last_error }));
}

/** Re-queue every parked op (reset attempts and backoff) and kick a fresh drain. */
export async function retryParked(db: Db, deps: Partial<OutboxDeps> = {}): Promise<void> {
  await db.exclusive(tx => requeueParked(tx));
  await refreshPending(db);
  await refreshFailed(db);
  void drain(db, deps);
}

/** Permanently drop a parked op the user has chosen to abandon. */
export async function discardParked(db: Db, seq: number): Promise<void> {
  await db.exclusive(tx => deleteOutbox(tx, seq));
  await refreshFailed(db);
  bumpMirror();
}

function actor(): string | null {
  return authPort().getActor();
}

/** A best-effort optimistic ListDto so a list created offline shows immediately. The server
 *  fills in the authoritative owner/members on the next pull; `self` may be null before the first
 *  `/me` resolves the principal id, in which case owner/members stay empty until then. */
function optimisticListDoc(op: Extract<ClientOp, { kind: 'list.create' }>, self: PersonRef | null): ListDto {
  return {
    id: op.listId,
    name: op.name,
    kind: op.listKind,
    color: op.color,
    simplePriority: true, // matches the UI's default until the server pull sets the real value
    owner: self ?? { principalId: '', email: '', displayName: null },
    access: 'Owner', // the creator owns the list they just created
    isArchived: false,
    createdAt: op.occurredAt,
    updatedAt: op.occurredAt,
    tags: [],
    members: self ? [{ principalId: self.principalId, email: self.email, displayName: self.displayName ?? null, role: 'Owner', addedAt: op.occurredAt, addedBy: self }] : [],
  };
}

/** Optimistically apply one op to the local mirror (items + list docs). Runs inside the
 *  enqueue transaction; same-transaction reads see earlier writes, so a batch can complete
 *  or annotate an item it created moments before. */
async function applyOpLocally(tx: Tx, op: ClientOp, who: string | null, self: PersonRef | null): Promise<void> {
  for (const ev of opToEvents(op)) {
    const prev = await getItemState(tx, ev.itemId);
    // An edit to an item no longer in the mirror (deleted by a pull mid-tap) must not seed a
    // ghost row from empty state — the op still pushes and reconciles (or parks) server-side.
    if (!prev && ev.type !== 'ItemAdded') continue;
    await putItemState(tx, applyItemEvent(prev ?? emptyItemState(), ev, who));
  }
  if (op.kind === 'list.create') {
    await putListDoc(tx, { id: op.listId, archived: false, updatedAt: op.occurredAt, doc: optimisticListDoc(op, self) });
  } else if (op.kind.startsWith('list.')) {
    // Optimistically patch the mirrored list doc (rename/recolor/membership). A null patch
    // means the change deleted the list locally (last owner leaving).
    const current = await getListDoc<ListDto>(tx, op.listId);
    if (current) {
      const patched = applyListOp(current, op, self);
      if (patched === null) {
        await deleteListLocal(tx, op.listId);
      } else {
        await putListDoc(tx, { id: patched.id, archived: patched.isArchived, updatedAt: patched.updatedAt, doc: patched });
      }
    }
  }
}

/**
 * Enqueue a user action: optimistically apply it to the local mirror AND append the
 * durable outbox row in one SQLite transaction, then kick the replay worker. The UI
 * updates immediately and the change survives an app restart while offline.
 */
export function enqueue(db: Db, op: ClientOp, deps: Partial<OutboxDeps> = {}): Promise<void> {
  return enqueueMany(db, [op], deps);
}

/**
 * Batch variant (e.g. CSV import: list.create + N item ops): one transaction over every op
 * and a single mirror bump, so a large import doesn't trigger a UI reload per op. Outbox rows
 * keep op order, and replay drains FIFO — causal chains (create → complete) hold server-side.
 */
export async function enqueueMany(db: Db, ops: ClientOp[], deps: Partial<OutboxDeps> = {}): Promise<void> {
  if (ops.length === 0) return;
  const who = actor();
  const self = authPort().getSelf();

  try {
    await db.exclusive(async tx => {
      for (const op of ops) {
        await applyOpLocally(tx, op, who, self);
        await insertOutbox(tx, op.commandId, JSON.stringify(op), op.occurredAt);
      }
    });
  } catch (e) {
    // A failed optimistic-apply + enqueue transaction is a genuine client bug (SQLite / reducer),
    // not an expected offline condition — report it.
    Sentry.captureException(e, { tags: { area: 'enqueue', op: ops[0].kind, count: ops.length } });
    logDebug('enqueue:error', `${ops[0].kind}x${ops.length} ${String(e)}`);
    throw e;
  }
  const first = ops[0];
  logDebug('enqueue:ok', ops.length > 1 ? `batch x${ops.length}` : first.kind === 'list.create' ? `list ${first.listId}` : first.kind);

  await refreshPending(db);
  bumpMirror();
  void drain(db, deps);
}

/** Reconstruct the original per-outcome debug detail (the bug case needs the live stack). */
function replayLogDetail(d: ReplayDecision, e: unknown, opKind: string): string {
  if (d.logTag === 'replay:401') return opKind;
  if (d.logTag === 'replay:bug') {
    const stack = e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : '';
    return `${opKind} ${String(e)} :: ${stack}`;
  }
  return `${opKind} ${(d.rowError ?? '').slice(0, 200)}`;
}

// Serialized replay: one in-flight request, strict seq order, so causal chains stay ordered.
// A call landing while a drain is running queues exactly one follow-up run — a row enqueued
// after the running drain's final empty check must not sit until the next external trigger.
let draining: Promise<void> | null = null;
let drainQueued = false;

export function drain(db: Db, deps: Partial<OutboxDeps> = {}): Promise<void> {
  if (draining) {
    drainQueued = true;
    return draining;
  }
  // The returned promise covers the queued rerun, so `await drain()` really does mean "no
  // drain is in flight" — useListPolling relies on that to push before it pulls.
  draining = runDrain(db, { ...realDeps, ...deps })
    .finally(() => { draining = null; })
    .then(() => {
      if (!drainQueued) return;
      drainQueued = false;
      return drain(db, deps);
    });
  return draining;
}

async function runDrain(db: Db, deps: OutboxDeps): Promise<void> {
  try {
    await authPort().refresh(); // ensure replay uses a live access token
    for (;;) {
      const row = await nextDueOutbox(db, deps.now().toISOString());
      if (!row) break;

      const op = JSON.parse(row.op_json) as ClientOp;

      try {
        await deps.replay(op);
        await db.exclusive(tx => deleteOutbox(tx, row.seq));
        logDebug('replay:ok', op.kind);
      } catch (e) {
        // Classify (pure, tested in replayError.test.ts), then apply the decision.
        const status = useSyncStatus.getState();
        const d = classifyReplayError(e, op.kind);
        // A non-HTTP error means a client bug that will fail identically forever — report it.
        // 4xx/5xx/network are expected (handled + surfaced in the Sync Issues UI), so stay quiet.
        if (d.logTag === 'replay:bug') Sentry.captureException(e, { tags: { area: 'outbox', op: op.kind } });
        if (d.rowStatus) {
          const attempts = row.attempts + 1;
          const park = d.rowStatus === 'parked' || attempts >= PARK_AFTER_ATTEMPTS;
          const nextAttemptAt = park ? null : new Date(deps.now().getTime() + nextAttemptDelayMs(attempts, deps.rand)).toISOString();
          await db.exclusive(tx => markFailure(tx, row.seq, park, nextAttemptAt, d.rowError ?? ''));
        }
        if (d.serverUnreachable) status.setServerReachable(false);
        if (d.lastError !== null) status.setLastError(d.lastError);
        logDebug(d.logTag, replayLogDetail(d, e, op.kind));
        if (d.stop) break;
        continue;
      }
    }
  } finally {
    await refreshPending(db);
    await refreshFailed(db);
  }
}
