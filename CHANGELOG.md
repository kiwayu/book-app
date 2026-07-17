# Changelog

All notable changes to this project are documented here.

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
