import { makeTheme, THEME_LIST, isThemeDark } from "../theme";

const lum = (hex: string) => {
  const h = hex.replace("#", "");
  return (
    parseInt(h.slice(0, 2), 16) +
    parseInt(h.slice(2, 4), 16) +
    parseInt(h.slice(4, 6), 16)
  ) / 3;
};

describe("theme registry", () => {
  it("includes light, dark, nord (nordic) and popular monkeytype themes", () => {
    const ids = THEME_LIST.map((x) => x.id);
    ["light", "dark", "nord", "dracula", "serika_dark", "gruvbox"].forEach((id) =>
      expect(ids).toContain(id)
    );
    expect(THEME_LIST.length).toBeGreaterThanOrEqual(8);
  });

  it("every theme builds a complete palette with the same shape", () => {
    const lightKeys = Object.keys(makeTheme("light").color);
    for (const { id } of THEME_LIST) {
      const th = makeTheme(id);
      expect(th.color.bg.base).toBeTruthy();
      expect(th.color.bg.raised).toBeTruthy();
      expect(th.color.text.primary).toBeTruthy();
      expect(th.color.accent.base).toBeTruthy();
      expect(Object.keys(th.color)).toEqual(lightKeys);
    }
  });

  it("dark themes have a dark background, light a light one", () => {
    for (const { id, dark } of THEME_LIST) {
      const bg = makeTheme(id).color.bg.base;
      if (dark) expect(lum(bg)).toBeLessThan(72);
      else expect(lum(bg)).toBeGreaterThan(180);
    }
  });

  it("isThemeDark reflects the theme", () => {
    expect(isThemeDark("dark")).toBe(true);
    expect(isThemeDark("nord")).toBe(true);
    expect(isThemeDark("light")).toBe(false);
  });

  it("themes have distinct accents", () => {
    expect(makeTheme("dracula").color.accent.base).not.toBe(
      makeTheme("nord").color.accent.base
    );
  });
});

/* App-wide light/dark palette. makeTheme(mode) must return a full, same-shaped
   token set whose colours actually differ between modes. */
describe("app theme palette", () => {
  it("light and dark use different backgrounds", () => {
    expect(makeTheme("light").color.bg.base.toLowerCase()).toBe("#eef5ff");
    expect(makeTheme("dark").color.bg.base.toLowerCase()).not.toBe("#eef5ff");
  });

  it("dark background is actually dark (low luminance)", () => {
    const hex = makeTheme("dark").color.bg.base.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    expect((r + g + b) / 3).toBeLessThan(60); // dark
  });

  it("text colour flips for contrast", () => {
    expect(makeTheme("light").color.text.primary).not.toBe(
      makeTheme("dark").color.text.primary
    );
  });

  it("keeps the same token structure in both modes", () => {
    expect(Object.keys(makeTheme("dark"))).toEqual(
      Object.keys(makeTheme("light"))
    );
    expect(Object.keys(makeTheme("dark").color)).toEqual(
      Object.keys(makeTheme("light").color)
    );
  });
});
