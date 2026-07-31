/*
 * RED reproducer for "Failed to load book: ePub is not defined":
 * the reader HTML loaded jszip/epub.js from cdnjs at runtime, so any
 * network failure (or an offline device) left ePub undefined. The fix
 * vendors both libraries into the bundle and inlines them.
 */
import { buildReaderHtml, DEFAULT_SETTINGS } from "../readerHtml";

const html = buildReaderHtml("file:///docs/books/a.epub", null, DEFAULT_SETTINGS);

describe("buildReaderHtml — self-contained document", () => {
  it("does not load any script from a CDN", () => {
    expect(html).not.toContain("cdnjs.cloudflare.com");
    expect(html).not.toMatch(/<script[^>]+src=/);
  });

  it("inlines jszip and epub.js so ePub is always defined", () => {
    expect(html).toContain("JSZip");
    // vendored epub.js source must actually be present, not a stub
    expect(html.length).toBeGreaterThan(200_000);
  });

  it("keeps the inline scripts from terminating the document early", () => {
    // Any literal "</script" inside vendored code would truncate the page:
    // every opener must have exactly one real closer.
    const openers = (html.match(/<script/gi) ?? []).length;
    const closers = (html.match(/<\/script>/gi) ?? []).length;
    expect(openers).toBe(closers);
  });

  it("still wires the book url and reader API", () => {
    expect(html).toContain("file:///docs/books/a.epub");
    expect(html).toContain("window.readerApi");
    expect(html).toContain("getChapterText");
  });

  it("binds no input listeners at all — gestures have one owner, natively", () => {
    /* History: taps were first bound to phantom `rendition.on("touchstart")`
       events epub.js never emits (dead on arrival), then to per-view iframe
       listeners (2026-07-20). Both were unreachable, because the native side
       mounts a full-screen responder over this WebView. The invariant now is
       that this document handles no input whatsoever — see tapZones.ts. */
    expect(html).not.toContain('rendition.on("touchstart"');
    expect(html).not.toContain('rendition.on("rendered"');
    expect(html).not.toContain("wireInput");
    expect(html).not.toContain("zoneAction");
    /* Deliberately NOT asserting on `addEventListener` generally: the inlined
       epub.js binds plenty of its own. Only our identifiers are checkable from
       a string, which is why behaviour lives in readerApi.jsdom.test.ts. */
  });

  it("reports chapter-relative page position for the progress footer", () => {
    expect(html).toContain("chapterPage:");
    expect(html).toContain("chapterPages:");
    expect(html).toContain("loc.start.displayed");
  });

  it("themes the book with a CSS filter on #viewer (paint effect works over the cross-origin iframe)", () => {
    // The book text lives in a cross-origin blob iframe we cannot touch. A CSS
    // filter on the outer #viewer element is a paint effect the browser applies
    // over the iframe regardless of origin — dark mode = invert the viewer.
    expect(html).toContain("invert(1) hue-rotate(180deg)"); // dark/night
    expect(html).toContain("style.filter");
    expect(html).toContain(`padding:0 ${DEFAULT_SETTINGS.marginWidth}px`);
  });

  it("re-paginates via resize + display when a layout setting changes", () => {
    expect(html).toContain("rendition.resize");
    expect(html).toContain("rendition.display");
  });

  it("exposes a caret API to pick the RSVP start word", () => {
    expect(html).toContain("caretAt:");           // reader API entry
    expect(html).toContain("caretRangeFromPoint"); // hit-test the tapped word
    expect(html).toContain("bb-caret");            // the caret element
  });

  /* The RSVP bridge (nextChapter / goToBlock / cancelAdvance) is covered
     behaviourally in readerApi.jsdom.test.ts, which executes this script
     instead of grepping it. String assertions were removed after a mutation
     test: with cancelAdvance emptied out they stayed green, while the jsdom
     suite correctly failed. Asserting that a function's NAME appears in a
     string proves nothing about what it does. */

  it("flattens nested TOC chapters, not just top-level parts", () => {
    // Many epubs nest chapters under parts ("books within the book"); the TOC
    // builder must recurse into subitems or those chapters are lost. Anchored
    // to our own flattener name ("subitems" alone also matches epub.js source).
    expect(html).toContain("flattenToc(");
  });
});
