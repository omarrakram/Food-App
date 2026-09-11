import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';

export default function AccountSettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { user, isEnabled, signOut, deleteAccount } = useAuth();
  const { resetPreferences } = usePreferences();
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmSignOut = () => {
    void (async () => {
      const confirmed = await confirmAction({
        title: t('profile.signOutConfirm'),
        confirmLabel: t('profile.signOut'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;
      await signOut();
      await resetPreferences();
      router.replace('/(auth)/welcome');
    })();
  };

  const confirmDelete = () => {
    // Two-step, and the destructive label is explicit about permanence.
    void (async () => {
      const confirmed = await confirmAction({
        title: t('profile.deleteAccountConfirm'),
        message: t('profile.deleteAccountBody'),
        confirmLabel: t('profile.deleteAccountAction'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!confirmed) return;

      setIsDeleting(true);
      try {
        await deleteAccount();
        await resetPreferences();
        router.replace('/(auth)/welcome');
      } catch (error) {
        const presented = presentError(error);
        toast.show({ message: t(presented.titleKey, presented.values), tone: 'danger' });
      } finally {
        setIsDeleting(false);
      }
    })();
  };

  // No backend configured. This is the state every preview build is in, and
  // it used to render a header over one line of text — which reads as a screen
  // that failed to load rather than a product that works offline. Say what is
  // true instead: the data is real, it is on this device, and nothing is
  // pretending to be an account.
  if (!isEnabled) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('profile.account')} />

        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          <Text variant="headline">{t('account.localTitle')}</Text>
          <Text variant="body" color="textSecondary">
            {t('account.localBody')}
          </Text>
        </View>

        <ListGroup>
          <ListRow
            title={t('account.localWhatWorks')}
            subtitle={t('account.localWhatWorksSub')}
            icon="checkmark-circle-outline"
            iconTone="success"
          />
          <ListRow
            title={t('account.localWhatDoesNot')}
            subtitle={t('account.localWhatDoesNotSub')}
            icon="cloud-offline-outline"
          />
          <ListRow
            title={t('profile.privacy')}
            subtitle={t('account.localPrivacySub')}
            icon="shield-checkmark-outline"
            onPress={() => router.push('/settings/privacy')}
          />
        </ListGroup>

        <Text variant="micro" color="textTertiary">
          {t('account.localFooter')}
        </Text>
      </ScreenScroll>
    );
  }

  if (!user) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('profile.account')} />
        <Text variant="body" color="textSecondary">
          {t('profile.signInPrompt')}
        </Text>
        <Button
          label={t('auth.signIn')}
          onPress={() => router.push('/(auth)/sign-in')}
          size="lg"
          testID="account-sign-in"
        />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.xl}>
      <ScreenHeader title={t('profile.account')} />

      <ListGroup>
        <ListRow title={t('auth.email')} icon="mail-outline" value={user.email ?? ''} />
        <ListRow
          title={t('auth.password')}
          icon="key-outline"
          onPress={() => router.push('/(auth)/reset-password')}
          testID="account-change-password"
        />
      </ListGroup>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={t('profile.signOut')}
          variant="secondary"
          icon="log-out-outline"
          onPress={confirmSignOut}
          size="lg"
          testID="account-sign-out"
        />
        <Button
          label={t('profile.deleteAccount')}
          variant="danger"
          icon="trash-outline"
          onPress={confirmDelete}
          loading={isDeleting}
          size="lg"
          testID="account-delete"
        />
        <Text variant="footnote" color="textTertiary" align="center">
          {t('profile.deleteAccountBody')}
        </Text>
      </View>
    </ScreenScroll>
  );
}
