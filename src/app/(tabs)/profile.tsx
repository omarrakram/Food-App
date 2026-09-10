import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useShoppingList } from '@/features/shopping/hooks';
import { useI18n } from '@/i18n';
import { env } from '@/lib/config/env';
import { useTheme } from '@/theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();
  const shoppingList = useShoppingList();

  const uncheckedCount = (shoppingList.data ?? []).filter((item) => !item.isChecked).length;
  const initials = (preferences.displayName ?? t('profile.guest')).trim().charAt(0).toUpperCase();

  return (
    <ScreenScroll bottomInset={theme.layout.tabBarHeight} contentGap={theme.spacing.xl}>
      <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingTop: theme.spacing.xl }}>
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="title1" color="primarySoftText">
            {initials}
          </Text>
        </View>
        <Text variant="title2">{preferences.displayName ?? t('profile.guest')}</Text>
        {preferences.city ? (
          <Text variant="footnote" color="textSecondary">
            {preferences.city}
          </Text>
        ) : null}
      </View>

      <ListGroup>
        <ListRow
          title={t('profile.preferences')}
          subtitle={t('profile.preferencesSub')}
          icon="restaurant-outline"
          iconTone="primary"
          onPress={() => router.push('/settings/preferences')}
          testID="profile-preferences"
        />
        <ListRow
          title={t('profile.household')}
          subtitle={t('profile.householdSub')}
          icon="people-outline"
          value={t('common.people', { count: preferences.householdSize })}
          onPress={() => router.push('/settings/household')}
        />
        <ListRow
          title={t('profile.kitchen')}
          subtitle={t('profile.kitchenSub')}
          icon="flame-outline"
          onPress={() => router.push('/settings/kitchen')}
        />
      </ListGroup>

      <ListGroup>
        <ListRow
          title={t('profile.shoppingList')}
          icon="cart-outline"
          value={uncheckedCount > 0 ? t('common.items', { count: uncheckedCount }) : undefined}
          onPress={() => router.push('/shopping-list')}
          testID="profile-shopping"
        />
        <ListRow
          title={t('profile.appearance')}
          icon="contrast-outline"
          onPress={() => router.push('/settings/appearance')}
          testID="profile-appearance"
        />
        <ListRow
          title={t('profile.language')}
          icon="language-outline"
          onPress={() => router.push('/settings/language')}
        />
      </ListGroup>

      <ListGroup>
        <ListRow
          title={t('profile.account')}
          icon="person-outline"
          onPress={() => router.push('/settings/account')}
          testID="profile-account"
        />
        <ListRow
          title={t('profile.privacy')}
          icon="shield-checkmark-outline"
          onPress={() => router.push('/settings/privacy')}
        />
      </ListGroup>

      <Text variant="footnote" color="textTertiary" align="center">
        {t('profile.version', { version: env.appVersion })}
      </Text>
    </ScreenScroll>
  );
}
