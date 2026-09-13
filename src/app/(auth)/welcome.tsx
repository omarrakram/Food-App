import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

export default function WelcomeScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { isEnabled, continueAsGuest } = useAuth();

  // Recording the choice is the point of this button. Without it a relaunch
  // would bring the user straight back here, which is the nagging the explicit
  // choice exists to avoid.
  const browseAsGuest = async () => {
    await continueAsGuest();
    router.replace('/');
  };

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: theme.spacing.xxl }}>
        <LinearGradient
          colors={['#F5773E', '#E85D2A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 84,
            height: 84,
            borderRadius: theme.radius.xl,
            alignItems: 'center',
            justifyContent: 'center',
            ...theme.elevation(2),
          }}
        >
          <Text variant="display" style={{ color: '#FFFFFF' }}>
            {t('common.appName').charAt(0)}
          </Text>
        </LinearGradient>

        <View style={{ gap: theme.spacing.md }}>
          <Text variant="display">{t('auth.welcomeTitle')}</Text>
          <Text variant="body" color="textSecondary">
            {t('auth.welcomeBody')}
          </Text>
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.xl }}>
        {isEnabled ? (
          <>
            <Button
              label={t('auth.getStarted')}
              onPress={() => router.push('/(auth)/sign-up')}
              size="lg"
              testID="welcome-get-started"
            />
            <Button
              label={t('auth.haveAccount')}
              variant="ghost"
              onPress={() => router.push('/(auth)/sign-in')}
              size="md"
              fullWidth
              testID="welcome-sign-in"
            />
          </>
        ) : (
          // With no Supabase project configured the app still works fully on
          // local data, so we offer the only route that can succeed.
          <Button
            label={t('auth.continueAsGuest')}
            onPress={() => void browseAsGuest()}
            size="lg"
            testID="welcome-guest"
          />
        )}

        {isEnabled ? (
          <Button
            label={t('auth.continueAsGuest')}
            variant="ghost"
            size="sm"
            onPress={() => void browseAsGuest()}
            fullWidth
            testID="welcome-guest"
          />
        ) : null}

        <Text variant="micro" color="textTertiary" align="center">
          {t('auth.termsNotice')}
        </Text>
      </View>
    </Screen>
  );
}
