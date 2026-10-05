import type { ItemSyncChange } from '@lupira/tasks-api/models';
import type { ItemState } from './itemState';

/**
 * A pulled item as the reducer's state. The guards come from the server per field, so a pending local edit
 * rebases against the write that actually owns each field rather than the item's last change.
 */
export function itemFromWire({ item: r, guards: g }: ItemSyncChange): ItemState {
  const tagTs: Record<string, string> = {};
  const tagCmd: Record<string, string> = {};
  for (const [tagId, guard] of Object.entries(g.tags)) {
    tagTs[tagId] = guard.ts;
    tagCmd[tagId] = guard.cmd;
  }
  return {
    id: r.id, listId: r.listId, parentItemId: r.parentItemId ?? null,
    title: r.title, notes: r.notes ?? null,
    completed: r.completed, completedAt: r.completedAt ?? null, completedBy: r.completedBy?.principalId ?? null,
    assignedTo: r.assignee?.principalId ?? null, dueAt: r.dueAt ?? null,
    quantity: r.quantity ?? null, unit: r.unit ?? null,
    priority: r.priority ?? 0,
    tags: [...r.tags], sortOrder: r.sortOrder,
    createdBy: r.createdBy?.principalId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt,
    deleted: false,
    nameTs: g.name.ts, nameCmd: g.name.cmd,
    notesTs: g.notes.ts, notesCmd: g.notes.cmd,
    assigneeTs: g.assignee.ts, assigneeCmd: g.assignee.cmd,
    dueTs: g.due.ts, dueCmd: g.due.cmd,
    qtyTs: g.qty.ts, qtyCmd: g.qty.cmd,
    priorityTs: g.priority.ts, priorityCmd: g.priority.cmd,
    completedTs: g.status.ts, completedCmd: g.status.cmd,
    moveTs: g.move.ts, moveCmd: g.move.cmd,
    tagTs, tagCmd,
  };
}
