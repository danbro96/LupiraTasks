# LupiraTasks — agent notes

**Mobile-app-first product.** `../LupiraTasksMobile` (Expo/RN) is the primary product. This web client
mirrors it — match the app's screen flow and structure rather than inventing a new design language.
Check `../LupiraTasksMobile/src/ui/screens`, `src/ui/components` before adding or changing UI.
**Online-only** (React Query, server is source of truth) — no offline mirror.

## UI stack
MUI v9 (Emotion; per-component default imports; v9 API only — `slots`/`slotProps`, `sx`, `*Outlined`
icons). `ui/theme/tokens/` mirrors the mobile app's `src/ui/theme` (shared neutrals; estate teal
primary) and feeds `ui/theme/muiTheme.ts`, which emits every token: `--mui-palette-*` (incl. custom
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

## Conventions
- Latest stable deps; bump hard. vitest for tests. Comment only the non-obvious *why*; present state only.
- The API (`../LupiraTasksApi`) and mobile are untouched — the BFF reuses the same public `lupira-tasks`
  client, so the forwarded token's issuer + `aud=lupira-tasks` already match. Only Authentik changes: add
  the web redirect URI to that client.

## Estate
- **Screens** are `ui/screens/XScreen.tsx` with a named export.

- **Stay in step with the sibling Lupira frontends.** Same components, theme wiring and layout;
  match what they already do rather than inventing a local shape. Shared files stay byte-identical.
- **Icons**: `ui/icons.ts` re-exports `@mui/icons-material` `*Outlined` under concept names — import from there, never from `@mui/icons-material` directly, and don't hand-roll SVGs. No emoji as iconography.
