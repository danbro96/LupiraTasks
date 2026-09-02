/**
 * The seam between the generated clients and each app's own HTTP concerns.
 *
 * Two slots, because the two auth models coexist inside the web app: the member surface rides the
 * first-party cookie the BFF owns and redirects to sign-in on a 401, while the share-link surface is
 * account-less and must surface that error instead. The app carries a bearer it refreshes itself and
 * only needs the member slot. Rather than generate a client per transport, each app installs what it
 * uses at startup.
 */
export type ApiTransport = <T>(url: string, init?: RequestInit) => Promise<T>;

let member: ApiTransport | null = null;
let shared: ApiTransport | null = null;

/** Install the member transport. Call once, before anything issues a request. */
export function setApiTransport(next: ApiTransport): void {
  member = next;
}

/** Install the account-less share-link transport. Only the web app has one. */
export function setSharedApiTransport(next: ApiTransport): void {
  shared = next;
}

/** Orval mutator for the member surface. Paths carry the BFF's `/api` prefix, so this prepends nothing. */
export function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  if (!member) {
    throw new Error('@lupira/tasks-api: no transport installed — call setApiTransport() during startup.');
  }
  return member<T>(url, init);
}

/** Orval mutator for the share-link surface, which must never carry a member credential. */
export function sharedApiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  if (!shared) {
    throw new Error('@lupira/tasks-api: no share transport installed — call setSharedApiTransport() during startup.');
  }
  return shared<T>(url, init);
}
