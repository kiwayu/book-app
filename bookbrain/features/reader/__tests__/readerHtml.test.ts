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
});
