import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PriceTag } from '@/components/recipe/price-tag';
import {} from '@/components/recipe/recipe-card';
import { Badge } from '@/components/ui/badge';
import { RecipeShareSheet } from '@/components/recipe/share-sheet';
import { Button, IconButton } from '@/components/ui/button';
import { ScreenFooter, ScreenScroll } from '@/components/ui/screen';
import { Divider } from '@/components/ui/section';
import { Sheet } from '@/components/ui/sheet';
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
import { isOrderingAvailable } from '@/features/grocery/registry';
import { useI18n } from '@/i18n';
import { divideMoney, formatMoney } from '@/lib/format/money';
import { RecipeImage } from '@/components/recipe/recipe-image';
import { useTheme } from '@/theme';
import type { IngredientMatch, Recipe } from '@/types/domain';

function NutritionCell({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: theme.spacing.sm }}>
      <Text variant="bodyMedium">{value}</Text>
      <Text variant="micro" color="textTertiary">
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
  const displayName = useIngredientName();
  const recipeText = useRecipeText();

  const ingredient = recipe.ingredients.find((entry) => entry.id === match.recipeIngredientId);
  if (!ingredient) return null;

  const scaled = scaleQuantity(ingredient.quantity, recipe.baseServings, servings);
  const quantityLabel = formatQuantity(scaled, ingredient.unit, { t, formatNumber });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        opacity: muted ? 0.85 : 1,
      }}
    >
      <Ionicons
        name={match.isAvailable ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={match.isAvailable ? theme.colors.success : theme.colors.borderStrong}
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
      <Text variant="subhead" color="textSecondary">
        {quantityLabel}
      </Text>
      {ingredient.isOptional ? <Badge label={t('common.optional')} tone="neutral" /> : null}
    </View>
  );
}

export default function RecipeDetailScreen() {
  const theme = useTheme();
  const { t, formatNumber, locale } = useI18n();
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

  const [servings, setServings] = useState<number | null>(null);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const orderingAvailable = isOrderingAvailable(preferences.country);
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
  const perServing = divideMoney(priced.money, Math.max(1, effectiveServings));
  const missing = match.missingIngredients;

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
          <RecipeImage
            recipe={recipe}
            aspectRatio={theme.layout.heroImageAspect}
            glyphSize={52}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120 }}
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
              flexDirection: 'row',
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              ...theme.elevation(1),
            }}
          >
            <NutritionCell
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
              flexDirection: 'row',
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
              ...theme.elevation(1),
            }}
          >
            <NutritionCell
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
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
            }}
          >
            <View style={{ gap: 2 }}>
              <Text variant="caption" color="textTertiary">
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
              <Text variant="caption" color="textTertiary">
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

            {match.availableIngredients.length > 0 ? (
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" color="successSoftText">
                  {t('recipe.youHave')}
                </Text>
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
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" color="primary">
                  {t('recipe.youNeed')}
                </Text>
                {missing.map((entry) => (
                  <IngredientLine
                    key={entry.recipeIngredientId}
                    recipe={recipe}
                    match={entry}
                    servings={effectiveServings}
                    muted={false}
                  />
                ))}
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
              The same rule the shopping list already follows, and this screen
              did not: an active-looking button that opens a sheet saying
              "not available yet" is a tap spent to learn nothing, and two
              screens disagreeing about whether ordering exists is worse than
              either answer. No provider is configured for any country yet —
              `enabledProvidersFor` returns none — so the unavailable state
              says so on its face and cannot be pressed. The sheet and the
              provider registry stay for when one is.
            */}
            <Button
              label={orderingAvailable ? t('recipe.orderIngredients') : t('shopping.orderComingSoon')}
              icon="bag-handle-outline"
              variant="ghost"
              onPress={orderingAvailable ? () => setOrderSheetOpen(true) : undefined}
              disabled={!orderingAvailable}
              size="md"
              fullWidth
              testID="recipe-order"
            />
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

      <Sheet
        visible={orderSheetOpen}
        onClose={() => setOrderSheetOpen(false)}
        title={t('recipe.orderComingSoon')}
        scrollable={false}
      >
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="body" color="textSecondary">
            {orderingAvailable
              ? t('grocery.notAvailableBody', { country: t(`country.${preferences.country}` as const) })
              : t('recipe.orderComingSoonBody')}
          </Text>
          <Button
            label={t('recipe.addMissingToList', { count: missing.length })}
            onPress={() => {
              handleAddMissing();
              setOrderSheetOpen(false);
            }}
            disabled={missing.length === 0}
            size="lg"
          />
        </View>
      </Sheet>

      <RecipeShareSheet
        visible={sharing}
        onClose={() => setSharing(false)}
        recipeId={recipe.id}
        recipeTitle={recipeText.title(recipe)}
      />
    </>
  );
}
