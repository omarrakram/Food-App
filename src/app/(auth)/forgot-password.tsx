import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen, ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { StateView } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { AuthFailure, validateEmail, type AuthErrorKey } from '@/features/auth/errors';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const submit = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await sendPasswordReset(email);
      // Always reports success. Telling the user whether the address exists
      // would make this an account-enumeration oracle.
      setIsSent(true);
    } catch (caught) {
      setError(caught instanceof AuthFailure ? caught.authKey : 'auth.error.rateLimited');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSent) {
    return (
      <Screen edges={{ top: true, bottom: true }}>
        <StateView
          icon="mail-outline"
          title={t('auth.resetTitle')}
          body={t('auth.resetSent')}
          action={{ label: t('auth.signIn'), onPress: () => router.replace('/(auth)/sign-in') }}
          fullHeight
          testID="forgot-password-sent"
        />
      </Screen>
    );
  }

  return (
    <Screen edges={{ top: true }} padded={false} style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <ScreenHeader title={t('auth.resetTitle')} subtitle={t('auth.resetBody')} />
      </View>

      <ScreenScroll edges={{ top: false }} contentGap={theme.spacing.lg}>
        <Input
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          autoFocus
          error={error ? t(error) : null}
          onSubmitEditing={() => void submit()}
          testID="forgot-password-email"
        />
        <Text variant="footnote" color="textTertiary">
          {t('auth.resetSent')}
        </Text>
      </ScreenScroll>

      <ScreenFooter>
        <Button
          label={t('auth.resetSend')}
          onPress={() => void submit()}
          loading={isSubmitting}
          size="lg"
          testID="forgot-password-submit"
        />
      </ScreenFooter>
    </Screen>
  );
}
