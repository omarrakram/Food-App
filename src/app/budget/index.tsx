import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  activeFilterCount,
  RequestFilters,
  ServingsField,
  type RequestFiltersValue,
} from '@/components/cook/request-filters';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen, ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { requestDefaultsFrom, usePreferences } from '@/features/preferences/preferences-provider';
import { encodeRequest } from '@/features/recipes/request-params';
import { useI18n } from '@/i18n';
import {
  currencySymbol,
  formatMoney,
  fromMajor,
  parseMoneyInput,
  toMajor,
} from '@/lib/format/money';
import { getItem, setItem, StorageKeys } from '@/lib/storage';
import { useTheme } from '@/theme';

/**
 * One-tap budgets, in major units. Tuned for the Egyptian market.
 *
 * Three, not five. Quick amounts only earn their place if they are faster than
 * typing; a grid of them becomes a second decision to make before the first
 * one, and starts to read as the app having opinions about what you should
 * spend.
 */
const PRESETS_BY_CURRENCY: Record<string, number[]> = {
  EGP: [100, 150, 250],
  SAR: [25, 40, 60],
  AED: [25, 40, 60],
  USD: [5, 10, 15, 25, 40],
  GBP: [5, 10, 15, 25, 40],
};

/** Below this, no realistic meal exists; we ask for a bigger number instead. */
const MIN_BUDGET_MAJOR = 10;

export default function BudgetScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { preferences } = usePreferences();

  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<RequestFiltersValue>({
    servings: preferences.householdSize,
    mealType: null,
    cuisine: null,
    maxMinutes: null,
    minProteinGrams: null,
    maxCalories: null,
  });

  // Seed with whatever they budgeted last time — most people are consistent.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const last = await getItem<number>(StorageKeys.lastBudget);
      const seed = last ?? preferences.typicalBudgetMinor;
      if (!cancelled && seed) {
        setAmount(String(toMajor({ amountMinor: seed, currency: preferences.currency })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preferences.currency, preferences.typicalBudgetMinor]);

  const parsed = parseMoneyInput(amount, preferences.currency);
  const minimum = fromMajor(MIN_BUDGET_MAJOR, preferences.currency);
  const isValid = parsed !== null && parsed.amountMinor >= minimum.amountMinor;
  const presets = PRESETS_BY_CURRENCY[preferences.currency] ?? PRESETS_BY_CURRENCY.EGP ?? [];
  const filterCount = activeFilterCount(filters);

  const handleSubmit = () => {
    if (!parsed || !isValid) {
      setTouched(true);
      return;
    }
    void setItem(StorageKeys.lastBudget, parsed.amountMinor);
    const query = encodeRequest({
      ...requestDefaultsFrom(preferences),
      mode: 'budget',
      ingredients: [],
      budgetMinor: parsed.amountMinor,
      servings: filters.servings,
      mealType: filters.mealType,
      cuisine: filters.cuisine,
      maxMinutes: filters.maxMinutes,
      minProteinGrams: filters.minProteinGrams,
      maxCalories: filters.maxCalories,
      query: null,
    });
    router.push({ pathname: '/budget/results', params: query });
  };

  return (
    <Screen edges={{ top: true }} padded={false} style={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: theme.layout.screenPadding }}>
        <ScreenHeader title={t('budget.title')} subtitle={t('budget.subtitle')} />
      </View>

      <ScreenScroll edges={{ top: false }} contentGap={theme.spacing.xxl} bottomInset={theme.spacing.xxl}>
        <View style={{ gap: theme.spacing.md }}>
          <Input
            label={t('budget.amountLabel')}
            value={amount}
            onChangeText={(next) => {
              setAmount(next);
              setTouched(true);
            }}
            keyboardType="decimal-pad"
            emphasis="display"
            placeholder="150"
            suffix={currencySymbol(preferences.currency, locale)}
            leadingIcon="wallet-outline"
            autoFocus
            error={touched && !isValid && amount.length > 0
              ? t('budget.invalidAmount', { min: formatMoney(minimum, { locale }) })
              : null}
            hint={t('budget.perMeal')}
            testID="budget-amount"
          />

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="caption" color="textTertiary">
              {t('budget.presets')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {presets.map((preset) => (
                <Chip
                  key={preset}
                  label={formatMoney(fromMajor(preset, preferences.currency), { locale })}
                  size="sm"
                  selected={parsed !== null && toMajor(parsed) === preset}
                  onPress={() => {
                    setAmount(String(preset));
                    setTouched(true);
                  }}
                  testID={`budget-preset-${preset}`}
                />
              ))}
            </View>
          </View>

          {/*
            NO PRICE DISCLAIMER HERE. It was a filled info panel giving a
            caveat the same visual weight as the input it qualified, on a
            screen whose only job is to take a number.

            The honesty is not dropped, it is moved to where it is actually
            actionable: the results page already labels every figure
            "Estimated prices, not live store prices", marks each row with ~,
            and counts the items it could not price at all. A caveat next to
            the price it qualifies is read; a caveat two screens earlier is
            not.
          */}
        </View>

        {/*
          SERVINGS IS NOT A FILTER HERE, which is why it sits on the screen
          rather than behind the sheet — the opposite of the Cook flow, and
          deliberately so. A budget without a head count is not a constraint
          the engine can use: 150 EGP means something completely different for
          one person and for five, and every price shown downstream is derived
          from it. It is the second half of the question this screen asks.
        */}
        <ServingsField
          value={filters.servings}
          onChange={(servings) => setFilters((current) => ({ ...current, servings }))}
        />

        {/*
          Everything else is one tap away, as on Cook. This block used to sit
          open on the screen under a "Narrow it down" heading — six groups of
          chips between a person and a list of meals they can afford, on the
          screen whose entire promise is "tell us a number".
        */}
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
          testID="budget-filters"
        />

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
                testID="budget-filters-clear"
              />
            ) : null}
            <Button
              label={t('common.done')}
              size="lg"
              onPress={() => setFiltersOpen(false)}
              testID="budget-filters-done"
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
        {/* States the number it is about to spend, and names no magic. */}
        <Button
          label={
            isValid && parsed
              ? t('budget.ctaWithAmount', { amount: formatMoney(parsed, { locale }) })
              : t('budget.findMeals')
          }
          onPress={handleSubmit}
          disabled={!isValid}
          size="lg"
          testID="budget-submit"
        />
      </ScreenFooter>
    </Screen>
  );
}
