# Changelog

All notable changes to this project are documented here.

## [1.2.0] - 2026-07-30

The release that turns the reader from "it opens EPUBs" into something you can
actually read a book in: chapters flow into each other while speed reading,
every surface follows one theme, and your library shows real covers.

### Added
- **Speed reading flows across chapters.** Finishing a chapter now moves the
  book to the next one and waits at its first word, so a session is no longer
  capped at one chapter. Sections with no prose (covers, nav pages) are skipped,
  so you never land on a blank screen, and the last chapter says so instead of
  silently restarting.
- **Closing the speed reader leaves the page where you stopped.** Chapter
  advance moves the book itself, and closing seeks to the paragraph you reached,
  so going back to normal reading picks up from the right place instead of
  wherever you opened the overlay.
- **Start speed reading from any word.** Long-press and drag in the book to
  place a caret, then hit ⚡ to stream from exactly there.
- **Reading themes.** Light, sepia, dark, and night for book pages, plus a
  "Match app" option that paints the page in the exact app palette. Changes
  apply live, without reopening the book.
- **App-wide theme registry** with a picker in Settings and a themed navigation
  bar, so the library, reader, and speed reader agree on one look.
- **Real book covers.** Covers are pulled out of the EPUB on import and on
  first open, and the library shows them in a bookstore-style grid.
- **Edit book details.** Fix a title, author, or other metadata from the book
  detail sheet; missing authors are filled in from the EPUB's own metadata.
- **Always-on progress footer** with page number and pages left in the chapter,
  plus a page-jump slider for moving anywhere in the book by drag.
- **Dimmed previous and next words** flanking the speed reader's focus word,
  so you keep a sense of context without breaking the fixed eye position.
- **Android Play build config** — application ID, version code, and EAS build
  profiles.

### Changed
- Tap zones are handled natively (left third back, right third forward, middle
  for the menu) instead of inside the EPUB iframe, which never fired on Android.
- The reader remounts per book, so the table of contents and cover refresh when
  you switch titles.
- Speed reading offers Resume or Start over when you reopen a chapter you were
  part way through.

### Fixed
- `readerApi.getCurrentCfi` was called in two places but never defined, so the
  ⚡ speed-reading marker bookmark had always silently failed to save.
- "ePub is not defined" on an offline or flaky network: epub.js and JSZip are
  vendored into the bundle instead of loaded from a CDN at runtime.
- Chapters nested under parts were dropped from the table of contents; the
  navigation tree is now flattened recursively.
- The speed reader's focus word is scaled to fit instead of being truncated or
  ellipsised, so long words stay readable.
- Reading theme changes now apply live rather than needing the book reopened,
  and the Reading theme picker always shows.
- Importing a file whose name collides with an existing book no longer
  overwrites it; imports are atomic and clean up after themselves.
- The library's swipe actions crashed without a `GestureHandlerRootView` at the
  root; the reader page also sat under the status and navigation bars.

### Tests
- 144 tests across 15 suites, including a Playwright web smoke suite and TDD
  evidence reports under `bookbrain/docs/testing/`.

## [1.1.0] - 2026-06-24

### Added
- **Speed reading (RSVP)** in the EPUB reader. A ⚡ button in the reader
  streams the current chapter one word at a time with the Optimal
  Recognition Point letter pinned, so your eyes stay fixed.
  - `RsvpOverlay` drives the existing RSVP engine with a
    requestAnimationFrame loop that indexes by elapsed time, so dropped
    frames self-correct instead of drifting.
  - Play/pause (tap the word or the button), WPM stepper + presets
    (250/350/450/600), ±5-word seek, and restart.
  - Mid-stream WPM changes rebase from the current word — the speed
    changes without skipping words.
  - Chosen WPM persists across sessions; a per-book resume pointer
    (`rsvp_word_index`) remembers where you stopped and is cleared once
    you return to normal page reading.
- `splitOrp` engine helper and `readerApi.getChapterText()` bridge for
  extracting chapter paragraphs from the epub.js view.

### Tests
- 11 new tests: 5 unit tests for `splitOrp`, 6 integration tests that
  drive `RsvpOverlay` through a real play loop with a controlled clock.
  Full suite: 78 passing.

### Fixed
- Escaped unescaped quotes in `BookDetailSheet` highlight text (lint).
