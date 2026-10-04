# Release process — Lupira Tasks (Android)

How to ship the app: native builds via **EAS Build**, distribution via **Google Play Internal
testing**, and JS-only updates via **EAS Update (OTA)**.

## TL;DR decision: rebuild or OTA?

| Change | How to ship |
|---|---|
| JS/TS, styles, images, React components, most bug fixes | **OTA** — `eas update` (seconds, no Play) |
| New/removed native module, Expo SDK bump, `app.json` native config (plugins, permissions, `scheme`, `package`, icon), `expo-updates`/`runtimeVersion` change, **first release** | **Native build** — `eas build` + upload to Play |

`runtimeVersion` uses the **fingerprint** policy: EAS hashes the native layer, so an OTA update is
only delivered to builds with a matching fingerprint. If you changed native code, the fingerprint
changes and old builds correctly **won't** receive the update — that's your signal to rebuild.

## Prerequisites (one-time)

- Logged in to EAS (`eas login`) with access to project `df09191d-…` (owner `danbro96`).
- Google Play Console access (verified individual developer).
- A dedicated **test Authentik account** for the Play "App access" form and for testers without an account.
- Backend deployed at `tasks-api.lupira.com` (the app's `DEFAULT_API_URL`).
- OIDC redirect `lupiratasks://oauthredirect` registered on the Authentik `tasks` client (already done).
- *(Recommended)* `SENTRY_AUTH_TOKEN` as an EAS secret (`eas secret:create --name SENTRY_AUTH_TOKEN …`)
  so release builds upload source maps for symbolicated crashes.

## Build profiles (`eas.json`)

| Profile | Output | Channel | Use |
|---|---|---|---|
| `development` | APK, dev client | `development` | local dev with Metro (`npm run build:preview` is usually enough; this is for native debugging) |
| `preview` | APK, internal distribution | `preview` | **pre-flight smoke test** — install directly, no Play |
| `production` | AAB, `autoIncrement` | `production` | the build uploaded to Play |

`cli.appVersionSource = "remote"` → EAS owns the Android `versionCode` and bumps it each
`production` build. The **versionName** is `expo.version` in `app.json` — the only version in the
repo (`package.json` stays `0.0.0`). Bump it manually for user-facing releases, e.g. `1.0.0` → `1.1.0`.
Settings shows `<versionName> · dev | embedded | OTA <id>`; Sentry events carry `update_id` and
`update_channel` tags.

---

## A. Native release (first release, or any native change)

Pushing to the `release/android` branch builds the production AAB and submits it to Play Internal
testing (`.github/workflows/mobile-release.yml`: tests → `eas build --auto-submit` → tag
`android/v<versionName>+<versionCode>`).

1. **(Recommended) smoke-test first** — the standalone runtime (no Metro):
   ```
   npm run build:preview        # eas build --profile preview --platform android (APK)
   ```
   Install the APK on a device → verify **login (OIDC redirect)**, **list create → sync**, and
   **settings/members**. If good, proceed.

2. **Bump `expo.version`** in `app.json` if the release is user-facing; commit to `main`.

3. **Promote:**
   ```
   git push origin main:release/android
   ```
   The workflow runs only when the push touches `apps/mobile/**`, `packages/**` or the lockfile.
   On the first ever build EAS generates the **upload keystore** (kept in EAS credentials — guard
   the account).

4. **First release only — upload the first AAB by hand** (Play's API cannot create an app's first
   release): `npm run build:android`, then Play Console → Internal testing → Create release → upload
   the `.aab`, accept **Play App Signing** (Google holds the app signing key; EAS holds the upload
   key). Then complete the gating declarations (see `docs/mobile/play-store-submission.md`):
   privacy policy URL (host `docs/mobile/PRIVACY.md`), Data safety, App access (+ test account),
   content rating, target audience/ads. The package name `com.lupira.tasks` is **permanent** once
   uploaded.

5. **Testers:** add tester emails / a Google Group (≤100) to the Internal testing track; share the
   opt-in URL. Testers install from Play.

One-time pipeline setup: an `EXPO_TOKEN` repo secret, and a Play service account with release
permission uploaded to EAS credentials (`eas credentials`). Branch protection on `release/android`
requires `tests / unit` only.

---

## B. OTA update (JS-only changes)

Requires a build that already embeds `expo-updates` on the matching channel (see "First-time OTA"
below if the installed build predates this setup).

1. Make + commit your JS changes; run `npm run typecheck && npm run test`.
2. Publish to the channel's branch:
   ```
   eas update --branch production --message "Short changelog"
   ```
   or run the **mobile-ota** workflow (Actions → Run workflow): typecheck + tests, `expo export --source-maps`, `eas update`, then the bundle's source maps go to Sentry (needs a `SENTRY_AUTH_TOKEN` repo secret).
3. Running apps reload into it immediately: `useAutoUpdate` checks on launch and on foreground (max once per 5 min), downloads, then calls `reloadAsync()`.

Channel ↔ branch: the `production` **channel** (set on the build) maps to the `production`
**branch** (created on first `eas update`). If they aren't linked, run once:
`eas channel:edit production --branch production` (verify with `eas channel:view production`).

---

## First-time OTA caveat (current state)

The beta already on Play was built **before** `expo-updates` was added, so it **cannot receive OTA
updates**. You must ship **one more native build** (section A) that embeds `expo-updates`; testers
update from Play once. After that, every JS-only fix goes out via section B.

## Versioning summary

- **versionName** (`app.json` → `expo.version`): bump manually per user-facing release.
- **versionCode** (Android): managed by EAS (`appVersionSource: remote` + `autoIncrement`), unique &
  increasing per `production` build — never edit by hand.
- **runtimeVersion** (`app.json`): `{ "policy": "fingerprint" }` — don't set manually; it gates OTA
  compatibility automatically.

## Troubleshooting

- **OTA not arriving:** confirm the installed build's channel (`production`) and that
  `eas update --branch production` published; check `eas channel:view production` points to the
  branch. A fingerprint mismatch (native change since the build) means you must rebuild, not OTA.
- **Play rejects the AAB — duplicate versionCode:** ensure `appVersionSource: remote` + the
  `production` profile's `autoIncrement` (already configured); don't pin `android.versionCode`.
- **Login fails only in a standalone build:** confirm `lupiratasks://oauthredirect` is registered on
  the Authentik client and the device has network to `auth.lupira.com` / `tasks-api.lupira.com`.
- **No symbolicated crashes in Sentry:** set the `SENTRY_AUTH_TOKEN` EAS secret so release builds
  upload source maps.

## Command reference

```
npm run build:preview                         # preview APK (smoke test)
npm run build:android                         # production AAB (Play)
eas update --branch production --message "…"  # OTA JS update to production channel
eas submit --profile production --platform android   # (later) automate Play upload via service account
```
