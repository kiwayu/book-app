# Reader palette + RSVP start caret — TDD evidence

## Feature 1 — Book pages themed with the app palette

With **Match app theme** on, the reader paints the actual book pages in the
**exact app palette** (Catppuccin, Nord, Dracula, …) via epub.js's content hook
(`addStylesheetCss` colours + `#viewer` background), not a light/dark filter — so
colours are true and images aren't inverted. Picking a classic Light/Sepia/Dark/
Night in the in-book sheet clears the palette and uses the reliable filter path.

- `ReaderSettings` gained optional `bg/fg/link`; when set, `applyTheme`/`contentCss`
  colour the content directly instead of the filter.
- `ReaderScreen` passes `t.color` (active app theme) when `readerMatchApp` is on;
  `updateSettings` clears the palette when a classic theme is chosen.

## Feature 2 — Draggable caret picks the RSVP start word

Long-press then drag on the page places a blinking caret at a word; that word
becomes the speed-reader's start (no resume prompt). A plain tap still does
zone navigation.

Architecture (the book text is in an epub iframe the RN overlay sits above):
- RN overlay detects long-press (400ms) + drag → `inject caretAt(x, y-insetTop)`.
- `caretAt` (main doc) converts to iframe coords via the iframe element's
  `getBoundingClientRect`, then `caretRangeFromPoint` on the current section
  document (same handle epub.js styles), draws `#bb-caret`, and posts the word
  index (whitespace-word count before the caret).
- `ReaderScreen` stores it; on "Speed read", RSVP starts at that word.
- All iframe access is wrapped so a cross-origin failure just disables the caret.

## Test spec

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Reader HTML exposes the caret API (`caretAt` + `caretRangeFromPoint` + `#bb-caret`) | `readerHtml.test.ts › exposes a caret API` | unit | PASS |
| 2 | Reader HTML/theme contract intact (filter path, content hook, TOC, RSVP) | `readerHtml.test.ts` (10) | unit | PASS |
| 3 | Whole suite intact after wiring | `npx jest` | unit | PASS (141) |

RED: caret API absent → 1 failed. GREEN: full suite **141/141**; `tsc --noEmit` clean.

## Known gaps / follow-ups

- Word-index mapping is a whitespace-word count — lands on the tapped word in
  nearly all cases but can be ±1 near long/hyphenated words.
- The caret and exact-palette content styling rely on same-origin access to the
  section document; if a device sandboxes the epub iframe cross-origin, both
  degrade gracefully (caret disabled; classic filter theme still works).
- The caret is a per-page reading-time affordance (not persisted across chapters)
  and is used only for the RSVP start, as requested.
