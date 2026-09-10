import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen, ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-provider';
import { AuthFailure, validatePassword, type AuthErrorKey } from '@/features/auth/errors';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * Reached from the reset email's deep link. Supabase has already exchanged the
 * token for a session by the time this renders, so all that remains is setting
 * the new password.
 */
export default function ResetPasswordScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await updatePassword(password);
      toast.show({ message: t('auth.passwordUpdated'), tone: 'success' });
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof AuthFailure ? caught.authKey : 'auth.error.sessionExpired');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen edges={{ top: true }} padded={false} style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <ScreenHeader title={t('auth.resetTitle')} />
      </View>

      <ScreenScroll edges={{ top: false }} contentGap={theme.spacing.lg}>
        <Input
          label={t('auth.newPassword')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordPlaceholder')}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          trailingIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
          onTrailingIconPress={() => setShowPassword((current) => !current)}
          autoFocus
          error={error ? t(error) : null}
          onSubmitEditing={() => void submit()}
          testID="reset-password-input"
        />
      </ScreenScroll>

      <ScreenFooter>
        <Button
          label={t('auth.updatePassword')}
          onPress={() => void submit()}
          loading={isSubmitting}
          size="lg"
          testID="reset-password-submit"
        />
      </ScreenFooter>
    </Screen>
  );
}
