import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { RequestFilters, type RequestFiltersValue } from '@/components/cook/request-filters';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Screen, ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
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

/** One-tap budgets, in major units. Tuned for the Egyptian market. */
const PRESETS_BY_CURRENCY: Record<string, number[]> = {
  EGP: [75, 100, 150, 250, 400],
  SAR: [15, 25, 40, 60, 100],
  AED: [15, 25, 40, 60, 100],
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

          <View
            style={{
              flexDirection: 'row',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.infoSoft,
            }}
          >
            <Text variant="footnote" style={{ color: theme.colors.infoSoftText, flex: 1 }}>
              {t('budget.estimateNotice', { country: t(`country.${preferences.country}` as const) })}
            </Text>
          </View>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <Text variant="title3">{t('cook.filtersTitle')}</Text>
          <RequestFilters
            value={filters}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          />
        </View>
      </ScreenScroll>

      <ScreenFooter>
        <Button
          label={t('budget.findMeals')}
          icon="sparkles"
          onPress={handleSubmit}
          disabled={!isValid}
          size="lg"
          testID="budget-submit"
        />
      </ScreenFooter>
    </Screen>
  );
}
