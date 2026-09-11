import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen, ScreenFooter } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { TagInput } from '@/components/ui/tag-input';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { isCountrySupported } from '@/features/pricing/price-book';
import { useI18n } from '@/i18n';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import { useTheme } from '@/theme';
import {
  ALLERGENS,
  APPLIANCES,
  COUNTRY_CODES,
  CUISINES,
  DIET_FLAGS,
  EATING_STYLES,
  GOALS,
  SKILL_LEVELS,
  type Allergen,
  type Appliance,
  type CountryCode,
  type Cuisine,
  type DietFlag,
  type UserPreferences,
} from '@/types/domain';

/**
 * First-run onboarding, in six screens.
 *
 * It used to be eleven — one question each — which is a lot of taps before
 * anyone has seen a recipe. Questions that a person answers in the same breath
 * now share a screen ("where do you cook, and for how many"), while the two
 * that carry real weight keep their own: diet, because the model behind it is
 * subtle, and allergies, because they are a safety constraint rather than a
 * preference.
 *
 * Every underlying preference field survives the regrouping; nothing was
 * dropped to make the count.
 */

type Draft = Partial<UserPreferences>;

type StepId = 'name' | 'household' | 'diet' | 'avoid' | 'taste' | 'kitchen';

const STEPS: readonly StepId[] = ['name', 'household', 'diet', 'avoid', 'taste', 'kitchen'];

/**
 * Steps that must be answered before moving on.
 *
 * Everything else has a defensible default, so it gets a Skip. A step with no
 * Skip is not "important" — it is unanswerable by default.
 */
const REQUIRED_STEPS: ReadonlySet<StepId> = new Set<StepId>(['name']);

/** Common enough to be worth one tap, short enough not to become a survey. */
const DISLIKE_SUGGESTIONS = ['mushrooms', 'olives', 'coriander', 'liver', 'aubergine'];

function toggle<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}

export default function OnboardingScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { preferences, completeOnboarding } = usePreferences();
  const { isEnabled: authEnabled, status: authStatus } = useAuth();

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

  const step = STEPS[index] ?? 'name';
  const isLast = index === STEPS.length - 1;
  const isFirst = index === 0;

  const canAdvance = useMemo(() => {
    if (!REQUIRED_STEPS.has(step)) return true;
    if (step === 'name') return Boolean((draft.displayName ?? '').trim());
    return true;
  }, [step, draft.displayName]);

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

  const finish = async () => {
    await completeOnboarding(draft);
    // A guest who has just told us their diet, allergies and goals is the best
    // moment to offer an account — their answers are the thing worth keeping.
    // It stays an offer: `welcome` has a "look around first" route out.
    if (authEnabled && authStatus === 'signed_out') {
      router.replace('/(auth)/welcome');
      return;
    }
    router.replace('/');
  };

  if (!restored) return <Screen />;

  const progress = (index + 1) / STEPS.length;
  const country = draft.country ?? preferences.country;
  const eatingStyle = draft.dietaryPreference ?? preferences.dietaryPreference;
  const dietFlags = draft.dietFlags ?? preferences.dietFlags;
  const allergens = draft.allergens ?? preferences.allergens;

  const content = () => {
    switch (step) {
      case 'name':
        return (
          <StepShell title={t('onboarding.nameTitle')} body={t('onboarding.nameBody')}>
            <Input
              value={draft.displayName ?? ''}
              onChangeText={(displayName) => patch({ displayName })}
              placeholder={t('auth.namePlaceholder')}
              autoFocus
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => canAdvance && goNext()}
              testID="onboarding-name"
            />
          </StepShell>
        );

      case 'household':
        return (
          <StepShell title={t('onboarding.householdTitle')} body={t('onboarding.householdBody')}>
            <View style={{ gap: theme.spacing.xl }}>
              <Field label={t('onboarding.country')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {COUNTRY_CODES.map((code: CountryCode) => {
                    const supported = isCountrySupported(code);
                    return (
                      <Chip
                        key={code}
                        label={
                          supported
                            ? t(`country.${code}` as const)
                            : `${t(`country.${code}` as const)} · ${t('common.comingSoon')}`
                        }
                        selected={country === code}
                        // Budgets are only honest where a real price survey
                        // exists. Rather than hide the ambition, the country is
                        // visible and plainly not ready.
                        disabled={!supported}
                        onPress={() => patch({ country: code })}
                        testID={`onboarding-country-${code}`}
                      />
                    );
                  })}
                </View>
              </Field>

              <Input
                label={t('onboarding.city')}
                value={draft.city ?? ''}
                onChangeText={(city) => patch({ city })}
                placeholder={t('onboarding.cityPlaceholder')}
                testID="onboarding-city"
              />

              <Field label={t('onboarding.householdLabel')}>
                <Stepper
                  value={draft.householdSize ?? preferences.householdSize}
                  onChange={(householdSize) => patch({ householdSize })}
                  min={1}
                  max={12}
                  suffix={t('common.people', { count: draft.householdSize ?? preferences.householdSize })}
                  accessibilityLabel={t('onboarding.householdLabel')}
                  testID="onboarding-household"
                />
              </Field>
            </View>
          </StepShell>
        );

      case 'diet':
        return (
          <StepShell title={t('onboarding.dietTitle')} body={t('onboarding.dietBody')}>
            <View style={{ gap: theme.spacing.xl }}>
              <Field label={t('onboarding.eatingStyleLabel')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
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

              <Field label={t('onboarding.dietFlagsLabel')} hint={t('onboarding.dietFlagsHint')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {DIET_FLAGS.map((flag: DietFlag) => (
                    <Chip
                      key={flag}
                      label={t(`diet.${flag}` as const)}
                      selected={dietFlags.includes(flag)}
                      onPress={() => patch({ dietFlags: toggle(dietFlags, flag) })}
                      testID={`onboarding-dietflag-${flag}`}
                    />
                  ))}
                </View>
              </Field>
            </View>
          </StepShell>
        );

      case 'avoid':
        return (
          <StepShell title={t('onboarding.avoidTitle')} body={t('onboarding.avoidBody')}>
            <View style={{ gap: theme.spacing.xl }}>
              <Field label={t('onboarding.allergyLabel')} hint={t('onboarding.allergyBody')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
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

              <Field label={t('onboarding.dislikeLabel')} hint={t('onboarding.dislikeBody')}>
                <TagInput
                  values={draft.dislikedIngredients ?? preferences.dislikedIngredients}
                  onChange={(dislikedIngredients) => patch({ dislikedIngredients })}
                  placeholder={t('onboarding.dislikePlaceholder')}
                  suggestions={DISLIKE_SUGGESTIONS}
                  testID="onboarding-dislike-input"
                />
              </Field>
            </View>
          </StepShell>
        );

      case 'taste':
        return (
          <StepShell title={t('onboarding.tasteTitle')} body={t('onboarding.tasteBody')}>
            <View style={{ gap: theme.spacing.xl }}>
              <Field label={t('onboarding.goalLabel')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {GOALS.map((goal) => (
                    <Chip
                      key={goal}
                      label={t(`goal.${goal}` as const)}
                      selected={draft.primaryGoal === goal}
                      onPress={() => patch({ primaryGoal: goal })}
                      testID={`onboarding-goal-${goal}`}
                    />
                  ))}
                </View>
              </Field>

              <Field label={t('onboarding.cuisineLabel')} hint={t('onboarding.cuisineBody')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {CUISINES.map((cuisine: Cuisine) => (
                    <Chip
                      key={cuisine}
                      label={t(`cuisine.${cuisine}` as const)}
                      selected={(draft.preferredCuisines ?? []).includes(cuisine)}
                      onPress={() =>
                        patch({ preferredCuisines: toggle(draft.preferredCuisines, cuisine) })
                      }
                      testID={`onboarding-cuisine-${cuisine}`}
                    />
                  ))}
                </View>
              </Field>
            </View>
          </StepShell>
        );

      case 'kitchen':
      default:
        return (
          <StepShell title={t('onboarding.kitchenTitle')} body={t('onboarding.kitchenBody')}>
            <View style={{ gap: theme.spacing.xl }}>
              <Field label={t('onboarding.skillLabel')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {SKILL_LEVELS.map((level) => (
                    <Chip
                      key={level}
                      label={t(`skill.${level}` as const)}
                      selected={draft.skillLevel === level}
                      onPress={() => patch({ skillLevel: level })}
                      testID={`onboarding-skill-${level}`}
                    />
                  ))}
                </View>
              </Field>

              <Field label={t('onboarding.appliancesLabel')} hint={t('onboarding.appliancesBody')}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {APPLIANCES.map((appliance: Appliance) => (
                    <Chip
                      key={appliance}
                      label={t(`appliance.${appliance}` as const)}
                      selected={(draft.appliances ?? preferences.appliances).includes(appliance)}
                      onPress={() =>
                        patch({
                          appliances: toggle(draft.appliances ?? preferences.appliances, appliance),
                        })
                      }
                      testID={`onboarding-appliance-${appliance}`}
                    />
                  ))}
                </View>
              </Field>
            </View>
          </StepShell>
        );
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
        <Text variant="micro" color="textTertiary">
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
        <Button
          label={isLast ? t('onboarding.doneCta') : t('common.continue')}
          onPress={() => (isLast ? void finish() : goNext())}
          disabled={!canAdvance}
          size="lg"
          testID="onboarding-next"
        />
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
            {!REQUIRED_STEPS.has(step) ? (
              <Button
                label={isLast ? t('common.skipForNow') : t('common.skip')}
                variant="ghost"
                size="sm"
                onPress={() => (isLast ? void finish() : goNext())}
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
  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title1">{title}</Text>
        <Text variant="body" color="textSecondary">
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
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <Text variant="subhead">{label}</Text>
        {hint ? (
          <Text variant="micro" color="textTertiary">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}
