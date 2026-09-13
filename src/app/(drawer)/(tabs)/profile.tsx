import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useOwnProfile } from '@/features/profile/hooks';
import { useShoppingList } from '@/features/shopping/hooks';
import { useI18n } from '@/i18n';
import { env } from '@/lib/config/env';
import { useTheme } from '@/theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();
  const { user, isEnabled: authEnabled, signedOutReason, acknowledgeExpiry } = useAuth();
  const shoppingList = useShoppingList();
  const ownProfile = useOwnProfile();

  const uncheckedCount = (shoppingList.data ?? []).filter((item) => !item.isChecked).length;
  // The profile row is the authority on the display name once there is an
  // account; preferences hold the guest's copy.
  const name = ownProfile.data?.displayName ?? preferences.displayName ?? t('profile.guest');

  return (
    <ScreenScroll bottomInset={theme.layout.tabBarHeight} contentGap={theme.spacing.xl}>
      <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingTop: theme.spacing.xl }}>
        <Avatar url={ownProfile.data?.avatarUrl} fallback={name} size={76} testID="profile-avatar-view" />
        <Text variant="title2">{name}</Text>
        {ownProfile.data?.username ? (
          <Text variant="footnote" color="textSecondary">
            @{ownProfile.data.username}
          </Text>
        ) : null}
        {user?.email ? (
          <Text variant="footnote" color="textSecondary">
            {user.email}
          </Text>
        ) : preferences.city ? (
          <Text variant="footnote" color="textSecondary">
            {preferences.city}
          </Text>
        ) : null}
      </View>

      {authEnabled && !user ? (
        <View style={{ gap: theme.spacing.sm }}>
          {/*
            An expired session is not the same as being a guest, and saying
            "Sign in to sync" to someone who WAS signed in five minutes ago
            reads as though their account is gone. They are told what happened
            and their local data still works meanwhile.
          */}
          <Text variant="callout" color="textSecondary" align="center">
            {signedOutReason === 'expired'
              ? t('auth.error.sessionExpired')
              : t('profile.signInPrompt')}
          </Text>
          <Button
            label={signedOutReason === 'expired' ? t('auth.signInAgain') : t('auth.getStarted')}
            onPress={() => {
              acknowledgeExpiry();
              router.push(signedOutReason === 'expired' ? '/(auth)/sign-in' : '/(auth)/welcome');
            }}
            size="lg"
            testID="profile-sign-in"
          />
        </View>
      ) : null}

      <ListGroup>
        <ListRow
          title={t('profile.edit')}
          subtitle={t('profile.editSub')}
          icon="person-circle-outline"
          iconTone="primary"
          onPress={() => router.push('/settings/profile')}
          testID="profile-edit"
        />
      </ListGroup>

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
          title={t('basics.settingsRow')}
          subtitle={t('basics.subtitle')}
          icon="basket-outline"
          value={
            preferences.alwaysAvailableIngredients.length > 0
              ? String(preferences.alwaysAvailableIngredients.length)
              : undefined
          }
          onPress={() => router.push('/settings/basics')}
          testID="profile-basics"
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
