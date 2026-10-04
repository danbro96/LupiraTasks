import { useEffect } from 'react';
import { create } from 'zustand';
import { getDb, allOutboxRows } from '../../data/db';
import { useSyncStatus } from '../../sync/syncStatus';
import type { ClientOp } from '../../domain/ops';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

export type OpStatus = 'pending' | 'failed';

/** The aggregate id an op affects: the list for a list op, else the item. */
function aggregateId(op: ClientOp): string {
  switch (op.kind) {
    case 'list.create':
    case 'list.rename':
    case 'list.recolor':
    case 'list.setSimplePriority':
    case 'list.reorder':
    case 'list.memberAdd':
    case 'list.memberRoleChange':
    case 'list.memberRemove':
    case 'list.leave':
    case 'list.delete':
    case 'list.archive':
    case 'list.restore':
      return op.listId;
    default:
      return op.itemId; // all item.* ops
  }
}

function sameStatuses(a: Map<string, OpStatus>, b: Map<string, OpStatus>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

// One shared map rather than per-screen state, so a row can subscribe to its own entry: a tick
// changes the outbox several times, and re-rendering every row for each change is what lagged.
const useStatusStore = create<{ map: Map<string, OpStatus> }>(() => ({ map: new Map() }));
let latestRead = 0;
let started = false;

async function reload(): Promise<void> {
  const read = ++latestRead;
  try {
    const db = await getDb();
    const rows = await allOutboxRows(db);
    const next = new Map<string, OpStatus>();
    for (const r of rows) {
      const id = aggregateId(JSON.parse(r.op_json) as ClientOp);
      const status: OpStatus = r.status === 'parked' ? 'failed' : 'pending';
      if (next.get(id) === 'failed') continue; // failed wins
      next.set(id, status);
    }
    if (read !== latestRead || sameStatuses(useStatusStore.getState().map, next)) return;
    useStatusStore.setState({ map: next });
  } catch (e) {
    // A failed read keeps the previous badges on screen; the next change retries.
    logDebug('useOutboxStatus:error', e instanceof Error ? e.message : String(e));
  }
}

/** Re-read whenever the mirror bumps or the pending/failed counts change (every enqueue and drain). */
function start(): void {
  if (started) return;
  started = true;
  useSyncStatus.subscribe((s, prev) => {
    if (s.mirrorRevision !== prev.mirrorRevision || s.pending !== prev.pending || s.failed !== prev.failed) void reload();
  });
  void reload();
}

/**
 * Map of aggregate id (listId or itemId) → its outbox sync status, so list/item rows can show a
 * pending/failed badge. 'failed' (parked) wins over 'pending'.
 */
export function useOutboxStatus(): Map<string, OpStatus> {
  useEffect(start, []);
  return useStatusStore(s => s.map);
}

/** One aggregate's status — re-renders only when that entry changes. */
export function useOpStatus(id: string): OpStatus | undefined {
  useEffect(start, []);
  return useStatusStore(s => s.map.get(id));
}
