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

/** Generous, rounded radii — the app should feel soft and food-forward. */
export const radius = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  xxl: 32,
  pill: 999,
} as const;

export type RadiusKey = keyof typeof radius;

/**
 * Type scale. `lineHeight` is absolute (not a multiplier) because React Native
 * treats numeric lineHeight as points, and Arabic glyphs need the extra room
 * that these values already allow for.
 */
export const typography = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '800' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 19, lineHeight: 25, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyMedium: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
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
