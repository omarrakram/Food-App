import { useState } from 'react';
import { LayoutAnimation, Platform, UIManager, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressScale } from './press-scale';
import { Text } from './text';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: ViewStyle;
  testID?: string;
};

/**
 * iOS-style segmented control. Used for the Saved tab switcher and appearance
 * / language pickers — anywhere with 2–4 mutually exclusive choices.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const [, forceRender] = useState(0);

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          padding: 3,
          gap: 3,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceAlt,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <PressScale
            key={option.value}
            // Per-segment so a test can actually switch tabs. The container
            // testID alone only proves the control rendered.
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              forceRender((n) => n + 1);
              onChange(option.value);
            }}
            haptic="selection"
            scaleTo={0.96}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.sm,
              backgroundColor: isSelected ? theme.colors.surface : 'transparent',
              borderWidth: 1,
              borderColor: isSelected ? theme.colors.border : 'transparent',
            }}
          >
            <Text
              variant="subhead"
              color={isSelected ? 'text' : 'textSecondary'}
              lines={1}
            >
              {option.label}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}
