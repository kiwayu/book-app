import { Platform, type TextStyle } from "react-native";

/* ══════════════════════════════════════════════════════
   Design Tokens — BookBrain
   ──────────────────────────────────────────────────────
   8px base grid · minimal · premium · calm
   Dark surfaces with subtle blue-slate depth layering
   ══════════════════════════════════════════════════════ */

/* ── Color palette ─────────────────────────────────── */

const color = {
  /*
   * Surface hierarchy — each layer reads as distinctly
   * elevated. Subtle blue-grey tint over neutral black
   * gives an Apple/macOS-style premium depth.
   *
   *  base      → screen background (deepest)
   *  raised    → cards, rows
   *  overlay   → modals, popovers
   *  elevated  → floating menus, tooltips
   */
  bg: {
    base:     "#0c0c10",   // deep blue-slate, not pure black
    raised:   "#13131a",   // dark card surface
    overlay:  "#1a1a24",   // elevated panel
    elevated: "#21212e",   // highest floating surface
  },

  glass: {
    bg:           "rgba(255,255,255,0.05)",
    bgHover:      "rgba(255,255,255,0.08)",
    border:       "rgba(255,255,255,0.09)",
    borderStrong: "rgba(255,255,255,0.13)",
  },

  text: {
    primary:   "#f2f2f7",  // iOS system white — warm, not harsh
    secondary: "#aeaeb2",  // iOS gray 2
    tertiary:  "#787880",  // iOS gray 3
    muted:     "#545458",  // subdued label
    faint:     "#3a3a40",  // hairline dividers, placeholders
    inverse:   "#0c0c10",
  },

  accent: {
    base:        "#6366f1",
    strong:      "#4f46e5",
    light:       "#818cf8",
    lighter:     "#a5b4fc",
    lightest:    "#c7d2fe",
    bg:          "rgba(99,102,241,0.12)",
    bgStrong:    "rgba(99,102,241,0.25)",
    border:      "rgba(99,102,241,0.30)",
    borderStrong:"rgba(99,102,241,0.45)",
  },

  success: {
    base:    "#10b981",
    light:   "#34d399",
    lighter: "#6ee7b7",
    bg:      "rgba(16,185,129,0.15)",
    border:  "rgba(16,185,129,0.25)",
  },

  warning: {
    base:  "#f59e0b",
    light: "#fbbf24",
    bg:    "rgba(251,191,36,0.12)",
  },

  error: {
    base:   "#ef4444",
    light:  "#fca5a5",
    bg:     "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.18)",
  },

  /*
   * Borders — all carry a faint blue-grey tint for
   * cohesion with the surface palette.
   */
  border: {
    subtle:  "#1c1c28",
    default: "#252533",
    strong:  "#323248",
    accent:  "#2d2d42",
  },
} as const;

/* ── Spacing (8px base grid) ──────────────────────── */

const space = {
  _0:  0,
  _1:  4,
  _2:  8,
  _3:  12,
  _4:  16,
  _5:  20,
  _6:  24,
  _7:  28,
  _8:  32,
  _10: 40,
  _12: 48,
  _16: 64,
} as const;

/* ── Border radius ────────────────────────────────── */

const radius = {
  xs:   4,
  sm:   6,
  md:   8,
  lg:   10,
  xl:   12,
  "2xl": 14,
  "3xl": 16,
  "4xl": 20,
  "5xl": 24,
  pill:  999,
} as const;

/* ── Typography ───────────────────────────────────── */

const font = {
  display: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: color.text.primary,
  } as TextStyle,

  title: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: color.text.primary,
  } as TextStyle,

  headline: {
    fontSize: 15,
    fontWeight: "700",
    color: color.text.primary,
  } as TextStyle,

  body: {
    fontSize: 14,
    fontWeight: "500",
    color: color.text.primary,
  } as TextStyle,

  caption: {
    fontSize: 12,
    fontWeight: "600",
    color: color.text.secondary,
  } as TextStyle,

  micro: {
    fontSize: 11,
    fontWeight: "600",
    color: color.text.tertiary,
  } as TextStyle,

  tiny: {
    fontSize: 10,
    fontWeight: "500",
    color: color.text.muted,
  } as TextStyle,

  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: color.text.tertiary,
  } as TextStyle,
} as const;

/* ── Shadows ──────────────────────────────────────── */
/*
 * Shadow color uses a deep blue-slate (#05050e) instead
 * of pure black — creates softer, warmer depth that
 * reads as layered rather than flat-with-outline.
 */

const shadow = {
  none: {},

  soft: Platform.select({
    ios: {
      shadowColor:   "#05050e",
      shadowOffset:  { width: 0, height: 2 },
      shadowOpacity: 0.20,
      shadowRadius:  8,
    },
    android: { elevation: 3 },
    default: {},
  })!,

  medium: Platform.select({
    ios: {
      shadowColor:   "#05050e",
      shadowOffset:  { width: 0, height: 4 },
      shadowOpacity: 0.30,
      shadowRadius:  14,
    },
    android: { elevation: 6 },
    default: {},
  })!,

  heavy: Platform.select({
    ios: {
      shadowColor:   "#05050e",
      shadowOffset:  { width: 0, height: 8 },
      shadowOpacity: 0.40,
      shadowRadius:  20,
    },
    android: { elevation: 10 },
    default: {},
  })!,

  top: Platform.select({
    ios: {
      shadowColor:   "#05050e",
      shadowOffset:  { width: 0, height: -4 },
      shadowOpacity: 0.35,
      shadowRadius:  20,
    },
    android: { elevation: 10 },
    default: {},
  })!,
} as const;

/* ── Glass presets ────────────────────────────────── */

const glass = {
  card: {
    backgroundColor: color.glass.bg,
    borderWidth: 1,
    borderColor: color.glass.border,
    ...shadow.soft,
  },

  cardElevated: {
    backgroundColor: color.glass.bgHover,
    borderWidth: 1,
    borderColor: color.glass.borderStrong,
    ...shadow.medium,
  },

  sheet: {
    backgroundColor: color.bg.raised,
    borderWidth: 1,
    borderColor: color.glass.border,
    ...shadow.heavy,
  },

  surface: {
    backgroundColor: color.bg.raised,
    borderWidth: 1,
    borderColor: color.border.default,
  },
} as const;

/* ── Animation timing ─────────────────────────────── */

const anim = {
  fast:        80,
  normal:      150,
  slow:        250,
  spring:      { friction: 6, tension: 40 },
  microBounce: { toValue: 0.96, duration: 60 },
} as const;

/* ── Press feedback ───────────────────────────────── */

const press = {
  opacity: { opacity: 0.82 },
  scale:   { opacity: 0.82, transform: [{ scale: 0.985 }] },
  subtle:  { opacity: 0.92 },
} as const;

/* ── Exports ──────────────────────────────────────── */

export const t = {
  color,
  space,
  radius,
  font,
  shadow,
  glass,
  anim,
  press,
} as const;

export type Theme = typeof t;
