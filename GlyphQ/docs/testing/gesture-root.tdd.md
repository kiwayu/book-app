# TDD Evidence — GestureHandlerRootView crash (device import/library)

**Reported:** "Import from device not working properly. book not loading.
Also receiving render error. PanGestureHandler must be used as a descendant
od GestureHandlerRootView" (Expo Go, Android, 2026-07-19)

**Source plan:** none — journeys derived during this TDD run.

## User journey

As a reader, I want the library to render after importing a book on my
phone, so that I can open and read what I imported.

## Root cause

`LibraryScreen`/`CompactBookRow` render `Swipeable` (a `PanGestureHandler`).
Native requires a `GestureHandlerRootView` ancestor; `app/_layout.tsx` had
none, so the library crashed as soon as a book row rendered — which is
immediately after a successful import. Web does not enforce the invariant,
so the Playwright suite never caught it. The import pipeline itself was not
at fault.

## RED → GREEN

| Stage | Command | Result |
|-------|---------|--------|
| RED | `npx jest app/__tests__` | `Expected: > 0, Received: 0` — no `GestureHandlerRootView` in the root layout tree (commit 0bc5079) |
| GREEN | `npx jest --silent` | 10 suites, 104/104 pass (commit c551996) |
| Types | `npx tsc --noEmit` | clean |

## What is guaranteed

| # | Guarantee | Test | Type | Result |
|---|-----------|------|------|--------|
| 1 | Root layout wraps the navigator in `GestureHandlerRootView`, so any `PanGestureHandler` descendant (library Swipeable rows) can mount on native | `app/__tests__/_layout.test.tsx` | unit | PASS |

## Known gaps

- No jest coverage threshold is configured in this repo; coverage not measured this run.
- On-device confirmation pending: the crash is proven fixed at the component level; the "book not loading" symptom is expected to disappear with it since the crash killed the library screen post-import. If books still fail to load in the reader after this fix, that is a separate bug — capture the device error and file it.
