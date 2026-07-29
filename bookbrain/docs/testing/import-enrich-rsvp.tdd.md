# Import enrichment, RSVP theming/marker, settings grid — TDD evidence

Journeys derived during this run.

## Task 1 — Author/cover extracted on import (fallback: first open)

- New `components/EpubExtractor.tsx`: a **hidden WebView** that reuses the reader
  HTML (`buildReaderHtml` + `extractMeta`/`extractCover`) to pull author/metadata
  and cover from the epub right after import, then applies them via
  `applyEpubMeta` / `saveCover`. It has a 20s timeout and finishes on error.
- `LibraryScreen` mounts it after a successful import and refreshes.
- If import extraction fails/times out, the fields stay empty → the reader's
  existing **first-open** extraction fills them (the fallback).
- `needsEnrichment(book)` decides if a book still needs it (empty author/cover).

## Task 2 — Speed reader uses the app appearance theme

`ReaderScreen` now builds the RSVP overlay colours from `t.color` (the active app
theme), so Catppuccin, Nord, Dracula, … all apply to the speed reader.

## Task 3 — Uniform appearance thumbnails

The theme grid used `flexGrow: 1`, so the last row (e.g. Matrix) stretched.
Now fixed-width (`31%`) cards with `justifyContent: space-between` — every
thumbnail is the same size.

## Task 4 — Marker where speed reading stopped

On exiting RSVP, `ReaderScreen` requests the current CFI and drops a bookmark
labelled "⚡ Speed reading" at that page, so you can find where you left off.

## Test spec

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | `pickMissingMeta` fills empty author/publisher/year only | `services/__tests__/epubMeta.test.ts` | unit | PASS |
| 2 | `needsEnrichment` true when author or cover missing | `epubMeta.test.ts › needsEnrichment` | unit | PASS |
| 3 | Reader HTML exposes `extractMeta` / `extractCover` (used by extractor) | `readerHtml.test.ts` | unit | PASS |
| 4 | Whole suite intact after wiring | `npx jest` | unit | PASS (140) |

RED: `needsEnrichment` unexported → 3 failed. GREEN: full suite **140/140**;
`npx tsc --noEmit` clean.

## Known gaps / follow-ups

- The RSVP exit marker is a **page-level** bookmark (at the reader's current CFI),
  not the exact stopped word — mapping a token index to a CFI would be a larger
  change.
- Import extraction runs a hidden WebView; on a device without WebView access to
  the file it silently falls back to first-open (both paths reuse the same
  epub.js code).
- Unit tests cover the pure/service logic; the hidden-WebView wiring and RSVP
  colour/marker are integration changes verified via tsc + manual device test.
