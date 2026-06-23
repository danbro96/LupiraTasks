/**
 * The member API and auth are served same-origin by the BFF, which proxies `/api/*` to LupiraTasksApi
 * and owns the `/auth/*` routes. The SPA only ever talks to its own origin, so there is no CORS and the
 * session cookie stays first-party. Override the prefix only if the BFF mounts the proxy elsewhere.
 */
const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const API_BASE_URL = (raw ?? '/api').replace(/\/$/, '');
