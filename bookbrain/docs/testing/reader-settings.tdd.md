# Reader themes & settings — TDD evidence

**Task:** Themes (dark mode etc.) and reading settings weren't applying live. Overhaul so they work.

## Root cause

Theme/settings changes are pushed into the reader WebView via
`window.readerApi.applySettings(json)`. The prior implementation applied colours
through epub.js's `themes.register("bb")` + `themes.select("bb")`. `select()`
**no-ops once `_current === "bb"`** (set during initial load), so every later
theme change updated stored rules but never re-injected them into the live
iframe — dark mode never visibly changed.

## Fix

Own a `<style id="bb-theme">` element inside each book iframe, reached by
querying the `#viewer iframe` DOM we control (not epub.js's unreliable
`getContents()`), and rewrite it on every change:

- `themeCss()` — full CSS: `html,body` + `body *` colour/font/line-height/size,
  link colour, block spacing. `body *` forces books that hard-code element
  colours to flip.
- `bookDocs()` / `styleDoc()` / `paintBook()` — inject/update the style in every
  rendered iframe.
- `rendered` event styles each fresh page as it appears (paging keeps the theme).
- `applySettings()` repaints instantly; on a layout-affecting change
  (font/size/line/margin) it also `resize()` + `display(cfi)` so epub.js
  re-columnises against the styled DOM (no text clipping).

## User journeys

1. As a reader, when I pick Dark/Night/Sepia the page recolours immediately.
2. As a reader, when I change font, size, line spacing or margins the text
   reflows immediately without clipping.
3. Paging forward keeps the chosen theme/settings.

## Test spec

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Reader drives the iframes directly (`#viewer iframe` + `bb-theme` style), not epub theme select | `readerHtml.test.ts › injects theme styles straight into the book iframes` | unit | PASS |
| 2 | Layout-affecting changes re-paginate via resize + display | `readerHtml.test.ts › re-paginates via resize + display` | unit | PASS |
| 3 | Existing reader HTML contract intact (margins, no injectIntoView, RSVP, tap zones) | `features/reader` suite (53 tests) | unit | PASS |

RED: `querySelectorAll("#viewer iframe")` absent → test 1 failed as intended.
GREEN: after implementing direct injection → `npx jest features/reader` → 53/53 pass; `npx tsc --noEmit` clean.

## Known gap

Unit tests assert the generated HTML mechanism (the testable surface for
WebView code). The actual on-device rendering (colours visibly flipping) is
verified by manual device testing — not automatable in jest here.
