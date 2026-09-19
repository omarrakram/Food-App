import { useEffect } from 'react';
import { View, type ViewStyle, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

/**
 * Pulsing placeholder block.
 *
 * We use opacity rather than a translating gradient: it is one animated node
 * instead of a masked gradient per block, which keeps long skeleton lists at
 * 60fps on the low-end Android devices common in the launch market.
 */
export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  const theme = useTheme();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.set(
      withRepeat(
        withTiming(1, { duration: theme.duration.shimmer, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [pulse, theme.duration.shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.sm,
          backgroundColor: theme.colors.skeleton,
        },
        style,
        animatedStyle,
      ]}
    />
  );
}

/** Skeleton shaped like a `RecipeCard`, so loading and loaded states align. */
export function RecipeCardSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        ...theme.elevation(1),
      }}
    >
      <Skeleton height={180} radius={0} />
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <Skeleton width="72%" height={20} />
        <Skeleton width="90%" height={14} />
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          <Skeleton width={64} height={22} radius={theme.radius.sm} />
          <Skeleton width={78} height={22} radius={theme.radius.sm} />
          <Skeleton width={58} height={22} radius={theme.radius.sm} />
        </View>
      </View>
    </View>
  );
}

/** Skeleton for compact list rows (pantry, shopping list). */
export function ListRowSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
      }}
    >
      <Skeleton width={44} height={44} radius={theme.radius.md} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="55%" height={15} />
        <Skeleton width="32%" height={12} />
      </View>
    </View>
  );
}

export function SkeletonList({
  count = 3,
  variant = 'card',
}: {
  count?: number;
  variant?: 'card' | 'row';
}) {
  const theme = useTheme();
  const Item = variant === 'card' ? RecipeCardSkeleton : ListRowSkeleton;
  return (
    <View style={{ gap: variant === 'card' ? theme.spacing.lg : 0 }}>
      {Array.from({ length: count }, (_, index) => (
        <Item key={index} />
      ))}
    </View>
  );
}
