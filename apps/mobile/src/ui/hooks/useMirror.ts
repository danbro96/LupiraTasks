import { useEffect, useRef, useState } from 'react';
import type { ListDto } from '@lupira/tasks-api/models';
import type { ItemState } from '../../domain/itemState';
import { diffItems, type ItemChange } from '@lupira/tasks-domain/itemChange';
import { getDb } from '../../data/db/expoDb';
import { getItemsByList } from '../../data/mirror';
import { useListsState } from '../../state/lists-store';
import { useSyncStatus } from '../../sync/syncStatus';
import { logDebug } from '@danbro96/lupira-expo-diagnostics/log';

// Read hooks over the offline SQLite mirror. They reload whenever `mirrorRevision` bumps
// (after any enqueue or pull). Each effect drops its result if a newer bump superseded it —
// two overlapping reloads resolving out of order must not leave stale data on screen.

/** A failed read keeps the last good rows on screen; the next bump retries. Caught rather than
 *  left to reject so it doesn't surface as an unhandled rejection with no context. */
function logReadError(stage: string, e: unknown): void {
  logDebug(`${stage}:error`, e instanceof Error ? e.message : String(e));
}

/**
 * Keep the previous object for every unchanged row, and the previous array when nothing changed:
 * each read parses fresh objects, and a polled pull rewrites the same rows every few seconds —
 * new identities would re-render every memoized TaskRow for nothing.
 *
 * Serializes rather than trusting a version field: the comparison then can't miss a change and
 * leave the screen stale, the one failure mode that matters here.
 */
function reuseUnchanged(rows: ItemState[], previous: ItemState[]): ItemState[] {
  const byId = new Map(previous.map(r => [r.id, r]));
  let changed = rows.length !== previous.length;
  const next = rows.map((r, i) => {
    const old = byId.get(r.id);
    const kept = old && JSON.stringify(old) === JSON.stringify(r) ? old : r;
    if (kept !== previous[i]) changed = true;
    return kept;
  });
  return changed ? next : previous;
}

export function useLists(): { lists: ListDto[] } {
  return { lists: useListsState(s => s.active) };
}

export function useArchivedLists(): { lists: ListDto[] } {
  return { lists: useListsState(s => s.archived) };
}

/**
 * A list's items, plus what the latest reload changed when it came from a pull rather than the
 * user's own tap. `changes` carries a nonce so an identical repeat still reads as a new event.
 */
export function useItems(listId: string): {
  items: ItemState[];
  loading: boolean;
  changes: { nonce: number; list: ItemChange<string>[] };
} {
  const rev = useSyncStatus(s => s.mirrorRevision);
  const [items, setItems] = useState<ItemState[]>([]);
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<{ nonce: number; list: ItemChange<string>[] }>({ nonce: 0, list: [] });
  // Keyed by list: diffing against another list's read would report every row as added.
  const prev = useRef<{ listId: string; rows: Map<string, ItemState> }>({ listId, rows: new Map() });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const rows = await getItemsByList(db, listId);
      if (cancelled) return;
      // Read, don't subscribe: only the revision should retrigger this effect.
      const remote = useSyncStatus.getState().mirrorOrigin === 'pull';
      const same = prev.current.listId === listId;
      const diff = remote && same ? diffItems(prev.current.rows, rows) : [];
      prev.current = { listId, rows: new Map(rows.map(r => [r.id, r])) };
      setItems(current => reuseUnchanged(rows, current));
      if (diff.length > 0) setChanges(c => ({ nonce: c.nonce + 1, list: diff }));
      setLoading(false);
    })().catch(e => {
      logReadError('useItems', e);
      if (!cancelled) setLoading(false); // never leave the screen on its initial-load spinner
    });
    return () => { cancelled = true; };
  }, [rev, listId]);
  return { items, loading, changes };
}
