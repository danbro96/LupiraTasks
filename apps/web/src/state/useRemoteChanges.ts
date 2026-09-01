import { useCallback, useRef, useState } from 'react';
import { diffItems, type ChangeableItem, type ItemChange } from '../domain/itemChange';

// Which edits came from someone else — something React Query can't tell you on its own, because a
// local mutation and a poll both write the same cache.
//
// `absorb` takes an optimistic patch and records it silently; `emit` takes a network result and
// reports what changed against that snapshot. A local edit is therefore invisible twice over: the
// optimistic patch absorbs it, and the settle-refetch then finds the snapshot already holding it.

export interface RemoteChanges {
  /** Bumps per emitted batch, so an identical repeat still reads as a new event. */
  nonce: number;
  list: ItemChange[];
}

export function useRemoteChanges<T extends ChangeableItem>(scope: string) {
  const snapshot = useRef<{ scope: string; rows: Map<string, T> }>({ scope, rows: new Map() });
  const [changes, setChanges] = useState<RemoteChanges>({ nonce: 0, list: [] });

  const write = useCallback((rows: readonly T[], emitting: boolean, scopeNow: string) => {
    // A different list: nothing to compare against, or every row would look newly added.
    const switched = snapshot.current.scope !== scopeNow;
    const diff = emitting && !switched ? diffItems(snapshot.current.rows, rows) : [];
    snapshot.current = { scope: scopeNow, rows: new Map(rows.map(r => [r.id, r])) };
    if (diff.length > 0) setChanges(c => ({ nonce: c.nonce + 1, list: diff }));
  }, []);

  const absorb = useCallback((rows: readonly T[]) => write(rows, false, scope), [write, scope]);
  const emit = useCallback((rows: readonly T[]) => write(rows, true, scope), [write, scope]);

  return { changes, absorb, emit };
}
