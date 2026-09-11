import { View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { CUISINES, MEAL_TYPES, type Cuisine, type MealType } from '@/types/domain';

/** Cooking-time ceilings offered as one-tap choices. */
const TIME_OPTIONS = [15, 30, 45, 60] as const;

/** Protein targets in grams per serving. */
const PROTEIN_OPTIONS = [20, 30, 40] as const;

/** Calorie ceilings per serving. */
const CALORIE_OPTIONS = [400, 600, 800] as const;

export type RequestFiltersValue = {
  servings: number;
  mealType: MealType | null;
  cuisine: Cuisine | null;
  maxMinutes: number | null;
  minProteinGrams: number | null;
  maxCalories: number | null;
};

export type RequestFiltersProps = {
  value: RequestFiltersValue;
  onChange: (patch: Partial<RequestFiltersValue>) => void;
  /** Nutrition targets are hidden on the budget screen to keep it short. */
  showNutrition?: boolean;
};

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="caption" color="textTertiary">
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {children}
      </View>
    </View>
  );
}

/** How many of the optional constraints the user has actually set. */
export function activeFilterCount(value: RequestFiltersValue): number {
  return [value.mealType, value.cuisine, value.maxMinutes, value.minProteinGrams, value.maxCalories]
    .filter((entry) => entry !== null)
    .length;
}

/**
 * Servings, which stays on the screen.
 *
 * It is the one constraint nearly everyone sets and the one that changes every
 * quantity and price downstream, so it earns its place next to the primary
 * action. Everything else is behind `RequestFilters`.
 */
export function ServingsField({
  value,
  onChange,
}: {
  value: number;
  onChange: (servings: number) => void;
}) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="caption" color="textTertiary">
        {t('cook.servings')}
      </Text>
      <Stepper
        value={value}
        onChange={onChange}
        min={1}
        max={12}
        suffix={t('common.peopleUnit', { count: value })}
        accessibilityLabel={t('cook.servings')}
        testID="filter-servings"
      />
    </View>
  );
}

/**
 * The secondary constraints, shown on demand.
 *
 * These used to sit open on the cook screen, so the first thing between a
 * hungry person and a recipe was six groups of chips. Ingredients are the
 * task; meal type, cuisine, time and nutrition targets are refinements, and
 * refinements belong behind a control you only open if you want them.
 */
export function RequestFilters({ value, onChange, showNutrition = true }: RequestFiltersProps) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <FilterGroup label={t('cook.maxTime')}>
        <Chip
          label={t('cook.anyTime')}
          size="sm"
          selected={value.maxMinutes === null}
          onPress={() => onChange({ maxMinutes: null })}
        />
        {TIME_OPTIONS.map((minutes) => (
          <Chip
            key={minutes}
            label={t('common.min', { count: minutes })}
            size="sm"
            selected={value.maxMinutes === minutes}
            onPress={() => onChange({ maxMinutes: minutes })}
            testID={`filter-time-${minutes}`}
          />
        ))}
      </FilterGroup>

      <FilterGroup label={t('cook.mealType')}>
        <Chip
          label={t('cook.anyMeal')}
          size="sm"
          selected={value.mealType === null}
          onPress={() => onChange({ mealType: null })}
        />
        {MEAL_TYPES.map((meal) => (
          <Chip
            key={meal}
            label={t(`meal.${meal}` as const)}
            size="sm"
            selected={value.mealType === meal}
            onPress={() => onChange({ mealType: value.mealType === meal ? null : meal })}
            testID={`filter-meal-${meal}`}
          />
        ))}
      </FilterGroup>

      <FilterGroup label={t('cook.cuisine')}>
        <Chip
          label={t('cook.anyCuisine')}
          size="sm"
          selected={value.cuisine === null}
          onPress={() => onChange({ cuisine: null })}
        />
        {CUISINES.map((cuisine) => (
          <Chip
            key={cuisine}
            label={t(`cuisine.${cuisine}` as const)}
            size="sm"
            selected={value.cuisine === cuisine}
            onPress={() => onChange({ cuisine: value.cuisine === cuisine ? null : cuisine })}
            testID={`filter-cuisine-${cuisine}`}
          />
        ))}
      </FilterGroup>

      {showNutrition ? (
        <>
          <FilterGroup label={t('cook.protein')}>
            <Chip
              label={t('cook.noTarget')}
              size="sm"
              selected={value.minProteinGrams === null}
              onPress={() => onChange({ minProteinGrams: null })}
            />
            {PROTEIN_OPTIONS.map((grams) => (
              <Chip
                key={grams}
                label={`${grams}g+`}
                size="sm"
                selected={value.minProteinGrams === grams}
                onPress={() => onChange({ minProteinGrams: grams })}
                testID={`filter-protein-${grams}`}
              />
            ))}
          </FilterGroup>

          <FilterGroup label={t('cook.calories')}>
            <Chip
              label={t('cook.noTarget')}
              size="sm"
              selected={value.maxCalories === null}
              onPress={() => onChange({ maxCalories: null })}
            />
            {CALORIE_OPTIONS.map((calories) => (
              <Chip
                key={calories}
                label={`< ${calories}`}
                size="sm"
                selected={value.maxCalories === calories}
                onPress={() => onChange({ maxCalories: calories })}
                testID={`filter-calories-${calories}`}
              />
            ))}
          </FilterGroup>
        </>
      ) : null}
    </View>
  );
}
