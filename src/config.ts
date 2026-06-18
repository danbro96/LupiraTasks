/**
 * Where the API lives. Empty `VITE_API_BASE_URL` means same-origin (e.g. behind a
 * reverse proxy that forwards `/shared/*`). In the cross-origin deployment the share
 * site runs at tasks.lupira.com and the API at tasks-api.lupira.com, so set
 * `VITE_API_BASE_URL=https://tasks-api.lupira.com` (the default here) and add that
 * site origin to the API's `Auth:AllowedOrigins`.
 */
const raw = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const API_BASE_URL = (raw ?? 'https://tasks-api.lupira.com').replace(/\/$/, '');
