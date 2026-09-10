import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';
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
 * The only text primitive in the app. Using it everywhere guarantees the type
 * scale, colour roles and RTL text alignment stay consistent.
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
  const scale = theme.typography[variant];

  return (
    <RNText
      numberOfLines={lines}
      style={[
        {
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          fontWeight: scale.fontWeight as TextStyle['fontWeight'],
          color: theme.colors[color],
          textAlign: align,
        },
        style,
      ]}
      {...rest}
    />
  );
}
