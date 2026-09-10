import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { sortMatches, type SortMode } from '@/features/recipes/rank';
import { useIsSaved, useToggleSave } from '@/features/saved/hooks';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import type { MealRequest, RecipeMatch } from '@/types/domain';

import { RecipeCard } from './recipe-card';

function ResultCard({ match, showMatch }: { match: RecipeMatch; showMatch: boolean }) {
  const router = useRouter();
  const isSaved = useIsSaved(match.recipe.id);
  const toggleSave = useToggleSave();

  return (
    <RecipeCard
      match={match}
      isSaved={isSaved}
      showMatch={showMatch}
      onPress={() => router.push(`/recipe/${match.recipe.id}`)}
      onToggleSave={() => toggleSave.mutate({ recipe: match.recipe, shouldSave: !isSaved })}
      testID={`result-${match.recipe.id}`}
    />
  );
}

export type ResultsViewProps = {
  request: MealRequest;
  matches: RecipeMatch[];
  isLoading: boolean;
  error?: unknown;
  /** True while AI generation is still running behind already-shown results. */
  isGenerating?: boolean;
  /** Set when generation failed. Non-blocking: local results still render. */
  generationError?: unknown;
  onRetry?: () => void;
  onAdjust?: () => void;
  /** Extra content rendered above the list, e.g. the budget summary. */
  header?: React.ReactNode;
};

/**
 * Shared results list for the ingredient, budget and search flows.
 *
 * Always returns multiple options rather than a single answer, and keeps the
 * sort control visible so the user can re-rank by what they actually care
 * about right now.
 */
export function ResultsView({
  request,
  matches,
  isLoading,
  error,
  isGenerating = false,
  generationError,
  onRetry,
  onAdjust,
  header,
}: ResultsViewProps) {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  const [sort, setSort] = useState<SortMode>('best');

  const sorted = useMemo(() => sortMatches(matches, sort), [matches, sort]);

  if (error) {
    const presented = presentError(error);
    return (
      <ErrorState
        title={t(presented.titleKey, presented.values)}
        body={t(presented.bodyKey, presented.values)}
        action={onRetry ? { label: t('common.retry'), onPress: onRetry } : undefined}
        secondaryAction={onAdjust ? { label: t('common.edit'), onPress: onAdjust } : undefined}
        fullHeight
      />
    );
  }

  if (isLoading) {
    return (
      <View style={{ gap: theme.layout.cardGap }}>
        <View style={{ gap: 4, alignItems: 'center', paddingVertical: theme.spacing.lg }}>
          <Text variant="bodyMedium">{t('results.generating')}</Text>
          <Text variant="footnote" color="textSecondary" align="center">
            {t('results.generatingSub')}
          </Text>
        </View>
        <SkeletonList count={3} />
      </View>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon="restaurant-outline"
        title={t('results.empty')}
        body={t('results.emptyBody')}
        action={onAdjust ? { label: t('common.edit'), onPress: onAdjust } : undefined}
        testID="results-empty"
        fullHeight
      />
    );
  }

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: 'best', label: t('results.sortBest') },
    { value: 'cheapest', label: t('results.sortCheapest') },
    { value: 'fastest', label: t('results.sortFastest') },
    { value: 'protein', label: t('results.sortProtein') },
  ];

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {header}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="footnote" color="textSecondary">
            {t('results.count', { count: sorted.length })}
          </Text>
          {isGenerating ? (
            // Generation runs behind results that are already useful, so this
            // is an ambient hint rather than a spinner over the whole screen.
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ActivityIndicator size="small" color={theme.colors.textTertiary} />
              <Text variant="micro" color="textTertiary">
                {t('results.generatingMore')}
              </Text>
            </View>
          ) : null}
        </View>
        {request.budgetMinor !== null ? (
          <Badge label={t('budget.estimateNoticeShort')} tone="neutral" icon="information-circle" />
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm }}
      >
        {sortOptions.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            size="sm"
            selected={sort === option.value}
            onPress={() => setSort(option.value)}
            testID={`sort-${option.value}`}
          />
        ))}
      </ScrollView>

      {generationError ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceAlt,
          }}
        >
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            {t(presentError(generationError).bodyKey, presentError(generationError).values)}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: theme.layout.cardGap }}>
        {sorted.map((match) => (
          <ResultCard
            key={match.recipe.id}
            match={match}
            showMatch={request.mode !== 'search'}
          />
        ))}
      </View>

      <Text variant="micro" color="textTertiary" align="center">
        {formatNumber(sorted.length)} · {t('budget.estimateNoticeShort')}
      </Text>
    </View>
  );
}
