import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { ResultsView } from '@/components/recipe/results-view';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { budgetVerdict } from '@/features/pricing/estimate';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useMealSuggestions } from '@/features/recipes/hooks';
import { decodeRequest } from '@/features/recipes/request-params';
import { useI18n } from '@/i18n';
import { formatMoney, money } from '@/lib/format/money';
import { useTheme } from '@/theme';

export default function BudgetResultsScreen() {
  const theme = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();
  const params = useLocalSearchParams();

  const request = useMemo(() => decodeRequest(params, preferences), [params, preferences]);
  const { matches, isLoading, error, refetch } = useMealSuggestions(request);

  const locale = language === 'ar' ? 'ar-EG' : 'en-US';
  const budgetLabel = request.budgetMinor
    ? formatMoney(money(request.budgetMinor, request.currency), { locale })
    : null;

  const withinCount = useMemo(
    () =>
      request.budgetMinor === null
        ? 0
        : matches.filter(
            (match) =>
              match.estimatedCost !== null &&
              budgetVerdict(match.estimatedCost.money.amountMinor, request.budgetMinor ?? 0) ===
                'within',
          ).length,
    [matches, request.budgetMinor],
  );

  const header = budgetLabel ? (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.successSoft,
      }}
    >
      <Ionicons name="wallet" size={22} color={theme.colors.successSoftText} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium" style={{ color: theme.colors.successSoftText }}>
          {budgetLabel} · {t('common.servings', { count: request.servings })}
        </Text>
        <Text variant="footnote" style={{ color: theme.colors.successSoftText }}>
          {t('budget.withinBudget')}: {withinCount}
        </Text>
      </View>
    </View>
  ) : null;

  return (
    <ScreenScroll bottomInset={theme.spacing.xxl} contentGap={theme.spacing.md}>
      <ScreenHeader title={t('results.title')} />
      <View>
        <ResultsView
          request={request}
          matches={matches}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          onAdjust={() => router.back()}
          header={header}
        />
      </View>
    </ScreenScroll>
  );
}
