import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { RecipeCard } from '@/components/recipe/recipe-card';
import { Chip } from '@/components/ui/chip';
import { PressScale } from '@/components/ui/press-scale';
import { ScreenScroll } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/states';
import { SkeletonList } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useIsSaved, useToggleSave } from '@/features/saved/hooks';
import { COLLECTIONS } from '@/features/recipes/fixtures';
import { useLocalSuggestions, useMealRequest } from '@/features/recipes/hooks';
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
  const [activeCollection, setActiveCollection] = useState<string>(COLLECTIONS[0].slug);

  // Discover browses the whole catalogue: no ingredient or budget constraint,
  // only the user's own hard constraints (allergens, diet, appliances).
  const request = useMealRequest(useMemo(() => ({ mode: 'search' as const }), []));
  const { matches, isLoading } = useLocalSuggestions(request, 200);

  const collection = COLLECTIONS.find((entry) => entry.slug === activeCollection);
  const visible = useMemo(
    () => (collection ? matches.filter((m) => m.recipe.tags.includes(collection.tag)) : matches),
    [matches, collection],
  );

  return (
    <ScreenScroll bottomInset={theme.layout.tabBarHeight} padded={false} contentGap={theme.spacing.lg}>
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text variant="title1">{t('discover.title')}</Text>
          <Text variant="callout" color="textSecondary">
            {t('discover.subtitle')}
          </Text>
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
        ) : visible.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title={t('results.empty')}
            body={t('results.emptyBody')}
          />
        ) : (
          visible.map((match) => <SaveableCard key={match.recipe.id} match={match} />)
        )}
      </View>
    </ScreenScroll>
  );
}
