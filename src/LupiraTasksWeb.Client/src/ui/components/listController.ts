import type { ListKind, SharedItemResponse, SharedTagResponse } from '../../data/api/shareTypes';

// The surface-agnostic contract the task UI consumes. Both the account-less share hook
// (useSharedList) and the member hook (useMemberList) produce this shape, so TaskList / TaskRow /
// TaskDetail / ListView render either surface unchanged.

/** An item as the UI needs it: the shared item shape, plus an optional assignee (member surface). */
export type ListItem = SharedItemResponse & { assignedTo?: string | null };

/** The list metadata the task UI reads — common to SharedListResponse and the member ListResponse. */
export interface ListViewModel {
  name: string;
  kind: ListKind;
  color?: string | null;
  simplePriority?: boolean;
  tags: SharedTagResponse[];
}

/** The mutation surface. The share hook supplies a no-op `setAssignee` (that surface has no assignee). */
export interface ListActions {
  addTask: (title: string, parentItemId?: string | null) => void;
  rename: (itemId: string, title: string) => void;
  setNotes: (itemId: string, notes: string | null) => void;
  setDue: (itemId: string, dueAt: string | null) => void;
  setQuantity: (itemId: string, quantity: number | null, unit: string | null) => void;
  setPriority: (itemId: string, priority: number) => void;
  setAssignee: (itemId: string, email: string | null) => void;
  toggleTag: (itemId: string, tagId: string, on: boolean) => void;
  toggleComplete: (item: ListItem) => void;
  move: (itemId: string, sortOrder: string, parentItemId: string | null) => void;
  remove: (item: ListItem) => void;
}
