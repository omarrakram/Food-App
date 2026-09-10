import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/components/ui/screen';
import { StateView } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-provider';
import { AuthFailure } from '@/features/auth/errors';
import { useI18n } from '@/i18n';

export default function VerifyEmailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { resendConfirmation } = useAuth();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [isSending, setIsSending] = useState(false);

  const resend = async () => {
    if (!email || isSending) return;
    setIsSending(true);
    try {
      await resendConfirmation(email);
      toast.show({ message: t('auth.verifyResent'), tone: 'success' });
    } catch (error) {
      toast.show({
        message: t(error instanceof AuthFailure ? error.authKey : 'error.genericTitle'),
        tone: 'danger',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Screen edges={{ top: true, bottom: true }}>
      <StateView
        icon="mail-open-outline"
        title={t('auth.verifyTitle')}
        body={t('auth.verifyBody', { email: email ?? '' })}
        action={{ label: t('auth.verifyResend'), onPress: () => void resend() }}
        secondaryAction={{ label: t('auth.signIn'), onPress: () => router.replace('/(auth)/sign-in') }}
        fullHeight
        testID="verify-email"
      />
    </Screen>
  );
}
