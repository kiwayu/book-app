# Google Play readiness — TDD evidence

**Task:** Ensure the app meets Android / Google Play Store requirements.

Journeys were derived during this run (no plan file).

## User journey

As the developer, I want the Android config to satisfy Google Play's hard
requirements (unique applicationId, integer versionCode, matching version,
portrait lock, adaptive icon) so a Play build/upload isn't rejected.

## What was wrong (RED)

`app.json` had **no `android.package`** (Play cannot build/upload without an
applicationId), **no `android.versionCode`**, and `version` (1.0.0) disagreed
with `package.json` (1.1.0). There was also no `eas.json`, so no way to produce
a Play-format AAB.

## What changed (GREEN)

- `app.json`: added `android.package = "com.bookbrain.app"`,
  `android.versionCode = 1`, set `version = "1.1.0"` to match `package.json`.
- `eas.json`: added `production` profile building an **app-bundle (AAB)** with
  `autoIncrement`, plus `preview` (APK) and `development` profiles;
  `appVersionSource: "local"` keeps `app.json` the source of truth.

## Test spec

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Valid reverse-DNS applicationId present | `__tests__/playReadiness.test.ts › declares a valid reverse-DNS applicationId` | unit | PASS |
| 2 | Integer versionCode >= 1 | `… › declares an integer android.versionCode` | unit | PASS |
| 3 | app.json version matches package.json | `… › keeps app.json version in sync` | unit | PASS |
| 4 | Semver marketing version | `… › uses a semver marketing version` | unit | PASS |
| 5 | Portrait lock | `… › locks orientation to portrait` | unit | PASS |
| 6 | Android adaptive icon foreground present | `… › ships an Android adaptive icon foreground` | unit | PASS |

RED: `npx jest __tests__/playReadiness` → 3 failed (package/versionCode/version).
GREEN: after config fix → 6/6 pass; full suite `npx jest` → **121/121 pass**.

## Automatable coverage

The suite guards every app.json field Play rejects a build for. On each future
change these tests fail fast if the package id, versionCode, version sync, or
icon regress.

## Manual Play requirements (NOT automatable — you must do these in Play Console)

These are process/asset/legal steps, not code, so they can't be unit-tested:

1. **App signing** — let Google Play App Signing manage the release key (EAS
   generates an upload key on first `eas build`). Keep the upload key safe.
2. **Target API level** — new apps must target a recent API level. Expo SDK 54
   targets **API 35** by default (meets the current bar); no override needed.
3. **Privacy Policy URL** — required (the app stores reading data locally; a
   short policy stating "data stays on device, no collection" suffices) and must
   be linked in the store listing.
4. **Data safety form** — declare what's collected/shared. This app keeps books,
   progress, highlights, covers **on-device** (SQLite + file system) and makes no
   analytics/network calls beyond fetching user-supplied EPUB URLs and the cover
   image — declare accordingly.
5. **Permissions** — none dangerous are used; document import uses the Storage
   Access Framework (no READ_EXTERNAL_STORAGE). Verify the built AAB's manifest
   only contains INTERNET before submitting.
6. **Store listing assets** — app name, short + full description, feature
   graphic (1024×500), phone screenshots (min 2), high-res icon (512×512).
7. **Content rating** questionnaire, **target audience**, **ads declaration**
   (this app shows no ads).
8. **Testing track** — upload the AAB to internal testing first, then promote to
   production.

## Build commands (for reference — run by you)

```
eas build -p android --profile production   # produces the AAB
eas submit -p android --latest              # uploads to Play (after console setup)
```

## Known gap

`com.bookbrain.app` is a chosen default and is **permanent once published** —
confirm or change it before the first Play upload.
