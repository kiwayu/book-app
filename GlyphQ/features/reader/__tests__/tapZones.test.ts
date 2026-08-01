import { tapZone, classifyGesture, SWIPE_MIN } from "../tapZones";

const W = 300; // thirds at 100 / 200
const at = (x: number, y = 500) => ({ x, y });

describe("tapZone", () => {
  it("left third -> prev", () => {
    expect(tapZone(0, W)).toBe("prev");
    expect(tapZone(99, W)).toBe("prev");
  });
  it("right third -> next", () => {
    expect(tapZone(299, W)).toBe("next");
    expect(tapZone(201, W)).toBe("next");
  });
  it("middle -> menu", () => {
    expect(tapZone(150, W)).toBe("menu");
    expect(tapZone(100, W)).toBe("menu"); // exact boundary is not prev
    expect(tapZone(200, W)).toBe("menu"); // exact boundary is not next
  });
  it("degenerate width -> menu (no accidental paging)", () => {
    expect(tapZone(0, 0)).toBe("menu");
  });
});

describe("classifyGesture — taps", () => {
  it("scores a still tap by its zone", () => {
    expect(classifyGesture(at(50), at(50), W)).toBe("prev");
    expect(classifyGesture(at(250), at(250), W)).toBe("next");
    expect(classifyGesture(at(150), at(150), W)).toBe("menu");
  });

  /* REGRESSION — the reported bug.
     Release used to decide, so a short drag out of the left third opened the
     menu instead of turning back. The finger LANDED in the left third; that is
     what the reader meant. */
  it("scores a sub-threshold drag from where the finger landed, not where it lifted", () => {
    expect(classifyGesture(at(50), at(80), W)).toBe("prev"); // 30px, left→middle
    expect(classifyGesture(at(250), at(220), W)).toBe("next"); // 30px, right→middle
    expect(classifyGesture(at(150), at(130), W)).toBe("menu"); // stays in middle
  });

  it("treats exactly SWIPE_MIN as not yet a swipe", () => {
    // boundary is > SWIPE_MIN, not >=
    expect(classifyGesture(at(50), at(50 + SWIPE_MIN), W)).toBe("prev");
    // one px further it IS a swipe, left→right, which means go back
    expect(classifyGesture(at(50), at(51 + SWIPE_MIN), W)).toBe("prev");
  });
});

describe("classifyGesture — swipes", () => {
  it("right-to-left turns the page forward", () => {
    expect(classifyGesture(at(250), at(100), W)).toBe("next");
  });

  /* REGRESSION — swiping back used to turn the page FORWARD, because the
     finger lifted in the right third. */
  it("left-to-right turns the page back, wherever the finger lifts", () => {
    expect(classifyGesture(at(20), at(280), W)).toBe("prev");
  });

  it("direction beats the origin zone once past the threshold", () => {
    // Starts in the left third (origin alone would say prev) but travels left.
    expect(classifyGesture(at(90), at(10), W)).toBe("next");
  });

  it("ignores a mostly-vertical drag", () => {
    // 60px across but 200px down — a scroll, not a page turn.
    expect(classifyGesture(at(150), { x: 210, y: 700 }, W)).toBe("menu");
  });
});

describe("classifyGesture — refusals", () => {
  it("does nothing when a second finger was seen", () => {
    // Two fingers: the delta spans the gap between them and would otherwise
    // read as a confident swipe.
    expect(classifyGesture(at(50), at(250), W, true)).toBe("none");
    expect(classifyGesture(at(50), at(50), W, true)).toBe("none");
  });

  it("falls back to the release point when the origin was lost", () => {
    // Terminate can clear the origin mid-gesture; falling back beats guessing.
    expect(classifyGesture(null, at(250), W)).toBe("next");
  });
});
