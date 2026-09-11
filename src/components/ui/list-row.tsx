import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Switch, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { RowChevron } from './screen';
import { Text } from './text';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: 'neutral' | 'primary' | 'danger' | 'success' | 'warning';
  /** Right-hand content. Ignored when `showChevron` or `toggle` is used. */
  right?: ReactNode;
  value?: string;
  onPress?: () => void;
  showChevron?: boolean;
  toggle?: { value: boolean; onChange: (next: boolean) => void };
  destructive?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/** Settings-style row. The building block of Profile and all preference screens. */
export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'neutral',
  right,
  value,
  onPress,
  showChevron,
  toggle,
  destructive = false,
  disabled = false,
  style,
  testID,
}: ListRowProps) {
  const theme = useTheme();

  const tones = {
    neutral: { bg: theme.colors.surfaceAlt, fg: theme.colors.textSecondary },
    primary: { bg: theme.colors.primarySoft, fg: theme.colors.primarySoftText },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successSoftText },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningSoftText },
  }[destructive ? 'danger' : iconTone];

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: 56,
        paddingVertical: theme.spacing.sm,
      }}
    >
      {icon ? (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: theme.radius.md,
            backgroundColor: tones.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={19} color={tones.fg} />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium" color={destructive ? 'danger' : 'text'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="textSecondary" lines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          disabled={disabled}
          accessibilityLabel={title}
          trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
          thumbColor="#FFFFFF"
        />
      ) : (
        <>
          {value ? (
            <Text variant="callout" color="textTertiary" lines={1} style={{ maxWidth: 140 }}>
              {value}
            </Text>
          ) : null}
          {right}
          {showChevron ?? (!!onPress && !right) ? <RowChevron /> : null}
        </>
      )}
    </View>
  );

  if (!onPress || toggle) {
    // Not pressable, so PressScale is not involved and cannot apply the
    // disabled dim — do it here instead.
    return (
      <View testID={testID} style={[{ opacity: disabled ? 0.45 : 1 }, style]}>
        {content}
      </View>
    );
  }

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic="selection"
      scaleTo={0.99}
      disabledOpacity={0.45}
      style={style as ViewStyle}
    >
      {content}
    </PressScale>
  );
}

/** Groups rows onto one card surface with hairline separators between them. */
export function ListGroup({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          paddingHorizontal: theme.spacing.lg,
          ...theme.elevation(1),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
