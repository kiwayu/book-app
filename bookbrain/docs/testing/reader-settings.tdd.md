# Reader themes & settings — TDD evidence

**Task:** Themes (dark mode etc.) and reading settings weren't applying live. Overhaul so they work.

## Root cause (final)

Theme/settings changes are pushed into the reader WebView via
`window.readerApi.applySettings(json)`. Two earlier attempts failed:
`themes.select("bb")` (no-ops once `_current === "bb"`), then injecting a
`<style>` via `document.querySelectorAll("#viewer iframe").contentDocument` —
which returns **null/inaccessible** after render (cross-origin blob iframe), so
nothing was ever styled and dark mode did nothing.

The **only reliably accessible** book-document handle is the one epub.js passes
on the `rendered` event — proven because tap-navigation (`wireInput`) binds to
that same doc and works. So we capture those docs and style them.

## Fix

Own a `<style id="bb-theme">` element inside each book document, using the doc
refs captured from the `rendered` event (`renderedDocs`), and rewrite it on
every change:

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
