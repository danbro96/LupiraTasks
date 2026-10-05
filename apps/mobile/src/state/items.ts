import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { mirrorQuery } from '@danbro96/lupira-expo-query/mirrorQuery';
import { diffItems, type ItemChange } from '@lupira/tasks-domain/itemChange';
import { itemsOfList } from '../data/queries/items';
import type { ItemState } from '../domain/itemState';
import { TASK_ITEM } from '../domain/ops';
import { mirrorDb } from '../sync/engine';
import { pulledSince, pullSeq } from '../sync/remoteChanges';

const NONE: ItemState[] = [];

export function useItems(listId: string): { items: ItemState[]; loading: boolean } {
  const { data, isPending } = useQuery(mirrorQuery([TASK_ITEM, listId], async () => itemsOfList(await mirrorDb(), listId)));
  return { items: data ?? NONE, loading: isPending };
}

export interface RemoteChanges {
  /** Bumped per batch, so an identical repeat still reads as a new event. */
  nonce: number;
  list: ItemChange<string>[];
}

/** What the latest pulls changed about a list's items: someone else's edits, never the user's own taps. */
export function useRemoteChanges(listId: string, items: ItemState[]): RemoteChanges {
  const [changes, setChanges] = useState<RemoteChanges>({ nonce: 0, list: [] });
  // Keyed by list: diffing against another list's rows would report every row as added.
  const seen = useRef({ listId, rows: new Map<string, ItemState>(), seq: pullSeq() });

  useEffect(() => {
    const prev = seen.current;
    const pulled = pulledSince(prev.seq);
    const diff = prev.listId === listId ? diffItems(prev.rows, items.filter(i => pulled.has(i.id))) : [];
    seen.current = { listId, rows: new Map(items.map(i => [i.id, i])), seq: pullSeq() };
    if (diff.length > 0) setChanges(c => ({ nonce: c.nonce + 1, list: diff }));
  }, [listId, items]);

  return changes;
}
