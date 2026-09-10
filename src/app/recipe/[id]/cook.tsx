import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button, IconButton } from '@/components/ui/button';
import { Screen, ScreenFooter } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { formatQuantity, scaleQuantity } from '@/features/pricing/units';
import { useRecipe } from '@/features/recipes/hooks';
import { useRecordHistory } from '@/features/saved/hooks';
import { useI18n } from '@/i18n';
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
  const router = useRouter();
  const { id, servings } = useLocalSearchParams<{ id: string; servings?: string }>();

  const { data: recipe } = useRecipe(id);
  const recordHistory = useRecordHistory();
  const [stepIndex, setStepIndex] = useState(0);
  const [finished, setFinished] = useState(false);

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

  const confirmExit = () => {
    Alert.alert(t('cooking.exitConfirmTitle'), t('cooking.exitConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('cooking.exit'), style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const handleFinish = () => {
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
        <Text variant="subhead" color="textSecondary">
          {t('recipe.step', { current: step.stepNumber, total: recipe.steps.length })}
        </Text>
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
          {step.instruction}
        </Text>

        {step.durationMinutes ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name="time-outline" size={17} color={theme.colors.textSecondary} />
            <Text variant="callout" color="textSecondary">
              {t('common.min', { count: step.durationMinutes })}
            </Text>
          </View>
        ) : null}

        {step.safetyNote ? (
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
              {step.safetyNote}
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
                  {ingredient.name}
                </Text>
                <Text variant="bodyMedium" color="textSecondary">
                  {formatQuantity(
                    scaleQuantity(ingredient.quantity, recipe.baseServings, targetServings),
                    ingredient.unit,
                    (value) => formatNumber(value),
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
        <Text variant="micro" color="textTertiary" align="center">
          {t('cooking.keepAwake')}
        </Text>
      </ScreenFooter>
    </Screen>
  );
}
