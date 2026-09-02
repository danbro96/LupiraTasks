import { setApiTransport, setSharedApiTransport } from '@lupira/tasks-api/transport';
import { API_BASE_URL } from '../../config';

/**
 * Mutators for every orval-generated request. Two of them, because the API serves two auth models:
 * `customFetch` is the member surface — auth rides the BFF's HttpOnly cookie session (same-origin), so
 * a 401 means the session expired → bounce to sign-in. `customFetchShared` is the account-less
 * `/shared/{token}` surface, where the token rides in the path and a 401 means the link was revoked or
 * expired; that screen reports it instead of redirecting.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init: RequestInit | undefined, credentialed: boolean): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${url}`, {
      ...(credentialed ? { credentials: 'include' as const } : {}),
      ...init,
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }
  if (!res.ok) {
    // 400/403/409 arrive as application/problem+json — surface the human-readable detail.
    const text = await res.text().catch(() => res.statusText);
    let message = text || res.statusText;
    try {
      const problem = JSON.parse(text) as { detail?: string; title?: string };
      message = problem.detail || problem.title || message;
    } catch {
      // not a problem document — keep the raw text
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function customFetch<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    return await request<T>(url, init, true);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const returnUrl = window.location.pathname + window.location.search;
      window.location.assign(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
    throw e;
  }
}

export function customFetchShared<T>(url: string, init?: RequestInit): Promise<T> {
  return request<T>(url, init, false);
}

/** Hands both mutators to the generated clients. Called once, before anything issues a request. */
export function installApiTransports(): void {
  setApiTransport(customFetch);
  setSharedApiTransport(customFetchShared);
}

export default customFetch;
