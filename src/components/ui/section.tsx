import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { useGlyph } from './direction';
import { PressScale } from './press-scale';
import { hitSlopFor } from './touch-target';
import { Text } from './text';

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
};

export function SectionHeader({ title, subtitle, action, style }: SectionHeaderProps) {
  const theme = useTheme();
  const glyph = useGlyph('chevron-forward', 'chevron-back');

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title3">{title}</Text>
        {subtitle ? (
          <Text variant="footnote" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action ? (
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          /*
            Measured at 20×64 on Home, which `hitSlop={8}` lifted to 36 — still
            under the 44 the rest of the app holds itself to. `hitSlopFor` is
            that single definition, and taking the height from the type scale
            rather than typing 20 here means the target follows the text if the
            variant ever changes.

            It stays a plain text link visually. That is the point of hitSlop:
            a row of 44px pills would be a wall of buttons, and a "See all"
            beside a section title should read as a word, not a control.
          */
          hitSlop={hitSlopFor(theme.typography.subhead.lineHeight)}
          scaleTo={0.94}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <Text variant="subhead" color="primary">
            {action.label}
          </Text>
          <Ionicons name={glyph} size={15} color={theme.colors.primary} />
        </PressScale>
      ) : null}
    </View>
  );
}

export function Section({
  title,
  subtitle,
  action,
  children,
  style,
}: SectionHeaderProps & { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[{ gap: theme.spacing.md }, style]}>
      <SectionHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </View>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View style={[{ height: 1, backgroundColor: theme.colors.border, width: '100%' }, style]} />
  );
}
