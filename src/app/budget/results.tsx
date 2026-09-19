import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { ResultsView } from '@/components/recipe/results-view';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { budgetVerdict } from '@/features/pricing/estimate';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useMealSuggestions } from '@/features/recipes/hooks';
import { decodeRequest, encodeRequest, relaxRequest } from '@/features/recipes/request-params';
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
  const { matches, relaxations, isLoading, error, isGenerating, generationError, refetch } =
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

  /*
    THE BUDGET, AS A LINE OF TEXT, not as a green slab.

    It was a full-width filled card with a wallet icon, occupying the top of
    the results page above the count row and the sort row — three stacked
    chrome surfaces before the first recipe. The information is worth keeping
    and the furniture is not: the constraint the user typed is now a single
    line with a rule under it, which states the same two facts and gives the
    vertical space back to the food.
  */
  const header = budgetLabel ? (
    <View
      style={{
        gap: 2,
        paddingBottom: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Text variant="title3">
        {budgetLabel} · {t('common.servings', { count: request.servings })}
      </Text>
      <Text variant="footnote" color="textSecondary">
        {t('budget.withinBudget')}: {tally.within}
        {tally.unknown > 0 ? ` · ${t('budget.needsChecking', { count: tally.unknown })}` : ''}
      </Text>
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
          relaxations={relaxations}
          onRelax={(relaxation) =>
            router.replace({
              pathname: '/budget/results',
              params: encodeRequest(relaxRequest(request, relaxation.reason)),
            })
          }
          header={header}
        />
      </View>
    </ScreenScroll>
  );
}
