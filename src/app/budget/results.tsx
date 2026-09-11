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
  const { t, locale } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();
  const params = useLocalSearchParams();

  const request = useMemo(() => decodeRequest(params, preferences), [params, preferences]);
  const { matches, isLoading, error, isGenerating, generationError, refetch } =
    useMealSuggestions(request);

  const budgetLabel = request.budgetMinor
    ? formatMoney(money(request.budgetMinor, request.currency), { locale })
    : null;

  /**
   * Counted against what the cook still has to BUY, not what the dish is
   * worth — "I have 150 EGP" is a question about their wallet. A recipe whose
   * price data is incomplete lands in `unknown` rather than being quietly
   * counted as affordable.
   */
  const tally = useMemo(() => {
    if (request.budgetMinor === null) return { within: 0, unknown: 0 };

    let within = 0;
    let unknown = 0;
    for (const match of matches) {
      const spend = match.estimatedSpend ?? match.estimatedCost;
      if (!spend) {
        unknown += 1;
        continue;
      }
      const verdict = budgetVerdict(
        spend.money.amountMinor,
        request.budgetMinor ?? 0,
        spend.completeness ?? 'complete',
      );
      if (verdict === 'within') within += 1;
      else if (verdict === 'unknown') unknown += 1;
    }
    return { within, unknown };
  }, [matches, request.budgetMinor]);

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
          {t('budget.withinBudget')}: {tally.within}
          {tally.unknown > 0 ? ` · ${t('budget.needsChecking', { count: tally.unknown })}` : ''}
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
          isGenerating={isGenerating}
          generationError={generationError}
          onRetry={refetch}
          onAdjust={() => router.back()}
          header={header}
        />
      </View>
    </ScreenScroll>
  );
}
