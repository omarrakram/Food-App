import { useRouter } from 'expo-router';

import { EmptyState, Screen } from '@/components/ui';
import { useTranslation } from '@/i18n';

export default function NotFoundScreen() {
  const t = useTranslation();
  const router = useRouter();

  return (
    <Screen>
      <EmptyState
        icon="compass-outline"
        title={t('error.notFoundTitle')}
        body={t('error.notFoundBody')}
        action={{ label: t('error.goHome'), onPress: () => router.replace('/') }}
        fullHeight
      />
    </Screen>
  );
}
