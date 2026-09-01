import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../data/api/fetcher';
import {
  deleteSharedItem,
  getGetSharedListQueryKey,
  getSharedList,
  updateSharedItem,
  createSharedItem,
  completeSharedItem,
  moveSharedItem,
  reopenSharedItem,
} from '../data/api/shared/shared/shared';
import type {
  CreateItemRequest,
  SharedItemDto,
  SharedListResponse,
  SharedTagDto,
  UpdateItemRequest,
} from '../data/api/shared/models';
import { newId } from '../domain/ids';
import { descendantIds, nextChildSortOrder, topSortOrder } from '../domain/itemTree';
import { useRemoteChanges } from './useRemoteChanges';
import { useListPollInterval } from './usePollInterval';

// React Query wrapper around the shared-link surface. One cached list per token; every mutation
// updates the cache optimistically (so the UI feels instant), rolls back on error, and refetches
// on settle (server is the source of truth — no offline/persistence here). Every mutation stamps
// `occurredAt` (client wall-clock) so concurrent edits converge via last-writer-wins.

const TERMINAL = new Set([400, 401, 403, 404]); // not worth retrying
const nowIso = () => new Date().toISOString();

type Ctx = { previous?: SharedListResponse };

export function useSharedList(token: string) {
  const qc = useQueryClient();
  const key = useMemo(() => getGetSharedListQueryKey(token), [token]);

  const { changes, absorb, emit } = useRemoteChanges<SharedItemDto>(token);
  const refetchInterval = useListPollInterval();

  // Hand-rolled rather than the generated hook so `emit` can sit in queryFn: only a network result
  // may announce a change, and setQueryData never runs queryFn.
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const data = await getSharedList(token);
      emit(data.items);
      return data;
    },
    retry: (count, err) => !(err instanceof ApiError && TERMINAL.has(err.status)) && count < 2,
    // A hidden tab stops polling (refetchIntervalInBackground defaults to false).
    refetchInterval,
  });

  const list = query.data;
  const items = useMemo(() => list?.items ?? [], [list]);
  const canEdit = list?.access === 'ReadWrite';
  const tagsById = useMemo(
    () => new Map<string, SharedTagDto>((list?.tags ?? []).map(t => [t.id, t])),
    [list],
  );

  // Shared optimistic scaffolding for every mutation: snapshot → patch items → roll back on error
  // → refetch on settle.
  function optimistic<V>(apply: (items: SharedItemDto[], vars: V) => SharedItemDto[]) {
    return {
      onMutate: async (vars: V): Promise<Ctx> => {
        await qc.cancelQueries({ queryKey: key });
        const previous = qc.getQueryData<SharedListResponse>(key);
        if (previous) {
          const patched = apply(previous.items, vars);
          qc.setQueryData<SharedListResponse>(key, { ...previous, items: patched });
          absorb(patched); // the user's own edit — never announce it back to them
        }
        return { previous };
      },
      onError: (_err: unknown, _vars: V, ctx: Ctx | undefined) => {
        if (ctx?.previous) {
          qc.setQueryData(key, ctx.previous);
          absorb(ctx.previous.items); // rolled back — the snapshot must follow
        }
      },
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: key });
      },
    };
  }

  const addMut = useMutation<SharedItemDto, unknown, CreateItemRequest, Ctx>({
    mutationFn: body => createSharedItem(token, { occurredAt: nowIso(), ...body }),
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
        tags: body.tagIds ?? [],
        sortOrder: body.sortOrder,
      },
    ]),
  });

  const updateMut = useMutation<SharedItemDto, unknown, { itemId: string; body: UpdateItemRequest }, Ctx>({
    mutationFn: ({ itemId, body }) => updateSharedItem(token, itemId, { occurredAt: nowIso(), ...body }),
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
        if (body.addTagIds?.length) next.tags = Array.from(new Set([...it.tags, ...body.addTagIds]));
        if (body.removeTagIds?.length) next.tags = it.tags.filter(t => !body.removeTagIds!.includes(t));
        return next;
      }),
    ),
  });

  const toggleMut = useMutation<SharedItemDto, unknown, SharedItemDto, Ctx>({
    mutationFn: item =>
      item.completed
        ? reopenSharedItem(token, item.id, { occurredAt: nowIso() })
        : completeSharedItem(token, item.id, { occurredAt: nowIso() }),
    ...optimistic<SharedItemDto>((curr, item) =>
      curr.map(it =>
        it.id === item.id ? { ...it, completed: !item.completed, completedAt: item.completed ? null : nowIso() } : it,
      ),
    ),
  });

  const moveMut = useMutation<
    SharedItemDto,
    unknown,
    { itemId: string; sortOrder: string; parentItemId: string | null },
    Ctx
  >({
    mutationFn: ({ itemId, sortOrder, parentItemId }) =>
      moveSharedItem(token, itemId, { sortOrder, parentItemId, occurredAt: nowIso() }),
    ...optimistic<{ itemId: string; sortOrder: string; parentItemId: string | null }>((curr, { itemId, sortOrder, parentItemId }) =>
      curr.map(it => (it.id === itemId ? { ...it, sortOrder, parentItemId } : it)),
    ),
  });

  const deleteMut = useMutation<void, unknown, { ids: string[] }, Ctx>({
    mutationFn: ({ ids }) =>
      Promise.all(ids.map(id => deleteSharedItem(token, id, { occurredAt: nowIso() }))).then(() => undefined),
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
      // The account-less share surface has no assignees (the API trims emails) — no-op to satisfy
      // the shared ListActions contract.
      setAssignee(_itemId: string, _email: string | null) {},
      toggleTag(itemId: string, tagId: string, on: boolean) {
        updateMut.mutate({ itemId, body: on ? { addTagIds: [tagId] } : { removeTagIds: [tagId] } });
      },
      toggleComplete(item: SharedItemDto) {
        toggleMut.mutate(item);
      },
      move(itemId: string, sortOrder: string, parentItemId: string | null) {
        moveMut.mutate({ itemId, sortOrder, parentItemId });
      },
      remove(item: SharedItemDto) {
        deleteMut.mutate({ ids: [item.id, ...descendantIds(items, item.id)] });
      },
    }),
    [items, addMut, updateMut, toggleMut, moveMut, deleteMut],
  );

  return { query, list, items, canEdit, tagsById, actions, changes };
}

export type SharedListController = ReturnType<typeof useSharedList>;
