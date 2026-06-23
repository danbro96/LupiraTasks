// DTOs for the account-less shared-link surface (`/shared/{token}`), mirroring the API's
// SharedListResponse / SharedItemResponse and the item request DTOs. Hand-authored (the
// generated Orval client targets an empty OpenAPI doc); kept narrow to exactly this surface.

export type ListKind = 'Todo' | 'Shopping';
export type ShareAccess = 'Read' | 'ReadWrite';

export interface SharedTagResponse {
  id: string;
  label: string;
  color: string;
}

export interface SharedItemResponse {
  id: string;
  parentItemId?: string | null;
  title: string;
  notes?: string | null;
  completed: boolean;
  completedAt?: string | null;
  dueAt?: string | null;
  quantity?: number | null;
  unit?: string | null;
  priority?: number | null; // 0 = none, 1..9 scale
  tags: string[]; // tag ids — resolve labels/colors against SharedListResponse.tags
  sortOrder: string;
}

export interface SharedListResponse {
  name: string;
  kind: ListKind;
  color?: string | null;
  simplePriority?: boolean; // true (default) = star toggle; false = 0–9 scale
  access: ShareAccess;
  tags: SharedTagResponse[];
  items: SharedItemResponse[];
}

export interface CreateItemRequest {
  id: string; // client GUIDv7 (idempotency key)
  title: string;
  sortOrder: string;
  parentItemId?: string | null;
  dueAt?: string | null;
  quantity?: number | null;
  unit?: string | null;
  priority?: number | null;
  tagIds?: string[] | null;
  occurredAt?: string | null;
}

/** PATCH uses `*Provided` flags so the server can tell "clear to null" from "leave unchanged". */
export interface UpdateItemRequest {
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
  addTagIds?: string[] | null;
  removeTagIds?: string[] | null;
  occurredAt?: string | null;
}

export interface MoveItemRequest {
  parentItemId?: string | null;
  sortOrder: string;
  occurredAt?: string | null;
}
