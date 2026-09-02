/**
 * The seam between the generated clients and each app's own HTTP concerns. Both surfaces now ride a
 * cookie the BFF owns — the member session, or the guest session minted from a share token — so one
 * transport serves both and each app installs its own at startup.
 */
export type ApiTransport = <T>(url: string, init?: RequestInit) => Promise<T>;

let transport: ApiTransport | null = null;

/** Install the app's transport. Call once, before anything issues a request. */
export function setApiTransport(next: ApiTransport): void {
  transport = next;
}

/** Orval mutator. Paths carry the BFF's `/api` prefix, so this prepends nothing. */
export function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  if (!transport) {
    throw new Error('@lupira/tasks-api: no transport installed — call setApiTransport() during startup.');
  }
  return transport<T>(url, init);
}
