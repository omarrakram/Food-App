import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import {
  ALLERGENS,
  CUISINES,
  DIETARY_PREFERENCES,
  GOALS,
  type Allergen,
  type Cuisine,
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

  const [dislikeDraft, setDislikeDraft] = useState('');

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

  const addDislike = () => {
    const value = dislikeDraft.trim().toLowerCase();
    if (!value || preferences.dislikedIngredients.includes(value)) {
      setDislikeDraft('');
      return;
    }
    void updatePreferences({ dislikedIngredients: [...preferences.dislikedIngredients, value] });
    setDislikeDraft('');
  };

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.xxl}>
      <ScreenHeader title={t('profile.preferences')} />

      <Group title={t('onboarding.dietTitle')}>
        {DIETARY_PREFERENCES.map((diet) => (
          <Chip
            key={diet}
            label={t(`diet.${diet}` as const)}
            selected={preferences.dietaryPreference === diet}
            onPress={() => void updatePreferences({ dietaryPreference: diet })}
            testID={`pref-diet-${diet}`}
          />
        ))}
      </Group>

      <Group title={t('onboarding.allergyTitle')} subtitle={t('onboarding.allergyBody')}>
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

      <Group title={t('onboarding.goalTitle')}>
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

      <Group title={t('onboarding.cuisineTitle')} subtitle={t('onboarding.cuisineBody')}>
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
          <Text variant="headline">{t('onboarding.dislikeTitle')}</Text>
          <Text variant="footnote" color="textSecondary">
            {t('onboarding.dislikeBody')}
          </Text>
        </View>
        <Input
          value={dislikeDraft}
          onChangeText={setDislikeDraft}
          onSubmitEditing={addDislike}
          placeholder={t('onboarding.dislikePlaceholder')}
          returnKeyType="done"
          autoCapitalize="none"
          testID="pref-dislike-input"
        />
        {preferences.dislikedIngredients.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {preferences.dislikedIngredients.map((name) => (
              <Chip
                key={name}
                label={name}
                selected
                onRemove={() =>
                  void updatePreferences({
                    dislikedIngredients: preferences.dislikedIngredients.filter(
                      (entry) => entry !== name,
                    ),
                  })
                }
              />
            ))}
          </View>
        ) : null}
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
