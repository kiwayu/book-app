import { Platform, DevSettings, type TextStyle } from "react-native";

/* ══════════════════════════════════════════════════════
   Design Tokens — BookBrain
   ──────────────────────────────────────────────────────
   A named-theme registry. Each theme is a small SEED
   (bg / surface / text / sub / accent + dark flag); the
   full token set is DERIVED from it, so adding a theme is
   a few colours. Spacing/radius/timing are shared.

   Changing theme persists the id and reloads, so every
   module-level StyleSheet rebuilds in the new palette.
   Themes include light, dark, nord ("nordic") and popular
   monkeytype palettes (serika, dracula, gruvbox, …).
   ══════════════════════════════════════════════════════ */

export type ThemeId = string;

interface ThemeSeed {
  name: string;
  dark: boolean;
  bg: string;       // base background
  surface?: string; // raised surface (derived if omitted)
  text: string;     // primary text
  sub: string;      // secondary / muted text
  accent: string;   // brand / active colour
}

/* ── Theme registry ────────────────────────────────── */

const THEME_SEEDS: Record<string, ThemeSeed> = {
  light:       { name: "Light",       dark: false, bg: "#EEF5FF", surface: "#E0EFFB", text: "#1e3548", sub: "#6A89A7", accent: "#5a9dd4" },
  dark:        { name: "Dark",        dark: true,  bg: "#0d1520", surface: "#16202e", text: "#e8eff7", sub: "#94aec5", accent: "#5a9dd4" },
  nord:        { name: "Nord",        dark: true,  bg: "#2e3440", surface: "#3b4252", text: "#d8dee9", sub: "#7b88a1", accent: "#88c0d0" },
  serika_dark: { name: "Serika Dark", dark: true,  bg: "#323437", surface: "#3c3f42", text: "#d1d0c5", sub: "#7c7f83", accent: "#e2b714" },
  dracula:     { name: "Dracula",     dark: true,  bg: "#282a36", surface: "#343746", text: "#f8f8f2", sub: "#6272a4", accent: "#bd93f9" },
  gruvbox:     { name: "Gruvbox",     dark: true,  bg: "#282828", surface: "#32302f", text: "#ebdbb2", sub: "#928374", accent: "#fabd2f" },
  rose_pine:   { name: "Rosé Pine",   dark: true,  bg: "#191724", surface: "#1f1d2e", text: "#e0def4", sub: "#6e6a86", accent: "#ebbcba" },
  catppuccin:  { name: "Catppuccin",  dark: true,  bg: "#1e1e2e", surface: "#282a3a", text: "#cdd6f4", sub: "#7f849c", accent: "#cba6f7" },
  carbon:      { name: "Carbon",      dark: true,  bg: "#313131", surface: "#3d3d3d", text: "#f2f2e4", sub: "#7f7f7f", accent: "#f66e0d" },
  matrix:      { name: "Matrix",      dark: true,  bg: "#000000", surface: "#0a120a", text: "#15ff00", sub: "#2f8a26", accent: "#15ff00" },
};

/** For UI: id + display name + preview swatches. */
export const THEME_LIST = Object.entries(THEME_SEEDS).map(([id, s]) => ({
  id,
  name: s.name,
  dark: s.dark,
  bg: s.bg,
  accent: s.accent,
  text: s.text,
}));

export function isThemeDark(id: ThemeId): boolean {
  return !!THEME_SEEDS[id]?.dark;
}

/* ── Colour helpers (pure, no deps) ────────────────── */

function clamp(n: number) { return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, "0")).join("");
}
function mix(a: string, b: string, amt: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.r + (B.r - A.r) * amt, A.g + (B.g - A.g) * amt, A.b + (B.b - A.b) * amt);
}
const lighten = (hex: string, amt: number) => mix(hex, "#ffffff", amt);
const darken = (hex: string, amt: number) => mix(hex, "#000000", amt);
function alpha(hex: string, a: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── Palette derivation ────────────────────────────── */

function buildPalette(seed: ThemeSeed) {
  const { dark, bg, text, sub, accent } = seed;
  const surface = seed.surface || (dark ? lighten(bg, 0.05) : darken(bg, 0.04));
  const step = dark ? lighten : darken; // surfaces/borders move away from bg
  return {
    bg: {
      base:     bg,
      raised:   surface,
      overlay:  step(bg, 0.10),
      elevated: step(bg, 0.16),
    },
    glass: {
      bg:           dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.60)",
      bgHover:      dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.85)",
      border:       alpha(accent, 0.20),
      borderStrong: alpha(accent, 0.36),
    },
    text: {
      primary:   text,
      secondary: mix(text, sub, 0.30),
      tertiary:  sub,
      muted:     mix(sub, bg, 0.35),
      faint:     mix(sub, bg, 0.60),
      inverse:   bg,
    },
    accent: {
      base:         accent,
      strong:       dark ? lighten(accent, 0.08) : darken(accent, 0.12),
      light:        lighten(accent, 0.14),
      lighter:      lighten(accent, 0.30),
      lightest:     lighten(accent, 0.45),
      bg:           alpha(accent, 0.14),
      bgStrong:     alpha(accent, 0.24),
      border:       alpha(accent, 0.32),
      borderStrong: alpha(accent, 0.52),
    },
    success: {
      base:    "#1fb877",
      light:   "#3fd693",
      lighter: "#74e3b5",
      bg:      alpha("#1fb877", dark ? 0.14 : 0.10),
      border:  alpha("#1fb877", 0.24),
    },
    warning: {
      base:  "#e0a021",
      light: "#f0b93f",
      bg:    alpha("#e0a021", dark ? 0.14 : 0.10),
    },
    error: {
      base:   "#e5484d",
      light:  "#f16d6d",
      bg:     alpha("#e5484d", dark ? 0.14 : 0.10),
      border: alpha("#e5484d", 0.22),
    },
    border: {
      subtle:  step(bg, 0.08),
      default: step(bg, 0.15),
      strong:  step(bg, 0.26),
      accent:  alpha(accent, 0.40),
    },
  };
}

type Palette = ReturnType<typeof buildPalette>;

/* ── Shared tokens ─────────────────────────────────── */

const space = {
  _0: 0, _1: 4, _2: 8, _3: 12, _4: 16, _5: 20,
  _6: 24, _7: 28, _8: 32, _10: 40, _12: 48, _16: 64,
} as const;

const radius = {
  xs: 4, sm: 6, md: 8, lg: 10, xl: 12,
  "2xl": 14, "3xl": 16, "4xl": 20, "5xl": 24, pill: 999,
} as const;

const anim = {
  fast: 80, normal: 150, slow: 250,
  spring: { friction: 6, tension: 40 },
  microBounce: { toValue: 0.96, duration: 60 },
} as const;

const press = {
  opacity: { opacity: 0.82 },
  scale:   { opacity: 0.82, transform: [{ scale: 0.985 }] },
  subtle:  { opacity: 0.92 },
} as const;

/* ── Builders ──────────────────────────────────────── */

function buildFont(color: Palette) {
  return {
    display:  { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: color.text.primary } as TextStyle,
    title:    { fontSize: 18, fontWeight: "800", letterSpacing: -0.2, color: color.text.primary } as TextStyle,
    headline: { fontSize: 15, fontWeight: "700", color: color.text.primary } as TextStyle,
    body:     { fontSize: 14, fontWeight: "500", color: color.text.primary } as TextStyle,
    caption:  { fontSize: 12, fontWeight: "600", color: color.text.secondary } as TextStyle,
    micro:    { fontSize: 11, fontWeight: "600", color: color.text.tertiary } as TextStyle,
    tiny:     { fontSize: 10, fontWeight: "500", color: color.text.muted } as TextStyle,
    label:    { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: color.text.tertiary } as TextStyle,
  };
}

function buildShadow(dark: boolean) {
  const c = dark ? "#000000" : "#2c4a62";
  const o = dark ? 1.6 : 1;
  const sel = (h: number, opacity: number, r: number, elevation: number) =>
    Platform.select({
      ios: { shadowColor: c, shadowOffset: { width: 0, height: h }, shadowOpacity: opacity * o, shadowRadius: r },
      android: { elevation },
      default: {},
    })!;
  return {
    none: {},
    soft:   sel(2, 0.10, 8, 3),
    medium: sel(4, 0.14, 14, 6),
    heavy:  sel(8, 0.20, 20, 10),
    top:    sel(-4, 0.14, 20, 10),
  };
}

function buildGlass(color: Palette, shadow: ReturnType<typeof buildShadow>) {
  return {
    card:         { backgroundColor: color.glass.bg, borderWidth: 1, borderColor: color.glass.border, ...shadow.soft },
    cardElevated: { backgroundColor: color.glass.bgHover, borderWidth: 1, borderColor: color.glass.borderStrong, ...shadow.medium },
    sheet:        { backgroundColor: color.bg.raised, borderWidth: 1, borderColor: color.glass.border, ...shadow.heavy },
    surface:      { backgroundColor: color.bg.raised, borderWidth: 1, borderColor: color.border.default },
  };
}

/** Pure: build the full token set for a theme id. */
export function makeTheme(id: ThemeId) {
  const seed = THEME_SEEDS[id] || THEME_SEEDS.light;
  const color = buildPalette(seed);
  const shadow = buildShadow(seed.dark);
  return {
    id,
    isDark: seed.dark,
    color,
    space,
    radius,
    font: buildFont(color),
    shadow,
    glass: buildGlass(color, shadow),
    anim,
    press,
  };
}

export type Theme = ReturnType<typeof makeTheme>;

/* ── Persistence (synchronous, so styles pick it up at load) ── */

const THEME_DB = "bookbrain-theme.db";

function readThemeId(): ThemeId {
  try {
    const SQLite = require("expo-sqlite");
    const db = SQLite.openDatabaseSync(THEME_DB);
    db.execSync("CREATE TABLE IF NOT EXISTS pref (k TEXT PRIMARY KEY, v TEXT)");
    const row = db.getFirstSync("SELECT v FROM pref WHERE k = 'mode'");
    const id = row && row.v;
    return id && THEME_SEEDS[id] ? id : "light";
  } catch {
    return "light";
  }
}

let currentId: ThemeId = readThemeId();

export let t = makeTheme(currentId);

export function getThemeId(): ThemeId {
  return currentId;
}

/** Persist the theme and reload so every screen rebuilds in the new palette. */
export function setThemeId(id: ThemeId): void {
  if (!THEME_SEEDS[id] || id === currentId) return;
  try {
    const SQLite = require("expo-sqlite");
    const db = SQLite.openDatabaseSync(THEME_DB);
    db.execSync("CREATE TABLE IF NOT EXISTS pref (k TEXT PRIMARY KEY, v TEXT)");
    db.runSync("INSERT OR REPLACE INTO pref (k, v) VALUES ('mode', ?)", [id]);
  } catch {
    /* best effort */
  }
  currentId = id;
  t = makeTheme(id);
  try {
    DevSettings.reload();
  } catch {
    /* reload unavailable (production without expo-updates) — next launch applies it */
  }
}
