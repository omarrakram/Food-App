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
 * The app's primary content surface. Rounded, softly elevated, and pressable
 * when `onPress` is supplied.
 */
export function Card({
  children,
  onPress,
  elevation = 1,
  padded = true,
  clip = false,
  style,
  testID,
  accessibilityLabel,
}: CardProps) {
  const theme = useTheme();

  const baseStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: padded ? theme.spacing.lg : 0,
    borderWidth: elevation === 0 ? 1 : 0,
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
