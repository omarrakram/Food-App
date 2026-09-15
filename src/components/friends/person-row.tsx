import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { ListRow } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
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

/** An action that lives behind ••• rather than on the row. */
export type PersonOverflowAction = {
  labelKey: TranslationKey;
  onPress: () => void;
  icon?: Parameters<typeof ListRow>[0]['icon'];
  destructive?: boolean;
  testID?: string;
};

/**
 * One person, wherever they appear.
 *
 * Search results, friends, incoming requests and sent requests are the same
 * row with different buttons, so they are one component: four near-identical
 * lists is how "Accept" ends up on a row that should offer "Cancel".
 *
 * INLINE vs OVERFLOW. A friend row used to carry Message, Unfriend and Block
 * side by side, which is three problems at once: the row had no primary action
 * because everything looked equally weighted, the two destructive ones sat a
 * thumb's width from the one people actually want, and at 320px the name had
 * nowhere left to go. `actions` is what the row is FOR; `overflow` is
 * everything else, one tap further away, where a mis-tap costs a sheet rather
 * than a friendship.
 */
export function PersonRow({
  person,
  subtitle,
  actions = [],
  overflow = [],
  testID,
}: {
  person: PublicProfile;
  subtitle?: string;
  actions?: PersonAction[];
  overflow?: PersonOverflowAction[];
  testID?: string;
}) {
  const theme = useTheme();
  const { t, isRTL } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

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

      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
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

        {overflow.length > 0 ? (
          <IconButton
            icon="ellipsis-horizontal"
            size={34}
            variant="ghost"
            onPress={() => setMenuOpen(true)}
            accessibilityLabel={t('common.moreActions', { name })}
            testID={testID ? `${testID}-more` : 'person-more'}
          />
        ) : null}
      </View>

      {overflow.length > 0 ? (
        <Sheet
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={name}
          scrollable={false}
          testID={testID ? `${testID}-menu` : 'person-menu'}
        >
          <View>
            {overflow.map((action) => (
              <ListRow
                key={String(action.labelKey)}
                title={t(action.labelKey)}
                icon={action.icon}
                destructive={action.destructive}
                onPress={() => {
                  // Close FIRST. The destructive ones open a confirm dialog,
                  // and a confirm behind a sheet that is still animating shut
                  // is a dialog nobody can reach.
                  setMenuOpen(false);
                  action.onPress();
                }}
                testID={action.testID}
              />
            ))}
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
