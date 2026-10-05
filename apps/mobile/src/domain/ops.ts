import { newId } from '@lupira/tasks-domain/ids';
import type { Guid, Iso, ItemEvent } from './events';
import type { ListKind, ListRole } from '@lupira/tasks-api/models';

// A ClientOp is one user action: the unit the sync engine queues, folds into the local docs (item ops through
// the LWW reducer, list ops through listDoc) and replays to the API with its commandId as the Idempotency-Key,
// so a redelivered command is a server-side no-op. This module is the pure half: the type and its builders.

export const TASK_LIST = 'task.list';
export const TASK_ITEM = 'task.item';

export type Aggregate = typeof TASK_LIST | typeof TASK_ITEM;

interface Base<A extends Aggregate> {
  commandId: Guid;
  occurredAt: Iso;
  aggregate: A;
  aggregateId: Guid;
}

type I = Base<typeof TASK_ITEM>;
type L = Base<typeof TASK_LIST>;

export type ItemOp =
  | (I & { kind: 'item.create'; listId: Guid; itemId: Guid; title: string; sortOrder: string; parentItemId: Guid | null })
  | (I & { kind: 'item.rename'; listId: Guid; itemId: Guid; title: string })
  | (I & { kind: 'item.notes'; listId: Guid; itemId: Guid; notes: string | null })
  | (I & { kind: 'item.assign'; listId: Guid; itemId: Guid; assigneePrincipalId: string | null; assigneeEmail: string | null })
  | (I & { kind: 'item.due'; listId: Guid; itemId: Guid; dueAt: Iso | null })
  | (I & { kind: 'item.quantity'; listId: Guid; itemId: Guid; quantity: number | null; unit: string | null })
  | (I & { kind: 'item.priority'; listId: Guid; itemId: Guid; priority: number })
  | (I & { kind: 'item.tagAdd'; listId: Guid; itemId: Guid; tagId: Guid })
  | (I & { kind: 'item.tagRemove'; listId: Guid; itemId: Guid; tagId: Guid })
  | (I & { kind: 'item.complete'; listId: Guid; itemId: Guid })
  | (I & { kind: 'item.reopen'; listId: Guid; itemId: Guid })
  | (I & { kind: 'item.move'; listId: Guid; itemId: Guid; sortOrder: string; parentItemId: Guid | null })
  | (I & { kind: 'item.delete'; listId: Guid; itemId: Guid });

export type ListOp =
  | (L & { kind: 'list.create'; listId: Guid; name: string; listKind: ListKind; color: string | null })
  | (L & { kind: 'list.rename'; listId: Guid; name: string })
  | (L & { kind: 'list.recolor'; listId: Guid; color: string | null })
  | (L & { kind: 'list.setSimplePriority'; listId: Guid; simplePriority: boolean })
  | (L & { kind: 'list.reorder'; listId: Guid; sortOrder: string })
  | (L & { kind: 'list.memberAdd'; listId: Guid; email: string; role: ListRole })
  | (L & { kind: 'list.memberRoleChange'; listId: Guid; principalId: string; role: ListRole })
  | (L & { kind: 'list.memberRemove'; listId: Guid; principalId: string })
  | (L & { kind: 'list.leave'; listId: Guid; principalId: string })
  | (L & { kind: 'list.delete'; listId: Guid })
  | (L & { kind: 'list.archive'; listId: Guid })
  | (L & { kind: 'list.restore'; listId: Guid });

export type ClientOp = ItemOp | ListOp;

/** A fresh command id and client wall-clock for a new op on one aggregate. */
export function stamp<A extends Aggregate>(aggregate: A, aggregateId: Guid): Base<A> {
  return { commandId: newId(), occurredAt: new Date().toISOString(), aggregate, aggregateId };
}

/** The item event an op folds into the item's state. */
export function itemEventOf(op: ItemOp): ItemEvent {
  const { commandId, occurredAt } = op;
  switch (op.kind) {
    case 'item.create':
      return { type: 'ItemAdded', itemId: op.itemId, listId: op.listId, parentItemId: op.parentItemId, title: op.title, sortOrder: op.sortOrder, occurredAt, commandId };
    case 'item.rename':
      return { type: 'ItemRenamed', itemId: op.itemId, title: op.title, occurredAt, commandId };
    case 'item.notes':
      return { type: 'ItemNotesEdited', itemId: op.itemId, notes: op.notes, occurredAt, commandId };
    case 'item.assign':
      return { type: 'ItemAssigned', itemId: op.itemId, assigneePrincipalId: op.assigneePrincipalId, occurredAt, commandId };
    case 'item.due':
      return { type: 'ItemDueDateSet', itemId: op.itemId, dueAt: op.dueAt, occurredAt, commandId };
    case 'item.quantity':
      return { type: 'ItemQuantitySet', itemId: op.itemId, quantity: op.quantity, unit: op.unit, occurredAt, commandId };
    case 'item.priority':
      return { type: 'ItemPrioritySet', itemId: op.itemId, priority: op.priority, occurredAt, commandId };
    case 'item.tagAdd':
      return { type: 'ItemTagAdded', itemId: op.itemId, tagId: op.tagId, occurredAt, commandId };
    case 'item.tagRemove':
      return { type: 'ItemTagRemoved', itemId: op.itemId, tagId: op.tagId, occurredAt, commandId };
    case 'item.complete':
      return { type: 'ItemCompleted', itemId: op.itemId, occurredAt, commandId };
    case 'item.reopen':
      return { type: 'ItemReopened', itemId: op.itemId, occurredAt, commandId };
    case 'item.move':
      return { type: 'ItemMoved', itemId: op.itemId, parentItemId: op.parentItemId, sortOrder: op.sortOrder, occurredAt, commandId };
    case 'item.delete':
      return { type: 'ItemDeleted', itemId: op.itemId, occurredAt, commandId };
  }
}
