import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { IngredientPicker } from '@/components/cook/ingredient-picker';
import {
  activeFilterCount,
  RequestFilters,
  ServingsField,
  type RequestFiltersValue,
} from '@/components/cook/request-filters';
import { Button } from '@/components/ui/button';
import { Screen, ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { usePantryItems } from '@/features/pantry/hooks';
import { requestDefaultsFrom, usePreferences } from '@/features/preferences/preferences-provider';
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

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ingredients, setIngredients] = useState<string[]>([]);
  /**
   * How many ingredients the user is willing to be missing.
   *
   * Three real answers, not two. It used to be a strict/partial toggle where
   * "partial" applied no kitchen constraint at all — so it returned the same
   * twenty top-ranked recipes whatever you had selected. A gap budget is a
   * number, so the modes now differ by that number and nothing else.
   *
   * Defaults to 0: someone who has just typed out their fridge is asking what
   * they can cook RIGHT NOW, and answering a different question without saying
   * so is how a results page stops being trustworthy.
   */
  const [maxMissing, setMaxMissing] = useState(0);
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
      ...requestDefaultsFrom(preferences),
      mode: 'ingredients',
      ingredients,
      budgetMinor: null,
      pantryMode: maxMissing === 0 ? 'strict' : 'partial',
      maxMissingIngredients: maxMissing,
      servings: filters.servings,
      mealType: filters.mealType,
      cuisine: filters.cuisine,
      maxMinutes: filters.maxMinutes,
      minProteinGrams: filters.minProteinGrams,
      maxCalories: filters.maxCalories,
      query: null,
    });
    router.push({ pathname: '/cook/results', params: query });
  };

  const filterCount = activeFilterCount(filters);

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

        {/*
          Servings stays; everything else is one tap away. A hungry person
          should not have to walk past six groups of chips to ask for food.
        */}
        <View style={{ gap: theme.spacing.lg }}>
          <SegmentedControl<'strict' | 'missing1' | 'missing2'>
            options={[
              { value: 'strict', label: t('cook.modeStrict') },
              { value: 'missing1', label: t('cook.modeMissing1') },
              { value: 'missing2', label: t('cook.modeMissing2') },
            ]}
            value={maxMissing === 0 ? 'strict' : maxMissing === 1 ? 'missing1' : 'missing2'}
            onChange={(mode) =>
              setMaxMissing(mode === 'strict' ? 0 : mode === 'missing1' ? 1 : 2)
            }
            testID="cook-pantry-mode"
          />
          <Text variant="footnote" color="textSecondary">
            {maxMissing === 0
              ? t('cook.modeStrictHint')
              : t('cook.modeMissingHint', { count: maxMissing })}
          </Text>

          <ServingsField
            value={filters.servings}
            onChange={(servings) => setFilters((current) => ({ ...current, servings }))}
          />

          <Button
            label={
              filterCount > 0
                ? t('cook.filtersWithCount', { count: filterCount })
                : t('cook.filtersTitle')
            }
            icon="options-outline"
            variant="secondary"
            size="md"
            fullWidth
            onPress={() => setFiltersOpen(true)}
            testID="cook-filters"
          />
        </View>
      </ScreenScroll>

      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('cook.filtersTitle')}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            {filterCount > 0 ? (
              <Button
                label={t('cook.clearFilters')}
                variant="ghost"
                size="md"
                onPress={() =>
                  setFilters((current) => ({
                    servings: current.servings,
                    mealType: null,
                    cuisine: null,
                    maxMinutes: null,
                    minProteinGrams: null,
                    maxCalories: null,
                  }))
                }
                testID="cook-filters-clear"
              />
            ) : null}
            <Button
              label={t('common.done')}
              size="lg"
              onPress={() => setFiltersOpen(false)}
              testID="cook-filters-done"
            />
          </View>
        }
      >
        <RequestFilters
          value={filters}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        />
      </Sheet>

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
