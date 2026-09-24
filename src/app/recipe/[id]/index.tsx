import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PriceTag } from '@/components/recipe/price-tag';
import {} from '@/components/recipe/recipe-card';
import { Badge } from '@/components/ui/badge';
import { useRowDirection, useSide, useTextAlign } from '@/components/ui/direction';
import { RecipeShareSheet } from '@/components/recipe/share-sheet';
import { Button, IconButton } from '@/components/ui/button';
import { ScreenFooter, ScreenScroll } from '@/components/ui/screen';
import { Divider } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { buildAvailabilityIndex, matchRecipeIngredients } from '@/features/ingredients/matching';
import { usePantryItems } from '@/features/pantry/hooks';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { estimateRecipeCost, toPricedAmount } from '@/features/pricing/estimate';
import { useIngredientName } from '@/features/ingredients/display';
import { useRecipeText } from '@/features/recipes/localise';
import { formatQuantity, scaleQuantity } from '@/features/pricing/units';
import { useRecipe } from '@/features/recipes/hooks';
import { useIsSaved, useRecordHistory, useToggleSave } from '@/features/saved/hooks';
import { useShoppingMutations } from '@/features/shopping/hooks';
import { SourcedLineRow, UnsourceableLineRow } from '@/components/commerce/sourced-line';
import { toCartInputs, useCartMutations, useRecipeSourcing } from '@/features/commerce/hooks';
import { merchantDisplayName } from '@/features/commerce/display';
import type { SourcedLine } from '@/features/commerce/ports';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { divideMoney, formatMoney } from '@/lib/format/money';
import { RecipeImage } from '@/components/recipe/recipe-image';
import { useTheme } from '@/theme';
import type { IngredientMatch, Recipe } from '@/types/domain';

/**
 * A stable empty list, so the sourcing hook's memo is not invalidated on every
 * render while the recipe is still loading.
 */
const NO_MATCHES: readonly IngredientMatch[] = [];

/**
 * One fact in the strip under the title.
 *
 * These used to sit in two separate bordered, rounded boxes — seven numbers
 * inside two cards on a screen that already had a card for cost and another
 * for servings. Cardifying a number does not make it easier to read; it makes
 * the page look like a dashboard. They are now a plain strip ruled top and
 * bottom, with hairline dividers between cells, which is how a recipe's facts
 * are set in print.
 */
function NutritionCell({
  label,
  value,
  first = false,
}: {
  label: string;
  value: string;
  /** Suppresses the leading divider on the first cell of a row. */
  first?: boolean;
}) {
  const theme = useTheme();
  // The divider belongs between cells, so it has to follow the reading
  // direction: a physical `borderLeft` would leave a rule hanging off the
  // strip's outer edge once the row reverses. `useSide` names the physical
  // side the leading edge lands on, which is the left-to-right answer on a
  // platform that swaps sides for us and the mirrored one where nothing does.
  const leading = useSide('leading');
  const divider = first ? 0 : 1;
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 3,
        paddingVertical: theme.spacing.md,
        borderLeftWidth: leading === 'left' ? divider : 0,
        borderRightWidth: leading === 'left' ? 0 : divider,
        borderLeftColor: theme.colors.border,
        borderRightColor: theme.colors.border,
      }}
    >
      <Text variant="headline">{value}</Text>
      <Text variant="micro" color="textTertiary" lines={1}>
        {label}
      </Text>
    </View>
  );
}

function IngredientLine({
  recipe,
  match,
  servings,
  muted,
}: {
  recipe: Recipe;
  match: IngredientMatch;
  servings: number;
  muted: boolean;
}) {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  const row = useRowDirection();
  const trailing = useTextAlign('trailing');
  const displayName = useIngredientName();
  const recipeText = useRecipeText();

  const ingredient = recipe.ingredients.find((entry) => entry.id === match.recipeIngredientId);
  if (!ingredient) return null;

  const scaled = scaleQuantity(ingredient.quantity, recipe.baseServings, servings);
  const quantityLabel = formatQuantity(scaled, ingredient.unit, { t, formatNumber });

  return (
    /*
      An ingredient list is a table, so it is set like one: a hairline between
      rows, the name ranged left, the quantity ranged right in its own column
      so the numbers line up down the page. The availability mark is a small
      dot rather than a filled tick — at one per row, twenty ticks became the
      loudest thing in the section, and the grouping headers above already say
      which list you are reading.
    */
    <View
      style={{
        flexDirection: row,
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: theme.radius.pill,
          backgroundColor: match.isAvailable ? theme.colors.success : theme.colors.borderStrong,
        }}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="body">
          {displayName(ingredient.name)}
          {ingredient.preparation ? (
            <Text variant="body" color="textTertiary">
              {` · ${recipeText.preparation(ingredient.preparation)}`}
            </Text>
          ) : null}
        </Text>
        {/*
          WHERE the tick came from, never a vaguer word than the truth.
          This row used to say "Pantry staple · assumed" for onions, garlic,
          stock cube, cumin and oil in a recipe that never called any of them
          a staple — the app had simply decided the user had them. It now says
          which of four things happened, and three of the four name a decision
          the user actually made.
        */}
        {match.excludedReason === 'expired' ? (
          <Text variant="micro" color="danger">
            {t('safety.expiredExcluded')}
          </Text>
        ) : match.excludedReason === 'out_of_stock' ? (
          <Text variant="micro" color="danger">
            {t('pantry.outOfStock')}
          </Text>
        ) : match.availableVia === 'universal_basic' ? (
          <Text variant="micro" color="textTertiary">
            {t('pantry.assumedBasic')}
          </Text>
        ) : match.availableVia === 'user_staple' ? (
          <Text variant="micro" color="textTertiary">
            {t('pantry.fromYourBasics')}
          </Text>
        ) : match.availableVia === 'pantry' ? (
          <Text variant="micro" color="textTertiary">
            {t('pantry.fromYourPantry')}
          </Text>
        ) : null}
      </View>
      <Text
        variant="subhead"
        color={muted ? 'textTertiary' : 'textSecondary'}
        align={trailing}
        style={{ minWidth: 64 }}
      >
        {quantityLabel}
      </Text>
      {ingredient.isOptional ? <Badge label={t('common.optional')} tone="neutral" /> : null}
    </View>
  );
}

export default function RecipeDetailScreen() {
  const theme = useTheme();
  const { t, formatNumber, locale, language } = useI18n();
  const recipeText = useRecipeText();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { preferences } = usePreferences();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: recipe, isLoading } = useRecipe(id);
  const pantry = usePantryItems();
  const isSaved = useIsSaved(id);
  const toggleSave = useToggleSave();
  const recordHistory = useRecordHistory();
  const shopping = useShoppingMutations();

  const row = useRowDirection();
  const [servings, setServings] = useState<number | null>(null);
  /**
   * Commerce is REVEALED, not rendered by default.
   *
   * The page is a recipe. Somebody who opened it to cook from what they have
   * should not have to scroll past a shop to reach the method, so the products
   * appear when they are asked for and the default view is unchanged.
   */
  const [showSourcing, setShowSourcing] = useState(false);
  const cart = useCartMutations();
  const [sharing, setSharing] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const effectiveServings = servings ?? recipe?.baseServings ?? preferences.householdSize;

  // Record the view once the recipe resolves, so "recently viewed" is accurate.
  useEffect(() => {
    if (recipe) recordHistory.mutate({ recipe, kind: 'viewed' });
    // Intentionally keyed on the id only: re-running on every mutation-object
    // identity change would log a view per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id]);

  const availability = useMemo(
    // The basics belong here as much as on the results screen: without them
    // this list would tick onions for a cook on Results and then show it as
    // missing when they opened the recipe.
    () =>
      buildAvailabilityIndex(pantry.data ?? [], [], {
        alwaysAvailable: preferences.alwaysAvailableIngredients,
      }),
    [pantry.data, preferences.alwaysAvailableIngredients],
  );

  const match = useMemo(
    () => (recipe ? matchRecipeIngredients(recipe, availability) : null),
    [recipe, availability],
  );

  const estimate = useMemo(
    () =>
      recipe
        ? estimateRecipeCost(recipe, {
            servings: effectiveServings,
            country: preferences.country,
            currency: preferences.currency,
          })
        : null,
    [recipe, effectiveServings, preferences.country, preferences.currency],
  );

  const declaredAllergens = useMemo(() => {
    if (!recipe) return [];
    return recipe.allergens.filter((allergen) => preferences.allergens.includes(allergen));
  }, [recipe, preferences.allergens]);

  /*
    YOU NEED, and what a shop could do about it.

    Hoisted above the early returns because hooks cannot be called after one.
    While the recipe is loading this sources an empty list, which selects a
    branch and does nothing else.
  */
  const missing = useMemo(() => match?.missingIngredients ?? NO_MATCHES, [match]);
  const sourcing = useRecipeSourcing(recipe?.id ?? '', missing);

  /*
    A product belongs UNDER THE ROW THAT ASKED FOR IT.

    Keyed by the recipe ingredient id that `requirementsFor` echoed onto the
    line, not by the canonical slug: one recipe can want tomatoes twice, fresh
    and tinned, and a slug key would put the tin under the fresh row.
  */
  const sourcedByIngredient = useMemo(() => {
    const byId = new Map<string, SourcedLine>();
    for (const line of sourcing?.result.lines ?? []) {
      if (line.requested.requestLineId) byId.set(line.requested.requestLineId, line);
    }
    return byId;
  }, [sourcing]);

  /** Rows the app cannot even name canonically, so no shop can be asked. */
  const unsourceableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of sourcing?.requirements.unsourceable ?? []) {
      if (entry.requestLineId) ids.add(entry.requestLineId);
    }
    return ids;
  }, [sourcing]);

  if (isLoading) {
    return (
      <ScreenScroll padded={false} edges={{ top: false }}>
        <Skeleton height={320} radius={0} />
        <View style={{ padding: theme.layout.screenPadding, gap: theme.spacing.md }}>
          <Skeleton width="70%" height={26} />
          <Skeleton width="100%" height={16} />
          <Skeleton width="90%" height={16} />
        </View>
      </ScreenScroll>
    );
  }

  if (!recipe || !match || !estimate) {
    return (
      <EmptyState
        icon="fast-food-outline"
        title={t('error.notFoundTitle')}
        body={t('error.notFoundBody')}
        action={{ label: t('error.goHome'), onPress: () => router.replace('/') }}
        fullHeight
      />
    );
  }

  const priced = toPricedAmount(estimate);
  const merchantName = sourcing ? merchantDisplayName(sourcing.merchant.merchant, language) : '';
  const addableCount = sourcing?.addable.length ?? 0;
  const perServing = divideMoney(priced.money, Math.max(1, effectiveServings));

  const handleAddMissing = () => {
    const inputs = missing
      .map((entry) => recipe.ingredients.find((ingredient) => ingredient.id === entry.recipeIngredientId))
      .filter((ingredient): ingredient is NonNullable<typeof ingredient> => Boolean(ingredient))
      .map((ingredient) => ({
        name: ingredient.name,
        quantity: scaleQuantity(ingredient.quantity, recipe.baseServings, effectiveServings),
        unit: ingredient.unit,
        sourceRecipeId: recipe.id,
      }));

    shopping.addMany.mutate(inputs, {
      onSuccess: () =>
        toast.show({
          message: t('recipe.addedToList'),
          tone: 'success',
          action: { label: t('common.seeAll'), onPress: () => router.push('/shopping-list') },
        }),
    });
  };

  /**
   * Adds ONLY what the sourcer called `matched`.
   *
   * Never a `needs_confirmation` line, never an out-of-stock one, never one
   * ruled out by an allergy and never an unmapped one. A bulk action that
   * quietly resolved an ambiguous mapping on the user's behalf would be the
   * app deciding what somebody eats, which is exactly what the three-axis
   * split in `sourcing.ts` exists to prevent.
   */
  const handleAddToCart = () => {
    if (!sourcing || sourcing.addable.length === 0) return;

    const inputs = toCartInputs(sourcing, sourcing.addable, recipe.id);
    if (inputs.length === 0) return;

    cart.addLines.mutate(inputs, {
      onSuccess: (outcome) =>
        toast.show({
          // Replacing the basket is the louder message of the two, so it wins
          // the toast: the user needs to know the other shop's items are gone.
          message: outcome.replacedMerchant
            ? t('cart.replacedMerchant')
            : t('commerce.addedToCart', { count: outcome.addedLines }),
          tone: outcome.replacedMerchant ? 'warning' : 'success',
          action: { label: t('commerce.viewCart'), onPress: () => router.push('/cart') },
        }),
      onError: (error) =>
        toast.show({ message: t(presentError(error).bodyKey), tone: 'danger' }),
    });
  };

  const toggleStep = (stepId: string) => {
    setCompletedSteps((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const safetyNotes = recipe.steps
    .map((step) => recipeText.safetyNote(step))
    .filter((note): note is string => Boolean(note));

  return (
    <>
      <ScreenScroll padded={false} edges={{ top: false }} bottomInset={theme.spacing.huge}>
        <View style={{ position: 'relative' }}>
          <RecipeImage recipe={recipe} aspectRatio={theme.layout.heroImageAspect} />
          {/*
            The one gradient left on this screen, and it is functional rather
            than decorative: back, share and save sit over arbitrary
            photography, and without a scrim their legibility depends on
            whatever happens to be in the top of the picture. The two
            decorative gradients this app used to have — the home hero pair and
            the missing-photo placeholder — are gone.
          */}
          <LinearGradient
            colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 108 }}
            pointerEvents="none"
          />
          <View
            style={{
              position: 'absolute',
              top: insets.top + theme.spacing.sm,
              left: theme.layout.screenPadding,
              right: theme.layout.screenPadding,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            <IconButton
              icon="chevron-back"
              variant="onImage"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityLabel={t('common.back')}
              testID="recipe-back"
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <IconButton
                icon="share-outline"
                variant="onImage"
                onPress={() => setSharing(true)}
                accessibilityLabel={t('recipe.share')}
                testID="recipe-share"
              />
              <IconButton
                icon={isSaved ? 'heart' : 'heart-outline'}
                variant="onImage"
                onPress={() => toggleSave.mutate({ recipe, shouldSave: !isSaved })}
                accessibilityLabel={isSaved ? t('recipe.unsaveRecipe') : t('recipe.saveRecipe')}
                testID="recipe-save"
              />
            </View>
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.lg,
            gap: theme.spacing.xl,
          }}
        >
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="title1">{recipeText.title(recipe)}</Text>
            <Text variant="callout" color="textSecondary">
              {recipeText.description(recipe)}
            </Text>
          </View>

          {declaredAllergens.length > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.dangerSoft,
              }}
            >
              <Ionicons name="warning" size={18} color={theme.colors.danger} />
              <Text variant="footnote" style={{ color: theme.colors.dangerSoftText, flex: 1 }}>
                {t('recipe.allergenWarning', {
                  allergens: declaredAllergens
                    .map((allergen) => t(`allergen.${allergen}` as const))
                    .join(', '),
                })}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              flexDirection: row,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <NutritionCell
              first
              label={t('recipe.prepTime')}
              value={t('common.min', { count: recipe.prepMinutes })}
            />
            <NutritionCell
              label={t('recipe.cookTime')}
              value={t('common.min', { count: recipe.cookMinutes })}
            />
            <NutritionCell
              label={t('recipe.difficulty')}
              value={t(`difficulty.${recipe.difficulty}` as const)}
            />
          </View>

          <View
            style={{
              flexDirection: row,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <NutritionCell
              first
              label={t('recipe.calories')}
              value={recipe.nutrition.calories !== null ? formatNumber(recipe.nutrition.calories) : '—'}
            />
            <NutritionCell
              label={t('recipe.protein')}
              value={
                recipe.nutrition.proteinGrams !== null
                  ? t('common.grams', { count: recipe.nutrition.proteinGrams })
                  : '—'
              }
            />
            <NutritionCell
              label={t('recipe.carbs')}
              value={
                recipe.nutrition.carbsGrams !== null
                  ? t('common.grams', { count: recipe.nutrition.carbsGrams })
                  : '—'
              }
            />
            <NutritionCell
              label={t('recipe.fat')}
              value={
                recipe.nutrition.fatGrams !== null
                  ? t('common.grams', { count: recipe.nutrition.fatGrams })
                  : '—'
              }
            />
          </View>

          <View
            style={{
              flexDirection: row,
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
            }}
          >
            {/*
              Cost leads, servings answer to it. The two used to be a matched
              pair of equal-weight labelled blocks, which made the reader work
              out which was the number and which was the control. The label is
              now a quiet eyebrow, the money is the biggest thing in the row,
              and the per-serving figure hangs beneath it — where it reads as a
              consequence of the stepper rather than a competing fact.
            */}
            <View style={{ gap: 2, flex: 1 }}>
              <Text variant="micro" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                {t('recipe.estimatedCost')}
              </Text>
              <PriceTag priced={priced} size="lg" />
              <Text variant="micro" color="textTertiary">
                {t('recipe.costPerServing', {
                  value: `~${formatMoney(perServing, { locale })}`,
                })}
              </Text>
            </View>
            <View style={{ gap: theme.spacing.xs, alignItems: 'flex-end' }}>
              <Text variant="micro" color="textTertiary" style={{ textTransform: 'uppercase' }}>
                {t('recipe.servingsAdjust')}
              </Text>
              <Stepper
                value={effectiveServings}
                onChange={setServings}
                min={1}
                max={12}
                accessibilityLabel={t('recipe.servingsAdjust')}
                testID="recipe-servings"
              />
            </View>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Text variant="title3">{t('recipe.ingredients')}</Text>

            {/*
              The have/need split is the reason this screen exists, so each
              group is labelled with its own count rather than relying on the
              reader to total the ticks themselves.
            */}
            {match.availableIngredients.length > 0 ? (
              <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.xs }}>
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                >
                  <Text
                    variant="micro"
                    style={{ color: theme.colors.success, textTransform: 'uppercase' }}
                  >
                    {t('recipe.youHave')}
                  </Text>
                  <Text variant="micro" color="textTertiary">
                    {formatNumber(match.availableIngredients.length)}
                  </Text>
                </View>
                {match.availableIngredients.map((entry) => (
                  <IngredientLine
                    key={entry.recipeIngredientId}
                    recipe={recipe}
                    match={entry}
                    servings={effectiveServings}
                    muted
                  />
                ))}
              </View>
            ) : null}

            {missing.length > 0 ? (
              <View
                style={{ gap: theme.spacing.xs, marginTop: theme.spacing.lg }}
                testID="recipe-you-need"
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                >
                  <Text
                    variant="micro"
                    style={{ color: theme.colors.primary, textTransform: 'uppercase' }}
                  >
                    {t('recipe.youNeed')}
                  </Text>
                  <Text variant="micro" color="textTertiary">
                    {formatNumber(missing.length)}
                  </Text>
                </View>
                {missing.map((entry) => {
                  const sourced = sourcedByIngredient.get(entry.recipeIngredientId);
                  return (
                    <View key={entry.recipeIngredientId} style={{ gap: 4 }}>
                      <IngredientLine
                        recipe={recipe}
                        match={entry}
                        servings={effectiveServings}
                        muted={false}
                      />
                      {showSourcing && sourcing ? (
                        sourced ? (
                          <SourcedLineRow
                            line={sourced}
                            merchantName={merchantName}
                            testID={`recipe-sourced-${entry.recipeIngredientId}`}
                          />
                        ) : unsourceableIds.has(entry.recipeIngredientId) ? (
                          <UnsourceableLineRow
                            testID={`recipe-unsourceable-${entry.recipeIngredientId}`}
                          />
                        ) : null
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={{ gap: theme.spacing.md }}>
            <Text variant="title3">{t('recipe.steps')}</Text>
            {recipe.steps.map((step) => {
              const isDone = completedSteps.has(step.id);
              return (
                <View key={step.id}>
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: theme.spacing.md,
                      paddingVertical: theme.spacing.sm,
                    }}
                  >
                    <IconButton
                      icon={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                      variant="ghost"
                      size={28}
                      active={isDone}
                      onPress={() => toggleStep(step.id)}
                      accessibilityLabel={`${t('recipe.step', {
                        current: step.stepNumber,
                        total: recipe.steps.length,
                      })}`}
                      testID={`step-${step.stepNumber}`}
                    />
                    <View style={{ flex: 1, gap: theme.spacing.xs }}>
                      <Text
                        variant="body"
                        color={isDone ? 'textTertiary' : 'text'}
                        style={isDone ? { textDecorationLine: 'line-through' } : undefined}
                      >
                        {recipeText.instruction(step)}
                      </Text>
                      {recipeText.safetyNote(step) ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            gap: theme.spacing.xs,
                            alignItems: 'flex-start',
                          }}
                        >
                          <Ionicons
                            name="shield-checkmark"
                            size={13}
                            color={theme.colors.warningSoftText}
                            style={{ marginTop: 2 }}
                          />
                          <Text
                            variant="footnote"
                            style={{ color: theme.colors.warningSoftText, flex: 1 }}
                          >
                            {recipeText.safetyNote(step)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <Divider />
                </View>
              );
            })}
          </View>

          {safetyNotes.length > 0 ? (
            <View
              style={{
                gap: theme.spacing.sm,
                padding: theme.spacing.lg,
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.warningSoft,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <Ionicons name="shield-checkmark" size={17} color={theme.colors.warningSoftText} />
                <Text variant="headline" style={{ color: theme.colors.warningSoftText }}>
                  {t('recipe.safetyTitle')}
                </Text>
              </View>
              <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
                {t('safety.crossContamination')}
              </Text>
            </View>
          ) : null}

          <View style={{ gap: theme.spacing.sm }}>
            {missing.length > 0 ? (
              <Button
                label={t('recipe.addMissingToList', { count: missing.length })}
                icon="cart-outline"
                variant="secondary"
                onPress={handleAddMissing}
                loading={shopping.addMany.isPending}
                size="lg"
                testID="recipe-add-missing"
              />
            ) : null}

            {/*
              THE SHOP, WHICH IS OPT-IN AND HONEST ABOUT ITSELF.

              Three states, and no button that looks alive and is not. With no
              branch selectable the control says so and cannot be pressed —
              the same rule the shopping list follows, because two screens
              disagreeing about whether ordering exists is worse than either
              answer. With one, the first tap reveals the products; only then
              is there anything to add.
            */}
            {missing.length === 0 ? null : !sourcing ? (
              <Button
                label={t('shopping.orderComingSoon')}
                icon="bag-handle-outline"
                variant="ghost"
                disabled
                size="md"
                fullWidth
                testID="recipe-order"
              />
            ) : !showSourcing ? (
              <Button
                label={t('commerce.getMissing')}
                icon="bag-handle-outline"
                variant="secondary"
                onPress={() => setShowSourcing(true)}
                size="md"
                fullWidth
                testID="recipe-get-missing"
              />
            ) : (
              <View
                style={{
                  gap: theme.spacing.sm,
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.lg,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface,
                }}
                testID="recipe-sourcing"
              >
                {/*
                  THE DEMO BADGE IS NOT DECORATION. This catalogue is fixture
                  data with invented prices, and anything that looks like a
                  supermarket without saying it is not one is a lie the user
                  cannot detect from the inside.
                */}
                {sourcing.merchant.isDemo ? (
                  <View style={{ gap: 2 }} testID="recipe-demo-badge">
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.xs,
                      }}
                    >
                      <Ionicons name="flask-outline" size={14} color={theme.colors.warningSoftText} />
                      <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
                        {t('commerce.demoBadge')}
                      </Text>
                    </View>
                    <Text variant="caption" color="textTertiary">
                      {t('commerce.demoBody')}
                    </Text>
                  </View>
                ) : (
                  <Text variant="footnote" color="textSecondary">
                    {t('commerce.sourcingFrom', { merchant: merchantName })}
                  </Text>
                )}

                {/*
                  PARTIAL FULFILMENT IS SAID OUT LOUD. "Add 3 to cart" under a
                  list of seven missing ingredients reads as a complete answer
                  unless the screen states the gap.
                */}
                <Text variant="footnote" color={addableCount === 0 ? 'textSecondary' : 'text'}>
                  {addableCount === 0
                    ? t('commerce.noneReady')
                    : addableCount === missing.length
                      ? t('commerce.allReady', { count: addableCount })
                      : t('commerce.partial', {
                          ready: formatNumber(addableCount),
                          total: formatNumber(missing.length),
                        })}
                </Text>
                {/*
                  WHY THE GAP EXISTS, WITHOUT RECOMMENDING ANYTHING.

                  The lines this sentence covers are not one thing. Some are
                  merely unmapped; others were refused because every option
                  conflicts with an allergy the cook declared, or because
                  nobody published allergen data for them, or because we are
                  not confident the product is the ingredient. Telling the cook
                  to "buy the rest yourself" is a purchase recommendation, and
                  applied to those it reads as AKALT suggesting a product it
                  had just refused. The ROW says why for each one; this says
                  only that we could not do it automatically.
                */}
                {addableCount < missing.length ? (
                  <>
                    <Text variant="caption" color="textTertiary">
                      {t('commerce.partialBody')}
                    </Text>
                    <Text variant="caption" color="textTertiary">
                      {t('commerce.partialAside')}
                    </Text>
                  </>
                ) : null}

                <Button
                  label={t('commerce.addToCart', { count: addableCount })}
                  icon="cart-outline"
                  onPress={handleAddToCart}
                  disabled={addableCount === 0}
                  loading={cart.addLines.isPending}
                  size="lg"
                  fullWidth
                  testID="recipe-add-to-cart"
                />
                <View style={{ flexDirection: row, gap: theme.spacing.sm }}>
                  <Button
                    label={t('commerce.viewCart')}
                    variant="ghost"
                    onPress={() => router.push('/cart')}
                    size="md"
                    testID="recipe-view-cart"
                  />
                  <Button
                    label={t('commerce.hide')}
                    variant="ghost"
                    onPress={() => setShowSourcing(false)}
                    size="md"
                    testID="recipe-hide-sourcing"
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      </ScreenScroll>

      <ScreenFooter>
        <Button
          label={t('recipe.startCooking')}
          icon="play"
          onPress={() => router.push(`/recipe/${recipe.id}/cook?servings=${effectiveServings}`)}
          size="lg"
          testID="recipe-start-cooking"
        />
      </ScreenFooter>

      <RecipeShareSheet
        visible={sharing}
        onClose={() => setSharing(false)}
        recipeId={recipe.id}
        recipeTitle={recipeText.title(recipe)}
      />
    </>
  );
}
