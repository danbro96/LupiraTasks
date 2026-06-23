// DTOs for the authenticated member surface, mirroring the API's ListResponse / ItemResponse /
// member + share contracts. Item and item-request shapes are identical to the shared surface, so
// those are re-exported from shareTypes rather than duplicated.

import type { ListKind, ShareAccess, SharedItemResponse, SharedTagResponse } from './shareTypes';

export type { ListKind, ShareAccess, SharedTagResponse } from './shareTypes';
export type { CreateItemRequest, MoveItemRequest, UpdateItemRequest } from './shareTypes';

export type ListRole = 'Owner' | 'Editor' | 'Viewer';

export interface MeResponse {
  email: string;
  displayName?: string | null;
  isAdmin: boolean;
}

export interface ListMember {
  email: string;
  role: ListRole;
  addedAt: string;
  addedBy?: string | null;
}

/** Full list metadata (GET /lists, GET /lists/{id}). Items are fetched separately. */
export interface ListResponse {
  id: string;
  version: number;
  name: string;
  kind: ListKind;
  color?: string | null;
  simplePriority: boolean;
  ownerEmail: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  tags: SharedTagResponse[];
  members: ListMember[];
}

export interface ListCollectionResponse {
  lists: ListResponse[];
}

/** A member item: the shared item shape plus the read-only assignee (`assignedTo`). */
export type MemberItemResponse = SharedItemResponse & { assignedTo?: string | null };

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
  email: string;
  displayName?: string | null;
}

export interface DirectoryResponse {
  people: DirectoryPerson[];
}
