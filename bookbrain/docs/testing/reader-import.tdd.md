# TDD Evidence — reader fix + library device import (2026-07-17)

**Source plan:** none — journeys derived from the user's bug report in this TDD run:
"in the library, when adding a book I want an option to add/upload from device;
the epub function said *Failed to load book: ePub is not defined*; ensure it reads
normally like an ereader; keep speed reading."

## User journeys
1. Add a book to the library from a device file.
2. An EPUB opens and reads offline — "ePub is not defined" can never happen.
3. Speed reading (RSVP) keeps working (regression-guarded by the existing suite).

## Root cause (journey 2)
`buildReaderHtml` loaded `epub.js/0.3.93` from cdnjs — cdnjs only hosts epub.js
0.2.x, so the `<script src>` 404'd on every device and `ePub` was never defined.
Fix: vendor jszip 3.10.1 (cdnjs) and epub.js 0.3.93 (jsdelivr/npm) via
`scripts/vendor-reader-libs.js` into `features/reader/vendor/*.ts` and inline
them into the generated WebView HTML. The reader is now fully offline.

## RED → GREEN
- RED commit `dcc203b`: `npx jest readerHtml importBook` —
  `readerHtml.test.ts` failed on `cdnjs.cloudflare.com` present / no inlined libs;
  `importBook.test.ts` failed on `Cannot find module '../importBook'`.
- GREEN commit `a8dd07e`: `npx jest` — **8 suites, 88/88 pass**; `npx tsc --noEmit` clean.

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Reader HTML contains no CDN script tags | `readerHtml.test.ts: does not load any script from a CDN` | unit | PASS |
| 2 | jszip + epub.js are inlined (real source, not stubs) | `readerHtml.test.ts: inlines jszip and epub.js` | unit | PASS |
| 3 | Inline vendored code cannot truncate the document (`</script` escaped) | `readerHtml.test.ts: keeps the inline scripts from terminating…` | unit | PASS |
| 4 | Book URL + readerApi (incl. getChapterText for RSVP) still wired | `readerHtml.test.ts: still wires the book url and reader API` | unit | PASS |
| 5 | Picker cancel imports nothing | `importBook.test.ts: returns null when the user cancels` | unit | PASS |
| 6 | Device import creates book + want_to_read entry + book_files row | `importBook.test.ts: creates book + want_to_read entry…` | integration (mocked DB) | PASS |
| 7 | Same file twice dedupes by content hash | `importBook.test.ts: dedupes by content hash` | integration (mocked DB) | PASS |
| 8 | PDFs rejected with a validation error (for now) | `importBook.test.ts: rejects PDFs` | unit | PASS |
| 9 | Reader resolves book_files first, legacy epub_paths fallback | `importBook.test.ts: resolveBookSource (3 tests)` | integration (mocked DB+AsyncStorage) | PASS |
| 10 | Speed reading unchanged | `engine.test.ts` + `RsvpOverlay.test.tsx` (pre-existing) | unit/component | PASS |

## Coverage
`npx jest --coverage` over the code touched this cycle
(`services/{importBook,bookFiles,contentHash,fileValidation,epubPathsMigration}.ts`,
`features/reader/readerHtml.ts`): **99.09% stmts / 81.81% branch / 100% funcs**.
Known gaps: UI wiring (LibraryScreen Alert chooser, reader tab) is untested —
thin view code over the tested services; vendored lib files are excluded (generated).

## Merge evidence
Checkpoints on `feature/complete-reader`: `dcc203b` (RED) → `a8dd07e` (GREEN).
If squashed, this file preserves the RED/GREEN record.
