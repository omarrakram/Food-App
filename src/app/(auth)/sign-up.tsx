import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScreenFooter, ScreenHeader, ScreenScroll, Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import {
  AuthFailure,
  validateEmail,
  validateName,
  validatePassword,
  type AuthErrorKey,
} from '@/features/auth/errors';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

export default function SignUpScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { signUp } = useAuth();
  const { preferences, updatePreferences } = usePreferences();

  const [name, setName] = useState(preferences.displayName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{
    name?: AuthErrorKey;
    email?: AuthErrorKey;
    password?: AuthErrorKey;
    form?: AuthErrorKey;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    const nextErrors = {
      name: validateName(name) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.email || nextErrors.password) return;

    setIsSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUp({ email, password, displayName: name });
      // Keep the name locally too: it is used before the profile row loads.
      await updatePreferences({ displayName: name.trim() });

      if (needsEmailConfirmation) {
        router.replace({
          pathname: '/(auth)/verify-email',
          params: { email: email.trim().toLowerCase() },
        });
      } else {
        router.replace('/');
      }
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
        <ScreenHeader title={t('auth.signUp')} />
      </View>

      <ScreenScroll edges={{ top: false }} contentGap={theme.spacing.lg}>
        <Input
          label={t('auth.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('auth.namePlaceholder')}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          error={errors.name ? t(errors.name) : null}
          testID="sign-up-name"
        />
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
          testID="sign-up-email"
        />
        <Input
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.passwordPlaceholder')}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          trailingIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
          onTrailingIconPress={() => setShowPassword((current) => !current)}
          error={errors.password ? t(errors.password) : null}
          onSubmitEditing={() => void submit()}
          testID="sign-up-password"
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

        <Text variant="micro" color="textTertiary">
          {t('auth.termsNotice')}
        </Text>
      </ScreenScroll>

      <ScreenFooter>
        <Button
          label={t('auth.signUp')}
          onPress={() => void submit()}
          loading={isSubmitting}
          size="lg"
          testID="sign-up-submit"
        />
        <Button
          label={t('auth.hasAccount')}
          variant="ghost"
          size="sm"
          onPress={() => router.replace('/(auth)/sign-in')}
          fullWidth
        />
      </ScreenFooter>
    </Screen>
  );
}
