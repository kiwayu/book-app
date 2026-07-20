import { tapZone } from "../tapZones";

const W = 300; // thirds at 100 / 200

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
