import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { View, type ViewStyle } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/button';
import { PressScale } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { Recipe, RecipeMatch } from '@/types/domain';

import { PriceTag } from './price-tag';

/** Neutral blurhash so images fade in from a warm tone, not a grey block. */
const PLACEHOLDER_HASH = 'L6PZfSjE.AyE_3t7t7R**0o#DgR4';

function MetaPill({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Ionicons name={icon} size={13} color={theme.colors.textTertiary} />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

/** Stand-in artwork for a recipe with no photograph. */
export function RecipePlaceholder({ aspectRatio }: { aspectRatio: number }) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={
        theme.scheme === 'dark'
          ? ['#3A2318', '#211D1A']
          : [theme.colors.primarySoft, theme.colors.surfaceAlt]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: '100%',
        aspectRatio,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name="restaurant-outline"
        size={36}
        color={theme.colors.primarySoftText}
      />
    </LinearGradient>
  );
}

export type RecipeCardProps = {
  match: RecipeMatch;
  onPress: () => void;
  onToggleSave?: () => void;
  isSaved?: boolean;
  /** Hides the ingredient-match row; used on Discover where there is no request. */
  showMatch?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/**
 * The primary recipe surface: large photo, title, and the four facts that
 * decide whether someone cooks it — time, protein, cost, and how much of it
 * they already have.
 */
export function RecipeCard({
  match,
  onPress,
  onToggleSave,
  isSaved = false,
  showMatch = true,
  style,
  testID,
}: RecipeCardProps) {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  const { recipe } = match;

  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;
  const hasEverything = match.missingIngredients.length === 0 && match.requiredCount > 0;

  // Only meaningful once a pantry is known; without one the two figures are
  // identical and the extra label would be noise.
  const ownsSomething =
    match.estimatedSpend !== null &&
    match.estimatedCost !== null &&
    match.estimatedSpend.money.amountMinor !== match.estimatedCost.money.amountMinor;

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${recipe.title}. ${recipe.description}`}
      onPress={onPress}
      haptic="light"
      scaleTo={0.985}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          overflow: 'hidden',
          ...theme.elevation(1),
        },
        style as ViewStyle,
      ]}
    >
      <View style={{ position: 'relative' }}>
        {recipe.imageUrl ? (
          <Image
            source={recipe.imageUrl}
            placeholder={{ blurhash: PLACEHOLDER_HASH }}
            contentFit="cover"
            transition={220}
            // Recipe photos repeat across screens; caching them avoids a
            // refetch every time the feed re-renders.
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
            style={{
              width: '100%',
              aspectRatio: theme.layout.cardImageAspect,
              backgroundColor: theme.colors.surfaceAlt,
            }}
          />
        ) : (
          // Generated recipes have no photograph. A designed placeholder in the
          // brand palette reads as intentional; a broken image frame does not.
          <RecipePlaceholder aspectRatio={theme.layout.cardImageAspect} />
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 }}
          pointerEvents="none"
        />

        {onToggleSave ? (
          <IconButton
            icon={isSaved ? 'heart' : 'heart-outline'}
            variant="onImage"
            active={false}
            onPress={onToggleSave}
            accessibilityLabel={isSaved ? t('recipe.unsaveRecipe') : t('recipe.saveRecipe')}
            style={{ position: 'absolute', top: theme.spacing.md, right: theme.spacing.md }}
            testID={`${testID ?? recipe.id}-save`}
          />
        ) : null}

        {showMatch && match.requiredCount > 0 ? (
          <View
            style={{ position: 'absolute', left: theme.spacing.md, bottom: theme.spacing.md }}
          >
            <Badge
              label={
                hasEverything
                  ? t('results.matchFull')
                  : t('results.match', {
                      have: formatNumber(match.haveCount),
                      total: formatNumber(match.requiredCount),
                    })
              }
              tone={hasEverything ? 'success' : match.matchPercent >= 60 ? 'primary' : 'neutral'}
              icon={hasEverything ? 'checkmark-circle' : 'basket-outline'}
              size="md"
            />
          </View>
        ) : null}

        {match.usesExpiringItems.length > 0 ? (
          <View style={{ position: 'absolute', top: theme.spacing.md, left: theme.spacing.md }}>
            <Badge label={t('pantry.expiringSoon')} tone="warning" icon="time-outline" size="md" />
          </View>
        ) : null}
      </View>

      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <View style={{ gap: 3 }}>
          <Text variant="title3" lines={1}>
            {recipe.title}
          </Text>
          <Text variant="footnote" color="textSecondary" lines={2}>
            {recipe.description}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: theme.spacing.md,
          }}
        >
          <MetaPill icon="time-outline" label={t('common.min', { count: totalMinutes })} />
          <MetaPill
            icon="speedometer-outline"
            label={t(`difficulty.${recipe.difficulty}` as const)}
          />
          {recipe.nutrition.calories !== null ? (
            <MetaPill
              icon="flame-outline"
              label={t('common.kcal', { count: recipe.nutrition.calories })}
            />
          ) : null}
          {recipe.nutrition.proteinGrams !== null ? (
            <MetaPill
              icon="barbell-outline"
              label={t('common.grams', { count: recipe.nutrition.proteinGrams })}
            />
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.sm,
            marginTop: 2,
          }}
        >
          {/*
            When the cook already owns part of the recipe, the number that
            answers "can I afford this" is what they still have to buy — and it
            is labelled, so the two figures can never be mistaken for one
            another.
          */}
          {ownsSomething ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <PriceTag priced={match.estimatedSpend} size="md" />
              <Text variant="micro" color="textTertiary">
                {t('price.toBuy')}
              </Text>
            </View>
          ) : (
            <PriceTag priced={match.estimatedCost} size="md" />
          )}
          {showMatch && match.missingIngredients.length > 0 ? (
            <Text variant="caption" color="textTertiary">
              {t('results.missing', { count: match.missingIngredients.length })}
            </Text>
          ) : null}
        </View>
      </View>
    </PressScale>
  );
}

export type RecipeCardCompactProps = {
  recipe: Recipe;
  onPress: () => void;
  /** Width of the card in a horizontal carousel. */
  width?: number;
  badge?: string;
  testID?: string;
};

/** Small card used in horizontal carousels on Home and Discover. */
export function RecipeCardCompact({
  recipe,
  onPress,
  width = 168,
  badge,
  testID,
}: RecipeCardCompactProps) {
  const theme = useTheme();
  const t = useI18n().t;
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
      onPress={onPress}
      haptic="light"
      scaleTo={0.96}
      style={{ width, gap: theme.spacing.sm }}
    >
      <View style={{ position: 'relative', borderRadius: theme.radius.md, overflow: 'hidden' }}>
        {recipe.imageUrl ? (
          <Image
            source={recipe.imageUrl}
            placeholder={{ blurhash: PLACEHOLDER_HASH }}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            accessibilityIgnoresInvertColors
            style={{
              width: '100%',
              aspectRatio: 1,
              backgroundColor: theme.colors.surfaceAlt,
            }}
          />
        ) : (
          <RecipePlaceholder aspectRatio={1} />
        )}
        {badge ? (
          <View style={{ position: 'absolute', left: 6, bottom: 6 }}>
            <Badge label={badge} tone="primary" />
          </View>
        ) : null}
      </View>

      <View style={{ gap: 1 }}>
        <Text variant="subhead" lines={2}>
          {recipe.title}
        </Text>
        <Text variant="caption" color="textTertiary">
          {t('common.min', { count: totalMinutes })}
        </Text>
      </View>
    </PressScale>
  );
}
