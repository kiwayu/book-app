# GlyphQ

The Expo app itself. Project overview, feature list, and design system live in
the [repo README](../README.md); this file covers running and testing the app.

## Run it

```bash
npm install
npm start
```

Then press `i` for the iOS simulator, `a` for an Android emulator, `w` for web,
or scan the QR code with Expo Go.

## Test it

```bash
npm test            # Jest: 15 suites, 144 tests
npm run test:e2e    # Playwright web smoke suite
npm run lint
npx tsc --noEmit
```

Every shipped workstream has a TDD evidence report under `docs/testing/`,
recording the RED reproducer, the fix, and the test that now guards it.

## Where things are

| Path | What lives there |
|------|------------------|
| `app/` | Expo Router routes; `(tabs)/` holds library, reader, analytics, settings |
| `features/reader/` | EPUB reader: native shell, generated WebView HTML, vendored epub.js |
| `features/reader/rsvp/` | Speed reading: pure `engine.ts` (schedule, ORP, tokenizer) and `RsvpOverlay.tsx` |
| `features/library/` | Library grid, filtering, book detail sheet |
| `services/` | Import pipeline, EPUB metadata and cover extraction, settings |
| `db/` | SQLite schema, migrations, queries |
| `store/` | Zustand stores |
| `theme.ts` | Design tokens and the app-wide theme registry |

## Notes

- epub.js and JSZip are vendored into `features/reader/vendor/` and inlined into
  the generated WebView document. Do not reintroduce CDN script tags: the reader
  has to work offline, and a `readerHtml` test enforces it.
- Refresh the vendored copies with `node scripts/vendor-reader-libs.js`.
- Local EPUBs load through a `file://` HTML document rather than an HTML string,
  because iOS WKWebView cannot XHR `file://` from an HTML-string origin.
