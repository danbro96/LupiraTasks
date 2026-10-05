# apps/mobile — agent notes

- Shared frontend conventions: ~/Nextcloud/Familj/DevOps/Guides/frontend-estate.md (repo-specific deviations below).
- **Primary product.** The web client (`apps/web`) mirrors this app's screen flow and
  structure; keep changes here coherent with it. Android-first (`eas.json` builds Android only), package
  `com.lupira.tasks`, scheme `lupiratasks`, `eas.json` submits to the Play internal track — see `docs/mobile/RELEASE.md` for the EAS/OTA path.
- **Offline-first on the shared kernel** (`@danbro96/lupira-sync-engine`, `sync/engine.ts`). Two modules in
  `sync/modules/`: `task.list` (reduce = `listDoc.reduceList`, feed `/sync/lists`) and `task.item` (reduce =
  `itemLww` via `itemEventOf`, feed `/sync/items` with per-field guards mapped by `itemMap.itemFromWire`, index
  `item_index(id, list_id, sort_order)`); both hold on `listId`. Ops carry `aggregate`/`aggregateId` from
  `stamp()`. Screens write only through `state/commands.ts` (one function per intent); delete = an op held for
  `UNDO_MS`, Undo = `engine.discard`. DB `lupira-tasks.db` (`data/db/expoDb.ts`, `serializeStatements` because
  expo-modules-core's `SharedObjectRegistry` races concurrent statements); a sign-in as another account runs `engine.wipe()`.
- **Reads are React Query** (`@danbro96/lupira-expo-query`): mirror hooks in `state/` are `mirrorQuery` over
  `data/queries/*`, invalidated by the engine's `onChange` (outbox badges also on queue-count changes); the
  directory and share links are `onlineQuery` under the persisted `tasks` root. Remote flash = ids from
  `onChange` events with origin `pull` (`sync/remoteChanges.ts`). Triggers: `state/syncTriggers.ts`
  (foreground, reconnect, sign-in, background task); an open list also polls `engine.sync()`.
- **Layering** (downward-only, `eslint-plugin-boundaries`): `domain → data → sync → state → ui`, with
  `config/` as a leaf. `@danbro96/lupira-*` imports are allowed per layer: tokens everywhere, http (domain:
  `apiError` only), feedback, the debug `log`, `oidc` and `sqlite` from data up, the sync engine and query
  helpers from sync up, the auth store from state up, the Paper kit and diagnostics screens from ui. `eslint.config.mjs` is the `mobile()` preset of `@danbro96/lupira-config-eslint`. See README for the per-folder breakdown.
- **API client is generated**: `@lupira/tasks-api/fetch/*` (orval, never hand-edit) resolves to the body. The
  fetch flavour, not the react-query one: the engine owns the mirror's caching, and the app keys its own queries.
- **Palette**: the app's own semantics (`pending`, `failed`, `remoteChange`, `banner*`, `toast*`) ride on the Paper theme beside the MD3 colours. Colors come from `@lupira/tasks-tokens` (extending `@danbro96/lupira-tokens-core`'s `Palette`); spacing, radii and hit-slop from `@danbro96/lupira-tokens-core`.
- **Row components** (`ListDetailScreen`, `ListsScreen`, and `PriorityControl`, which renders in those rows) follow the estate memo/styles-as-props rule. `ListDetailScreen` additionally interleaves long-press drag (`react-native-reorderable-list`), a
  hand-built swipe-to-delete (`Gesture.Pan` — `Swipeable`'s open callback doesn't fire reliably here),
  the remote-change flash, and a drag-freeze that pins rendered rows mid-gesture.
- `react-native-worklets/plugin` must stay last in `babel.config.js`.
