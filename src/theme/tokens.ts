/**
 * Design tokens.
 *
 * Every visual constant in the app lives here. Components must never hard-code
 * a colour, radius, or pixel gap — they read from tokens (or from the themed
 * palette in `palette.ts`) so that dark mode, RTL, and future re-skins are a
 * single-file change.
 */

/** 4pt base scale. Keys read as t-shirt sizes for legibility at call sites. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 56,
} as const;

export type SpacingKey = keyof typeof spacing;

/**
 * Corner radii.
 *
 * Collapsed from the old scale, which topped out at 32 and whose most-used
 * value was `pill` (999) — across buttons, chips, badges, search fields and
 * icon circles alike. A capsule shape language is the default look of a
 * generated UI; this one is rectangular and editorial, and `pill` now survives
 * for the two places a capsule is genuinely correct: avatars and circular icon
 * buttons.
 */
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  /** Kept so call sites compile; prefer `xl`. Nothing rectangular should use it. */
  xxl: 24,
  pill: 999,
} as const;

export type RadiusKey = keyof typeof radius;

/**
 * Type scale. `lineHeight` is absolute (not a multiplier) because React Native
 * treats numeric lineHeight as points, and Arabic glyphs need the extra room
 * that these values already allow for.
 */
export const typography = {
  /* Display and titles are tracked in slightly, which is what makes large type
     read as set rather than as merely big — the single cheapest typographic
     upgrade available before a brand typeface is licensed. Body sizes keep
     neutral tracking, where tightening costs legibility (and costs more in
     Arabic than in Latin). */
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.7 },
  title1: { fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.5 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: '700', letterSpacing: -0.1 },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyMedium: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  footnote: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  /* Section eyebrows and metadata labels. Uppercase at call sites, where the
     wide tracking stops it reading as a shout. */
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.6 },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Motion. Kept short — this is a utility app, not a showreel. */
export const duration = {
  instant: 90,
  fast: 160,
  normal: 240,
  slow: 380,
  shimmer: 1100,
} as const;

/** Minimum touch target, per Apple HIG / Material accessibility guidance. */
export const hitSize = {
  min: 44,
} as const;

export const zIndex = {
  base: 0,
  sticky: 10,
  header: 20,
  sheet: 30,
  toast: 40,
  modal: 50,
} as const;

/** Layout constants shared by screens. */
export const layout = {
  screenPadding: spacing.xl,
  /**
   * Widest the app's content is ever laid out.
   *
   * This is a phone product. On a wide browser an unconstrained layout stretches
   * a bottom tab bar and a recipe card across 1400px, which is neither the
   * design nor a useful thing to review. Centring at a phone-ish width shows
   * the real proportions; native is unaffected because no phone is this wide.
   */
  contentMaxWidth: 480,
  cardGap: spacing.lg,
  maxContentWidth: 640,
  tabBarHeight: 60,
  heroImageAspect: 4 / 3,
  cardImageAspect: 16 / 10,
} as const;
