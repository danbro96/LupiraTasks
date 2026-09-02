import { setApiTransport } from '@lupira/tasks-api/transport';
import { API_BASE_URL } from '../../config';

/**
 * The mutator for every orval-generated request. Auth rides a BFF cookie session either way — the
 * member's, or the guest session minted from a share token — so one transport serves both surfaces.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** A dead guest cookie must surface on the share screen, not bounce the visitor into Authentik. */
let guestSession = false;

export function markGuestSession(active: boolean): void {
  guestSession = active;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${url}`, { credentials: 'include', ...init });
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
  // A 200 of HTML means the SPA fallback answered a dead route; parsing it fails obscurely.
  if ((res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new ApiError(res.status, `Expected data from ${url} but received the app shell.`);
  }

  return (await res.json()) as T;
}

export async function customFetch<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    return await request<T>(url, init);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !guestSession) {
      const returnUrl = window.location.pathname + window.location.search;
      window.location.assign(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
    throw e;
  }
}

/** Hands the mutator to the generated clients. Called once, before anything issues a request. */
export function installApiTransports(): void {
  setApiTransport(customFetch);
}

export default customFetch;
