import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { RecipeCard } from '@/components/recipe/recipe-card';
import { ScreenScroll } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useRecipeHistory, useSavedRecipes, useToggleSave } from '@/features/saved/hooks';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { Recipe, RecipeMatch } from '@/types/domain';

type Tab = 'saved' | 'viewed' | 'cooked';

/**
 * Saved / recent / cooked share one card component, which expects a
 * `RecipeMatch`. There is no active request on this screen, so we wrap each
 * recipe in a neutral match with matching hidden.
 */
function asMatch(recipe: Recipe): RecipeMatch {
  return {
    recipe,
    matchPercent: 0,
    haveCount: 0,
    requiredCount: 0,
    missingIngredients: [],
    availableIngredients: [],
    estimatedCost: null,
    estimatedSpend: null,
    usesExpiringItems: [],
    score: 0,
  };
}

export default function SavedScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('saved');

  const saved = useSavedRecipes();
  const viewed = useRecipeHistory('viewed');
  const cooked = useRecipeHistory('cooked');
  const toggleSave = useToggleSave();

  const savedIds = useMemo(
    () => new Set((saved.data ?? []).map((entry) => entry.recipeId)),
    [saved.data],
  );

  const recipes = useMemo<Recipe[]>(() => {
    if (tab === 'saved') return (saved.data ?? []).map((entry) => entry.recipe);
    if (tab === 'viewed') return (viewed.data ?? []).map((entry) => entry.recipe);
    return (cooked.data ?? []).map((entry) => entry.recipe);
  }, [tab, saved.data, viewed.data, cooked.data]);

  const isLoading =
    (tab === 'saved' && saved.isLoading) ||
    (tab === 'viewed' && viewed.isLoading) ||
    (tab === 'cooked' && cooked.isLoading);

  const emptyCopy = {
    saved: { title: t('saved.empty'), body: t('saved.emptyBody'), icon: 'heart-outline' as const },
    viewed: {
      title: t('saved.emptyRecent'),
      body: t('saved.emptyRecentBody'),
      icon: 'eye-outline' as const,
    },
    cooked: {
      title: t('saved.emptyCooked'),
      body: t('saved.emptyCookedBody'),
      icon: 'flame-outline' as const,
    },
  }[tab];

  return (
    <ScreenScroll bottomInset={theme.layout.tabBarHeight} contentGap={theme.spacing.lg}>
      <View style={{ gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <Text variant="title1">{t('saved.title')}</Text>
        <SegmentedControl<Tab>
          options={[
            { value: 'saved', label: t('saved.tabSaved') },
            { value: 'viewed', label: t('saved.tabRecent') },
            { value: 'cooked', label: t('saved.tabCooked') },
          ]}
          value={tab}
          onChange={setTab}
          testID="saved-tabs"
        />
      </View>

      {isLoading ? (
        <SkeletonList count={2} />
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={emptyCopy.icon}
          title={emptyCopy.title}
          body={emptyCopy.body}
          action={{ label: t('saved.browse'), onPress: () => router.push('/discover') }}
          testID="saved-empty"
        />
      ) : (
        <View style={{ gap: theme.layout.cardGap }}>
          {recipes.map((recipe) => (
            <RecipeCard
              key={`${tab}-${recipe.id}`}
              match={asMatch(recipe)}
              showMatch={false}
              isSaved={savedIds.has(recipe.id)}
              onPress={() => router.push(`/recipe/${recipe.id}`)}
              onToggleSave={() =>
                toggleSave.mutate({ recipe, shouldSave: !savedIds.has(recipe.id) })
              }
              testID={`saved-${recipe.id}`}
            />
          ))}
        </View>
      )}
    </ScreenScroll>
  );
}
