import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './button';
import { Text } from './text';

export type StateAction = { label: string; onPress: () => void };

export type StateViewProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: StateAction;
  secondaryAction?: StateAction;
  tone?: 'neutral' | 'danger' | 'warning';
  /** Fill the parent and centre vertically. Off inside scroll sections. */
  fullHeight?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Shared shell for every empty / error / offline state in the app so they all
 * look and behave identically. Prefer the named wrappers below.
 */
export function StateView({
  icon,
  title,
  body,
  action,
  secondaryAction,
  tone = 'neutral',
  fullHeight = false,
  style,
  testID,
}: StateViewProps) {
  const theme = useTheme();

  const tones = {
    neutral: { bg: theme.colors.surfaceAlt, fg: theme.colors.textTertiary },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warning },
  }[tone];

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={body ? `${title}. ${body}` : title}
      style={[
        {
          flex: fullHeight ? 1 : undefined,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: theme.spacing.huge,
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.md,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 76,
          height: 76,
          borderRadius: theme.radius.pill,
          backgroundColor: tones.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={34} color={tones.fg} />
      </View>

      <Text variant="title3" align="center">
        {title}
      </Text>

      {body ? (
        <Text variant="callout" color="textSecondary" align="center" style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}

      {action || secondaryAction ? (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.sm, alignItems: 'center' }}>
          {action ? <Button label={action.label} onPress={action.onPress} size="md" /> : null}
          {secondaryAction ? (
            <Button
              label={secondaryAction.label}
              onPress={secondaryAction.onPress}
              variant="ghost"
              size="sm"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function EmptyState(props: Omit<StateViewProps, 'tone'>) {
  return <StateView tone="neutral" {...props} />;
}

export function ErrorState(props: Omit<StateViewProps, 'tone' | 'icon'> & { icon?: StateViewProps['icon'] }) {
  return <StateView tone="danger" icon={props.icon ?? 'cloud-offline-outline'} {...props} />;
}
