import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import {
  Platform,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
  type TextInput as RNTextInput,
} from 'react-native';

import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { Text } from './text';

/**
 * react-native-web renders `TextInput` as a DOM `<input>`, which draws the
 * browser's own focus ring inside the border this component already colours on
 * focus — two rings, one field. `outlineStyle` is a web-only style that RN's
 * types do not model, hence the cast; on native this is null and costs
 * nothing.
 */
const WEB_FOCUS_RING_RESET =
  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;

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
  /**
   * Grow with the text, between these bounds, then scroll inside.
   *
   * For a chat composer. A `multiline` TextInput on web is a `<textarea>`, and
   * react-native-web sets its `rows` from `numberOfLines` — which is undefined
   * here, so the browser applies its own default of 2 and the field opens
   * roughly twice as tall as the one line most messages need. Setting this
   * pins it to one row and measures the content instead.
   */
  autoGrow?: { min: number; max: number };
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
    autoGrow,
    onFocus,
    onBlur,
    onContentSizeChange,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const [isFocused, setIsFocused] = useState(false);
  const [grownHeight, setGrownHeight] = useState<number | null>(null);

  // Clamped on the way in, so the field can never be shorter than one line or
  // taller than the ceiling — past which it scrolls rather than pushing the
  // Send button off the screen.
  const measuredHeight =
    autoGrow && grownHeight !== null
      ? Math.min(Math.max(grownHeight, autoGrow.min), autoGrow.max)
      : null;

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
          minHeight: autoGrow ? autoGrow.min : 52,
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
          {...(autoGrow ? { rows: 1, scrollEnabled: measuredHeight === autoGrow.max } : null)}
          onContentSizeChange={(event) => {
            if (autoGrow) setGrownHeight(event.nativeEvent.contentSize.height);
            onContentSizeChange?.(event);
          }}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          style={[
            {
              flex: 1,
              paddingVertical: theme.spacing.md,
              ...(measuredHeight !== null ? { height: measuredHeight } : null),
              fontSize: theme.typography.body.fontSize,
              lineHeight: theme.typography.body.lineHeight,
              color: theme.colors.text,
              textAlign: isRTL ? 'right' : 'left',
            },
            WEB_FOCUS_RING_RESET,
          ]}
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
