import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { ROLE_FAMILY, arabicLineHeight, type TypeRole } from '@/theme/typography';
import type { TypographyVariant } from '@/theme/tokens';
import type { Palette } from '@/theme/palette';

/** Palette roles that make sense as text colours. */
export type TextColor = Extract<
  keyof Palette,
  | 'text'
  | 'textSecondary'
  | 'textTertiary'
  | 'textOnPrimary'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'primarySoftText'
  | 'successSoftText'
  | 'warningSoftText'
  | 'dangerSoftText'
  | 'infoSoftText'
>;

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  /** Shorthand for `numberOfLines` + tail ellipsis. */
  lines?: number;
};

/**
 * The only text primitive in the app.
 *
 * It does three things no call site should have to think about:
 *
 * 1. RESOLVES A REAL FONT FILE. Each variant names a semantic role, and the
 *    role maps to one concrete `fontFamily`. React Native will not select a
 *    weight from a family the way CSS does — with statically loaded fonts,
 *    `fontWeight` is ignored on Android and unreliable on iOS — so asking for
 *    weight 800 has to mean asking for the ExtraBold *file*.
 *
 * 2. SETS ARABIC LINE HEIGHT FROM THE SCRIPT, NOT THE STRING. Alexandria's ink
 *    travels to 1.732 em once Arabic descenders and stacked marks are involved,
 *    against a 1.219 em typographic box, and this app's Arabic copy really does
 *    carry shadda and fathatan. Latin-tuned leading does not clip one line, but
 *    it makes wrapped Arabic lines collide. See `typography.ts` for the
 *    measurements and for the one place the table deliberately trades ink
 *    safety for a headline that still reads as a headline.
 *
 * 3. DROPS LATIN TRACKING IN ARABIC. Negative tracking tightens Latin display
 *    type and damages Arabic, whose letters join: pulling joined forms together
 *    degrades the connection.
 */
export function Text({
  variant = 'body',
  color = 'text',
  align,
  lines,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const scale = theme.typography[variant];
  const isArabic = isRTL;

  const letterSpacing = 'letterSpacing' in scale ? scale.letterSpacing : undefined;

  return (
    <RNText
      numberOfLines={lines}
      style={[
        {
          fontFamily: ROLE_FAMILY[scale.role as TypeRole],
          fontSize: scale.fontSize,
          lineHeight: isArabic
            ? arabicLineHeight(variant, scale.fontSize, scale.lineHeight)
            : scale.lineHeight,
          // Kept as the fallback for the frames before the font loads, and for
          // the case where loading fails outright and the system face is used.
          fontWeight: scale.fontWeight as TextStyle['fontWeight'],
          letterSpacing: isArabic ? 0 : letterSpacing,
          color: theme.colors[color],
          textAlign: align,
        },
        style,
      ]}
      {...rest}
    />
  );
}
