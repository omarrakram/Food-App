import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { IngredientPicker } from '@/components/cook/ingredient-picker';
import { RequestFilters, type RequestFiltersValue } from '@/components/cook/request-filters';
import { Button } from '@/components/ui/button';
import { Screen, ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { usePantryItems } from '@/features/pantry/hooks';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { encodeRequest } from '@/features/recipes/request-params';
import { useI18n } from '@/i18n';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import { useTheme } from '@/theme';

export default function CookScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();
  const params = useLocalSearchParams<{ fromPantry?: string }>();

  const pantry = usePantryItems();

  // Previously-used ingredients live in AsyncStorage; reading them through the
  // query cache (rather than an effect) keeps the seeding logic below in the
  // render phase, where React can reconcile it in one pass.
  const recentIngredients = useQuery({
    queryKey: ['akla', 'recent', 'ingredients'],
    queryFn: () => getItem<string[]>(StorageKeys.recentIngredients),
    staleTime: Infinity,
  });

  const [ingredients, setIngredients] = useState<string[]>([]);
  const [hasSeeded, setHasSeeded] = useState(false);
  const [filters, setFilters] = useState<RequestFiltersValue>({
    servings: preferences.householdSize,
    mealType: null,
    cuisine: null,
    maxMinutes: null,
    minProteinGrams: null,
    maxCalories: null,
  });

  // Arriving from the pantry pre-selects everything the user has (the whole
  // point of that entry point); otherwise we seed from what they last cooked
  // with. Seeding happens once, during render, so the first paint already has
  // the chips in place instead of flashing an empty picker.
  const fromPantry = params.fromPantry === '1';
  const seedSource = fromPantry
    ? pantry.data?.map((item) => item.ingredientName)
    : recentIngredients.data;

  if (!hasSeeded && seedSource !== undefined) {
    setHasSeeded(true);
    if (seedSource !== null && seedSource.length > 0) setIngredients(seedSource);
  }

  const canSubmit = ingredients.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    void setItem(StorageKeys.recentIngredients, ingredients.slice(0, 20));
    const query = encodeRequest({
      mode: 'ingredients',
      ingredients,
      budgetMinor: null,
      currency: preferences.currency,
      country: preferences.country,
      servings: filters.servings,
      mealType: filters.mealType,
      cuisine: filters.cuisine,
      maxMinutes: filters.maxMinutes,
      minProteinGrams: filters.minProteinGrams,
      maxCalories: filters.maxCalories,
      query: null,
      dietaryPreference: preferences.dietaryPreference,
      dietFlags: preferences.dietFlags,
      allergens: preferences.allergens,
      dislikedIngredients: preferences.dislikedIngredients,
      appliances: preferences.appliances,
      skillLevel: preferences.skillLevel,
    });
    router.push({ pathname: '/cook/results', params: query });
  };

  const footerHint = useMemo(
    () => (canSubmit ? null : t('cook.needMoreIngredients')),
    [canSubmit, t],
  );

  return (
    <Screen edges={{ top: true }} padded={false} style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <ScreenHeader title={t('cook.title')} subtitle={t('cook.subtitle')} />
      </View>

      <ScreenScroll edges={{ top: false }} contentGap={theme.spacing.xxl} bottomInset={theme.spacing.xxl}>
        <IngredientPicker
          selected={ingredients}
          onChange={setIngredients}
          pantryItems={pantry.data ?? []}
          testID="cook-ingredient-picker"
        />

        <View style={{ gap: theme.spacing.md }}>
          <Text variant="title3">{t('cook.filtersTitle')}</Text>
          <RequestFilters
            value={filters}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          />
        </View>
      </ScreenScroll>

      <ScreenFooter>
        {footerHint ? (
          <Text variant="footnote" color="textTertiary" align="center">
            {footerHint}
          </Text>
        ) : null}
        <Button
          label={t('cook.findMeals')}
          icon="sparkles"
          onPress={handleSubmit}
          disabled={!canSubmit}
          size="lg"
          testID="cook-submit"
        />
      </ScreenFooter>
    </Screen>
  );
}
