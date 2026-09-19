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
  /* `role` names the real font weight each variant resolves to — see
     `typography.ts`. React Native cannot pick a weight out of a family the way
     CSS can, so the role is what the Text primitive turns into a concrete
     `fontFamily`; `fontWeight` is kept only as the fallback for the frames
     before the font finishes loading.

     Tracking is Latin-only and is dropped in Arabic, whose letters join:
     negative tracking pulls joined forms into one another. */
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.7, role: 'display' },
  title1: { fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.5, role: 'display' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, role: 'heading' },
  title3: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2, role: 'heading' },
  headline: { fontSize: 16, lineHeight: 22, fontWeight: '700', letterSpacing: -0.1, role: 'heading' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', role: 'body' },
  bodyMedium: { fontSize: 16, lineHeight: 24, fontWeight: '600', role: 'subheading' },
  callout: { fontSize: 15, lineHeight: 22, fontWeight: '400', role: 'body' },
  subhead: { fontSize: 14, lineHeight: 20, fontWeight: '600', role: 'subheading' },
  footnote: { fontSize: 13, lineHeight: 19, fontWeight: '400', role: 'caption' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600', role: 'label' },
  /* Section eyebrows and metadata labels. Uppercase at call sites, where the
     wide tracking stops it reading as a shout. */
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.6, role: 'label' },
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
  /**
   * The shape a large card's plate takes when the recipe has no photograph.
   *
   * A photo earns 16:10 by being appetising; an equal height of pattern does
   * not, and it pushed the recipe's own name toward the fold on more than half
   * the catalogue. A band still carries the cuisine label and the brand motif
   * while letting the title, match and price sit higher.
   */
  cardFallbackAspect: 24 / 7,
} as const;
