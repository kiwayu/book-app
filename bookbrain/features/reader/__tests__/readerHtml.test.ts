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

  it("binds tap/swipe to real chapter-document events, not phantom rendition events", () => {
    // epub.js never emits rendition 'touchstart'/'touchend'; binding there
    // left every tap dead (2026-07-20 device bug). Must wire per rendered view.
    expect(html).toContain('rendition.on("rendered"');
    expect(html).toContain("addEventListener");
    expect(html).not.toContain('rendition.on("touchstart"');
  });

  it("reports chapter-relative page position for the progress footer", () => {
    expect(html).toContain("chapterPage:");
    expect(html).toContain("chapterPages:");
    expect(html).toContain("loc.start.displayed");
  });

  it("injects theme styles into the rendered book documents so changes apply live", () => {
    // The reliable doc handle is the one from the "rendered" event (tap-wiring
    // uses it and works); external iframe.contentDocument is often inaccessible.
    expect(html).toContain("renderedDocs");
    expect(html).toContain('"bb-theme"');
    expect(html).toContain(`padding:0 ${DEFAULT_SETTINGS.marginWidth}px`);
    expect(html).not.toContain("injectIntoView");
  });

  it("re-paginates via resize + display when a layout setting changes", () => {
    expect(html).toContain("rendition.resize");
    expect(html).toContain("rendition.display");
  });

  it("flattens nested TOC chapters, not just top-level parts", () => {
    // Many epubs nest chapters under parts ("books within the book"); the TOC
    // builder must recurse into subitems or those chapters are lost. Anchored
    // to our own flattener name ("subitems" alone also matches epub.js source).
    expect(html).toContain("flattenToc(");
  });
});
