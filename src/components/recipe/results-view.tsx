import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { sortMatches, type SortMode } from '@/features/recipes/rank';
import { useIsSaved, useToggleSave } from '@/features/saved/hooks';
import { useI18n, type TranslationKey } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import type { RejectionReason, Relaxation } from '@/features/recipes/filter';
import type { MealRequest, RecipeMatch } from '@/types/domain';

/**
 * What dropping each constraint is offered as. Keyed by rejection reason so a
 * new constraint cannot be added without deciding how to word it.
 */

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

/**
 * How each droppable constraint is offered.
 *
 * Keyed by every rejection reason so a new constraint cannot be added without
 * deciding how to word it — and the safety reasons map to `null`, which is the
 * type system saying they are never offered.
 */
const RELAXATION_LABEL: Record<RejectionReason, TranslationKey | null> = {
  allergen: null,
  diet: null,
  excluded_ingredient: null,
  disliked_ingredient: 'results.relaxDisliked',
  missing_required_ingredient: 'results.relaxRequired',
  appliance: 'results.relaxAppliance',
  meal_type: 'results.relaxMealType',
  cuisine: 'results.relaxCuisine',
  time: 'results.relaxTime',
  calories: 'results.relaxCalories',
  protein: 'results.relaxProtein',
  pantry: 'results.relaxPantry',
};

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
  /**
   * Non-safety constraints the user could drop, offered when nothing matched.
   * Never contains an allergy, a diet or a hard avoid.
   */
  relaxations?: Relaxation[];
  onRelax?: (relaxation: Relaxation) => void;
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
  relaxations = [],
  onRelax,
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
      <View style={{ gap: theme.spacing.lg }}>
        <EmptyState
          icon="restaurant-outline"
          title={t('results.empty')}
          body={t('results.emptyBody')}
          action={onAdjust ? { label: t('common.edit'), onPress: onAdjust } : undefined}
          testID="results-empty"
        />

        {/*
          What the user could give up, and what it would get them.

          Shown rather than applied: the app does not decide on someone's
          behalf which of their requirements matters least. And this list can
          never contain an allergy, a diet or a hard avoid — `suggestRelaxations`
          refuses to build one, so there is no path from an empty page to
          quietly serving unsafe food.
        */}
        {relaxations.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }} testID="results-relaxations">
            <Text variant="caption" color="textTertiary">
              {t('results.relaxTitle')}
            </Text>
            {relaxations
              .map((relaxation) => ({ relaxation, key: RELAXATION_LABEL[relaxation.reason] }))
              .filter(
                (entry): entry is { relaxation: Relaxation; key: TranslationKey } =>
                  entry.key !== null,
              )
              .slice(0, 3)
              .map(({ relaxation, key }) => (
                <Button
                  key={relaxation.reason}
                  label={t(key, { count: relaxation.wouldReturn })}
                  variant="secondary"
                  size="md"
                  fullWidth
                  onPress={() => onRelax?.(relaxation)}
                  testID={`results-relax-${relaxation.reason}`}
                />
              ))}
          </View>
        ) : null}
      </View>
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

      {/*
        Bleeds past the screen padding on purpose. Constrained to it, the last
        option ("Most protein") was clipped at the padding boundary with no
        hint that anything lay beyond. Running to the edge is what makes a
        horizontal list read as scrollable, and the trailing padding leaves the
        final chip somewhere to land.
      */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{
          marginHorizontal: -theme.layout.screenPadding,
          flexGrow: 0,
        }}
        contentContainerStyle={{
          gap: theme.spacing.sm,
          paddingHorizontal: theme.layout.screenPadding,
        }}
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
          <ResultCard key={match.recipe.id} match={match} showMatch={request.mode !== 'search'} />
        ))}
      </View>

      <Text variant="micro" color="textTertiary" align="center">
        {formatNumber(sorted.length)} · {t('budget.estimateNoticeShort')}
      </Text>
    </View>
  );
}
