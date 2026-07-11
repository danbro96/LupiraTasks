// DTOs for the authenticated member surface, mirroring the API's ListResponse / ItemResponse /
// member + share contracts. Item and item-request shapes are identical to the shared surface, so
// those are re-exported from shareTypes rather than duplicated.

import type { ListKind, ShareAccess, SharedItemResponse, SharedTagResponse } from './shareTypes';

export type { ListKind, ShareAccess, SharedTagResponse } from './shareTypes';
export type { CreateItemRequest, MoveItemRequest, UpdateItemRequest } from './shareTypes';

export type ListRole = 'Owner' | 'Editor' | 'Viewer';

/** An identity as the API emits it. Identity is keyed on `principalId`; email/displayName are for display. */
export interface PersonRef {
  principalId: string;
  email: string;
  displayName?: string | null;
}

export interface MeResponse {
  principalId: string;
  email: string;
  displayName?: string | null;
  isAdmin: boolean;
}

export interface ListMember {
  principalId: string;
  email: string;
  displayName?: string | null;
  role: ListRole;
  addedAt: string;
  addedBy?: PersonRef | null;
}

/** Full list metadata (GET /lists, GET /lists/{id}). Items are fetched separately. */
export interface ListResponse {
  id: string;
  version: number;
  name: string;
  kind: ListKind;
  color?: string | null;
  simplePriority: boolean;
  owner: PersonRef;
  /** The caller's own role on this list (server-authoritative) — gate owner/editor UI on this. */
  access: ListRole;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  tags: SharedTagResponse[];
  members: ListMember[];
}

export interface ListCollectionResponse {
  lists: ListResponse[];
}

/** A member item: the shared item shape plus read-only identity refs (assignee + attribution). */
export type MemberItemResponse = SharedItemResponse & {
  assignee?: PersonRef | null;
  createdBy?: PersonRef | null;
  completedBy?: PersonRef | null;
};

export interface ItemCollectionResponse {
  items: MemberItemResponse[];
}

export interface CreateListRequest {
  id: string;
  name: string;
  kind: ListKind;
  color?: string | null;
}

export interface UpdateListRequest {
  name?: string;
  color?: string | null;
  colorProvided?: boolean;
  simplePriority?: boolean | null;
}

export interface AddMemberRequest {
  email: string;
  role?: ListRole | null;
}

export interface UpdateMemberRoleRequest {
  role: ListRole;
}

export interface CreateShareRequest {
  access: ShareAccess;
  label?: string | null;
  expiresAt?: string | null;
}

export interface ShareResponse {
  shareId: string;
  token: string;
  url: string;
  access: ShareAccess;
  label: string;
  createdAt: string;
  expiresAt?: string | null;
  revoked: boolean;
}

export interface ShareCollectionResponse {
  shares: ShareResponse[];
}

export interface RedeemShareResponse {
  listId: string;
  role: ListRole;
}

export interface DirectoryPerson {
  principalId: string;
  email: string;
  displayName?: string | null;
}

export interface DirectoryResponse {
  people: DirectoryPerson[];
}
