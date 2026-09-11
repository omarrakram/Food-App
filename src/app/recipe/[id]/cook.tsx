import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button, IconButton } from '@/components/ui/button';
import { Screen, ScreenFooter } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useIngredientName } from '@/features/ingredients/display';
import { useRecipeText } from '@/features/recipes/localise';
import { formatQuantity, scaleQuantity } from '@/features/pricing/units';
import { useRecipe } from '@/features/recipes/hooks';
import { useRecordHistory } from '@/features/saved/hooks';
import { useI18n } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { useTheme } from '@/theme';

/**
 * Distraction-free cooking mode.
 *
 * One instruction at a time, large type, and the ingredients that step needs
 * right underneath. The screen is kept awake because the user's hands are
 * covered in flour.
 *
 * Timers: `RecipeStep.durationMinutes` is already carried through the data
 * model and shown here, so adding a countdown is a UI-only change — see
 * PROJECT_STATUS.md § Future features.
 */
export default function CookingModeScreen() {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  const displayName = useIngredientName();
  const recipeText = useRecipeText();
  const router = useRouter();
  const { id, servings } = useLocalSearchParams<{ id: string; servings?: string }>();

  const { data: recipe } = useRecipe(id);
  const recordHistory = useRecordHistory();
  const [stepIndex, setStepIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const hasLoggedRef = useRef(false);

  // Keeps the screen on while someone is cooking with their hands full.
  useKeepAwake();

  const targetServings = useMemo(() => {
    const parsed = servings ? Number.parseInt(servings, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : (recipe?.baseServings ?? 2);
  }, [servings, recipe?.baseServings]);

  if (!recipe) {
    return (
      <Screen>
        <EmptyState
          icon="fast-food-outline"
          title={t('error.notFoundTitle')}
          body={t('error.notFoundBody')}
          action={{ label: t('error.goHome'), onPress: () => router.replace('/') }}
          fullHeight
        />
      </Screen>
    );
  }

  const step = recipe.steps[stepIndex];
  const isLastStep = stepIndex === recipe.steps.length - 1;

  /**
   * Asks before discarding progress — and only then.
   *
   * Confirming an exit from step one, where there is nothing to lose, trains
   * people to dismiss the dialog without reading it, which is exactly when it
   * stops protecting anything.
   */
  const confirmExit = () => {
    if (stepIndex === 0) {
      router.back();
      return;
    }

    void confirmAction({
      title: t('cooking.exitConfirmTitle'),
      message: t('cooking.exitConfirmBody'),
      confirmLabel: t('cooking.exit'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    }).then((confirmed) => {
      if (confirmed) router.back();
    });
  };

  /**
   * Writes the cooked entry exactly once.
   *
   * `finished` flips in the same render pass, but a double tap can land two
   * presses before React re-renders, and each one would append a separate
   * history row for the same meal. The ref settles synchronously.
   */
  const handleFinish = () => {
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;
    recordHistory.mutate({ recipe, kind: 'cooked' });
    setFinished(true);
  };

  if (finished) {
    return (
      <Screen background="backgroundAlt">
        <EmptyState
          icon="checkmark-circle"
          title={t('cooking.finishedTitle')}
          body={t('cooking.finishedBody')}
          action={{ label: t('common.done'), onPress: () => router.dismissAll() }}
          fullHeight
          testID="cooking-finished"
        />
      </Screen>
    );
  }

  if (!step) {
    return (
      <Screen>
        <EmptyState
          icon="fast-food-outline"
          title={t('error.notFoundTitle')}
          body={t('error.notFoundBody')}
          action={{ label: t('error.goHome'), onPress: () => router.replace('/') }}
          fullHeight
        />
      </Screen>
    );
  }

  const stepIngredients = recipe.ingredients.filter((ingredient) =>
    step.ingredientRefs.some(
      (ref) => ref.toLowerCase() === ingredient.name.toLowerCase(),
    ),
  );

  return (
    <Screen background="backgroundAlt" edges={{ top: true, bottom: false }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: theme.spacing.sm,
        }}
      >
        <IconButton
          icon="close"
          onPress={confirmExit}
          accessibilityLabel={t('cooking.exit')}
          testID="cooking-exit"
        />
        {/*
          The step counter with the dish above it: enough to know what you are
          cooking after a pause, without turning a distraction-free screen into
          a header.
        */}
        <View style={{ flex: 1, alignItems: 'center', gap: 1 }}>
          <Text variant="micro" color="textTertiary" numberOfLines={1}>
            {recipeText.title(recipe)}
          </Text>
          <Text variant="subhead" color="textSecondary">
            {t('recipe.step', { current: step.stepNumber, total: recipe.steps.length })}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress bar */}
      <View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: 'hidden',
          marginBottom: theme.spacing.xl,
        }}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: recipe.steps.length, now: step.stepNumber }}
      >
        <View
          style={{
            height: 4,
            width: `${(step.stepNumber / recipe.steps.length) * 100}%`,
            backgroundColor: theme.colors.primary,
          }}
        />
      </View>

      <Animated.View
        key={step.id}
        entering={FadeIn.duration(theme.duration.normal)}
        exiting={FadeOut.duration(theme.duration.fast)}
        style={{ flex: 1, gap: theme.spacing.xl }}
      >
        <Text variant="title1" style={{ lineHeight: 38 }}>
          {recipeText.instruction(step)}
        </Text>

        {step.durationMinutes ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name="time-outline" size={17} color={theme.colors.textSecondary} />
            <Text variant="callout" color="textSecondary">
              {t('common.min', { count: step.durationMinutes })}
            </Text>
          </View>
        ) : null}

        {recipeText.safetyNote(step) ? (
          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.warningSoft,
            }}
          >
            <Ionicons name="shield-checkmark" size={19} color={theme.colors.warningSoftText} />
            <Text variant="callout" style={{ color: theme.colors.warningSoftText, flex: 1 }}>
              {recipeText.safetyNote(step)}
            </Text>
          </View>
        ) : null}

        {stepIngredients.length > 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="caption" color="textTertiary">
              {t('cooking.ingredientsForStep')}
            </Text>
            {stepIngredients.map((ingredient) => (
              <View
                key={ingredient.id}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: theme.spacing.md,
                  paddingVertical: 4,
                }}
              >
                <Text variant="bodyMedium" style={{ flex: 1 }}>
                  {displayName(ingredient.name)}
                </Text>
                <Text variant="bodyMedium" color="textSecondary">
                  {formatQuantity(
                    scaleQuantity(ingredient.quantity, recipe.baseServings, targetServings),
                    ingredient.unit,
                    { t, formatNumber },
                  )}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Animated.View>

      <ScreenFooter>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Button
            label={t('cooking.previous')}
            variant="secondary"
            onPress={() => setStepIndex((index) => Math.max(0, index - 1))}
            disabled={stepIndex === 0}
            size="lg"
            style={{ flex: 1 }}
            testID="cooking-previous"
          />
          <Button
            label={isLastStep ? t('cooking.finish') : t('cooking.next')}
            onPress={() =>
              isLastStep ? handleFinish() : setStepIndex((index) => index + 1)
            }
            size="lg"
            style={{ flex: 1 }}
            testID="cooking-next"
          />
        </View>
        {/*
          Claimed only on the platforms where it is true. expo-keep-awake maps
          to the browser Wake Lock API on web, which needs a secure context and
          can be refused — promising a screen that stays on and then letting it
          sleep mid-recipe is worse than saying nothing.
        */}
        {Platform.OS === 'ios' || Platform.OS === 'android' ? (
          <Text variant="micro" color="textTertiary" align="center">
            {t('cooking.keepAwake')}
          </Text>
        ) : null}
      </ScreenFooter>
    </Screen>
  );
}
