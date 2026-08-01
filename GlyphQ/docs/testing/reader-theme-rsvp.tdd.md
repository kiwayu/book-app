# Reader theme option + RSVP focus-word fix — TDD evidence

## Task A — Speed-reading word never cut off / ellipsised

**Was:** the RSVP focus word sat in a fixed-width band with `overflow: hidden`
and the ORP parts used `numberOfLines={1}`, so long words were clipped/ellipsised.

**Fix:** the focus word is now a single `<Text numberOfLines={1}
adjustsFontSizeToFit minimumFontScale={0.3}>` — RN **scales the font down to fit**
instead of clipping, so the whole word always shows. The ORP letter is coloured
inline; the band width keeps it clear of the prev/next gutters (which stay on the
left/right and may ellipsise — they're secondary).

**Test:** `RsvpOverlay.test.tsx › auto-shrinks the focus word …` renders a very
long word and asserts the focus Text is `adjustsFontSizeToFit` + single-line.
RED (no `rsvp-focus` node) → GREEN.

## Task B — Reader theme: match app, or a separate reading theme

- New setting `readerMatchApp` (default `true`).
- Settings → Reader: **Match app theme** toggle; when Off, a **Reading theme**
  picker (Light / Sepia / Dark / Night) appears. Clean, only shown when relevant.
- Reader opens with: app-derived theme when matching, else the chosen reading
  theme (`ReaderScreen` reads `readerMatchApp` / `readerTheme`).

## Test spec

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Focus word auto-shrinks (never truncated/ellipsised) | `RsvpOverlay.test.tsx › auto-shrinks the focus word` | unit | PASS |
| 2 | RSVP engine/render wiring intact | `features/reader/rsvp` suite (42) | unit | PASS |
| 3 | Types/consumers valid after settings + reader changes | `tsc --noEmit` | build | PASS |

GREEN: `npx jest` → **132/132**; `npx tsc --noEmit` clean.

## Known follow-up

"Match app theme" maps to the reader's light/dark epub theme. Rendering the exact
monkeytype palette (e.g. Nord's #2e3440 background) inside the epub reader would
need a custom-colour reader theme (the epub reader currently supports
light/sepia/dark/night) — a separate change.
