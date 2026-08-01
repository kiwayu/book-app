# Theme registry + themed nav bar — TDD evidence

**Task:** Make the navigation (tab) bar follow the theme, and add more themes — popular monkeytype palettes plus keeping light / dark / nord ("nordic").

## What changed

- `theme.ts` is now a **named-theme registry**. Each theme is a small seed
  (`bg / surface / text / sub / accent` + `dark`), and `buildPalette()` derives
  the full token set (surfaces, text ramp, accent ramp, borders, glass,
  semantics) with pure hex helpers. Adding a theme = a few colours.
- Themes: **light, dark, nord, serika_dark, dracula, gruvbox, rose_pine,
  catppuccin, carbon, matrix** (10).
- `THEME_LIST` (id/name/swatches), `isThemeDark(id)`, `getThemeId`/`setThemeId`
  replace the old light/dark-only `mode` API. Selection persists + reloads.
- **Nav bar** (`app/(tabs)/_layout.tsx`) previously had hardcoded colours
  (`#5a9dd4`, `#EEF5FF`) — now reads `t.color.accent.base` / `text.muted` /
  `bg.raised` / `border.default`, so it recolours with the theme.
- Settings **Appearance** section is a theme picker grid (swatch preview + name +
  active check).
- Reader opens dark when the active theme is dark (`isThemeDark`).

## Test spec

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Registry includes light, dark, nord + monkeytype themes (≥8) | `__tests__/theme.test.ts › includes light, dark, nord …` | unit | PASS |
| 2 | Every theme builds a complete, same-shaped palette | `… › every theme builds a complete palette` | unit | PASS |
| 3 | Dark themes have dark bg, light has light bg | `… › dark themes have a dark background` | unit | PASS |
| 4 | `isThemeDark` reflects the theme | `… › isThemeDark reflects the theme` | unit | PASS |
| 5 | Themes have distinct accents | `… › themes have distinct accents` | unit | PASS |

RED: `THEME_LIST` / `isThemeDark` absent → 5 failed. GREEN: after implementing the
registry → theme suite 9/9; full suite **131/131**; `npx tsc --noEmit` clean (all
20 `t` consumers still valid).

## Behaviour note

Selecting a theme reloads the app (so module-level styles rebuild) and persists;
the tab bar, all screens, and the reader come back in the new palette.

## Known follow-ups

- Status bar / Android system nav bar tint in dark themes.
- Live (no-reload) switching would need migrating module styles to a `useTheme()`
  hook across all screens.
