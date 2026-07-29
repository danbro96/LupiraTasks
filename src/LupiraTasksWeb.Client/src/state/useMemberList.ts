import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../data/api/lists';
import { ApiError } from '../data/api/fetcher';
import type { CreateItemRequest, MemberItemResponse, SharedTagResponse } from '../data/api/listTypes';
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

/** Member item PATCH body — the shared fields plus the member-only assignee. */
type UpdateBody = {
  title?: string;
  titleProvided?: boolean;
  notes?: string | null;
  notesProvided?: boolean;
  dueAt?: string | null;
  dueAtProvided?: boolean;
  quantity?: number | null;
  unit?: string | null;
  quantityProvided?: boolean;
  priority?: number | null;
  priorityProvided?: boolean;
  assigneeEmail?: string | null;
  assigneeEmailProvided?: boolean;
  addTagIds?: string[] | null;
  removeTagIds?: string[] | null;
};

type Ctx = { previous?: MemberItemResponse[] };

export function useMemberList(listId: string) {
  const qc = useQueryClient();
  const metaKey = useMemo(() => ['list', listId] as const, [listId]);
  const itemsKey = useMemo(() => ['list', listId, 'items'] as const, [listId]);

  const retry = (count: number, err: unknown) =>
    !(err instanceof ApiError && TERMINAL.has(err.status)) && count < 2;

  const { changes, absorb, emit } = useRemoteChanges<MemberItemResponse>(listId);
  const refetchInterval = useListPollInterval();

  // Polled so another member's edits appear without a manual refresh. refetchIntervalInBackground is
  // left at its default (false) so a hidden tab stops polling. Meta is polled too: a remote rename /
  // recolor / tag / member change matters, and `members` is what puts a name on the notice.
  const metaQuery = useQuery({
    queryKey: metaKey,
    queryFn: () => api.getList(listId),
    retry,
    refetchInterval,
  });
  const itemsQuery = useQuery({
    queryKey: itemsKey,
    // Only a network result can emit — setQueryData never runs queryFn.
    queryFn: async () => {
      const rows = await api.getListItems(listId);
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
    () => new Map<string, SharedTagResponse>((list?.tags ?? []).map(t => [t.id, t])),
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

  function optimistic<V>(apply: (items: MemberItemResponse[], vars: V) => MemberItemResponse[]) {
    return {
      onMutate: async (vars: V): Promise<Ctx> => {
        await qc.cancelQueries({ queryKey: itemsKey });
        const previous = qc.getQueryData<MemberItemResponse[]>(itemsKey);
        if (previous) {
          const patched = apply(previous, vars);
          qc.setQueryData<MemberItemResponse[]>(itemsKey, patched);
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
      },
    };
  }

  const addMut = useMutation<MemberItemResponse, unknown, CreateItemRequest, Ctx>({
    mutationFn: body => api.addItem(listId, body),
    ...optimistic<CreateItemRequest>((curr, body) => [
      ...curr,
      {
        id: body.id,
        parentItemId: body.parentItemId ?? null,
        title: body.title,
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
      },
    ]),
  });

  const updateMut = useMutation<MemberItemResponse, unknown, { itemId: string; body: UpdateBody }, Ctx>({
    mutationFn: ({ itemId, body }) => api.updateItem(listId, itemId, body),
    ...optimistic<{ itemId: string; body: UpdateBody }>((curr, { itemId, body }) =>
      curr.map(it => {
        if (it.id !== itemId) return it;
        const next = { ...it };
        if (body.titleProvided && body.title !== undefined) next.title = body.title;
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

  const toggleMut = useMutation<MemberItemResponse, unknown, MemberItemResponse, Ctx>({
    mutationFn: item => (item.completed ? api.reopenItem(listId, item.id) : api.completeItem(listId, item.id)),
    ...optimistic<MemberItemResponse>((curr, item) =>
      curr.map(it =>
        it.id === item.id ? { ...it, completed: !item.completed, completedAt: item.completed ? null : nowIso() } : it,
      ),
    ),
  });

  const moveMut = useMutation<
    MemberItemResponse,
    unknown,
    { itemId: string; sortOrder: string; parentItemId: string | null },
    Ctx
  >({
    mutationFn: ({ itemId, sortOrder, parentItemId }) => api.moveItem(listId, itemId, { sortOrder, parentItemId }),
    ...optimistic<{ itemId: string; sortOrder: string; parentItemId: string | null }>((curr, { itemId, sortOrder, parentItemId }) =>
      curr.map(it => (it.id === itemId ? { ...it, sortOrder, parentItemId } : it)),
    ),
  });

  const deleteMut = useMutation<void, unknown, { ids: string[] }, Ctx>({
    mutationFn: ({ ids }) => Promise.all(ids.map(id => api.deleteItem(listId, id))).then(() => undefined),
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
      toggleComplete(item: MemberItemResponse) {
        toggleMut.mutate(item);
      },
      move(itemId: string, sortOrder: string, parentItemId: string | null) {
        moveMut.mutate({ itemId, sortOrder, parentItemId });
      },
      remove(item: MemberItemResponse) {
        deleteMut.mutate({ ids: [item.id, ...descendantIds(items, item.id)] });
      },
    }),
    [items, addMut, updateMut, toggleMut, moveMut, deleteMut],
  );

  return { query, list, items, canEdit, tagsById, members, actions, changes };
}
