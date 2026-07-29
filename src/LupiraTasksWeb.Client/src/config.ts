/**
 * The member API and auth are served same-origin by the BFF, which proxies `/api/*` to LupiraTasksApi
 * and owns the `/auth/*` routes. The SPA only ever talks to its own origin, so there is no CORS and the
 * session cookie stays first-party. Override the prefix only if the BFF mounts the proxy elsewhere.
 */
const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const API_BASE_URL = (raw ?? '/api').replace(/\/$/, '');

/** How often an open list refetches, so another member's edits appear. 0 disables polling. */
export const LIST_POLL_MS = 5_000;

/**
 * Quiet period after which polling pauses until the next interaction. React Query already stops on a
 * hidden tab, but a tab left *visible* on an unattended screen would otherwise refetch forever.
 * Generous on purpose: someone reading a list without touching it should still see updates. 0 = never
 * pause.
 */
export const LIST_POLL_IDLE_MS = 5 * 60_000;
