// The BFF session surface (`/auth/*`, served same-origin, not under `/api`). `getSessionUser` treats
// 401 as "logged out" (a valid state on the public share page) rather than redirecting — that's why
// it doesn't go through authedRequest.

export interface SessionUser {
  email: string;
  name?: string | null;
  groups: string[];
  isAdmin: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  let res: Response;
  try {
    res = await fetch('/auth/user', { credentials: 'include' });
  } catch {
    return null;
  }
  if (!res.ok) return null; // 401 = not signed in
  return (await res.json()) as SessionUser;
}

/** Full-page redirect into the BFF sign-in challenge, returning to `returnUrl` (default: current path). */
export function login(returnUrl?: string): void {
  const target = returnUrl ?? window.location.pathname + window.location.search;
  window.location.assign(`/auth/login?returnUrl=${encodeURIComponent(target)}`);
}

/** POST /auth/logout via a real navigation so the browser follows the OIDC sign-out redirects. */
export function logout(): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/auth/logout';
  document.body.appendChild(form);
  form.submit();
}
