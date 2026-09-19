import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressScale } from './press-scale';

export type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  /** 0 = flat with a hairline border, 1–3 = increasing shadow. */
  elevation?: 0 | 1 | 2 | 3;
  padded?: boolean;
  /** Clip children to the card's radius — needed when a hero image is inside. */
  clip?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
};

/**
 * The app's primary content surface.
 *
 * Border-first, not shadow-first. A hairline and a background step separate a
 * card from the page more honestly than a drop shadow does, and a screen of
 * bordered cards reads as a product while a screen of floating ones reads as a
 * concept render. `elevation` is therefore 0 by default and should stay there
 * for anything that sits IN the page; raise it only for things that genuinely
 * sit above it.
 */
export function Card({
  children,
  onPress,
  elevation = 0,
  padded = true,
  clip = false,
  style,
  testID,
  accessibilityLabel,
}: CardProps) {
  const theme = useTheme();

  const baseStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: padded ? theme.spacing.lg : 0,
    // The border stays at every elevation. It is what gives the card an edge
    // in dark mode, where a shadow on a dark surface is invisible.
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: clip ? 'hidden' : 'visible',
    ...theme.elevation(elevation),
  };

  if (!onPress) {
    return (
      <View testID={testID} style={[baseStyle, style]}>
        {children}
      </View>
    );
  }

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      haptic="light"
      scaleTo={0.985}
      style={[baseStyle, style as ViewStyle]}
    >
      {children}
    </PressScale>
  );
}
