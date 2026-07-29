import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../data/api/fetcher';
import { createList, getLists, setListOrder } from '../data/api/lists';
import type { CreateListRequest, ListResponse } from '../data/api/listTypes';
import { newId } from '../domain/ids';
import { planListReorder, sortActiveLists, sortArchivedLists } from '../domain/listOrder';

const TERMINAL = new Set([400, 401, 403, 404]); // not worth retrying

/** The caller's lists (GET /lists) + create and reorder mutations. The landing screen's data source.
 *  `lists` comes back in display order: the caller's own drag order, then never-dragged by name
 *  (archived: most recently archived first). */
export function useLists(archived = false) {
  const qc = useQueryClient();
  const key = ['lists', { archived }] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => getLists(archived),
    retry: (count, err) => !(err instanceof ApiError && TERMINAL.has(err.status)) && count < 2,
  });

  const create = useMutation({
    mutationFn: (body: Omit<CreateListRequest, 'id'>) => createList({ id: newId(), ...body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['lists'] }),
  });

  const lists = query.data ?? [];
  const sorted = archived ? sortArchivedLists(lists) : sortActiveLists(lists);

  const reorder = useMutation({
    // Sequential, not parallel: the first drag materializes a key for every list, and the server
    // records one event per call — no reason to open N connections for a handful of writes.
    mutationFn: async ({ from, to }: { from: number; to: number }) => {
      for (const t of planListReorder(sorted, from, to)) {
        await setListOrder(t.listId, { sortOrder: t.sortOrder });
      }
    },
    // Apply the new keys to the cache up front so the row stays where it was dropped instead of
    // snapping back for the round-trip. A failure is corrected by the invalidate in onSettled.
    onMutate: ({ from, to }: { from: number; to: number }) => {
      const keys = new Map(planListReorder(sorted, from, to).map(t => [t.listId, t.sortOrder]));
      if (keys.size === 0) return;
      qc.setQueryData<ListResponse[]>(key, prev =>
        prev?.map(l => (keys.has(l.id) ? { ...l, sortOrder: keys.get(l.id)! } : l)));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['lists'] }),
  });

  return { query, lists: sorted, create, reorder };
}
