import { API_BASE_URL } from '../../config';
import { ApiError } from './fetcher';

// Request helper for the authenticated member surface (`/me`, `/lists`, …). Auth rides the BFF's
// HttpOnly cookie session (same-origin), so we send credentials and never a bearer. A 401 means the
// session expired → bounce to sign-in. The account-less `shared.ts` client keeps its own bearer-free
// request() and surfaces 401s instead of redirecting.
export async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection and try again.');
  }
  if (res.status === 401) {
    const returnUrl = window.location.pathname + window.location.search;
    window.location.assign(`/auth/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    throw new ApiError(401, 'Not authenticated');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
