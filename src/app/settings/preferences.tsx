
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { TagInput } from '@/components/ui/tag-input';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import {
  ALLERGENS,
  CUISINES,
  DIET_FLAGS,
  EATING_STYLES,
  GOALS,
  type Allergen,
  type Cuisine,
  type DietFlag,
} from '@/types/domain';

function Group({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: 2 }}>
        <Text variant="headline">{title}</Text>
        {subtitle ? (
          <Text variant="footnote" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {children}
      </View>
    </View>
  );
}

export default function PreferencesSettingsScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const toast = useToast();
  const { preferences, updatePreferences } = usePreferences();

  const toggleAllergen = (allergen: Allergen) => {
    const next = preferences.allergens.includes(allergen)
      ? preferences.allergens.filter((entry) => entry !== allergen)
      : [...preferences.allergens, allergen];
    void updatePreferences({ allergens: next });
  };

  const toggleCuisine = (cuisine: Cuisine) => {
    const next = preferences.preferredCuisines.includes(cuisine)
      ? preferences.preferredCuisines.filter((entry) => entry !== cuisine)
      : [...preferences.preferredCuisines, cuisine];
    void updatePreferences({ preferredCuisines: next });
  };

  const toggleDietFlag = (flag: DietFlag) => {
    const next = preferences.dietFlags.includes(flag)
      ? preferences.dietFlags.filter((entry) => entry !== flag)
      : [...preferences.dietFlags, flag];
    void updatePreferences({ dietFlags: next });
  };

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.xxl}>
      <ScreenHeader title={t('profile.preferences')} />

      <Group title={t('onboarding.eatingStyleLabel')}>
        {EATING_STYLES.map((style) => (
          <Chip
            key={style}
            label={t(`diet.${style}` as const)}
            selected={preferences.dietaryPreference === style}
            onPress={() => void updatePreferences({ dietaryPreference: style })}
            testID={`pref-diet-${style}`}
          />
        ))}
      </Group>

      <Group title={t('onboarding.dietFlagsLabel')} subtitle={t('onboarding.dietFlagsHint')}>
        {DIET_FLAGS.map((flag: DietFlag) => (
          <Chip
            key={flag}
            label={t(`diet.${flag}` as const)}
            selected={preferences.dietFlags.includes(flag)}
            onPress={() => toggleDietFlag(flag)}
            testID={`pref-dietflag-${flag}`}
          />
        ))}
      </Group>

      <Group title={t('onboarding.allergyLabel')} subtitle={t('onboarding.allergyBody')}>
        {ALLERGENS.map((allergen) => (
          <Chip
            key={allergen}
            label={t(`allergen.${allergen}` as const)}
            tone="danger"
            selected={preferences.allergens.includes(allergen)}
            onPress={() => toggleAllergen(allergen)}
            testID={`pref-allergen-${allergen}`}
          />
        ))}
      </Group>

      <Group title={t('onboarding.goalLabel')}>
        {GOALS.map((goal) => (
          <Chip
            key={goal}
            label={t(`goal.${goal}` as const)}
            selected={preferences.primaryGoal === goal}
            onPress={() => void updatePreferences({ primaryGoal: goal })}
            testID={`pref-goal-${goal}`}
          />
        ))}
      </Group>

      <Group title={t('onboarding.cuisineLabel')} subtitle={t('onboarding.cuisineBody')}>
        {CUISINES.map((cuisine) => (
          <Chip
            key={cuisine}
            label={t(`cuisine.${cuisine}` as const)}
            selected={preferences.preferredCuisines.includes(cuisine)}
            onPress={() => toggleCuisine(cuisine)}
            testID={`pref-cuisine-${cuisine}`}
          />
        ))}
      </Group>

      <View style={{ gap: theme.spacing.sm }}>
        <View style={{ gap: 2 }}>
          <Text variant="headline">{t('onboarding.dislikeLabel')}</Text>
          <Text variant="footnote" color="textSecondary">
            {t('onboarding.dislikeBody')}
          </Text>
        </View>
        <TagInput
          values={preferences.dislikedIngredients}
          onChange={(dislikedIngredients) => void updatePreferences({ dislikedIngredients })}
          placeholder={t('onboarding.dislikePlaceholder')}
          testID="pref-dislike-input"
        />
      </View>

      <Button
        label={t('common.done')}
        onPress={() => toast.show({ message: t('common.saved'), tone: 'success' })}
        size="lg"
        testID="pref-done"
      />
    </ScreenScroll>
  );
}
