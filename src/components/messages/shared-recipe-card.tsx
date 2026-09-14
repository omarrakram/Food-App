import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { RecipeImage } from '@/components/recipe/recipe-image';
import { PressScale } from '@/components/ui/press-scale';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useRecipe } from '@/features/recipes/hooks';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

/**
 * A recipe, inside a message.
 *
 * The message carries an ID, so this looks the recipe up rather than rendering
 * a copy that travelled with it. That is the whole point of the reference: the
 * card shows the recipe AS IT IS NOW, and one that has been unpublished or
 * removed renders as "no longer available" instead of leaving a stale copy of
 * someone's withdrawn submission in a chat log forever.
 *
 * Which also means this can be in three states, and all three are designed:
 * loading, present, and gone.
 */
export function SharedRecipeCard({
  recipeId,
  testID,
}: {
  recipeId: string;
  testID?: string;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();

  const recipe = useRecipe(recipeId);

  const frame = {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden' as const,
    width: 232,
  };

  if (recipe.isLoading) {
    return (
      <View style={frame} testID={testID ? `${testID}-loading` : undefined}>
        <Skeleton height={116} radius={0} />
        <View style={{ padding: theme.spacing.sm, gap: theme.spacing.xs }}>
          <Skeleton height={14} />
          <Skeleton height={11} width="60%" />
        </View>
      </View>
    );
  }

  if (!recipe.data) {
    return (
      <View
        testID={testID ? `${testID}-missing` : undefined}
        style={{
          ...frame,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      >
        <Text variant="footnote" color="textSecondary">
          {t('messages.recipeGone')}
        </Text>
      </View>
    );
  }

  const dish = recipe.data;

  return (
    <PressScale
      accessibilityRole="link"
      accessibilityLabel={dish.title}
      onPress={() => router.push(`/recipe/${dish.id}`)}
      haptic="selection"
      scaleTo={0.98}
      style={frame}
      testID={testID}
    >
      <RecipeImage recipe={dish} aspectRatio={2} glyphSize={26} />
      <View style={{ padding: theme.spacing.sm, gap: 2 }}>
        <Text variant="subhead" lines={2}>
          {dish.title}
        </Text>
        <Text variant="micro" color="textSecondary">
          {t('common.min', { count: dish.prepMinutes + dish.cookMinutes })}
        </Text>
      </View>
    </PressScale>
  );
}
