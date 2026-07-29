import { pickMissingMeta, needsEnrichment } from "../epubMeta";

describe("needsEnrichment", () => {
  it("is true when the author is missing", () => {
    expect(needsEnrichment({ authors: null, cover_url: "x" })).toBe(true);
  });
  it("is true when the cover is missing", () => {
    expect(needsEnrichment({ authors: "A", cover_url: null })).toBe(true);
  });
  it("is false when both are present", () => {
    expect(needsEnrichment({ authors: "A", cover_url: "x" })).toBe(false);
  });
});

describe("pickMissingMeta", () => {
  const empty = { authors: null, publisher: null, published_year: null };

  it("fills author from epub creator when missing", () => {
    expect(pickMissingMeta(empty, { creator: "  Jane Austen " }).authors).toBe(
      "Jane Austen"
    );
  });

  it("does not overwrite an existing author", () => {
    const cur = { ...empty, authors: "Someone" };
    expect(pickMissingMeta(cur, { creator: "Jane Austen" }).authors).toBeUndefined();
  });

  it("parses the year from pubdate", () => {
    expect(pickMissingMeta(empty, { pubdate: "1813-01-28" }).published_year).toBe(1813);
  });

  it("fills publisher when missing", () => {
    expect(pickMissingMeta(empty, { publisher: "Penguin" }).publisher).toBe("Penguin");
  });

  it("returns nothing when there is nothing to fill", () => {
    expect(pickMissingMeta(empty, { creator: "", publisher: "  " })).toEqual({});
  });
});
