import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { Text } from './text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Shows an X on the right; fires `onRemove` instead of `onPress`. */
  onRemove?: () => void;
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
  onPress,
  onRemove,
  icon,
  size = 'md',
  disabled = false,
  tone = 'neutral',
  style,
  testID,
}: ChipProps) {
  const theme = useTheme();
  const height = size === 'sm' ? 32 : 40;
  const paddingH = size === 'sm' ? theme.spacing.md : theme.spacing.lg;

  const toneColors = {
    neutral: { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftText },
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftText },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successSoftText },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningSoftText },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.dangerSoftText },
  }[tone];

  const background = selected ? toneColors.bg : theme.colors.surface;
  const foreground = selected ? toneColors.fg : theme.colors.textSecondary;
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
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled || (!onPress && !onRemove)}
      onPress={onRemove ?? onPress}
      haptic="selection"
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
