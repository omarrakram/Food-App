import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
  type TextInput as RNTextInput,
} from 'react-native';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { Text } from './text';

export type InputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** Validation message. Presence switches the field into its error state. */
  error?: string | null;
  hint?: string;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  onTrailingIconPress?: () => void;
  /** Renders text to the right of the field, e.g. a currency code. */
  suffix?: string;
  containerStyle?: ViewStyle;
};

/**
 * Text field with label, error and icon affordances.
 *
 * Handles RTL automatically by flipping `textAlign` — RN does not do this for
 * `TextInput` reliably across platforms.
 */
export const Input = forwardRef<RNTextInput, InputProps>(function Input(
  {
    label,
    error,
    hint,
    leadingIcon,
    trailingIcon,
    onTrailingIconPress,
    suffix,
    containerStyle,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const [isFocused, setIsFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : isFocused
      ? theme.colors.primary
      : theme.colors.border;

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label ? (
        <Text variant="subhead" color="textSecondary">
          {label}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: 52,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: theme.colors.surface,
        }}
      >
        {leadingIcon ? (
          <Ionicons name={leadingIcon} size={18} color={theme.colors.textTertiary} />
        ) : null}

        <TextInput
          ref={ref}
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={label}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          style={{
            flex: 1,
            paddingVertical: theme.spacing.md,
            fontSize: theme.typography.body.fontSize,
            lineHeight: theme.typography.body.lineHeight,
            color: theme.colors.text,
            textAlign: isRTL ? 'right' : 'left',
          }}
          {...rest}
        />

        {suffix ? (
          <Text variant="subhead" color="textTertiary">
            {suffix}
          </Text>
        ) : null}

        {trailingIcon ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={trailingIcon}
            onPress={onTrailingIconPress}
            disabled={!onTrailingIconPress}
            hitSlop={8}
            scaleTo={0.9}
          >
            <Ionicons name={trailingIcon} size={18} color={theme.colors.textTertiary} />
          </PressScale>
        ) : null}
      </View>

      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="alert-circle" size={13} color={theme.colors.danger} />
          <Text variant="footnote" color="danger">
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="footnote" color="textTertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
