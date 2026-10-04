import type { Db, Tx } from '@danbro96/lupira-expo-sqlite/types';
import type { ItemState } from '../domain/itemState';
import { rowListId, rowsForList } from '../domain/outboxScope';

export async function putItemState(tx: Tx, s: ItemState): Promise<void> {
  await tx.run(
    `INSERT INTO items (id, list_id, state_json, sort_order, deleted, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       list_id = excluded.list_id, state_json = excluded.state_json,
       sort_order = excluded.sort_order, deleted = excluded.deleted, updated_at = excluded.updated_at`,
    [s.id, s.listId, JSON.stringify(s), s.sortOrder, s.deleted ? 1 : 0, s.updatedAt],
  );
}

export async function getItemState(tx: Tx, id: string): Promise<ItemState | null> {
  const row = await tx.first<{ state_json: string }>(`SELECT state_json FROM items WHERE id = ?`, [id]);
  return row ? (JSON.parse(row.state_json) as ItemState) : null;
}

export async function getItemsByList(tx: Tx, listId: string): Promise<ItemState[]> {
  const rows = await tx.all<{ state_json: string }>(
    `SELECT state_json FROM items WHERE list_id = ? AND deleted = 0 ORDER BY sort_order ASC`,
    [listId],
  );
  return rows.map(r => JSON.parse(r.state_json) as ItemState);
}

/** Stored `state_json` per item id — lets a pull skip rows the server sent back unchanged. */
export async function getItemJsonByList(tx: Tx, listId: string): Promise<Map<string, string>> {
  const rows = await tx.all<{ id: string; state_json: string }>(
    `SELECT id, state_json FROM items WHERE list_id = ?`, [listId],
  );
  return new Map(rows.map(r => [r.id, r.state_json]));
}

/** Hard-delete a list's item rows absent from the server payload (server-side deletions). */
export async function deleteItemsNotIn(tx: Tx, listId: string, keepIds: string[]): Promise<void> {
  if (keepIds.length === 0) {
    await tx.run(`DELETE FROM items WHERE list_id = ?`, [listId]);
    return;
  }
  const placeholders = keepIds.map(() => '?').join(', ');
  await tx.run(`DELETE FROM items WHERE list_id = ? AND id NOT IN (${placeholders})`, [listId, ...keepIds]);
}

// --- Lists mirror (stores the server ListDto JSON; `doc` is opaque here) ---

export async function putListDoc(
  tx: Tx,
  list: { id: string; archived: boolean; updatedAt: string; doc: unknown },
): Promise<void> {
  await tx.run(
    `INSERT INTO lists (id, doc_json, archived, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       doc_json = excluded.doc_json, archived = excluded.archived, updated_at = excluded.updated_at`,
    [list.id, JSON.stringify(list.doc), list.archived ? 1 : 0, list.updatedAt],
  );
}

// Both readers return the docs unordered: display order depends on fields inside `doc_json`
// (the caller's sortOrder / archivedAt), so the callers sort via @lupira/tasks-domain/listOrder.

export async function getListDocs<T = unknown>(tx: Tx): Promise<T[]> {
  const rows = await tx.all<{ doc_json: string }>(`SELECT doc_json FROM lists WHERE archived = 0`);
  return rows.map(r => JSON.parse(r.doc_json) as T);
}

/** Archived lists, for the "Archived lists" view. */
export async function getArchivedListDocs<T = unknown>(tx: Tx): Promise<T[]> {
  const rows = await tx.all<{ doc_json: string }>(`SELECT doc_json FROM lists WHERE archived = 1`);
  return rows.map(r => JSON.parse(r.doc_json) as T);
}

export async function getListDoc<T = unknown>(tx: Tx, id: string): Promise<T | null> {
  const row = await tx.first<{ doc_json: string }>(
    `SELECT doc_json FROM lists WHERE id = ?`, [id],
  );
  return row ? (JSON.parse(row.doc_json) as T) : null;
}

/** Stored `doc_json` per list id — lets a pull skip docs the server sent back unchanged. */
export async function getListDocJson(tx: Tx): Promise<Map<string, string>> {
  const rows = await tx.all<{ id: string; doc_json: string }>(`SELECT id, doc_json FROM lists`);
  return new Map(rows.map(r => [r.id, r.doc_json]));
}

export async function getListIds(tx: Tx): Promise<string[]> {
  const rows = await tx.all<{ id: string }>(`SELECT id FROM lists`);
  return rows.map(r => r.id);
}

/** Hard-remove a list and its items from the local mirror (server data is retained). */
export async function deleteListLocal(tx: Tx, listId: string): Promise<void> {
  await tx.run(`DELETE FROM items WHERE list_id = ?`, [listId]);
  await tx.run(`DELETE FROM lists WHERE id = ?`, [listId]);
}

export interface OutboxRow {
  seq: number;
  op_json: string;
}

export async function insertOutbox(
  tx: Tx,
  commandId: string,
  opJson: string,
  createdAt: string,
): Promise<void> {
  await tx.run(
    `INSERT INTO outbox (command_id, op_json, list_id, created_at) VALUES (?, ?, ?, ?)`,
    [commandId, opJson, rowListId(opJson), createdAt],
  );
}

export async function pendingOutbox(tx: Tx): Promise<OutboxRow[]> {
  return tx.all<OutboxRow>(
    `SELECT seq, op_json FROM outbox WHERE status = 'pending' ORDER BY seq ASC`,
  );
}

export interface DueOutboxRow extends OutboxRow {
  attempts: number;
}

/** The oldest pending row that is due and not behind an earlier parked or backed-off row of the same list. */
export async function nextDueOutbox(tx: Tx, nowIso: string): Promise<DueOutboxRow | null> {
  return tx.first<DueOutboxRow>(
    `SELECT o.seq, o.op_json, o.attempts FROM outbox o
     WHERE o.status = 'pending'
       AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?)
       AND NOT EXISTS (
         SELECT 1 FROM outbox h
         WHERE h.list_id = o.list_id AND h.seq < o.seq
           AND (h.status = 'parked' OR (h.status = 'pending' AND h.next_attempt_at > ?))
       )
     ORDER BY o.seq ASC LIMIT 1`,
    [nowIso, nowIso],
  );
}

/** Pending rows that target a single list — used to scope a list's rebase to its own ops. */
export async function pendingOutboxForList(tx: Tx, listId: string): Promise<OutboxRow[]> {
  return rowsForList(await pendingOutbox(tx), listId);
}

export async function pendingCount(tx: Tx): Promise<number> {
  const row = await tx.first<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'`);
  return row?.n ?? 0;
}

/** Count of outbox rows parked after a non-retryable failure (surfaced to the user). */
export async function parkedCount(tx: Tx): Promise<number> {
  const row = await tx.first<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE status = 'parked'`);
  return row?.n ?? 0;
}

export interface ParkedRow {
  seq: number;
  op_json: string;
  last_error: string | null;
}

/** Parked rows with their error, for the "Sync issues" recovery UI. */
export async function parkedOutbox(tx: Tx): Promise<ParkedRow[]> {
  return tx.all<ParkedRow>(
    `SELECT seq, op_json, last_error FROM outbox WHERE status = 'parked' ORDER BY seq ASC`,
  );
}

/** Move every parked row back to pending (reset attempts and backoff) so the next drain re-attempts them. */
export async function requeueParked(tx: Tx): Promise<void> {
  await tx.run(`UPDATE outbox SET status = 'pending', attempts = 0, last_error = NULL, next_attempt_at = NULL WHERE status = 'parked'`);
}

/** Every outbox row's op + status — used to badge mirror rows as pending/failed. */
export async function allOutboxRows(tx: Tx): Promise<{ op_json: string; status: string }[]> {
  return tx.all<{ op_json: string; status: string }>(`SELECT op_json, status FROM outbox`);
}

export async function deleteOutbox(tx: Tx, seq: number): Promise<void> {
  await tx.run(`DELETE FROM outbox WHERE seq = ?`, [seq]);
}

export async function markFailure(
  tx: Tx,
  seq: number,
  park: boolean,
  nextAttemptAt: string | null,
  error: string,
): Promise<void> {
  await tx.run(
    `UPDATE outbox SET status = ?, attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE seq = ?`,
    [park ? 'parked' : 'pending', nextAttemptAt, error, seq],
  );
}

// --- DB ownership (one account per device DB) ---

/**
 * Bind the local DB to the signed-in account. Same owner → no-op; unowned (fresh install, or one
 * that predates ownership stamping) → stamp without wiping, so a same-user relogin keeps offline
 * data and un-pushed edits; a DIFFERENT owner → wipe mirror + outbox before stamping, so the
 * previous account's data is never shown to — nor its pending ops replayed as — the new account.
 * (A DB left unowned-but-populated by a pre-stamping sign-out is adopted unwiped once; wiping
 * there would destroy a returning user's un-pushed edits, which is worse.)
 */
export async function adoptDbOwner(db: Db, sub: string): Promise<void> {
  const row = await db.first<{ value: string }>(`SELECT value FROM meta WHERE key = 'owner_sub'`);
  if (row?.value === sub) return;
  await db.exclusive(async tx => {
    if (row) {
      await tx.run(`DELETE FROM items`);
      await tx.run(`DELETE FROM lists`);
      await tx.run(`DELETE FROM outbox`);
    }
    await tx.run(
      `INSERT INTO meta (key, value) VALUES ('owner_sub', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [sub],
    );
  });
}
