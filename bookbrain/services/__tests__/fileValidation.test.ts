import {
  fileExtension,
  ebookKindOf,
  safeStorageName,
} from "../fileValidation";

describe("fileExtension", () => {
  it("extracts simple extensions, lower-cased", () => {
    expect(fileExtension("book.epub")).toBe(".epub");
    expect(fileExtension("Report.PDF")).toBe(".pdf");
  });

  it("uses only the last extension segment", () => {
    expect(fileExtension("my.novel.v2.epub")).toBe(".epub");
  });

  it("returns empty string when there is no extension", () => {
    expect(fileExtension("README")).toBe("");
  });

  it("treats dotfiles as having no extension", () => {
    expect(fileExtension(".epub")).toBe("");
  });

  it("ignores directories in the path", () => {
    expect(fileExtension("folder.epub/notes.txt")).toBe(".txt");
    expect(fileExtension("C:\\downloads\\book.epub")).toBe(".epub");
  });

  it("handles empty input", () => {
    expect(fileExtension("")).toBe("");
  });
});

describe("ebookKindOf", () => {
  it("classifies epub and pdf regardless of case", () => {
    expect(ebookKindOf("a.epub")).toBe("epub");
    expect(ebookKindOf("a.EPUB")).toBe("epub");
    expect(ebookKindOf("a.pdf")).toBe("pdf");
  });

  it("rejects everything else (octet-stream mislabels arrive here)", () => {
    expect(ebookKindOf("a.mobi")).toBeNull();
    expect(ebookKindOf("a.epub.zip")).toBeNull();
    expect(ebookKindOf("a")).toBeNull();
    expect(ebookKindOf("")).toBeNull();
  });
});

describe("safeStorageName", () => {
  it("keeps ordinary names, replacing spaces", () => {
    expect(safeStorageName("My Book.epub")).toBe("My_Book.epub");
  });

  it("strips path components", () => {
    expect(safeStorageName("/tmp/evil/../book.epub")).toBe("book.epub");
    expect(safeStorageName("C:\\x\\book.epub")).toBe("book.epub");
  });

  it("replaces filesystem-hostile characters", () => {
    expect(safeStorageName('a<b>c:"d|e?f*.epub')).toBe("a_b_c__d_e_f_.epub");
  });

  it("never returns an empty name", () => {
    expect(safeStorageName("")).toBe("book");
    expect(safeStorageName("///")).toBe("book");
  });
});
