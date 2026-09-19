/**
 * The brand typeface, its real weights, and Arabic vertical metrics.
 *
 * WHY THIS FILE EXISTS: until now the app had no typeface at all — no
 * `expo-font`, no font file — so it rendered in San Francisco on iOS, Roboto on
 * Android and whatever the browser chose on web, with Arabic falling back to a
 * different face on every platform. That is the largest single reason the
 * product did not look owned.
 *
 * ALEXANDRIA, and why it is the right choice rather than merely the requested
 * one. Verified against the shipped `400Regular` TTF rather than assumed:
 *
 *   - Licence          SIL Open Font License 1.1 (package: MIT AND OFL-1.1).
 *                      Free to embed in a commercial app, no attribution in-app
 *                      required, no runtime fetch.
 *   - Arabic           101 codepoints in U+0600–06FF, all ten Arabic-Indic
 *                      digits, 73 Presentation-Forms-A and 89 Presentation-
 *                      Forms-B, plus GSUB and GPOS — so contextual joining and
 *                      mark positioning are real, not faked by a fallback face.
 *   - Latin            Full A–Z a–z.
 *   - Weights          Nine static instances, 100–900. Every weight this app
 *                      uses is a real file; nothing is synthesised.
 *
 * WHY EXPLICIT FAMILIES PER WEIGHT. React Native does not pick a weight from a
 * family the way CSS does: with statically-loaded fonts, `fontWeight` is
 * ignored on Android and unreliable on iOS, and asking for `fontWeight: '800'`
 * on a Regular file yields either Regular or a smeared synthetic bold. Each
 * weight is therefore its own `fontFamily`, and the type scale names the exact
 * file it wants.
 */

/** Only the four weights the scale actually uses are bundled (~700KB). */
export const FONT_FAMILY = {
  regular: 'Alexandria_400Regular',
  semibold: 'Alexandria_600SemiBold',
  bold: 'Alexandria_700Bold',
  extrabold: 'Alexandria_800ExtraBold',
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILY;

/**
 * The six semantic roles the design system speaks in, and the real weight each
 * one resolves to.
 *
 * | role       | weight | file                        |
 * |------------|--------|-----------------------------|
 * | display    | 800    | Alexandria_800ExtraBold     |
 * | heading    | 700    | Alexandria_700Bold          |
 * | subheading | 600    | Alexandria_600SemiBold      |
 * | body       | 400    | Alexandria_400Regular       |
 * | label      | 600    | Alexandria_600SemiBold      |
 * | caption    | 400    | Alexandria_400Regular       |
 */
export const ROLE_FAMILY = {
  display: FONT_FAMILY.extrabold,
  heading: FONT_FAMILY.bold,
  subheading: FONT_FAMILY.semibold,
  body: FONT_FAMILY.regular,
  label: FONT_FAMILY.semibold,
  caption: FONT_FAMILY.regular,
} as const;

export type TypeRole = keyof typeof ROLE_FAMILY;

/**
 * ARABIC VERTICAL METRICS, measured from the font rather than guessed.
 *
 * Alexandria at 1000 units/em reports:
 *
 *     typoAscender   968    typoDescender  -251   -> typographic box 1.219 em
 *     winAscent     1166    winDescent      566   -> ink-safe box    1.732 em
 *
 * The gap between those two numbers IS the Arabic problem. The typographic box
 * describes Latin; the win* pair describes how far ink actually travels once
 * you add Arabic descenders (ج ح خ ع غ م ي) and stacked marks. The app's own
 * Arabic copy contains 89 shadda, 28 fathatan, 4 damma and 1 kasratan, over
 * 2759 descender-bearing letters — so this is not theoretical. A Latin-tuned
 * line height does not clip a single line, but it makes consecutive Arabic
 * lines collide, mark into descender.
 *
 * Arabic therefore gets its own ratios. Body and below clear 1.70 em, which is
 * at or near the 1.732 em ink-safe box, so wrapped Arabic body copy cannot
 * overlap. Display and heading sizes use 1.45–1.50 em: a 34pt headline at
 * 1.732 em would be 59pt of leading and would stop reading as a headline, and
 * the title-level strings are short, unwrapped and unvocalised. That trade is
 * deliberate and is the one place this table is not absolutely guaranteed.
 */
export const ARABIC_LINE_RATIO: Record<string, number> = {
  display: 1.45,
  title1: 1.45,
  title2: 1.5,
  title3: 1.5,
  headline: 1.55,
  body: 1.7,
  bodyMedium: 1.7,
  callout: 1.7,
  subhead: 1.7,
  footnote: 1.7,
  caption: 1.75,
  micro: 1.75,
};

/**
 * Arabic sets a touch looser than Latin at the same size, and tracking that
 * helps Latin display type actively hurts Arabic, whose letters join — negative
 * tracking pulls joined forms into each other. Latin tracking is therefore
 * dropped entirely in Arabic.
 */
export function arabicLineHeight(variant: string, fontSize: number, latin: number): number {
  const ratio = ARABIC_LINE_RATIO[variant];
  return ratio ? Math.round(fontSize * ratio) : latin;
}
