import * as Haptics from 'expo-haptics';
import { Platform, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressScaleProps = PressableProps & {
  /** How far to shrink on press. 1 = no scale. */
  scaleTo?: number;
  /** Dim the element while pressed, on top of the scale. */
  dimTo?: number;
  /**
   * Opacity applied while `disabled`.
   *
   * This lives here rather than in each caller's style because the animated
   * style is applied LAST in the style array, so an `opacity` set by a caller
   * is silently overridden. Composing it into the same animated value is the
   * only way a disabled control actually looks disabled.
   */
  disabledOpacity?: number;
  haptic?: 'none' | 'light' | 'medium' | 'selection';
  style?: ViewStyle | ViewStyle[];
};

/**
 * A Pressable with the app's standard press feedback: a subtle spring scale,
 * optional dim, and optional haptics. Used by every tappable surface so touch
 * response feels identical across the app.
 *
 * Handlers are intentionally NOT memoised: Reanimated shared values are stable
 * across renders, and wrapping the setters in `useCallback` would both add
 * noise and make the shared value a hook argument.
 */
export function PressScale({
  scaleTo = 0.97,
  dimTo = 1,
  disabledOpacity = 0.45,
  haptic = 'none',
  onPressIn,
  onPressOut,
  onPress,
  style,
  children,
  disabled,
  ...rest
}: PressScaleProps) {
  const theme = useTheme();
  const pressProgress = useSharedValue(0);

  /**
   * Honours "Reduce Motion".
   *
   * Someone who turns that on is usually telling the system that movement
   * makes them unwell. The press feedback stays — it just becomes a dim rather
   * than a scale, so the control still visibly responds without anything
   * moving.
   */
  const reduceMotion = useReducedMotion();
  const effectiveScaleTo = reduceMotion ? 1 : scaleTo;

  const animatedStyle = useAnimatedStyle(() => {
    const pressDim = 1 - pressProgress.get() * (1 - dimTo);
    return {
      transform: [{ scale: 1 - pressProgress.get() * (1 - effectiveScaleTo) }],
      opacity: (disabled ? disabledOpacity : 1) * pressDim,
    };
  });

  const handlePressIn: NonNullable<PressableProps['onPressIn']> = (event) => {
    pressProgress.set(withTiming(1, { duration: theme.duration.instant }));
    onPressIn?.(event);
  };

  const handlePressOut: NonNullable<PressableProps['onPressOut']> = (event) => {
    // A spring overshoots, which is the part reduced motion is asking us not
    // to do; a straight fade releases just as clearly.
    pressProgress.set(
      reduceMotion
        ? withTiming(0, { duration: theme.duration.instant })
        : withSpring(0, { damping: 18, stiffness: 260 }),
    );
    onPressOut?.(event);
  };

  const handlePress: NonNullable<PressableProps['onPress']> = (event) => {
    if (haptic !== 'none' && Platform.OS !== 'web') {
      // Haptics are a nicety; a failure here must never block the action.
      if (haptic === 'selection') void Haptics.selectionAsync().catch(() => {});
      else {
        void Haptics.impactAsync(
          haptic === 'light'
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Medium,
        ).catch(() => {});
      }
    }
    onPress?.(event);
  };

  return (
    <AnimatedPressable
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[style, animatedStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
