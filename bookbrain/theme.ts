import { Platform, type TextStyle } from "react-native";

/* ══════════════════════════════════════════════════════
   Design Tokens — BookBrain
   ──────────────────────────────────────────────────────
   8px base grid · minimal · premium · calm
   Light surfaces with soft blue layering — reading-first
   ══════════════════════════════════════════════════════ */

/* ── Color palette ─────────────────────────────────── */

const color = {
  /*
   * Surface hierarchy — each layer reads as distinctly
   * elevated. Soft blue-white tint inspired by the
   * palette: #BDDDFC · #88BDF2 · #6A89A7 · #384959
   *
   *  base      → screen background (lightest)
   *  raised    → cards, rows
   *  overlay   → modals, popovers
   *  elevated  → floating menus, tooltips
   */
  bg: {
    base:     "#EEF5FF",   // sky-white — barely-there blue tint
    raised:   "#E0EFFB",   // card / row surface
    overlay:  "#D3E8F8",   // elevated panel (toward #BDDDFC)
    elevated: "#C5DFFA",   // highest floating — pure #BDDDFC territory
  },

  /*
   * Glass — frosted light surfaces with blue border glow
   * (#88BDF2 tinted borders create the "lit edge" effect)
   */
  glass: {
    bg:           "rgba(255,255,255,0.58)",
    bgHover:      "rgba(255,255,255,0.82)",
    border:       "rgba(136,189,242,0.28)",   // #88BDF2
    borderStrong: "rgba(136,189,242,0.50)",
  },

  text: {
    primary:   "#1e3548",  // deep navy — max contrast on light bg
    secondary: "#384959",  // palette dark blue
    tertiary:  "#6A89A7",  // palette mid-slate
    muted:     "#8dabbf",  // lighter slate
    faint:     "#b0ccde",  // hairline dividers, placeholders
    inverse:   "#EEF5FF",  // light bg as inverse (text on dark)
  },

  accent: {
    /*
     * #88BDF2 is the raw palette accent — used as "light"
     * tone. base/strong are deepened for WCAG contrast
     * on the light backgrounds.
     */
    base:         "#5a9dd4",
    strong:       "#3f82bc",
    light:        "#88BDF2",
    lighter:      "#a8d4f8",
    lightest:     "#c8e4fc",
    bg:           "rgba(136,189,242,0.12)",
    bgStrong:     "rgba(136,189,242,0.22)",
    border:       "rgba(90,157,212,0.30)",
    borderStrong: "rgba(90,157,212,0.52)",
  },

  success: {
    base:    "#0ea369",
    light:   "#22c98a",
    lighter: "#5dd9a8",
    bg:      "rgba(14,163,105,0.10)",
    border:  "rgba(14,163,105,0.22)",
  },

  warning: {
    base:  "#d97706",
    light: "#f59e0b",
    bg:    "rgba(217,119,6,0.10)",
  },

  error: {
    base:   "#dc2626",
    light:  "#f87171",
    bg:     "rgba(220,38,38,0.08)",
    border: "rgba(220,38,38,0.16)",
  },

  /*
   * Borders — all carry a soft blue-grey tint
   * that coheres with the surface palette.
   */
  border: {
    subtle:  "#DDEAF5",
    default: "#C5DCED",
    strong:  "#A5CADA",
    accent:  "#B0CDE8",
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
 * Shadow color uses deep blue-slate (#2c4a62) instead
 * of black — on light surfaces this reads as a natural
 * blue-tinted depth rather than a harsh dark edge.
 * Opacities are lower than dark-mode equivalents since
 * the contrast is already supplied by the bg layers.
 */

const shadow = {
  none: {},

  soft: Platform.select({
    ios: {
      shadowColor:   "#2c4a62",
      shadowOffset:  { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius:  8,
    },
    android: { elevation: 3 },
    default: {},
  })!,

  medium: Platform.select({
    ios: {
      shadowColor:   "#2c4a62",
      shadowOffset:  { width: 0, height: 4 },
      shadowOpacity: 0.14,
      shadowRadius:  14,
    },
    android: { elevation: 6 },
    default: {},
  })!,

  heavy: Platform.select({
    ios: {
      shadowColor:   "#2c4a62",
      shadowOffset:  { width: 0, height: 8 },
      shadowOpacity: 0.20,
      shadowRadius:  20,
    },
    android: { elevation: 10 },
    default: {},
  })!,

  top: Platform.select({
    ios: {
      shadowColor:   "#2c4a62",
      shadowOffset:  { width: 0, height: -4 },
      shadowOpacity: 0.14,
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
