import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useI18n, type TranslationKey } from '@/i18n';
import { useTheme } from '@/theme';
import type { PublicProfile } from '@/types/domain';

export type PersonAction = {
  labelKey: TranslationKey;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  testID?: string;
};

/**
 * One person, wherever they appear.
 *
 * Search results, friends, incoming requests and sent requests are the same
 * row with different buttons, so they are one component: four near-identical
 * lists is how "Accept" ends up on a row that should offer "Cancel".
 */
export function PersonRow({
  person,
  subtitle,
  actions = [],
  testID,
}: {
  person: PublicProfile;
  subtitle?: string;
  actions?: PersonAction[];
  testID?: string;
}) {
  const theme = useTheme();
  const { t, isRTL } = useI18n();

  const name = person.displayName ?? person.username ?? '';

  return (
    <View
      testID={testID}
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Avatar url={person.avatarUrl} fallback={name} size={44} />

      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="callout" lines={1}>
          {name}
        </Text>
        {person.username ? (
          <Text variant="footnote" color="textSecondary" lines={1}>
            @{person.username}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="micro" color="textTertiary" lines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: theme.spacing.xs }}>
        {actions.map((action) => (
          <Button
            key={String(action.labelKey)}
            label={t(action.labelKey)}
            variant={action.variant ?? 'secondary'}
            size="sm"
            loading={action.loading}
            onPress={action.onPress}
            testID={action.testID}
          />
        ))}
      </View>
    </View>
  );
}
