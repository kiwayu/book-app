import { Platform, type TextStyle } from "react-native";

/* ══════════════════════════════════════════════════════
   Design Tokens — BookBrain
   ──────────────────────────────────────────────────────
   8px base grid · minimal · premium · calm
   ══════════════════════════════════════════════════════ */

/* ── Color palette ─────────────────────────────────── */

const color = {
  bg: {
    base: "#0a0a0a",
    raised: "#141414",
    overlay: "#1c1c1e",
    elevated: "#222224",
  },

  glass: {
    bg: "rgba(255,255,255,0.04)",
    bgHover: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.07)",
    borderStrong: "rgba(255,255,255,0.10)",
  },

  text: {
    primary: "#f0f0f0",
    secondary: "#a3a3a3",
    tertiary: "#737373",
    muted: "#525252",
    faint: "#3a3a3a",
    inverse: "#0a0a0a",
  },

  accent: {
    base: "#6366f1",
    strong: "#4f46e5",
    light: "#818cf8",
    lighter: "#a5b4fc",
    lightest: "#c7d2fe",
    bg: "rgba(99,102,241,0.12)",
    bgStrong: "rgba(99,102,241,0.25)",
    border: "rgba(99,102,241,0.30)",
    borderStrong: "rgba(99,102,241,0.45)",
  },

  success: {
    base: "#10b981",
    light: "#34d399",
    lighter: "#6ee7b7",
    bg: "rgba(16,185,129,0.15)",
    border: "rgba(16,185,129,0.25)",
  },

  warning: {
    base: "#f59e0b",
    light: "#fbbf24",
    bg: "rgba(251,191,36,0.12)",
  },

  error: {
    base: "#ef4444",
    light: "#fca5a5",
    bg: "rgba(239,68,68,0.10)",
    border: "rgba(239,68,68,0.18)",
  },

  border: {
    subtle: "#1c1c1e",
    default: "#262626",
    strong: "#333333",
    accent: "#2c2c2e",
  },
} as const;

/* ── Spacing (8px base grid) ──────────────────────── */

const space = {
  _0: 0,
  _1: 4,
  _2: 8,
  _3: 12,
  _4: 16,
  _5: 20,
  _6: 24,
  _7: 28,
  _8: 32,
  _10: 40,
  _12: 48,
  _16: 64,
} as const;

/* ── Border radius ────────────────────────────────── */

const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  "2xl": 14,
  "3xl": 16,
  "4xl": 20,
  "5xl": 24,
  pill: 999,
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

const shadow = {
  none: {},

  soft: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    },
    android: { elevation: 3 },
    default: {},
  })!,

  medium: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
    },
    android: { elevation: 6 },
    default: {},
  })!,

  heavy: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    android: { elevation: 10 },
    default: {},
  })!,

  top: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.30,
      shadowRadius: 16,
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
  fast: 80,
  normal: 150,
  slow: 250,
  spring: { friction: 6, tension: 40 },
  microBounce: { toValue: 0.96, duration: 60 },
} as const;

/* ── Press feedback ───────────────────────────────── */

const press = {
  opacity: { opacity: 0.82 },
  scale: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  subtle: { opacity: 0.92 },
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
