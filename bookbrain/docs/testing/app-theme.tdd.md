# App-wide Light/Dark theme — TDD evidence

**Task:** "Redo the settings so the theme can be changed from dark to light" — make the **whole app** switch between light and dark.

## Root cause (why every prior attempt failed)

I had been fixing the **in-reader epub theme**. The user was on the **Settings tab**, whose "Default theme" row (a) only stored a *reader default* and (b) was never even read by the reader. More fundamentally, the **entire app UI is painted by a single static light palette** (`theme.ts`), whose colours are baked into module-level `StyleSheet.create` calls across 20 files at import time. **There was no dark mode for the app at all**, so nothing in Settings could ever recolour it.

## Approach

- `theme.ts` now defines **light + dark palettes** and a pure `makeTheme(mode)` that builds the full token set (colour/font/glass/shadow) for a mode.
- The active mode is **persisted** (expo-sqlite `bookbrain-theme.db`, `pref(k,v)`) and read **synchronously at module load**, so `t` is built for the saved mode before any style is created.
- `setThemeMode(mode)` persists the choice and **reloads the app** (`DevSettings.reload`), so every module-level `StyleSheet` rebuilds in the new palette. This is the low-risk way to flip 20 files of static styles without rewriting them all.
- Settings tab gains an **Appearance** section (Light / Dark) at the top.
- The **reader** opens in a theme matching the app mode (dark app → dark pages).

## User journeys

1. As a user, I toggle Dark in Settings → the entire app (library, settings, analytics, reader) repaints dark.
2. My choice persists across app launches.
3. Light ↔ dark are visually distinct and legible.

## Test spec

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Light vs dark use different backgrounds | `__tests__/theme.test.ts › light and dark use different backgrounds` | unit | PASS |
| 2 | Dark background is genuinely dark (low luminance) | `… › dark background is actually dark` | unit | PASS |
| 3 | Text colour flips for contrast | `… › text colour flips for contrast` | unit | PASS |
| 4 | Same token structure in both modes (all 20 consumers stay valid) | `… › keeps the same token structure` | unit | PASS |

RED: `makeTheme` unexported → 4 failed. GREEN: after implementing → 4/4; full suite **126/126**; `npx tsc --noEmit` clean (all 20 `t` consumers still type-check).

## Behaviour note

Switching theme **reloads the app** (brief restart, then it comes back in the new palette). That restart is intentional — it's what makes the static module-level styles rebuild. In production (no `expo-updates`), the new mode applies on the next launch instead of an immediate reload.

## Known follow-ups

- Status-bar/tab-bar tint polish in dark mode.
- Optional: cross-fade instead of reload (would require migrating module styles to a runtime `useTheme()` hook across all 20 files).
