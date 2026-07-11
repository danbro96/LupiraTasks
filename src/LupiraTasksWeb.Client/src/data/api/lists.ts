import { authedRequest } from './authedFetch';
import type {
  AddMemberRequest,
  CreateItemRequest,
  CreateListRequest,
  CreateShareRequest,
  DirectoryPerson,
  DirectoryResponse,
  ItemCollectionResponse,
  ListCollectionResponse,
  ListResponse,
  MemberItemResponse,
  MeResponse,
  MoveItemRequest,
  RedeemShareResponse,
  ShareCollectionResponse,
  ShareResponse,
  UpdateItemRequest,
  UpdateListRequest,
  UpdateMemberRoleRequest,
} from './listTypes';

// Typed client for the authenticated member surface. Mirrors the account-less shared.ts style
// (function per endpoint, stamps `occurredAt` for last-writer-wins convergence) but every call
// goes through authedRequest, which attaches the bearer token.

const nowIso = () => new Date().toISOString();
const enc = encodeURIComponent;

/** Member create/update may also set an assignee (the shared surface cannot). */
type MemberCreateItemRequest = CreateItemRequest & { assigneeEmail?: string | null };
type MemberUpdateItemRequest = UpdateItemRequest & {
  assigneeEmail?: string | null;
  assigneeEmailProvided?: boolean;
};

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) });

// ---- me ----

export function getMe(): Promise<MeResponse> {
  return authedRequest<MeResponse>('/me');
}

// ---- lists ----

export async function getLists(archived = false): Promise<ListResponse[]> {
  const res = await authedRequest<ListCollectionResponse>(`/lists${archived ? '?archived=true' : ''}`);
  return res.lists;
}

export function createList(body: CreateListRequest): Promise<ListResponse> {
  return authedRequest<ListResponse>('/lists', post(body));
}

export function getList(listId: string): Promise<ListResponse> {
  return authedRequest<ListResponse>(`/lists/${enc(listId)}`);
}

export function updateList(listId: string, body: UpdateListRequest): Promise<ListResponse> {
  return authedRequest<ListResponse>(`/lists/${enc(listId)}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function archiveList(listId: string): Promise<ListResponse> {
  return authedRequest<ListResponse>(`/lists/${enc(listId)}/archive`, post());
}

export function restoreList(listId: string): Promise<ListResponse> {
  return authedRequest<ListResponse>(`/lists/${enc(listId)}/restore`, post());
}

export function deleteList(listId: string): Promise<void> {
  return authedRequest<void>(`/lists/${enc(listId)}`, { method: 'DELETE' });
}

// ---- items ----

export async function getListItems(listId: string): Promise<MemberItemResponse[]> {
  const res = await authedRequest<ItemCollectionResponse>(`/lists/${enc(listId)}/items`);
  return res.items;
}

export function addItem(listId: string, body: MemberCreateItemRequest): Promise<MemberItemResponse> {
  return authedRequest<MemberItemResponse>(`/lists/${enc(listId)}/items`, post({ occurredAt: nowIso(), ...body }));
}

export function updateItem(listId: string, itemId: string, body: MemberUpdateItemRequest): Promise<MemberItemResponse> {
  return authedRequest<MemberItemResponse>(`/lists/${enc(listId)}/items/${enc(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ occurredAt: nowIso(), ...body }),
  });
}

export function completeItem(listId: string, itemId: string): Promise<MemberItemResponse> {
  return authedRequest<MemberItemResponse>(`/lists/${enc(listId)}/items/${enc(itemId)}/complete`, post({ occurredAt: nowIso() }));
}

export function reopenItem(listId: string, itemId: string): Promise<MemberItemResponse> {
  return authedRequest<MemberItemResponse>(`/lists/${enc(listId)}/items/${enc(itemId)}/reopen`, post({ occurredAt: nowIso() }));
}

export function moveItem(listId: string, itemId: string, body: MoveItemRequest): Promise<MemberItemResponse> {
  return authedRequest<MemberItemResponse>(`/lists/${enc(listId)}/items/${enc(itemId)}/move`, post({ occurredAt: nowIso(), ...body }));
}

export function deleteItem(listId: string, itemId: string): Promise<void> {
  return authedRequest<void>(`/lists/${enc(listId)}/items/${enc(itemId)}?occurredAt=${enc(nowIso())}`, { method: 'DELETE' });
}

// ---- members ----

export function addMember(listId: string, body: AddMemberRequest): Promise<ListResponse> {
  return authedRequest<ListResponse>(`/lists/${enc(listId)}/members`, post(body));
}

export function updateMember(listId: string, principalId: string, body: UpdateMemberRoleRequest): Promise<ListResponse> {
  return authedRequest<ListResponse>(`/lists/${enc(listId)}/members/${enc(principalId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function removeMember(listId: string, principalId: string): Promise<void> {
  return authedRequest<void>(`/lists/${enc(listId)}/members/${enc(principalId)}`, { method: 'DELETE' });
}

// ---- shares ----

export function createShare(listId: string, body: CreateShareRequest): Promise<ShareResponse> {
  return authedRequest<ShareResponse>(`/lists/${enc(listId)}/shares`, post(body));
}

export async function getShares(listId: string): Promise<ShareResponse[]> {
  const res = await authedRequest<ShareCollectionResponse>(`/lists/${enc(listId)}/shares`);
  return res.shares;
}

export function revokeShare(listId: string, shareId: string): Promise<void> {
  return authedRequest<void>(`/lists/${enc(listId)}/shares/${enc(shareId)}`, { method: 'DELETE' });
}

export function redeemShare(token: string): Promise<RedeemShareResponse> {
  return authedRequest<RedeemShareResponse>('/shares/redeem', post({ token }));
}

// ---- users ----

export async function userDirectory(q?: string): Promise<DirectoryPerson[]> {
  const res = await authedRequest<DirectoryResponse>(`/users/directory${q ? `?q=${enc(q)}` : ''}`);
  return res.people;
}
