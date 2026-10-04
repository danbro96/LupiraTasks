# apps/mobile — agent notes

- Shared frontend conventions: ~/Nextcloud/Familj/DevOps/Guides/frontend-estate.md (repo-specific deviations below).
- **Primary product.** The web client (`apps/web`) mirrors this app's screen flow and
  structure; keep changes here coherent with it. Android-first (`eas.json` builds Android only), package
  `com.lupira.tasks`, scheme `lupiratasks`, `eas.json` submits to the Play internal track — see `docs/mobile/RELEASE.md` for the EAS/OTA path.
- **Offline-first.** Writes go UI → `enqueue(db, op)` → one exclusive SQLite transaction (optimistic apply + outbox
  row) → background drain replaying to the API with an `Idempotency-Key`; pulls write the server base
  and rebase pending ops. SQLite is `@danbro96/lupira-expo-sqlite` (`Db`/`Tx`, migrations in `data/db/schema.ts`),
  opened with `serializeStatements` because expo-modules-core's `SharedObjectRegistry` races concurrent statements.
  The drain backs off transient failures and parks after `PARK_AFTER_ATTEMPTS`; a parked or backed-off op holds the later ops of its list.
- **Layering** (downward-only, `eslint-plugin-boundaries`): `domain → data → sync → state → ui`, with
  `config/` as a leaf. `@danbro96/lupira-*` imports are allowed per layer: tokens everywhere, http (domain:
  `apiError` only), feedback, the debug `log`, `oidc` and `sqlite` from data up, the Paper kit and diagnostics
  screens from ui. `eslint.config.mjs` is the `mobile()` preset of `@danbro96/lupira-config-eslint`. See README for the per-folder breakdown.
- **API client is generated**: orval → `src/data/api/generated/` (never hand-edit). `client: 'fetch'`
  deliberately, not react-query — reads come from the SQLite mirror, so a query cache would be a
  second, mirror-unaware one.
- **Palette**: the app's own semantics (`pending`, `failed`, `remoteChange`, `banner*`, `toast*`) ride on the Paper theme beside the MD3 colours. Colors come from `@lupira/tasks-tokens` (extending `@danbro96/lupira-tokens-core`'s `Palette`); spacing, radii and hit-slop from `@danbro96/lupira-tokens-core`.
- **Row components** (`ListDetailScreen`, `ListsScreen`, and `PriorityControl`, which renders in those rows) follow the estate memo/styles-as-props rule. `ListDetailScreen` additionally interleaves long-press drag (`react-native-reorderable-list`), a
  hand-built swipe-to-delete (`Gesture.Pan` — `Swipeable`'s open callback doesn't fire reliably here),
  the remote-change flash, and a drag-freeze that pins rendered rows mid-gesture.
- `react-native-worklets/plugin` must stay last in `babel.config.js`.
