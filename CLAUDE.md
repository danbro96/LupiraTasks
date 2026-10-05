# LupiraTasks — agent notes

- BFF pattern: ~/Nextcloud/Familj/DevOps/Guides/bff-pattern.md
- Shared frontend conventions: ~/Nextcloud/Familj/DevOps/Guides/frontend-estate.md (repo-specific deviations below).
- The API lives in the sibling repo `../LupiraTasksApi`. Both clients authenticate against Authentik with `aud=lupira-tasks`.

**Mobile-app-first product.** `apps/mobile` (Expo/RN) is primary; read `apps/mobile/CLAUDE.md` before touching it. The web client mirrors its screen flow — check `apps/mobile/src/ui/screens` before changing web UI. The web is **online-only** (React Query, server is truth); only the app has the offline mirror.

## Workspaces
- `packages/domain` (`@lupira/tasks-domain`) — pure shared rules, TS source. Only `fractional-indexing` and `uuid` allowed. Holds `dueDate`, `listOrder`, `text`, `itemTree`, `itemChange` (generic over the actor: principal id in the mirror, `PersonRef` from the API), `ids`, `itemFormat`. The mirror's own machinery (`itemState`, `itemLww`, `itemMap`, `ops`, `listDoc`) stays in the app.
- `packages/tokens` (`@lupira/tasks-tokens`) — the Tasks-only palette keys extending `@danbro96/lupira-tokens-core`'s `Palette`, plus `listColorOptions`; each app has a one-line theme adapter.
- `packages/api` (`@lupira/tasks-api`) — generated client in three flavours: `query/*` (member), `shared/*` (account-less share surface), `fetch/*` (the app's sync engine and online queries). Every flavour resolves to the response body.
- **The transport is installed, not imported.** The generated clients call `@danbro96/lupira-http`'s seam. `installApiTransports()` in `apps/web/src/data/api/fetcher.ts` installs `@danbro96/lupira-web-session`'s cookie transport from `main.tsx`; mobile installs the bearer mutator from `src/data/api/installTransport.ts`, imported as a side effect in `index.ts` (ES imports hoist).
- Shared frontend plumbing comes from LupiraPlatform `@danbro96/lupira-*` packages (`~/Nextcloud/Familj/DevOps/Guides/platform-packages.md`); `@lupira/tasks-*` hold only what is Tasks-specific.

## Proxy specifics
- `exposed.json` (`Lupira.Bff.Proxy` shape) groups: `operations` → Default policy, `guest` → the share surface (`Guest` policy, `credential: none`, `pathMap`).
- Published paths carry `/api`; `API_BASE_URL` is empty and presets are bare BFF origins. **Never invalidate on a hand-written path key**; use the generated `get*QueryKey`, or a prefix change silently stops invalidating.
- **Tags are not rewritten** (Cal's merger retags per cluster): `Shared` is the share surface `apps/web` splits its two generated clients on.
- No wildcard route at all: Tasks proxies no file subtree.
- Unreachable: `/mcp`, `/dav-backend/*`, `/pingz`, `/openapi/v1.json`, `/scalar`, the cross-list `/items` + `/relations` agent surfaces. `POST /shares/redeem` is member-authed and one letter from anonymous `/shared/{token}`; exact templates keep them apart.
- Refresh: copy `../LupiraTasksApi/openapi/LupiraTasksApi.json` into `src/LupiraTasksBff/upstream/`, rebuild.

## The share link is a cookie, not a URL
`/s/:token` posts the token once to `POST /auth/guest`. The BFF validates it upstream (`GET /shared/{token}`), then signs a DataProtection-encrypted `Guest` cookie carrying it. Later calls go to `/api/share/…`; the proxy refills the upstream's `/shared/{token}/…` from the cookie's `share-token` claim (`pathMap.claims`). The upstream is unchanged.
- The token segment is dropped in one place, the guest group's `pathMap`, shared by the route table and the OpenAPI merger. `exposed.test.ts` restates the rule independently; `ProxyRoutesTests` asserts no `{token}` survives in a template. The merger also strips the unbindable `token` path parameter.
- `Guest` is a real named policy, not YARP's `"Anonymous"`: under `AllowAnonymous` a non-default scheme is never authenticated. The policy names its scheme, so neither cookie satisfies the other's.
- Cookie name and Secure policy fork by environment: `__Host-` needs Secure and dev is plain http, so dev uses `lupira-tasks-guest`/`SameAsRequest`. Dev cannot fall back to `DevAuthHandler` here.
- `markGuestSession()` suppresses the member 401 redirect (both surfaces share `customFetch`); `useGuestSession` sets it.
- Revocation needs no invalidation: the upstream re-reads the link every call.
- Dev masks the guest path (`DevAuthHandler` authenticates everything, SPA takes the redeem branch). Verify with a cookie jar against the BFF, or the integration tests (Production wiring).

## Web
- SPA layering `data → state → ui` (eslint-plugin-boundaries); `data/` transport + session, `state/` React Query hooks, `ui/` components/screens/navigation/theme.
- `index.css` holds only the dnd-kit row/grip structure and remote-flash keyframes. Custom palette keys: `border`, `remoteChange`, `text.subtle`. TaskDetail keeps blur-to-save with per-field dirty checks. **dnd-kit rows, grips and the flash overlay stay plain DOM** (dnd-kit writes inline transforms).
- Surfaces: member `/`, `/lists/:listId`; share `/s/:token` (logged in → auto-redeem via `POST /api/shares/redeem` → `/lists/:listId`).
- Mobile layering `domain → data → sync → state → ui`; the shared sync engine (SQLite docs + outbox) with React Query reads.
