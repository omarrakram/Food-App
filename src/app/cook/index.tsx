import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { IngredientPicker } from '@/components/cook/ingredient-picker';
import {
  activeFilterCount,
  RequestFilters,
  type RequestFiltersValue,
} from '@/components/cook/request-filters';
import { Button } from '@/components/ui/button';
import { Screen, ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { expiringSoonItems, isSafeToUse } from '@/features/ingredients/freshness';
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
  const params = useLocalSearchParams<{ fromPantry?: string; expiring?: string }>();

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

  /*
    ARRIVING FROM THE PANTRY pre-selects what the user has — that is the whole
    point of that entry point, and they asked for it by tapping "cook with
    these".

    ARRIVING NORMALLY NO LONGER DOES. Opening Cook used to silently pre-fill
    the previous search, so the screen you saw depended on something you did
    days ago, with nothing on screen saying so, and the first job was working
    out what was already ticked and why. Last time's list is now offered as a
    labelled group you can tap — same speed if you want it, no surprise if you
    do not.
  */
  const fromPantry = params.fromPantry === '1';
  // Narrower still when arriving from the "expiring soon" block: the question
  // there is "what can I make from the things about to go off", not "from
  // everything I own", and seeding the whole pantry would bury the answer.
  const onlyExpiring = params.expiring === '1';

  /*
    `undefined` HERE MEANS "the pantry has not loaded yet", and that is
    load-bearing rather than incidental: the guard below seeds exactly once,
    the first time this is not undefined. Collapsing it to `?? []` — which an
    earlier version of this edit did — makes the guard fire on the very first
    render, against an empty pantry, and then never fire again. The picker then
    opens blank no matter what the user owns, and the food-safety assertion
    about expired items passes VACUOUSLY because nothing was seeded at all.
  */
  const pantryRows = pantry.data;
  const seedSource = !fromPantry
    ? []
    : pantryRows === undefined
      ? undefined
      : // FOOD SAFETY: only what is still in date. Seeding an expired item
        // would put it in the picker as though the user had typed it, and a
        // typed ingredient is trusted absolutely — so the expiry rule the
        // engine enforces would be quietly defeated on the way in.
        (onlyExpiring ? expiringSoonItems(pantryRows) : pantryRows)
          .filter((item) => isSafeToUse(item))
          .map((item) => item.ingredientName);

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
          recent={recentIngredients.data ?? []}
          testID="cook-ingredient-picker"
        />

        {/*
          WHAT SURVIVES BELOW THE PICKER, and why only this.

          The gap budget stays on the main screen because it is not a filter —
          it decides what "cook with what I have" MEANS, and its default (0,
          strictly what you own) is the promise the screen makes. Hiding it
          would leave the promise unstated and unchangeable.

          Servings moved into Filters. It is a genuine optional constraint with
          a good default from the household size, and it was the last thing
          standing between choosing ingredients and getting food.

          The explanatory paragraph under the control is gone. Three labelled
          options that say "only what I have", "missing 1" and "missing 2" do
          not need a sentence each explaining that they mean what they say.
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
          {/*
            One line, for the mode that is actually selected.

            The labels had to shrink — "Only what I have" truncated to "Only
            what I h..." inside a three-up segmented control, and a clipped
            label is worse than a terse one. "Exact" is terse enough to need
            saying once what it means, so this says it once rather than
            printing a paragraph per option.
          */}
          <Text variant="footnote" color="textSecondary" testID="cook-mode-hint">
            {maxMissing === 0
              ? t('cook.modeStrictHint')
              : t('cook.modeMissingHint', { count: maxMissing })}
          </Text>

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
        {/*
          States what it will do and how much it has to work with. The icon was
          `sparkles`, which dressed a deterministic catalogue search up as
          something magical — the opposite of the confidence this screen is
          supposed to build.
        */}
        <Button
          label={
            canSubmit
              ? t('cook.ctaWithCount', { count: ingredients.length })
              : t('cook.findMeals')
          }
          onPress={handleSubmit}
          disabled={!canSubmit}
          size="lg"
          testID="cook-submit"
        />
      </ScreenFooter>
    </Screen>
  );
}
