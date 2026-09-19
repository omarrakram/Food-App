import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { SUGGESTED_KITCHEN_BASICS } from '@/features/ingredients/catalogue';
import { Button } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { Chip } from '@/components/ui/chip';
import { Screen, ScreenFooter } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { SUPPORTED_LANGUAGES, useI18n } from '@/i18n';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import { useTheme } from '@/theme';
import {
  ALLERGENS,
  EATING_STYLES,
  type Allergen,
  type UserPreferences,
} from '@/types/domain';

/**
 * First-run onboarding, in three screens.
 *
 * It has been eleven, then seven, and is now three. The pattern each time was
 * the same: questions a person answers in the same breath
 * now share a screen ("where do you cook, and for how many"), while the two
 * that carry real weight keep their own: diet, because the model behind it is
 * subtle, and allergies, because they are a safety constraint rather than a
 * preference.
 *
 * No preference FIELD was deleted — every one still exists, still has its
 * default, and is still editable in Settings. What changed is which of them a
 * first-time user is compelled to answer before the app will show them food.
 */

type Draft = Partial<UserPreferences>;

type StepId = 'language' | 'avoid' | 'start';

/**
 * THREE STEPS, and the cut is the point.
 *
 * This was seven: name, household, diet, avoid, taste, basics, kitchen — and
 * the ONLY required one was `name`, which is the single most optional fact in
 * the product. A first-time user had to type their name before the app would
 * show them a recipe. That is asking for profile information before
 * demonstrating any value, in the first ten seconds.
 *
 * What survives has to earn its place by being unanswerable by default:
 *
 *   language   changes every string on every subsequent screen, so asking
 *              after would mean asking in a language they may not read.
 *   avoid      allergies are a SAFETY rule, not a preference. The app must not
 *              show someone food that could hurt them, and it cannot infer
 *              that. Eating style rides along because it changes every result
 *              and costs one tap on a step already open.
 *   start      not a question — the first useful thing, chosen by the user.
 *
 * Everything cut has a defensible default AND an existing Settings screen:
 * name -> settings/profile, household and country -> settings/household,
 * dislikes -> settings/preferences, basics -> settings/basics, appliances ->
 * settings/kitchen. Nothing became unreachable; it stopped being compulsory.
 */
const STEPS: readonly StepId[] = ['language', 'avoid', 'start'];

/**
 * Steps that must be answered before moving on.
 *
 * Empty on purpose. `language` and `start` both commit a real choice by being
 * pressed, and `avoid` is skippable because "no allergies" is a legitimate
 * answer that must not be harder to give than a wrong one.
 */
const REQUIRED_STEPS: ReadonlySet<StepId> = new Set<StepId>();

function toggle<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}

export default function OnboardingScreen() {
  const theme = useTheme();
  const { t, language, setLanguage, isRTL } = useI18n();
  const row = useRowDirection();
  const router = useRouter();
  const { preferences, completeOnboarding } = usePreferences();

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>({});
  const [restored, setRestored] = useState(false);

  // Restore any partially completed run.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getItem<{ draft: Draft; index: number }>(StorageKeys.onboardingDraft);
      if (!cancelled && stored) {
        setDraft(stored.draft);
        // A draft saved by the eleven-step build can carry an index past the
        // end of the new flow; clamping is what keeps that upgrade silent.
        setIndex(Math.min(Math.max(stored.index, 0), STEPS.length - 1));
      }
      if (!cancelled) setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = useCallback(
    (update: Draft) => {
      setDraft((current) => {
        const next = { ...current, ...update };
        void setItem(StorageKeys.onboardingDraft, { draft: next, index });
        return next;
      });
    },
    [index],
  );

  const step = STEPS[index] ?? 'language';
  const isLast = index === STEPS.length - 1;
  const isFirst = index === 0;

  const canAdvance = useMemo(() => !REQUIRED_STEPS.has(step), [step]);

  const goNext = () => {
    if (index < STEPS.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      void setItem(StorageKeys.onboardingDraft, { draft, index: nextIndex });
    }
  };

  const goBack = () => {
    if (index > 0) setIndex(index - 1);
  };

  /**
   * Completes onboarding and lands the user on the thing they chose.
   *
   * The kitchen basics default is still committed explicitly rather than left
   * undefined, which would silently mean "I have nothing" and quietly break
   * every match. It is no longer a step the user walks through, so it is now
   * surfaced in Settings -> Kitchen basics instead, pre-ticked and editable.
   *
   * It also no longer detours through `(auth)/welcome`. The route gate already
   * shows that screen BEFORE onboarding for anyone who has never answered it,
   * so sending a guest there again on the way out asked the same question
   * twice and put an account wall between a user and the first useful screen.
   */
  const finish = async (destination: '/cook' | '/budget') => {
    await completeOnboarding({
      ...draft,
      alwaysAvailableIngredients:
        draft.alwaysAvailableIngredients ?? [...SUGGESTED_KITCHEN_BASICS],
    });
    router.replace(destination);
  };

  if (!restored) return <Screen />;

  const progress = (index + 1) / STEPS.length;
  const eatingStyle = draft.dietaryPreference ?? preferences.dietaryPreference;
  const allergens = draft.allergens ?? preferences.allergens;

  const content = () => {
    switch (step) {
      case 'language':
        return (
          <StepShell title={t('onboarding.languageTitle')} body={t('onboarding.languageBody')}>
            <View style={{ gap: theme.spacing.md }}>
              {SUPPORTED_LANGUAGES.map((code) => (
                <Button
                  key={code}
                  label={t(code === 'ar' ? 'language.arabic' : 'language.english')}
                  variant={language === code ? 'primary' : 'secondary'}
                  size="lg"
                  onPress={() => setLanguage(code)}
                  testID={`onboarding-language-${code}`}
                />
              ))}
            </View>
          </StepShell>
        );

      case 'avoid':
        return (
          <StepShell title={t('onboarding.avoidTitle')} body={t('onboarding.allergyBody')}>
            <View style={{ gap: theme.spacing.xl }}>
              <Field label={t('onboarding.allergyLabel')}>
                <View style={{ flexDirection: row, flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  <Chip
                    label={t('onboarding.allergyNone')}
                    selected={allergens.length === 0}
                    onPress={() => patch({ allergens: [] })}
                    testID="onboarding-allergy-none"
                  />
                  {ALLERGENS.map((allergen: Allergen) => (
                    <Chip
                      key={allergen}
                      label={t(`allergen.${allergen}` as const)}
                      tone="danger"
                      selected={allergens.includes(allergen)}
                      onPress={() => patch({ allergens: toggle(allergens, allergen) })}
                      testID={`onboarding-allergen-${allergen}`}
                    />
                  ))}
                </View>
              </Field>

              {/*
                Eating style rides along here rather than owning a step. It
                changes every result the app will ever show, which is worth one
                tap; it does not justify a screen of its own when the step is
                already open and the user is already answering "what should we
                not cook for you".
              */}
              <Field label={t('onboarding.eatingStyleLabel')}>
                <View style={{ flexDirection: row, flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {EATING_STYLES.map((style) => (
                    <Chip
                      key={style}
                      label={t(`diet.${style}` as const)}
                      selected={eatingStyle === style}
                      onPress={() => patch({ dietaryPreference: style })}
                      testID={`onboarding-diet-${style}`}
                    />
                  ))}
                </View>
              </Field>
            </View>
          </StepShell>
        );

      case 'start':
        return (
          <StepShell title={t('onboarding.startTitle')} body={t('onboarding.startBody')}>
            {/*
              Not a question, and not a summary of what was answered. The last
              step of onboarding is the first useful screen, chosen by the
              user — which is what "explain the product by doing" means in
              practice. Both routes land on real functionality immediately.
            */}
            <View style={{ gap: theme.spacing.md }}>
              <Button
                label={t('home.cookWithWhatIHave')}
                icon="basket-outline"
                size="lg"
                onPress={() => void finish('/cook')}
                testID="onboarding-start-cook"
              />
              <Button
                label={t('home.eatWithinBudget')}
                icon="wallet-outline"
                variant="secondary"
                size="lg"
                onPress={() => void finish('/budget')}
                testID="onboarding-start-budget"
              />
            </View>
          </StepShell>
        );

      default:
        return null;
    }
  };

  return (
    <Screen edges={{ top: true, bottom: false }}>
      <View style={{ paddingTop: theme.spacing.lg, gap: theme.spacing.sm }}>
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors.surfaceAlt,
            overflow: 'hidden',
            // Progress advances from the edge the reader starts at.
            flexDirection: row,
          }}
          accessibilityRole="progressbar"
          accessibilityLabel={t('onboarding.progress', {
            current: index + 1,
            total: STEPS.length,
          })}
          accessibilityValue={{ min: 0, max: STEPS.length, now: index + 1 }}
        >
          <View
            style={{
              height: 4,
              width: `${progress * 100}%`,
              backgroundColor: theme.colors.primary,
            }}
          />
        </View>
        <Text variant="micro" color="textTertiary" align={isRTL ? 'right' : 'left'}>
          {t('onboarding.progress', { current: index + 1, total: STEPS.length })}
        </Text>
      </View>

      {/*
        Scrolling rather than a fixed block: grouped steps are taller, and on a
        short phone with the keyboard up the field being typed into has to stay
        reachable. `flex: 1` on the scroller keeps the footer pinned so the
        primary action never scrolls away.
      */}
      <Animated.View
        key={step}
        entering={FadeIn.duration(theme.duration.normal)}
        exiting={FadeOut.duration(theme.duration.instant)}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingTop: theme.spacing.xl,
            paddingBottom: theme.spacing.xl,
          }}
        >
          {content()}
        </ScrollView>
      </Animated.View>

      <ScreenFooter>
        {/*
          No Continue on the last step. Its two buttons ARE the action, and a
          third primary control underneath them would be a second way to do the
          same thing with no way to say which.
        */}
        {!isLast ? (
          <Button
            label={t('common.continue')}
            onPress={goNext}
            disabled={!canAdvance}
            size="lg"
            testID="onboarding-next"
          />
        ) : null}
        {/*
          Back is absent on the first step rather than present and dimmed: a
          disabled control invites a tap and then refuses it. Skip appears only
          where the question is genuinely optional.
        */}
        {!isFirst || !REQUIRED_STEPS.has(step) ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: isFirst ? 'flex-end' : 'space-between',
            }}
          >
            {!isFirst ? (
              <Button
                label={t('common.back')}
                variant="ghost"
                size="sm"
                onPress={goBack}
                testID="onboarding-back"
              />
            ) : null}
            {/*
              No Skip on language. Skipping it does not mean "no preference",
              it means "decide for me" — and the app would then decide in a
              language the reader may not be able to undo the decision in.
              Every other step has a real default; this one has a real choice.
            */}
            {!isLast && step !== 'language' ? (
              <Button
                label={t('common.skip')}
                variant="ghost"
                size="sm"
                onPress={goNext}
                testID="onboarding-skip"
              />
            ) : null}
          </View>
        ) : null}
      </ScreenFooter>
    </Screen>
  );
}

function StepShell({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  /*
    Alignment is stated rather than inherited, so that choosing Arabic on step
    one re-renders THIS screen right-aligned on the very next frame.

    It cannot be left to the platform: `setLanguage` calls
    `I18nManager.forceRTL`, which on native needs a full reload before it
    affects layout — the app already surfaces a restart notice for exactly that
    reason. A user who picks العربية and sees the screen stay left-aligned has
    been told the setting did not work. Driving alignment from the language
    value instead makes the effect immediate on every platform.
  */
  const align = isRTL ? 'right' : 'left';
  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title1" align={align}>
          {title}
        </Text>
        <Text variant="body" color="textSecondary" align={align}>
          {body}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** A labelled group inside a step, so combined screens still read as one thing. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const { isRTL } = useI18n();
  const align = isRTL ? 'right' : 'left';
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <Text variant="subhead" align={align}>
          {label}
        </Text>
        {hint ? (
          <Text variant="micro" color="textTertiary" align={align}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
