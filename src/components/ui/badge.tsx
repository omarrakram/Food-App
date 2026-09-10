import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  testID?: string;
};

/**
 * Non-interactive status pill: match percentage, "Estimated", allergen
 * warnings, difficulty. Read-only counterpart to {@link Chip}.
 */
export function Badge({ label, tone = 'neutral', icon, size = 'sm', style, testID }: BadgeProps) {
  const theme = useTheme();

  const tones: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceAlt, fg: theme.colors.textSecondary },
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftText },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successSoftText },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningSoftText },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.dangerSoftText },
    info: { bg: theme.colors.infoSoft, fg: theme.colors.infoSoftText },
  };
  const { bg, fg } = tones[tone];

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          alignSelf: 'flex-start',
          backgroundColor: bg,
          paddingHorizontal: size === 'sm' ? theme.spacing.sm : theme.spacing.md,
          paddingVertical: size === 'sm' ? 3 : 6,
          borderRadius: theme.radius.pill,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 12 : 14} color={fg} /> : null}
      <Text variant={size === 'sm' ? 'micro' : 'caption'} style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
