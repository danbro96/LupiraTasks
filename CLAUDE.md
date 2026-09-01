# LupiraTasks — agent notes

**Mobile-app-first product.** `apps/mobile` (Expo/RN) is the primary product. The web client
mirrors it — match the app's screen flow and structure rather than inventing a new design language.
Check `apps/mobile/src/ui/screens` before adding or changing web UI. The web is **online-only**
(React Query, server is source of truth); only the app has the offline mirror.

## Monorepo (npm workspaces)
Root `package.json` hoists the toolchain (eslint/typescript/vitest) and owns `engines`, `allowScripts`
and the react `overrides` (RN pins exact versions). Workspaces:
- `packages/domain` (`@lupira/tasks-domain`) — pure shared logic, consumed as TS source. Purity is
  eslint-enforced: no generated DTO types, no platform APIs; `fractional-indexing` is the one allowed
  dependency. Holds what both clients agree on (`dueDate`, `listOrder`, `text`). `itemChange`/`itemTree`
  stay per-app — the app's are offline/LWW-aware and the web's are not; they are not drift.
- `packages/tokens` (`@lupira/tasks-tokens`) — the color palette both clients render. Spacing/radii stay
  per-app (the scales genuinely differ).
- `src/LupiraTasksWeb.Client` — the SPA. `apps/mobile` — the Expo app.

**New workspaces must also be added to the Dockerfile's COPY + `npm ci -w` lines.** Root scripts fan
out (`npm run lint|typecheck|test`) or delegate (`dev|build|gen:api`).

## UI stack (web)
MUI v9 (Emotion; per-component default imports; v9 API only — `slots`/`slotProps`, `sx`, `*Outlined`
icons). `ui/theme/muiTheme.ts` emits every token: `--mui-palette-*` (incl. custom
`border`, `remoteChange`, `text.subtle`) plus `--sp-*` via `MuiCssBaseline`. `index.css` is down to what no
component can own — the dnd-kit row/grip structure and the remote-flash keyframes — and defines no tokens.
Row *contents* are `Typography`/`Box` + `sx`. Never put a bespoke styling class and an MUI component on
the same element, and **never set `modularCssLayers`** (MUI 9.3.1 declares `mui.*` layers it never emits,
so `sx` silently loses to component styles).
Forms use react-hook-form; TaskDetail keeps blur-to-save with per-field dirty checks. **dnd-kit rows,
grips and the flash overlay stay plain DOM** — dnd-kit writes inline transforms on them.

## Shape: BFF + SPA (one image)
- `src/LupiraTasksWeb/` — .NET 10 **BFF**. Drives Authentik OIDC (code + PKCE) reusing the **shared
  public `lupira-tasks` client** (no secret — same issuer/aud as mobile, so the API is unchanged),
  server-side **HttpOnly cookie session** (`__Host-lupira-tasks`), Duende token refresh. **YARP** proxies `/api/{**}`
  to LupiraTasksApi: member routes carry the forwarded user token; `/api/shared/*` is anonymous (the
  account-less surface — never a bearer). Owns `/auth/login|logout|user`. Dev auto-auths a local user and
  forwards `X-Dev-User` instead of a token.
- `src/LupiraTasksWeb.Client/` — Vite + React 19 SPA. The browser only talks to its own origin (no CORS,
  no tokens in JS); auth is the session cookie (`credentials: 'include'`, 401 → `/auth/login`).

## SPA layering (downward-only, `eslint-plugin-boundaries`)
`domain → data → state → ui`
- `domain/` pure logic · `data/` generated API client + mutators + session helpers (`api/`) · `state/`
  React Query hooks · `ui/` `components/`, `screens/`, `navigation/`, `theme/`.
- `data/api/{member,shared}/` are **orval-generated** (`clean: true` — never hand-edit). Refresh with
  `npm run fetch:openapi && npm run gen:api` after an API change. Two targets because the two auth models
  need different 401 handling: member → redirect to sign-in, share-link → surface the error.

## Surfaces
- **Member (SSO):** `/` list of lists, `/lists/:listId` its tasks. Calls same-origin `/api/*`.
- **Share (account-less):** `/s/:token`. Logged in → auto-redeem (`POST /api/shares/redeem`) → `/lists/:listId`.

## Mobile
`apps/mobile` has its own agent notes — read `apps/mobile/CLAUDE.md` before touching the app.
Offline-first (SQLite mirror + outbox), layering `domain → data → sync → state → ui`.

## Conventions
- Latest stable deps; bump hard. vitest for tests. Comment only the non-obvious *why*; present state only.
- The API lives in the sibling repo `../LupiraTasksApi`. Both clients authenticate against Authentik
  with `aud=lupira-tasks`, so the API needs no change when a client is added.

## Estate
- **Screens** are `ui/screens/XScreen.tsx` with a named export.

- **Stay in step with the sibling Lupira frontends.** Same components, theme wiring and layout;
  match what they already do rather than inventing a local shape. Shared files stay byte-identical.
- **Icons**: `ui/icons.ts` re-exports `@mui/icons-material` `*Outlined` under concept names — import from there, never from `@mui/icons-material` directly, and don't hand-roll SVGs. No emoji as iconography.
