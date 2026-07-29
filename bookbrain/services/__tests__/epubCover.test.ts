import { parseCoverDataUrl } from "../epubCover";

describe("parseCoverDataUrl", () => {
  it("normalizes jpeg to jpg and keeps payload", () => {
    expect(parseCoverDataUrl("data:image/jpeg;base64,AAAB")).toEqual({
      ext: "jpg",
      base64: "AAAB",
    });
  });

  it("supports png/gif/webp", () => {
    expect(parseCoverDataUrl("data:image/png;base64,ZZ")?.ext).toBe("png");
    expect(parseCoverDataUrl("data:image/webp;base64,ZZ")?.ext).toBe("webp");
  });

  it("rejects non-image or malformed data urls", () => {
    expect(parseCoverDataUrl("data:application/pdf;base64,ZZ")).toBeNull();
    expect(parseCoverDataUrl("not-a-data-url")).toBeNull();
  });
});
