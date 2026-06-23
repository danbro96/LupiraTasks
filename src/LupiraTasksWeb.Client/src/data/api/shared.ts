import { API_BASE_URL } from '../../config';
import { ApiError } from './fetcher';
import type {
  CreateItemRequest,
  MoveItemRequest,
  SharedItemResponse,
  SharedListResponse,
  UpdateItemRequest,
} from './shareTypes';

// Typed client for the account-less shared-link endpoints. The `{token}` rides in the URL path
// (no Authorization header) and is re-validated by the API on every request, so a revoked or
// expired link surfaces as a 401 on the next call. Every mutation stamps `occurredAt` (client
// wall-clock) so concurrent edits from the mobile app / other links converge via last-writer-wins.

const nowIso = () => new Date().toISOString();
const base = (token: string) => `${API_BASE_URL}/shared/${encodeURIComponent(token)}`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getSharedList(token: string): Promise<SharedListResponse> {
  return request<SharedListResponse>(base(token));
}

export function addItem(token: string, body: CreateItemRequest): Promise<SharedItemResponse> {
  return request<SharedItemResponse>(`${base(token)}/items`, {
    method: 'POST',
    body: JSON.stringify({ occurredAt: nowIso(), ...body }),
  });
}

export function updateItem(token: string, itemId: string, body: UpdateItemRequest): Promise<SharedItemResponse> {
  return request<SharedItemResponse>(`${base(token)}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ occurredAt: nowIso(), ...body }),
  });
}

export function completeItem(token: string, itemId: string): Promise<SharedItemResponse> {
  return request<SharedItemResponse>(`${base(token)}/items/${itemId}/complete`, {
    method: 'POST',
    body: JSON.stringify({ occurredAt: nowIso() }),
  });
}

export function reopenItem(token: string, itemId: string): Promise<SharedItemResponse> {
  return request<SharedItemResponse>(`${base(token)}/items/${itemId}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ occurredAt: nowIso() }),
  });
}

export function moveItem(token: string, itemId: string, body: MoveItemRequest): Promise<SharedItemResponse> {
  return request<SharedItemResponse>(`${base(token)}/items/${itemId}/move`, {
    method: 'POST',
    body: JSON.stringify({ occurredAt: nowIso(), ...body }),
  });
}

export function deleteItem(token: string, itemId: string): Promise<void> {
  return request<void>(`${base(token)}/items/${itemId}?occurredAt=${encodeURIComponent(nowIso())}`, {
    method: 'DELETE',
  });
}
