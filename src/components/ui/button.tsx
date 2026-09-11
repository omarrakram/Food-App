import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { Text, type TextColor } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'leading' | 'trailing';
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the width of the parent. Default true for `lg`. */
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
};

const SIZES: Record<ButtonSize, { height: number; paddingH: number; gap: number; icon: number }> = {
  sm: { height: 36, paddingH: 14, gap: 6, icon: 16 },
  md: { height: 48, paddingH: 20, gap: 8, icon: 18 },
  lg: { height: 56, paddingH: 24, gap: 10, icon: 20 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'leading',
  loading = false,
  disabled = false,
  fullWidth,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();
  const dims = SIZES[size];
  const isDisabled = disabled || loading;
  const stretch = fullWidth ?? size === 'lg';

  const surface: Record<ButtonVariant, { bg: string; border: string; fg: TextColor }> = {
    primary: { bg: theme.colors.primary, border: 'transparent', fg: 'textOnPrimary' },
    secondary: { bg: theme.colors.surfaceAlt, border: theme.colors.border, fg: 'text' },
    ghost: { bg: 'transparent', border: 'transparent', fg: 'primary' },
    danger: { bg: theme.colors.danger, border: 'transparent', fg: 'textOnPrimary' },
    success: { bg: theme.colors.success, border: 'transparent', fg: 'textOnPrimary' },
  };
  const { bg, border, fg } = surface[variant];
  const foreground = theme.colors[fg];

  const iconNode = icon ? (
    <Ionicons name={icon} size={dims.icon} color={foreground} />
  ) : null;

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      haptic={variant === 'ghost' ? 'selection' : 'light'}
      scaleTo={0.97}
      disabledOpacity={0.45}
      style={[
        {
          minHeight: dims.height,
          paddingHorizontal: dims.paddingH,
          borderRadius: theme.radius.pill,
          backgroundColor: bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: stretch ? 'stretch' : 'flex-start',
          ...(variant === 'primary' || variant === 'danger' ? theme.elevation(1) : {}),
        },
        style as ViewStyle,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: dims.gap,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : (
          <>
            {iconPosition === 'leading' ? iconNode : null}
            <Text
              variant={size === 'sm' ? 'subhead' : 'bodyMedium'}
              color={fg}
              style={{ fontWeight: '700' }}
            >
              {label}
            </Text>
            {iconPosition === 'trailing' ? iconNode : null}
          </>
        )}
      </View>
    </PressScale>
  );
}

/** Circular icon-only button, used for back arrows, close, favourites. */
export function IconButton({
  icon,
  onPress,
  size = 40,
  variant = 'secondary',
  accessibilityLabel,
  active = false,
  disabled = false,
  style,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  variant?: 'secondary' | 'ghost' | 'onImage';
  accessibilityLabel: string;
  active?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}) {
  const theme = useTheme();

  const backgrounds: Record<typeof variant, string> = {
    secondary: theme.colors.surfaceAlt,
    ghost: 'transparent',
    onImage: 'rgba(0,0,0,0.42)',
  };
  const foreground = active
    ? theme.colors.primary
    : variant === 'onImage'
      ? '#FFFFFF'
      : theme.colors.text;

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      haptic="light"
      scaleTo={0.9}
      disabledOpacity={0.4}
      // Expand the touch target to 44pt without growing the visual circle.
      hitSlop={Math.max(0, (theme.hitSize.min - size) / 2)}
      style={[
        {
          width: size,
          height: size,
          borderRadius: theme.radius.pill,
          backgroundColor: backgrounds[variant],
          alignItems: 'center',
          justifyContent: 'center',
        },
        style as ViewStyle,
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={foreground} />
    </PressScale>
  );
}
