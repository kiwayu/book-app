import {
  tokenize,
  tokenizeParagraphs,
  orpIndex,
  splitOrp,
  durationFor,
  schedule,
  wordIndexAt,
  isFinished,
  rebase,
  totalDuration,
  PACING,
  type Token,
} from "../engine";

const tok = (word: string, isParagraphEnd = false, paragraphIndex = 0): Token => ({
  word,
  paragraphIndex,
  isParagraphEnd,
});

/* base duration at 300 WPM is exactly 200ms — easy mental math */
const WPM = 300;
const BASE = 200;

describe("tokenize", () => {
  it("splits on any whitespace run", () => {
    expect(tokenize("the  quick\tbrown\nfox")).toEqual([
      "the",
      "quick",
      "brown",
      "fox",
    ]);
  });

  it("returns [] for empty and whitespace-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   \n\t ")).toEqual([]);
  });

  it("keeps punctuation and quotes attached to their word", () => {
    expect(tokenize('he said, “wait!”')).toEqual([
      "he",
      "said,",
      "“wait!”",
    ]);
  });

  it("keeps hyphenated compounds as one token", () => {
    expect(tokenize("a well-known fact")).toEqual(["a", "well-known", "fact"]);
  });

  it("splits em-dashes, dash staying with the left word", () => {
    expect(tokenize("war—peace")).toEqual(["war—", "peace"]);
  });

  it("handles an em-dash leading or standalone", () => {
    expect(tokenize("—suddenly")).toEqual(["—", "suddenly"]);
    expect(tokenize("—")).toEqual(["—"]);
  });

  it("handles numbers as plain tokens", () => {
    expect(tokenize("in 1984 there")).toEqual(["in", "1984", "there"]);
  });
});

describe("tokenizeParagraphs", () => {
  it("marks paragraph indices and paragraph-end words", () => {
    const tokens = tokenizeParagraphs(["one two", "three"]);
    expect(tokens).toEqual([
      { word: "one", paragraphIndex: 0, isParagraphEnd: false },
      { word: "two", paragraphIndex: 0, isParagraphEnd: true },
      { word: "three", paragraphIndex: 1, isParagraphEnd: true },
    ]);
  });

  it("skips empty paragraphs without breaking indices", () => {
    const tokens = tokenizeParagraphs(["a", "", "b"]);
    expect(tokens.map((t) => [t.word, t.paragraphIndex])).toEqual([
      ["a", 0],
      ["b", 2],
    ]);
  });
});

describe("orpIndex", () => {
  it("follows the OpenSpritz length table", () => {
    expect(orpIndex("a")).toBe(0); // 1
    expect(orpIndex("an")).toBe(1); // 2
    expect(orpIndex("haven")).toBe(1); // 5
    expect(orpIndex("havens")).toBe(2); // 6
    expect(orpIndex("wonderful")).toBe(2); // 9
    expect(orpIndex("wonderfully")).toBe(3); // 11
    expect(orpIndex("extraordinary")).toBe(3); // 13
    expect(orpIndex("extraordinarily")).toBe(4); // 15
  });

  it("never exceeds the last character", () => {
    expect(orpIndex("")).toBe(0);
    expect(orpIndex("—")).toBe(0);
  });
});

describe("splitOrp", () => {
  it("splits a word around its focal letter", () => {
    // "reading" is 7 chars -> orpIndex 2
    expect(splitOrp("reading")).toEqual({
      left: "re",
      focus: "a",
      right: "ding",
    });
  });

  it("puts the focus first for one- and two-char words", () => {
    expect(splitOrp("a")).toEqual({ left: "", focus: "a", right: "" });
    expect(splitOrp("to")).toEqual({ left: "t", focus: "o", right: "" });
  });

  it("keeps punctuation in the right segment", () => {
    expect(splitOrp("end.")).toEqual({ left: "e", focus: "n", right: "d." });
  });

  it("returns three empty strings for empty input", () => {
    expect(splitOrp("")).toEqual({ left: "", focus: "", right: "" });
  });

  it("reassembles to the original word", () => {
    for (const w of ["a", "to", "reading", "extraordinarily", "war—", "“wait!”"]) {
      const { left, focus, right } = splitOrp(w);
      expect(left + focus + right).toBe(w);
    }
  });
});

describe("durationFor", () => {
  it("uses 60000/wpm as the base duration", () => {
    expect(durationFor(tok("plain"), WPM)).toBe(BASE);
  });

  it("throws on non-positive wpm", () => {
    expect(() => durationFor(tok("x"), 0)).toThrow(RangeError);
    expect(() => durationFor(tok("x"), -100)).toThrow(RangeError);
  });

  it("applies clause and sentence pauses", () => {
    expect(durationFor(tok("so,"), WPM)).toBe(BASE * PACING.CLAUSE_PAUSE);
    expect(durationFor(tok("end."), WPM)).toBe(BASE * PACING.SENTENCE_PAUSE);
    expect(durationFor(tok("end!"), WPM)).toBe(BASE * PACING.SENTENCE_PAUSE);
    expect(durationFor(tok("why?"), WPM)).toBe(BASE * PACING.SENTENCE_PAUSE);
  });

  it("detects sentence end behind closing quotes", () => {
    expect(durationFor(tok('done.”'), WPM)).toBe(
      BASE * PACING.SENTENCE_PAUSE
    );
  });

  it("paragraph end outranks sentence end — pauses never stack", () => {
    expect(durationFor(tok("over.", true), WPM)).toBe(
      BASE * PACING.PARAGRAPH_PAUSE
    );
  });

  it("slows long words", () => {
    expect(durationFor(tok("wonderful"), WPM)).toBe(BASE * PACING.LONG_WORD); // 9 chars
    expect(durationFor(tok("extraordinary"), WPM)).toBe(
      BASE * PACING.VERY_LONG_WORD
    ); // 13 chars
  });

  it("measures length without trailing punctuation", () => {
    // "absurd)" is 6 visible chars — no long-word multiplier
    expect(durationFor(tok('absurd”'), WPM)).toBe(BASE);
  });

  it("slows numbers", () => {
    expect(durationFor(tok("1984"), WPM)).toBe(BASE * PACING.NUMBER);
  });

  it("stacks complexity multiplicatively with pauses", () => {
    expect(durationFor(tok("wonderful."), WPM)).toBeCloseTo(
      BASE * PACING.SENTENCE_PAUSE * PACING.LONG_WORD
    );
  });
});

describe("schedule / wordIndexAt", () => {
  const tokens = tokenizeParagraphs(["one two three four"]); // 4 plain... "four" is paragraph end
  const sched = schedule(tokens, WPM);

  it("builds cumulative end times", () => {
    // one(200) two(200) three(200) four(paragraph end: 200*2.8)
    expect(sched.cumEnd).toEqual([200, 400, 600, 600 + 200 * 2.8]);
  });

  it("selects the visible word by elapsed time", () => {
    expect(wordIndexAt(sched, 0)).toBe(0);
    expect(wordIndexAt(sched, 199.9)).toBe(0);
    expect(wordIndexAt(sched, 200)).toBe(1); // boundary: word 0 ends AT 200
    expect(wordIndexAt(sched, 599)).toBe(2);
  });

  it("clamps before the start and past the end", () => {
    expect(wordIndexAt(sched, -50)).toBe(0);
    expect(wordIndexAt(sched, 10_000)).toBe(3);
  });

  it("reports completion", () => {
    expect(isFinished(sched, totalDuration(sched) - 1)).toBe(false);
    expect(isFinished(sched, totalDuration(sched))).toBe(true);
  });

  it("respects fromIndex offsets", () => {
    const tail = schedule(tokens, WPM, 2);
    expect(tail.offset).toBe(2);
    expect(wordIndexAt(tail, 0)).toBe(2);
    expect(wordIndexAt(tail, 200)).toBe(3);
  });

  it("throws on out-of-range fromIndex", () => {
    expect(() => schedule(tokens, WPM, -1)).toThrow(RangeError);
    expect(() => schedule(tokens, WPM, 5)).toThrow(RangeError);
  });

  it("handles empty token lists", () => {
    const empty = schedule([], WPM);
    expect(empty.cumEnd).toEqual([]);
    expect(wordIndexAt(empty, 123)).toBe(0);
    expect(isFinished(empty, 0)).toBe(true);
    expect(totalDuration(empty)).toBe(0);
  });
});

describe("rebase (mid-stream WPM change, D19)", () => {
  it("restarts the current word at t=0 under the new speed — no skips", () => {
    const tokens = tokenizeParagraphs(["alpha beta gamma delta epsilon"]);
    const before = schedule(tokens, 300);

    // Fake clock: we are 450ms in — word index 2 ("gamma") is visible.
    const visibleBefore = wordIndexAt(before, 450);
    expect(visibleBefore).toBe(2);

    // User drags the slider to 600 WPM. Overlay rebases and resets clock.
    const after = rebase(tokens, visibleBefore, 600);
    expect(after.offset).toBe(2);
    expect(wordIndexAt(after, 0)).toBe(2); // same word, not skipped

    // New cadence applies from here: 100ms per plain word at 600 WPM.
    expect(wordIndexAt(after, 100)).toBe(3);
  });

  it("is equivalent to schedule(tokens, wpm, fromIndex)", () => {
    const tokens = tokenizeParagraphs(["a b c d"]);
    expect(rebase(tokens, 1, 450)).toEqual(schedule(tokens, 450, 1));
  });

  it("rebase at the final word leaves a finishable schedule", () => {
    const tokens = tokenizeParagraphs(["only one"]);
    const last = rebase(tokens, 1, 300);
    expect(wordIndexAt(last, 0)).toBe(1);
    expect(isFinished(last, totalDuration(last))).toBe(true);
  });

  it("simulated rAF loop never moves backwards across a rebase", () => {
    const tokens = tokenizeParagraphs(["w1 w2 w3 w4 w5 w6 w7 w8"]);
    let sched = schedule(tokens, 240); // 250ms per plain word
    let clockStart = 0;
    let lastVisible = -1;

    for (let now = 0; now <= 1500; now += 16 /* ~60fps */) {
      const visible = wordIndexAt(sched, now - clockStart);
      expect(visible).toBeGreaterThanOrEqual(lastVisible);
      lastVisible = visible;
      if (now === 496) {
        // slider change mid-frame: rebase + clock reset, same word stays
        sched = rebase(tokens, visible, 480);
        clockStart = now;
        expect(wordIndexAt(sched, now - clockStart)).toBe(visible);
      }
    }
    expect(lastVisible).toBeGreaterThan(2); // stream kept advancing
  });
});
