import { useEffect } from 'react';
import { create } from 'zustand';
import type { ListDto } from '@lupira/tasks-api/models';
import { sortActiveLists, sortArchivedLists } from '@lupira/tasks-domain/listOrder';
import { getDb, getListDocs, getArchivedListDocs } from '../data/db';
import { useSyncStatus } from '../sync/syncStatus';
import { logDebug } from '../debug/log';

// One in-memory copy of the mirrored lists, shared by every screen. A per-screen read would start
// empty on mount, and an empty list set reads as "not a member" until SQLite answers.

type ListsState = {
  /** False until the first mirror read lands — distinguishes "unknown" from "no lists". */
  loaded: boolean;
  active: ListDto[];
  archived: ListDto[];
};

export const useListsStore = create<ListsState>(() => ({ loaded: false, active: [], archived: [] }));

let latestRead = 0;
let started = false;

export async function reloadLists(): Promise<void> {
  const read = ++latestRead;
  try {
    const db = await getDb();
    const [active, archived] = await Promise.all([getListDocs<ListDto>(db), getArchivedListDocs<ListDto>(db)]);
    // Two overlapping reads resolving out of order must not leave the older one on screen.
    if (read !== latestRead) return;
    const prev = useListsStore.getState();
    const next = { active: sortActiveLists(active), archived: sortArchivedLists(archived) };
    // A polled pull rewrites identical rows every few seconds; fresh arrays would re-render every row.
    useListsStore.setState({
      loaded: true,
      active: JSON.stringify(next.active) === JSON.stringify(prev.active) ? prev.active : next.active,
      archived: JSON.stringify(next.archived) === JSON.stringify(prev.archived) ? prev.archived : next.archived,
    });
  } catch (e) {
    // Keep the last good rows; the next bump retries.
    logDebug('lists:error', e instanceof Error ? e.message : String(e));
  }
}

/** Load once and follow every mirror bump. Idempotent. */
export function startListsStore(): void {
  if (started) return;
  started = true;
  useSyncStatus.subscribe((s, prev) => {
    if (s.mirrorRevision !== prev.mirrorRevision) void reloadLists();
  });
  void reloadLists();
}

/** Select from the store, starting it on first use. */
export function useListsState<T>(selector: (s: ListsState) => T): T {
  useEffect(startListsStore, []);
  return useListsStore(selector);
}
