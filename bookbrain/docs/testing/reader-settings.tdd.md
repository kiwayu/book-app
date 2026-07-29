# Reader themes & settings — TDD evidence

**Task:** Themes (dark mode etc.) and reading settings weren't applying live. Overhaul so they work.

## Root cause (final, API-verified)

The reader lives in a WebView; the book text renders inside epub.js **section
iframes**. Those iframes are cross-origin blobs, so **any code in our own page
that tries to touch `iframe.contentDocument` is blocked** — silently. Every
earlier attempt did exactly that (epub theme `select`, `#viewer iframe` query,
`rendered`-event doc refs), so nothing was ever styled and even the default
theme never applied to the book text.

Ground truth: grepping the vendored epub.js confirmed it exposes
`addStylesheetCss`, `hooks.content`, and `getContents`. `Contents.addStylesheetCss`
runs **inside epub.js**, which holds same-origin access to the section it
created — the one place that CAN style the content.

## Fix

Register an epub.js **content hook** that styles every section as it renders,
via `contents.addStylesheetCss(themeCss(), "bb-theme")`, plus `repaintContents()`
(over `rendition.getContents()`) for already-rendered sections. Settings changes
re-open the book (WebView remount at the saved CFI) so the hook re-runs with the
new settings baked in — guaranteed to apply:

- `themeCss()` — full CSS: `html,body` + `body *` colour/font/line-height/size,
  link colour, block spacing. `body *` forces books that hard-code element
  colours to flip.
- `paintContents(contents)` — `contents.addStylesheetCss(themeCss(), "bb-theme")`.
- `rendition.hooks.content.register(...)` — runs `paintContents` for every
  section as epub.js renders it (initial load + paging).
- `repaintContents()` — re-applies over `rendition.getContents()` for live change.
- Settings change → `ReaderScreen` re-opens the book at the saved CFI so the
  content hook re-runs with the new settings baked in.

## User journeys

1. As a reader, when I pick Dark/Night/Sepia the page recolours immediately.
2. As a reader, when I change font, size, line spacing or margins the text
   reflows immediately without clipping.
3. Paging forward keeps the chosen theme/settings.

## Test spec

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Book content styled via `addStylesheetCss(themeCss(), "bb-theme")` (epub.js content hook) | `readerHtml.test.ts › styles book content via epub.js content hook + addStylesheetCss` | unit | PASS |
| 2 | Layout-affecting changes re-paginate via resize + display | `readerHtml.test.ts › re-paginates via resize + display` | unit | PASS |
| 3 | Existing reader HTML contract intact (margins, RSVP, tap zones, flattened TOC) | `features/reader` suite (54 tests) | unit | PASS |

RED: `addStylesheetCss(themeCss(), "bb-theme")` absent → test 1 failed as intended.
GREEN: after adding the content hook → `npx jest features/reader` → 54/54 pass; full suite 122/122; `npx tsc --noEmit` clean.

## Known gap

Unit tests assert the generated HTML mechanism (the testable surface for
WebView code). The actual on-device rendering (colours visibly flipping) is
verified by manual device testing — not automatable in jest here.
