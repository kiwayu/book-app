import {
  nextCaretState,
  startIndexFor,
  type CaretState,
} from "../caretState";

const pick = (index: number, href: string | null = "c1.xhtml"): CaretState => ({
  index,
  href,
});

describe("nextCaretState", () => {
  it("records a pick", () => {
    expect(
      nextCaretState(null, { type: "placed", index: 42, href: "c1.xhtml" })
    ).toEqual({ index: 42, href: "c1.xhtml" });
  });

  it("treats word 0 as a real pick, not as 'nothing chosen'", () => {
    // The old code used 0 as its sentinel, so picking the first word of a
    // chapter did nothing at all.
    const s = nextCaretState(null, {
      type: "placed",
      index: 0,
      href: "c1.xhtml",
    });
    expect(s).toEqual({ index: 0, href: "c1.xhtml" });
    expect(startIndexFor(s, "c1.xhtml", 100)).toBe(0);
  });

  it("clears on consume and on abandon", () => {
    expect(nextCaretState(pick(5), { type: "consumed" })).toBeNull();
    expect(nextCaretState(pick(5), { type: "abandoned" })).toBeNull();
  });

  it("survives a relocation within the same chapter", () => {
    expect(
      nextCaretState(pick(5), { type: "chapterChanged", href: "c1.xhtml" })
    ).toEqual({ index: 5, href: "c1.xhtml" });
  });

  it("is discarded when the book moves to another chapter", () => {
    expect(
      nextCaretState(pick(5), { type: "chapterChanged", href: "c2.xhtml" })
    ).toBeNull();
  });

  it("discards a pick that has no chapter identity when the book moves", () => {
    // Cannot be validated, so it must not survive — starting at the top beats
    // starting at the wrong word.
    expect(
      nextCaretState(pick(5, null), { type: "chapterChanged", href: "c1.xhtml" })
    ).toBeNull();
  });
});

describe("startIndexFor", () => {
  it("returns the index for the chapter it belongs to", () => {
    expect(startIndexFor(pick(42), "c1.xhtml", 100)).toBe(42);
  });

  /* REGRESSION — an abandoned caret used to hijack the NEXT speed-reading
     session and suppress the resume prompt, because nothing cleared it. */
  it("returns null with no pick, so the normal start/resume path runs", () => {
    expect(startIndexFor(null, "c1.xhtml", 100)).toBeNull();
  });

  it("refuses a pick from a different chapter", () => {
    expect(startIndexFor(pick(42, "c1.xhtml"), "c2.xhtml", 100)).toBeNull();
  });

  it("refuses a pick that no longer lands inside the chapter", () => {
    // The chapter re-rendered shorter than when the caret was placed.
    expect(startIndexFor(pick(500), "c1.xhtml", 100)).toBeNull();
    expect(startIndexFor(pick(100), "c1.xhtml", 100)).toBeNull(); // off by one
    expect(startIndexFor(pick(99), "c1.xhtml", 100)).toBe(99); // last word is fine
  });

  it("refuses everything when the chapter has no words", () => {
    expect(startIndexFor(pick(0), "c1.xhtml", 0)).toBeNull();
  });

  it("allows a pick when the reader reported no href either side", () => {
    expect(startIndexFor(pick(3, null), null, 100)).toBe(3);
  });
});

/* The full abandon-then-open-normally journey the bug lived in. */
describe("regression: abandoned caret does not hijack the next session", () => {
  it("places, abandons, and starts clean", () => {
    let s: CaretState = null;
    s = nextCaretState(s, { type: "placed", index: 42, href: "c1.xhtml" });
    expect(startIndexFor(s, "c1.xhtml", 200)).toBe(42);

    // Reader changes their mind and keeps reading; the book moves on.
    s = nextCaretState(s, { type: "chapterChanged", href: "c2.xhtml" });

    // Opening speed reading now must NOT start at word 42 of chapter 2.
    expect(startIndexFor(s, "c2.xhtml", 200)).toBeNull();
  });
});
