# Lupira Tasks

Both clients for [LupiraTasksApi](../LupiraTasksApi) in one npm-workspaces monorepo: the Expo/RN
Android app (`apps/mobile`) and the web client, delivered as a **BFF (Backend-For-Frontend)** — a
single .NET 10 image that serves a Vite + React 19 SPA and proxies its API calls. **Mobile-app-first:**
the web client mirrors the app's design, screen flow, and layered structure. Unlike the offline-first
app, it is **online-only** — the server is the single source of truth.

## Why a BFF

Auth runs server-side: the .NET app drives Authentik OIDC (Authorization Code + PKCE), keeps the tokens,
and hands the browser an **HttpOnly cookie session**. The SPA never holds a token, so an XSS can't
exfiltrate one, and the user's access token is forwarded to LupiraTasksApi on member calls (Duende,
auto-refreshed). It reuses the **shared public `lupira-tasks` client** (the one mobile uses) — a BFF's
protection comes from holding tokens server-side, not from a client secret — so the issuer + audience
already match what the API validates, and the API and mobile are unchanged. The SPA talks only to its
own origin, so there is no CORS.

## Two surfaces

- **Member (SSO):** every route except share links requires signing in. The landing `/` is the list of
  lists; `/lists/:listId` is one list's tasks. Create / rename / archive lists, manage members and roles,
  mint / revoke share links, and assign tasks.
- **Share (account-less):** `/s/:token` opens a single list with no sign-in — proxied anonymously.
  Opening a share link **while signed in** "cashes in" the link (`POST /api/shares/redeem`) and routes to
  `/lists/:listId`.

## Layout

```
src/
  LupiraTasksWeb/          # .NET 10 BFF — Authentik OIDC + cookie session, YARP proxy to LupiraTasksApi
  LupiraTasksWeb.Client/   # Vite + React 19 SPA (layered domain → data → state → ui; eslint-plugin-boundaries)
apps/mobile/               # Expo/RN Android app — offline-first (SQLite mirror + outbox)
packages/domain/           # @lupira/tasks-domain — pure logic shared by both clients
packages/tokens/           # @lupira/tasks-tokens — the shared color palette
docs/mobile/               # release + Play Store docs for the app
Dockerfile                 # multi-stage: build the SPA → publish the BFF with the SPA in wwwroot
deploy/                    # compose.yaml + .env.example
```

Root scripts fan out over every workspace (`npm run lint|typecheck|test`) or delegate to the web
client (`dev|build|gen:api`). The image builds the web workspaces only.

The BFF proxies `/api/{**}` → LupiraTasksApi (member routes carry the forwarded token; `/api/shared/*`
is anonymous) and owns `/auth/login`, `/auth/logout`, `/auth/user`.

## Develop

```bash
npm install                                        # once, at the repo root — installs every workspace

# 1) BFF (dev auto-authenticates a local user; proxies to a local API at http://localhost:8080)
dotnet run --project src/LupiraTasksWeb            # http://localhost:5180

# 2) SPA (proxies /api + /auth to the BFF)
npm run dev                                        # http://localhost:5173

# 3) the Android app
npm start -w apps/mobile
```

Set the deploy env (`deploy/.env.example`): add this web's redirect URI
(`https://tasks.lupira.com/signin-oidc`) to the shared public `lupira-tasks` Authentik client, the API
base URL, and a mounted `/keys` volume for data-protection key persistence. No client secret is needed.

## Scripts (at the repo root)

| Script              | Description                                                |
| ------------------- | ---------------------------------------------------------- |
| `npm run dev`       | Vite dev server for the web client (proxies to the BFF)    |
| `npm run build`     | Type-check + build the SPA into the BFF `wwwroot`          |
| `npm run lint`      | Lint every workspace (incl. the layered import boundaries) |
| `npm run typecheck` | Type-check every workspace                                 |
| `npm test`          | Unit tests (vitest) across every workspace                 |

## Docker

```bash
docker build -t danbro96/lupira-tasks-web .
docker run -p 8080:80 -e Auth__Oidc__ClientSecret=… danbro96/lupira-tasks-web
```
