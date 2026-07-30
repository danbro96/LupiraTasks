import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../data/api/fetcher';
import {
  deleteListsListIdItemsItemId,
  getGetListsListIdItemsQueryKey,
  getListsListIdItems,
  patchListsListIdItemsItemId,
  postListsListIdItems,
  postListsListIdItemsItemIdComplete,
  postListsListIdItemsItemIdMove,
  postListsListIdItemsItemIdReopen,
} from '../data/api/member/items/items';
import { getGetListsListIdQueryKey, useGetListsListId } from '../data/api/member/lists/lists';
import { ItemStatus } from '../data/api/member/models';
import type { CreateItemRequest, ItemResponse, ListResponse, TagResponse, UpdateItemRequest } from '../data/api/member/models';
import { newId } from '../domain/ids';
import { descendantIds, nextChildSortOrder, topSortOrder } from '../domain/itemTree';
import { useRemoteChanges } from './useRemoteChanges';
import { useListPollInterval } from './usePollInterval';

// Member-surface controller — the authenticated analogue of useSharedList. Same return shape
// (`{ query, list, items, canEdit, tagsById, actions, members }`) so the same task UI renders it.
// List metadata + items are two queries; mutations patch the items cache optimistically and refetch
// on settle. `canEdit` derives from the caller's own role (Owner/Editor), unlike the share surface's
// access flag.

const TERMINAL = new Set([400, 401, 403, 404]);
const nowIso = () => new Date().toISOString();

type Ctx = { previous?: ItemResponse[] };

export function useMemberList(listId: string) {
  const qc = useQueryClient();
  const itemsKey = useMemo(() => getGetListsListIdItemsQueryKey(listId), [listId]);

  const retry = (count: number, err: unknown) =>
    !(err instanceof ApiError && TERMINAL.has(err.status)) && count < 2;

  const { changes, absorb, emit } = useRemoteChanges<ItemResponse>(listId);
  const refetchInterval = useListPollInterval();

  // Polled so another member's edits appear without a manual refresh. refetchIntervalInBackground is
  // left at its default (false) so a hidden tab stops polling. Meta is polled too: a remote rename /
  // recolor / tag / member change matters, and `members` is what puts a name on the notice.
  const metaQuery = useGetListsListId<ListResponse, ApiError>(listId, { query: { retry, refetchInterval } });
  // Hand-rolled rather than the generated hook so `emit` can sit in queryFn: only a network result may
  // announce a change, and setQueryData never runs queryFn.
  const itemsQuery = useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      const { items: rows } = await getListsListIdItems(listId);
      emit(rows);
      return rows;
    },
    retry,
    refetchInterval,
  });

  const list = metaQuery.data;
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const members = useMemo(() => list?.members ?? [], [list]);
  const tagsById = useMemo(
    () => new Map<string, TagResponse>((list?.tags ?? []).map(t => [t.id, t])),
    [list],
  );

  const myRole = list?.access;
  const canEdit = myRole === 'Owner' || myRole === 'Editor';

  // A combined view of the two queries so the screen has one loading/error/refetch surface.
  const query = {
    isLoading: metaQuery.isLoading || itemsQuery.isLoading,
    isError: metaQuery.isError || itemsQuery.isError,
    error: (metaQuery.error ?? itemsQuery.error) as unknown,
    refetch: () => {
      void metaQuery.refetch();
      void itemsQuery.refetch();
    },
  };

  function optimistic<V>(apply: (items: ItemResponse[], vars: V) => ItemResponse[]) {
    return {
      onMutate: async (vars: V): Promise<Ctx> => {
        await qc.cancelQueries({ queryKey: itemsKey });
        const previous = qc.getQueryData<ItemResponse[]>(itemsKey);
        if (previous) {
          const patched = apply(previous, vars);
          qc.setQueryData<ItemResponse[]>(itemsKey, patched);
          absorb(patched); // the user's own edit — never announce it back to them
        }
        return { previous };
      },
      onError: (_err: unknown, _vars: V, ctx: Ctx | undefined) => {
        if (ctx?.previous) {
          qc.setQueryData(itemsKey, ctx.previous);
          absorb(ctx.previous); // rolled back — the snapshot must follow, or the next poll "changes" it back
        }
      },
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: itemsKey });
        void qc.invalidateQueries({ queryKey: getGetListsListIdQueryKey(listId) });
      },
    };
  }

  const addMut = useMutation<ItemResponse, unknown, CreateItemRequest, Ctx>({
    mutationFn: body => postListsListIdItems(listId, { occurredAt: nowIso(), ...body }),
    ...optimistic<CreateItemRequest>((curr, body) => [
      ...curr,
      {
        id: body.id,
        listId,
        parentItemId: body.parentItemId ?? null,
        title: body.title,
        status: ItemStatus.Open,
        notes: null,
        completed: false,
        completedAt: null,
        dueAt: body.dueAt ?? null,
        quantity: body.quantity ?? null,
        unit: body.unit ?? null,
        priority: body.priority ?? 0,
        assignee: null,
        tags: body.tagIds ?? [],
        sortOrder: body.sortOrder,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ]),
  });

  const updateMut = useMutation<ItemResponse, unknown, { itemId: string; body: UpdateItemRequest }, Ctx>({
    mutationFn: ({ itemId, body }) => patchListsListIdItemsItemId(listId, itemId, { occurredAt: nowIso(), ...body }),
    ...optimistic<{ itemId: string; body: UpdateItemRequest }>((curr, { itemId, body }) =>
      curr.map(it => {
        if (it.id !== itemId) return it;
        const next = { ...it };
        if (body.titleProvided && body.title != null) next.title = body.title;
        if (body.notesProvided) next.notes = body.notes ?? null;
        if (body.dueAtProvided) next.dueAt = body.dueAt ?? null;
        if (body.quantityProvided) {
          next.quantity = body.quantity ?? null;
          next.unit = body.unit ?? null;
        }
        if (body.priorityProvided) next.priority = body.priority ?? 0;
        if (body.assigneeEmailProvided) {
          // Set-by-email still, but the item carries a PersonRef — resolve it from the roster so the
          // picker stays on the right member until the settle-refetch replaces it with the server's.
          const email = body.assigneeEmail ?? null;
          const match = email ? members.find(m => m.email.toLowerCase() === email.toLowerCase()) : undefined;
          next.assignee = match
            ? { principalId: match.principalId, email: match.email, displayName: match.displayName }
            : email
              ? { principalId: '', email, displayName: null }
              : null;
        }
        if (body.addTagIds?.length) next.tags = Array.from(new Set([...it.tags, ...body.addTagIds]));
        if (body.removeTagIds?.length) next.tags = it.tags.filter(t => !body.removeTagIds!.includes(t));
        return next;
      }),
    ),
  });

  // Only id+completed: the UI passes the surface-agnostic ListItem, not the full member ItemResponse.
  const toggleMut = useMutation<ItemResponse, unknown, { id: string; completed: boolean }, Ctx>({
    mutationFn: item =>
      item.completed
        ? postListsListIdItemsItemIdReopen(listId, item.id, { occurredAt: nowIso() })
        : postListsListIdItemsItemIdComplete(listId, item.id, { occurredAt: nowIso() }),
    ...optimistic<{ id: string; completed: boolean }>((curr, item) =>
      curr.map(it =>
        it.id === item.id ? { ...it, completed: !item.completed, completedAt: item.completed ? null : nowIso() } : it,
      ),
    ),
  });

  const moveMut = useMutation<
    ItemResponse,
    unknown,
    { itemId: string; sortOrder: string; parentItemId: string | null },
    Ctx
  >({
    mutationFn: ({ itemId, sortOrder, parentItemId }) =>
      postListsListIdItemsItemIdMove(listId, itemId, { sortOrder, parentItemId, occurredAt: nowIso() }),
    ...optimistic<{ itemId: string; sortOrder: string; parentItemId: string | null }>((curr, { itemId, sortOrder, parentItemId }) =>
      curr.map(it => (it.id === itemId ? { ...it, sortOrder, parentItemId } : it)),
    ),
  });

  const deleteMut = useMutation<void, unknown, { ids: string[] }, Ctx>({
    mutationFn: ({ ids }) =>
      Promise.all(ids.map(id => deleteListsListIdItemsItemId(listId, id, { occurredAt: nowIso() }))).then(() => undefined),
    ...optimistic<{ ids: string[] }>((curr, { ids }) => curr.filter(it => !ids.includes(it.id))),
  });

  const actions = useMemo(
    () => ({
      addTask(title: string, parentItemId: string | null = null) {
        const sortOrder = parentItemId ? nextChildSortOrder(items, parentItemId) : topSortOrder(items);
        addMut.mutate({ id: newId(), title, sortOrder, parentItemId });
      },
      rename(itemId: string, title: string) {
        updateMut.mutate({ itemId, body: { title, titleProvided: true } });
      },
      setNotes(itemId: string, notes: string | null) {
        updateMut.mutate({ itemId, body: { notes, notesProvided: true } });
      },
      setDue(itemId: string, dueAt: string | null) {
        updateMut.mutate({ itemId, body: { dueAt, dueAtProvided: true } });
      },
      setQuantity(itemId: string, quantity: number | null, unit: string | null) {
        updateMut.mutate({ itemId, body: { quantity, unit, quantityProvided: true } });
      },
      setPriority(itemId: string, priority: number) {
        updateMut.mutate({ itemId, body: { priority, priorityProvided: true } });
      },
      setAssignee(itemId: string, email: string | null) {
        updateMut.mutate({ itemId, body: { assigneeEmail: email, assigneeEmailProvided: true } });
      },
      toggleTag(itemId: string, tagId: string, on: boolean) {
        updateMut.mutate({ itemId, body: on ? { addTagIds: [tagId] } : { removeTagIds: [tagId] } });
      },
      toggleComplete(item: { id: string; completed: boolean }) {
        toggleMut.mutate({ id: item.id, completed: item.completed });
      },
      move(itemId: string, sortOrder: string, parentItemId: string | null) {
        moveMut.mutate({ itemId, sortOrder, parentItemId });
      },
      remove(item: { id: string }) {
        deleteMut.mutate({ ids: [item.id, ...descendantIds(items, item.id)] });
      },
    }),
    [items, addMut, updateMut, toggleMut, moveMut, deleteMut],
  );

  return { query, list, items, canEdit, tagsById, members, actions, changes };
}
