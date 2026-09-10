import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { Text } from './text';

export type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Rendered after the number, e.g. "servings". */
  suffix?: string;
  accessibilityLabel: string;
  style?: ViewStyle;
  testID?: string;
};

/** Numeric +/- control used for servings and pantry quantities. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  suffix,
  accessibilityLabel,
  style,
  testID,
}: StepperProps) {
  const theme = useTheme();
  const canDecrement = value - step >= min;
  const canIncrement = value + step <= max;

  const button = (
    icon: 'remove' | 'add',
    enabled: boolean,
    onPress: () => void,
    label: string,
  ) => (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      haptic="selection"
      scaleTo={0.88}
      style={{
        width: 36,
        height: 36,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        opacity: enabled ? 1 : 0.35,
      }}
    >
      <Ionicons name={icon} size={18} color={theme.colors.text} />
    </PressScale>
  );

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${accessibilityLabel}: ${value}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: 4,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surfaceAlt,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      {button('remove', canDecrement, () => onChange(value - step), `${accessibilityLabel} minus`)}
      <View style={{ minWidth: suffix ? 72 : 32, alignItems: 'center' }}>
        <Text variant="bodyMedium">{suffix ? `${value} ${suffix}` : value}</Text>
      </View>
      {button('add', canIncrement, () => onChange(value + step), `${accessibilityLabel} plus`)}
    </View>
  );
}
