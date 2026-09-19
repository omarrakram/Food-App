import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { PressScale, usePressFeedback } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { useRecipeText } from '@/features/recipes/localise';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';

import { RecipeImage } from './recipe-image';
import type { Recipe, RecipeMatch } from '@/types/domain';

import { PriceTag } from './price-tag';

function MetaPill({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
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

/**
 * "How much of this do I already have?" — the single fact this product exists
 * to answer, finally rendered where it can be read.
 *
 * It used to be a small badge reading "3/5" sitting ON the photograph, behind
 * a black gradient scrim put there to make it legible. That is three problems
 * at once: the most important number on the card competed with the food, it
 * was compressed to a fraction with no label, and it forced a decorative
 * gradient onto every card in the app.
 *
 * Here it is a titled row under the content with a proportion bar. The bar is
 * not decoration — it is the one glanceable encoding of "nearly there" versus
 * "barely", which a fraction cannot give you at scrolling speed.
 */
function MatchRow({ match }: { match: RecipeMatch }) {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  const row = useRowDirection();

  const hasEverything = match.missingIngredients.length === 0 && match.requiredCount > 0;
  const fraction =
    match.requiredCount > 0 ? Math.min(1, match.haveCount / match.requiredCount) : 0;
  const accent = hasEverything ? theme.colors.success : theme.colors.primary;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons
          name={hasEverything ? 'checkmark-circle' : 'basket-outline'}
          size={16}
          color={accent}
        />
        <Text variant="subhead" style={{ color: accent, flex: 1 }} lines={1}>
          {hasEverything
            ? t('results.matchFull')
            : t('results.match', {
                have: formatNumber(match.haveCount),
                total: formatNumber(match.requiredCount),
              })}
        </Text>
        {match.missingIngredients.length > 0 ? (
          <Text variant="caption" color="textTertiary">
            {t('results.missing', { count: match.missingIngredients.length })}
          </Text>
        ) : null}
      </View>

      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          height: 3,
          borderRadius: theme.radius.xs,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: 'hidden',
          // Progress grows from the edge the reader starts at, which in Arabic
          // is the right. A bar that fills leftward reads as depletion.
          flexDirection: row,
        }}
      >
        <View
          style={{
            width: `${Math.round(fraction * 100)}%`,
            height: '100%',
            backgroundColor: accent,
          }}
        />
      </View>
    </View>
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
  const { t } = useI18n();
  const recipeText = useRecipeText();
  const { recipe } = match;

  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;
  // Only meaningful once a pantry is known; without one the two figures are
  // identical and the extra label would be noise.
  const ownsSomething =
    match.estimatedSpend !== null &&
    match.estimatedCost !== null &&
    match.estimatedSpend.money.amountMinor !== match.estimatedCost.money.amountMinor;

  /*
    THE CARD IS NOT A BUTTON, and that is the whole point of this structure.

    It used to be: a `PressScale` wrapping everything, with the save button and
    the price tag — both independently pressable — inside it. On web
    react-native-web renders `accessibilityRole="button"` as a real `<button>`,
    so that produced `<button>` inside `<button>`: invalid HTML, which React
    says out loud, and worse than a warning for anyone using a screen reader or
    a keyboard, for whom a control nested inside another control is ambiguous
    at best and unreachable at worst.

    So the card is a plain container. The press target wraps only the parts
    that do nothing on their own — image, title, description, meta — and the
    two real controls are its SIBLINGS: the save button absolutely positioned
    over the image exactly where it was, and the price row in normal flow
    below. Three siblings, three separate controls, no nesting.

    The press feedback moves to the container so the whole card still shrinks
    as one, price row included: `PressScale` forwards `onPressIn`/`onPressOut`,
    and this drives the same timing and spring it would have used itself.
  */
  const press = usePressFeedback(0.985);

  return (
    <Animated.View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        },
        style as ViewStyle,
        press.style,
      ]}
    >
      <PressScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${recipeText.title(recipe)}. ${recipeText.description(recipe)}`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        haptic="light"
        // The container carries the scale, so the press target must not also
        // shrink — two scales would compound into a visibly deeper press.
        scaleTo={1}
      >
        <View style={{ position: 'relative' }}>
          <RecipeImage
            recipe={recipe}
            aspectRatio={theme.layout.cardImageAspect}
            fallbackAspectRatio={theme.layout.cardFallbackAspect}
          />

          {/*
            No scrim gradient any more. It existed only to make the match badge
            readable over the photograph; the badge now lives under the content
            in `MatchRow`, so the photograph is allowed to just be a photograph.
            The one thing still overlaid is a genuine time-sensitive alert, and
            it carries its own solid background.
          */}
          {match.usesExpiringItems.length > 0 ? (
            <View style={{ position: 'absolute', top: theme.spacing.sm, left: theme.spacing.sm }}>
              <Badge
                label={t('pantry.expiringSoon')}
                tone="warning"
                icon="time-outline"
                size="md"
              />
            </View>
          ) : null}
        </View>

        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.lg,
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ gap: 3 }}>
            {/*
            Marked so a test can read the title without scraping the card's
            text. Its first rendered line is the save button's icon glyph and
            its second is the match badge, so "the first words in the card" is
            not the title and an evidence table built that way says so.
          */}
            <Text variant="title2" lines={2} testID={`recipe-title-${recipe.id}`}>
              {recipeText.title(recipe)}
            </Text>
            <Text variant="footnote" color="textSecondary" lines={2}>
              {recipeText.description(recipe)}
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

          {showMatch && match.requiredCount > 0 ? <MatchRow match={match} /> : null}
        </View>
      </PressScale>

      {/*
        Outside the press target because `PriceTag` is itself a button — it
        opens the explainer for how an estimate is reached. The padding
        reproduces what it had as the last child of the block above: the
        container's `gap` of `sm` plus its own `marginTop: 2`.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm + 2,
          paddingBottom: theme.spacing.lg,
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
        {/* The missing count now lives in `MatchRow`, next to the number it
            qualifies, rather than orphaned on the opposite side of the card. */}
      </View>

      {/*
        Also a sibling, and positioned against the card rather than the image —
        the image is flush with the card's top edge, so the offsets land on the
        same pixels they did before.
      */}
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
    </Animated.View>
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
  const recipeText = useRecipeText();
  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={recipeText.title(recipe)}
      onPress={onPress}
      haptic="light"
      scaleTo={0.96}
      style={{ width, gap: theme.spacing.sm }}
    >
      <View style={{ position: 'relative', borderRadius: theme.radius.md, overflow: 'hidden' }}>
        <RecipeImage recipe={recipe} aspectRatio={1} />
        {badge ? (
          <View style={{ position: 'absolute', left: 6, bottom: 6 }}>
            <Badge label={badge} tone="primary" />
          </View>
        ) : null}
      </View>

      <View style={{ gap: 1 }}>
        <Text variant="subhead" lines={2}>
          {recipeText.title(recipe)}
        </Text>
        <Text variant="caption" color="textTertiary">
          {t('common.min', { count: totalMinutes })}
        </Text>
      </View>
    </PressScale>
  );
}
