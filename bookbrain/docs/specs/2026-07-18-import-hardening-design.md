# Import & Library Hardening Audit — Design

**Date:** 2026-07-18
**Status:** Approved (chat, 2026-07-18)

## Goal

Polish & reliability for the device-import and library flows, via code audit
and fixes. No new features. Every fix lands with a regression test.

## Scope

- `services/importBook.ts` — import orchestration
- `services/localEpub.ts` — picker + copy into `documentDirectory/books/`
- `services/fileValidation.ts` — name/extension validation
- `services/contentHash.ts` — dedupe hash
- `services/bookFiles.ts` — `book_files` row access
- `features/library/LibraryScreen.tsx` — import/delete handlers
- `db/database.ts` — transaction support (added if missing)

Out of scope: reader rendering, RSVP, search, analytics, PDF support.

## Findings to confirm and fix

1. **Filename-collision data loss (worst).** Files are stored under their
   original (sanitized) name in one flat `books/` dir. Two different books
   named `book.epub`: the second import overwrites the first book's file on
   disk; both `book_files` rows point at the same path. Fix: unique storage
   names.
2. **Non-atomic import.** Three INSERTs (books → library_entries →
   book_files) with no transaction; a mid-way failure leaves a ghost book.
   Fix: wrap in a SQLite transaction.
3. **Orphaned files.** The epub is copied into `books/` before any DB write;
   DB failure or a duplicate-detection early return strands the copy.
   Also verify book deletion removes the stored file. Fix: best-effort
   cleanup on failure/duplicate; delete file on book removal.
4. **Doc/behavior mismatch.** `contentHash.ts` claims an "import anyway"
   collision override exists; it doesn't. Fix the comment (no override
   built — YAGNI until a real collision is seen).
5. **Sweep for siblings.** Corrupt/zero-byte epub, cancelled picker,
   missing hash (dedupe silently skipped), and any other silent failure in
   the scoped files.

## Method

Audit → rank by user impact → failing regression test first → smallest
root-cause fix → full jest suite + Playwright smoke green.

## Deliverable

Fixed code, regression tests, and a findings list (found / fixed /
deliberately left).
