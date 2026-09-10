import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen, ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { AuthFailure, validateEmail, type AuthErrorKey } from '@/features/auth/errors';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

export default function SignInScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: AuthErrorKey; form?: AuthErrorKey }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const emailError = validateEmail(email);
    if (emailError) {
      setErrors({ email: emailError });
      return;
    }
    if (password.length === 0) {
      setErrors({ form: 'auth.error.invalidCredentials' });
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await signIn({ email, password });
      router.replace('/');
    } catch (error) {
      setErrors({
        form: error instanceof AuthFailure ? error.authKey : 'auth.error.invalidCredentials',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen edges={{ top: true }} padded={false} style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <ScreenHeader title={t('auth.signIn')} />
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
          textContentType="emailAddress"
          error={errors.email ? t(errors.email) : null}
          testID="sign-in-email"
        />
        <Input
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          trailingIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
          onTrailingIconPress={() => setShowPassword((current) => !current)}
          onSubmitEditing={() => void submit()}
          testID="sign-in-password"
        />

        {errors.form ? (
          <View
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.dangerSoft,
            }}
          >
            <Text variant="footnote" style={{ color: theme.colors.dangerSoftText }}>
              {t(errors.form)}
            </Text>
          </View>
        ) : null}

        <Button
          label={t('auth.forgotPassword')}
          variant="ghost"
          size="sm"
          onPress={() => router.push('/(auth)/forgot-password')}
          testID="sign-in-forgot"
        />
      </ScreenScroll>

      <ScreenFooter>
        <Button
          label={t('auth.signIn')}
          onPress={() => void submit()}
          loading={isSubmitting}
          size="lg"
          testID="sign-in-submit"
        />
        <Button
          label={t('auth.noAccount')}
          variant="ghost"
          size="sm"
          onPress={() => router.replace('/(auth)/sign-up')}
          fullWidth
        />
      </ScreenFooter>
    </Screen>
  );
}
