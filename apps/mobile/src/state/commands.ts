import * as Sentry from '@sentry/react-native';
import { generateKeyBetween } from 'fractional-indexing';
import { toast } from '@danbro96/lupira-expo-feedback/toast';
import { newId } from '@lupira/tasks-domain/ids';
import type { ListOrderTarget } from '@lupira/tasks-domain/listOrder';
import type { ListKind, ListRole } from '@lupira/tasks-api/models';
import type { ImportedTask } from '../domain/importTasks';
import { stamp, TASK_ITEM, TASK_LIST, type ClientOp } from '../domain/ops';
import { engine } from '../sync/engine';

// One function per user intent. Each queues its op(s) with the sync engine, which applies them locally at once
// and replays them to the server in the background; a rejection means the local write itself failed.

/** How long a delete stays queued, and undoable, before it replays. */
export const UNDO_MS = 6000;

async function enqueue(ops: ClientOp | ClientOp[], holdMs?: number): Promise<void> {
  try {
    await engine.enqueue(ops, { holdMs });
  } catch (e) {
    Sentry.captureException(e, { tags: { area: 'enqueue' } });
    throw e;
  }
}

const onList = (listId: string) => stamp(TASK_LIST, listId);
const onItem = (itemId: string) => stamp(TASK_ITEM, itemId);

export function createList(name: string, listKind: ListKind, color: string | null): Promise<void> {
  const listId = newId();
  return enqueue({ ...onList(listId), kind: 'list.create', listId, name, listKind, color });
}

/** The list, then each task in order: one ascending key chain keeps every sibling group ordered, and parents
 *  are tracked per nesting level. */
export function importList(name: string, listKind: ListKind, tasks: ImportedTask[]): Promise<void> {
  const listId = newId();
  const ops: ClientOp[] = [{ ...onList(listId), kind: 'list.create', listId, name, listKind, color: null }];
  const lastIdAtLevel: string[] = [];
  let prevKey: string | null = null;
  for (const t of tasks) {
    const itemId = newId();
    const parentItemId = t.level > 0 ? (lastIdAtLevel[t.level - 1] ?? null) : null;
    prevKey = generateKeyBetween(prevKey, null);
    ops.push({ ...onItem(itemId), kind: 'item.create', listId, itemId, title: t.title, sortOrder: prevKey, parentItemId });
    if (t.completed) ops.push({ ...onItem(itemId), kind: 'item.complete', listId, itemId });
    if (t.notes) ops.push({ ...onItem(itemId), kind: 'item.notes', listId, itemId, notes: t.notes });
    if (t.quantity != null || t.unit) ops.push({ ...onItem(itemId), kind: 'item.quantity', listId, itemId, quantity: t.quantity, unit: t.unit });
    if (t.dueAt) ops.push({ ...onItem(itemId), kind: 'item.due', listId, itemId, dueAt: t.dueAt });
    lastIdAtLevel[t.level] = itemId;
    lastIdAtLevel.length = t.level + 1;
  }
  return enqueue(ops);
}

export const renameList = (listId: string, name: string) =>
  enqueue({ ...onList(listId), kind: 'list.rename', listId, name });

export const recolorList = (listId: string, color: string | null) =>
  enqueue({ ...onList(listId), kind: 'list.recolor', listId, color });

export const setSimplePriority = (listId: string, simplePriority: boolean) =>
  enqueue({ ...onList(listId), kind: 'list.setSimplePriority', listId, simplePriority });

export const reorderLists = (targets: ListOrderTarget[]) =>
  enqueue(targets.map(t => ({ ...onList(t.listId), kind: 'list.reorder' as const, ...t })));

export const addMember = (listId: string, email: string, role: ListRole) =>
  enqueue({ ...onList(listId), kind: 'list.memberAdd', listId, email, role });

export const changeMemberRole = (listId: string, principalId: string, role: ListRole) =>
  enqueue({ ...onList(listId), kind: 'list.memberRoleChange', listId, principalId, role });

export const removeMember = (listId: string, principalId: string) =>
  enqueue({ ...onList(listId), kind: 'list.memberRemove', listId, principalId });

export const leaveList = (listId: string, principalId: string) =>
  enqueue({ ...onList(listId), kind: 'list.leave', listId, principalId });

export const archiveList = (listId: string) => enqueue({ ...onList(listId), kind: 'list.archive', listId });

export const restoreList = (listId: string) => enqueue({ ...onList(listId), kind: 'list.restore', listId });

export const deleteList = (listId: string) => enqueue({ ...onList(listId), kind: 'list.delete', listId });

export const addItem = (listId: string, title: string, sortOrder: string, parentItemId: string | null) => {
  const itemId = newId();
  return enqueue({ ...onItem(itemId), kind: 'item.create', listId, itemId, title, sortOrder, parentItemId });
};

export const renameItem = (listId: string, itemId: string, title: string) =>
  enqueue({ ...onItem(itemId), kind: 'item.rename', listId, itemId, title });

export const setNotes = (listId: string, itemId: string, notes: string | null) =>
  enqueue({ ...onItem(itemId), kind: 'item.notes', listId, itemId, notes });

export const setQuantity = (listId: string, itemId: string, quantity: number | null, unit: string | null) =>
  enqueue({ ...onItem(itemId), kind: 'item.quantity', listId, itemId, quantity, unit });

export const setDue = (listId: string, itemId: string, dueAt: string | null) =>
  enqueue({ ...onItem(itemId), kind: 'item.due', listId, itemId, dueAt });

export const assignItem = (listId: string, itemId: string, member: { principalId: string; email: string } | null) =>
  enqueue({ ...onItem(itemId), kind: 'item.assign', listId, itemId, assigneePrincipalId: member?.principalId ?? null, assigneeEmail: member?.email ?? null });

export const setPriority = (listId: string, itemId: string, priority: number) =>
  enqueue({ ...onItem(itemId), kind: 'item.priority', listId, itemId, priority });

export const setCompleted = (listId: string, itemId: string, completed: boolean) =>
  enqueue({ ...onItem(itemId), kind: completed ? 'item.complete' : 'item.reopen', listId, itemId });

export const moveItem = (listId: string, itemId: string, target: { sortOrder: string; parentItemId: string | null }) =>
  enqueue({ ...onItem(itemId), kind: 'item.move', listId, itemId, ...target });

/** Deletes items at once on this device; the ops stay queued for the Undo window, so Undo just drops them. */
export async function deleteItems(listId: string, itemIds: string[], label?: string): Promise<void> {
  const ops = itemIds.map(itemId => ({ ...onItem(itemId), kind: 'item.delete' as const, listId, itemId }));
  await enqueue(ops, UNDO_MS);
  toast(label ?? (itemIds.length > 1 ? `${itemIds.length} items deleted` : 'Item deleted'), {
    durationMs: UNDO_MS,
    action: { label: 'Undo', onPress: () => void Promise.all(ops.map(op => engine.discard(op.commandId))) },
  });
}

export async function retryChanges(commandIds: string[]): Promise<void> {
  for (const commandId of commandIds) await engine.retry(commandId);
}

export const discardChange = (commandId: string) => engine.discard(commandId);
