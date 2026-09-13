import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DrawerButton } from '@/components/navigation/drawer-button';
import { RecipeCard } from '@/components/recipe/recipe-card';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { PressScale } from '@/components/ui/press-scale';
import { ScreenScroll } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/states';
import { SkeletonList } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useIsSaved, useToggleSave } from '@/features/saved/hooks';
import { COLLECTIONS } from '@/features/recipes/fixtures';
import { useMealRequest, useRecipeSearch } from '@/features/recipes/hooks';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { RecipeMatch } from '@/types/domain';

function SaveableCard({ match }: { match: RecipeMatch }) {
  const router = useRouter();
  const isSaved = useIsSaved(match.recipe.id);
  const toggleSave = useToggleSave();

  return (
    <RecipeCard
      match={match}
      isSaved={isSaved}
      showMatch={false}
      onPress={() => router.push(`/recipe/${match.recipe.id}`)}
      onToggleSave={() => toggleSave.mutate({ recipe: match.recipe, shouldSave: !isSaved })}
      testID={`discover-${match.recipe.id}`}
    />
  );
}

export default function DiscoverScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  // `null` is the whole catalogue. It exists so the zero-result state has
  // something to recover TO: before this, a collection that matched nothing
  // left the user reading "No meals matched" with no way back except guessing
  // that another chip might help.
  const [activeCollection, setActiveCollection] = useState<string | null>(COLLECTIONS[0].slug);

  // Discover browses the whole catalogue: no ingredient or budget constraint,
  // only the user's own hard constraints (allergens, diet, appliances) plus
  // whichever collection is selected.
  const request = useMealRequest(useMemo(() => ({ mode: 'search' as const }), []));
  const collection = COLLECTIONS.find((entry) => entry.slug === activeCollection);

  // The collection goes INTO the query rather than filtering a fetched page.
  // Filtering after the fact is how a page of twenty-four turns into three
  // visible cards and an infinite scroll that looks broken.
  const tags = useMemo(() => (collection ? [collection.tag] : []), [collection]);

  const { matches, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useRecipeSearch(
    request,
    { tags },
  );

  return (
    <ScreenScroll
      bottomInset={theme.layout.tabBarHeight}
      padded={false}
      contentGap={theme.spacing.lg}
      // Prefetching one screen early means the next page is usually already
      // there by the time the user reaches the bottom of this one.
      onEndReached={fetchNextPage}
    >
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
          <DrawerButton testID="discover-open-drawer" />
          <View style={{ gap: 2, flex: 1 }}>
            <Text variant="title1">{t('discover.title')}</Text>
            <Text variant="callout" color="textSecondary">
              {t('discover.subtitle')}
            </Text>
          </View>
        </View>

        <PressScale
          accessibilityRole="search"
          accessibilityLabel={t('discover.searchPlaceholder')}
          onPress={() => router.push('/search')}
          haptic="selection"
          scaleTo={0.985}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            minHeight: 48,
            paddingHorizontal: theme.spacing.lg,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Ionicons name="search" size={18} color={theme.colors.textTertiary} />
          <Text variant="callout" color="textTertiary" lines={1} style={{ flex: 1 }}>
            {t('discover.searchPlaceholder')}
          </Text>
        </PressScale>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: theme.layout.screenPadding,
          gap: theme.spacing.sm,
        }}
      >
        <Chip
          label={t('discover.allCollections')}
          selected={activeCollection === null}
          onPress={() => setActiveCollection(null)}
          testID="collection-all"
        />
        {COLLECTIONS.map((entry) => (
          <Chip
            key={entry.slug}
            label={`${entry.emoji}  ${t(entry.labelKey)}`}
            selected={entry.slug === activeCollection}
            onPress={() => setActiveCollection(entry.slug)}
            testID={`collection-${entry.slug}`}
          />
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.layout.cardGap }}>
        {isLoading ? (
          <SkeletonList count={3} />
        ) : matches.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title={t('results.empty')}
            body={t('results.emptyBody')}
            // Only offered when a collection is actually narrowing things: an
            // empty catalogue with no filter on has nothing to clear, and a
            // button that changes nothing is worse than no button.
            action={
              activeCollection !== null
                ? { label: t('results.clearFilters'), onPress: () => setActiveCollection(null) }
                : undefined
            }
            testID="discover-empty"
          />
        ) : (
          <>
            {matches.map((match) => (
              <SaveableCard key={match.recipe.id} match={match} />
            ))}
            {/* An explicit control as well as the scroll trigger: on the web
                preview the list is short enough that the end-reached callback
                may never fire, and a catalogue that stops at 24 with no way
                forward reads as a bug. */}
            {hasNextPage ? (
              <Button
                variant="secondary"
                label={t('discover.loadMore')}
                loading={isFetchingNextPage}
                onPress={fetchNextPage}
                testID="discover-load-more"
              />
            ) : null}
          </>
        )}
      </View>
    </ScreenScroll>
  );
}
