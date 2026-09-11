import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen, ScreenFooter } from '@/components/ui/screen';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import { useTheme } from '@/theme';
import {
  ALLERGENS,
  APPLIANCES,
  CUISINES,
  DIETARY_PREFERENCES,
  GOALS,
  SKILL_LEVELS,
  type Allergen,
  type Appliance,
  type CountryCode,
  type Cuisine,
  type UserPreferences,
} from '@/types/domain';

/**
 * Progressive onboarding.
 *
 * One question per screen, everything after the name is skippable, and the
 * draft is written to disk on every change so a user who closes the app
 * mid-flow does not start over. Only allergies are treated as load-bearing —
 * they become hard safety constraints.
 */

type Draft = Partial<UserPreferences>;

const COUNTRIES: { code: CountryCode; label: string }[] = [
  { code: 'EG', label: 'Egypt' },
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'AE', label: 'UAE' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'US', label: 'United States' },
];

type StepId =
  | 'name'
  | 'location'
  | 'household'
  | 'diet'
  | 'allergies'
  | 'dislikes'
  | 'goal'
  | 'cuisines'
  | 'skill'
  | 'appliances'
  | 'done';

const STEPS: StepId[] = [
  'name',
  'location',
  'household',
  'diet',
  'allergies',
  'dislikes',
  'goal',
  'cuisines',
  'skill',
  'appliances',
  'done',
];

/** Steps the user may not skip past without answering. */
const REQUIRED_STEPS: ReadonlySet<StepId> = new Set<StepId>(['name']);

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
  const [dislikeInput, setDislikeInput] = useState('');
  const [restored, setRestored] = useState(false);

  // Restore any partially completed run.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getItem<{ draft: Draft; index: number }>(StorageKeys.onboardingDraft);
      if (!cancelled && stored) {
        setDraft(stored.draft);
        setIndex(Math.min(stored.index, STEPS.length - 1));
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

  const step = STEPS[index] ?? 'done';
  const isLast = step === 'done';

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

      case 'location':
        return (
          <StepShell title={t('onboarding.locationTitle')} body={t('onboarding.locationBody')}>
            <View style={{ gap: theme.spacing.lg }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {COUNTRIES.map((country) => (
                  <Chip
                    key={country.code}
                    label={country.label}
                    selected={(draft.country ?? preferences.country) === country.code}
                    onPress={() => patch({ country: country.code })}
                    testID={`onboarding-country-${country.code}`}
                  />
                ))}
              </View>
              <Input
                label={t('onboarding.city')}
                value={draft.city ?? ''}
                onChangeText={(city) => patch({ city })}
                placeholder={t('onboarding.cityPlaceholder')}
                testID="onboarding-city"
              />
            </View>
          </StepShell>
        );

      case 'household':
        return (
          <StepShell title={t('onboarding.householdTitle')} body={t('onboarding.householdBody')}>
            <Stepper
              value={draft.householdSize ?? preferences.householdSize}
              onChange={(householdSize) => patch({ householdSize })}
              min={1}
              max={12}
              accessibilityLabel={t('onboarding.householdTitle')}
              testID="onboarding-household"
            />
          </StepShell>
        );

      case 'diet':
        return (
          <StepShell title={t('onboarding.dietTitle')} body={t('onboarding.dietBody')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {DIETARY_PREFERENCES.map((diet) => (
                <Chip
                  key={diet}
                  label={t(`diet.${diet}` as const)}
                  selected={(draft.dietaryPreference ?? 'none') === diet}
                  onPress={() => patch({ dietaryPreference: diet })}
                  testID={`onboarding-diet-${diet}`}
                />
              ))}
            </View>
          </StepShell>
        );

      case 'allergies':
        return (
          <StepShell title={t('onboarding.allergyTitle')} body={t('onboarding.allergyBody')}>
            <View style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Chip
                  label={t('onboarding.allergyNone')}
                  selected={(draft.allergens ?? []).length === 0}
                  onPress={() => patch({ allergens: [] })}
                  testID="onboarding-allergy-none"
                />
                {ALLERGENS.map((allergen: Allergen) => (
                  <Chip
                    key={allergen}
                    label={t(`allergen.${allergen}` as const)}
                    tone="danger"
                    selected={(draft.allergens ?? []).includes(allergen)}
                    onPress={() => patch({ allergens: toggle(draft.allergens, allergen) })}
                    testID={`onboarding-allergen-${allergen}`}
                  />
                ))}
              </View>
            </View>
          </StepShell>
        );

      case 'dislikes':
        return (
          <StepShell title={t('onboarding.dislikeTitle')} body={t('onboarding.dislikeBody')}>
            <View style={{ gap: theme.spacing.md }}>
              <Input
                value={dislikeInput}
                onChangeText={setDislikeInput}
                onSubmitEditing={() => {
                  const value = dislikeInput.trim().toLowerCase();
                  if (!value) return;
                  patch({ dislikedIngredients: toggle(draft.dislikedIngredients, value) });
                  setDislikeInput('');
                }}
                placeholder={t('onboarding.dislikePlaceholder')}
                returnKeyType="done"
                autoCapitalize="none"
                testID="onboarding-dislike-input"
              />
              {(draft.dislikedIngredients ?? []).length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {(draft.dislikedIngredients ?? []).map((name) => (
                    <Chip
                      key={name}
                      label={name}
                      selected
                      onRemove={() =>
                        patch({ dislikedIngredients: toggle(draft.dislikedIngredients, name) })
                      }
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </StepShell>
        );

      case 'goal':
        return (
          <StepShell title={t('onboarding.goalTitle')} body={t('onboarding.goalBody')}>
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
          </StepShell>
        );

      case 'cuisines':
        return (
          <StepShell title={t('onboarding.cuisineTitle')} body={t('onboarding.cuisineBody')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {CUISINES.map((cuisine: Cuisine) => (
                <Chip
                  key={cuisine}
                  label={t(`cuisine.${cuisine}` as const)}
                  selected={(draft.preferredCuisines ?? []).includes(cuisine)}
                  onPress={() => patch({ preferredCuisines: toggle(draft.preferredCuisines, cuisine) })}
                  testID={`onboarding-cuisine-${cuisine}`}
                />
              ))}
            </View>
          </StepShell>
        );

      case 'skill':
        return (
          <StepShell title={t('onboarding.skillTitle')} body={t('onboarding.skillBody')}>
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
          </StepShell>
        );

      case 'appliances':
        return (
          <StepShell title={t('onboarding.appliancesTitle')} body={t('onboarding.appliancesBody')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {APPLIANCES.map((appliance: Appliance) => (
                <Chip
                  key={appliance}
                  label={t(`appliance.${appliance}` as const)}
                  selected={(draft.appliances ?? ['stove']).includes(appliance)}
                  onPress={() =>
                    patch({ appliances: toggle(draft.appliances ?? ['stove'], appliance) })
                  }
                  testID={`onboarding-appliance-${appliance}`}
                />
              ))}
            </View>
          </StepShell>
        );

      case 'done':
      default:
        return (
          <StepShell
            title={t('onboarding.doneTitle', { name: draft.displayName ?? '' })}
            body={t('onboarding.doneBody')}
          >
            <View />
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

      <Animated.View
        key={step}
        entering={FadeIn.duration(theme.duration.normal)}
        exiting={FadeOut.duration(theme.duration.instant)}
        style={{ flex: 1, paddingTop: theme.spacing.xxl }}
      >
        {content()}
      </Animated.View>

      <ScreenFooter>
        <Button
          label={isLast ? t('onboarding.doneCta') : t('common.continue')}
          onPress={() => (isLast ? void finish() : goNext())}
          disabled={!canAdvance}
          size="lg"
          testID="onboarding-next"
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Button
            label={t('common.back')}
            variant="ghost"
            size="sm"
            onPress={goBack}
            disabled={index === 0}
          />
          {!isLast && !REQUIRED_STEPS.has(step) ? (
            <Button
              label={t('common.skip')}
              variant="ghost"
              size="sm"
              onPress={goNext}
              testID="onboarding-skip"
            />
          ) : null}
        </View>
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
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="title1">{title}</Text>
        <Text variant="callout" color="textSecondary">
          {body}
        </Text>
      </View>
      {children}
    </View>
  );
}
