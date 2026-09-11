import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { Text } from './text';
import { hitSlopFor } from './touch-target';

export type ChipProps = {
  label: string;
  selected?: boolean;
  /**
   * How loudly a selected chip announces itself.
   *
   * `soft` is the default tint, right for a filter among filters. `solid`
   * fills the pill with the brand colour, for the places where "I have picked
   * this" has to be readable at a glance against a screen full of unselected
   * pills that also look like pills.
   */
  emphasis?: 'soft' | 'solid';
  onPress?: () => void;
  /** Shows an X on the right; fires `onRemove` instead of `onPress`. */
  onRemove?: () => void;
  /** Overrides the label for screen readers, e.g. "remove tomatoes". */
  accessibilityLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md';
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
  style?: ViewStyle;
  testID?: string;
};

/**
 * Selectable pill. Used for filters, dietary options, ingredient tokens and
 * pantry categories — anywhere the user picks from a small set.
 */
export function Chip({
  label,
  selected = false,
  emphasis = 'soft',
  onPress,
  onRemove,
  accessibilityLabel,
  icon,
  size = 'md',
  disabled = false,
  tone = 'neutral',
  style,
  testID,
}: ChipProps) {
  const theme = useTheme();
  const height = size === 'sm' ? 32 : 40;
  // The pill stays small; the thumb target does not. See touch-target.ts.
  const hitSlop = hitSlopFor(height);
  const paddingH = size === 'sm' ? theme.spacing.md : theme.spacing.lg;

  const toneColors = {
    neutral: { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftText },
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftText },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successSoftText },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningSoftText },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.dangerSoftText },
  }[tone];

  // `primaryStrong` rather than `primary`: the brand colour is too light to
  // put a label on and clear 4.5:1. See palette.ts.
  const isSolid = selected && emphasis === 'solid';
  const background = isSolid
    ? theme.colors.primaryStrong
    : selected
      ? toneColors.bg
      : theme.colors.surface;
  const foreground = isSolid
    ? theme.colors.textOnPrimary
    : selected
      ? toneColors.fg
      : theme.colors.textSecondary;
  const borderColor = selected ? 'transparent' : theme.colors.border;

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 14 : 16} color={foreground} /> : null}
      <Text
        variant={size === 'sm' ? 'caption' : 'subhead'}
        style={{ color: foreground }}
        lines={1}
      >
        {label}
      </Text>
      {onRemove ? (
        <Ionicons name="close" size={size === 'sm' ? 14 : 16} color={foreground} />
      ) : null}
    </View>
  );

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled || (!onPress && !onRemove)}
      onPress={onRemove ?? onPress}
      haptic="selection"
      hitSlop={hitSlop}
      scaleTo={0.94}
      disabledOpacity={0.45}
      style={[
        {
          height,
          paddingHorizontal: paddingH,
          borderRadius: theme.radius.pill,
          backgroundColor: background,
          borderWidth: selected ? 0 : 1,
          borderColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style as ViewStyle,
      ]}
    >
      {content}
    </PressScale>
  );
}
