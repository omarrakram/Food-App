import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { ResultsView } from '@/components/recipe/results-view';
import { ScreenScroll, ScreenHeader } from '@/components/ui/screen';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useMealSuggestions } from '@/features/recipes/hooks';
import { decodeRequest } from '@/features/recipes/request-params';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

export default function CookResultsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();
  const params = useLocalSearchParams();

  const request = useMemo(() => decodeRequest(params, preferences), [params, preferences]);
  const { matches, isLoading, error, isGenerating, generationError, refetch } =
    useMealSuggestions(request);

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.md}>
      <ScreenHeader title={t('results.title')} />
      <View>
        <ResultsView
          request={request}
          matches={matches}
          isLoading={isLoading}
          error={error}
          isGenerating={isGenerating}
          generationError={generationError}
          onRetry={refetch}
          onAdjust={() => router.back()}
        />
      </View>
    </ScreenScroll>
  );
}
