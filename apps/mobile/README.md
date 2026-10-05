# Lupira Tasks (mobile)

React Native + Expo client for the Lupira Tasks API. Offline-first on the shared sync engine
(`@danbro96/lupira-sync-engine`): lists and items live in SQLite with a durable outbox, replayed on reconnect.

## Stack

- Expo 57 / React Native 0.86 / React 19, TypeScript (strict)
- React Navigation (native stack)
- Zustand 5 (prefs; auth via `@danbro96/lupira-expo-oidc`'s `createAuthStore`)
- `expo-sqlite` + `@danbro96/lupira-sync-engine` — docs, outbox, cursors; React Query (`@danbro96/lupira-expo-query`) is the read path
- Orval — typed fetch client generated from the BFF OpenAPI spec (`@lupira/tasks-api`)
- `expo-secure-store` for token persistence, `expo-auth-session` for OIDC (Authentik)
- Sentry (pseudonymous ids, no PII)

## Getting started

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run start
```

## Architecture

Layered, downward-only imports, enforced by the `mobile()` preset of `@danbro96/lupira-config-eslint` (`eslint.config.mjs`):

```
src/
  domain/     pure logic: ops/events, LWW reducer, item tree, import/export
  data/       SQLite (db/expoDb.ts), mirror reads (queries/), transport (api/installTransport.ts), OIDC client
  sync/       the engine (engine.ts), one module per aggregate (modules/), replayOp, query client
  state/      command facade (commands.ts), React Query read hooks, sync triggers, auth + prefs stores
  ui/         screens, components, hooks, navigation, theme
  config.ts   defaults (API URL, version, Sentry DSN)
```

Writes flow UI → `state/commands.ts` → `engine.enqueue(op)`: the op joins the outbox and the doc's local state is
recomputed (server base folded through every queued op), then replayed to the API with an `Idempotency-Key`; a
transient failure backs off, and a parked or backed-off op holds the later ops of its list. Pulls page the
`/sync/lists` and `/sync/items` feeds from a cursor and recompute the same way.

## API client

The typed client is `@lupira/tasks-api` (`packages/api`), regenerated with `npm run gen:api` at the repo root.

`src/data/api/installTransport.ts` installs `@danbro96/lupira-http`'s bearer mutator: base URL and
bearer read through the AuthPort, one refresh-and-replay on a 401, transient retries for reads only (the
outbox owns write retries), and `ApiError` (carries `.status`). The dev auth mode sends `X-Dev-User` instead of a bearer.

Toasts, haptics, the debug log, OIDC, the Paper UI kit and the developer screens come from the
`@danbro96/lupira-expo-*` packages (`~/Nextcloud/Familj/DevOps/Guides/platform-packages.md`).

## Configuration

No secrets in source. The API base URL lives in `src/config.ts` (`DEFAULT_API_URL`).

## Releases

See `docs/mobile/RELEASE.md` (EAS build profiles, channels, OTA updates).
