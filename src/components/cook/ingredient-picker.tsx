import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { useRowDirection } from '@/components/ui/direction';
import { Input } from '@/components/ui/input';
import { PressScale } from '@/components/ui/press-scale';
import { Text } from '@/components/ui/text';
import { INGREDIENT_CATALOGUE, INGREDIENTS_BY_SLUG } from '@/features/ingredients/catalogue';
import { COMMON_INGREDIENT_NAMES } from '@/features/ingredients/common';
import { useIngredientName } from '@/features/ingredients/display';
import { resolveIngredient, searchIngredients } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { IngredientCategory, PantryItem } from '@/types/domain';

/**
 * Tell the app what is in your kitchen, fast.
 *
 * THE TARGET is someone standing at an open fridge: search, tap, search, tap,
 * find meals. Everything here is judged against that and nothing else.
 *
 * WHAT THIS REPLACED, and why each one cost time:
 *
 *   - A selected ingredient was REMOVED FROM THE RESULTS LIST. Tapping made
 *     the thing you tapped disappear, so you could not see what you had just
 *     done, could not undo it where you did it, and lost your place in a list
 *     that reflowed under your thumb. Results now stay put and carry their own
 *     selected state, and tapping again removes.
 *   - Suggestions were a hardcoded list of twelve English strings in this
 *     file, while the catalogue already marks 47 ingredients as common
 *     staples. The list is now derived from that data, so it is bilingual and
 *     cannot drift from the catalogue.
 *   - The 11-category taxonomy in `INGREDIENT_CATEGORIES` was not used at all,
 *     so browsing 257 ingredients meant guessing a word to type.
 *   - There was NO zero-results state. Typing something the catalogue does not
 *     know showed nothing at all — no explanation and no way forward — even
 *     though the engine has always accepted a free-text ingredient.
 *   - Everything was chips, including search results, so a long list became a
 *     reflowing wall with small targets.
 *
 * Quantity is deliberately absent. It is optional to the matching engine, and
 * asking for it per ingredient is what turns this screen into inventory
 * software. It lives in Pantry, where it is about what you own rather than
 * what you are cooking tonight.
 */

/** How many search results to show before the list stops being scannable. */
const SEARCH_LIMIT = 14;

/** Categories worth browsing, in the order a kitchen is usually searched. */
const BROWSE_ORDER: readonly IngredientCategory[] = [
  'protein',
  'vegetables',
  'carbs',
  'dairy',
  'fruit',
  'pantry',
  'spices',
  'sauces',
  'bakery',
  'frozen',
];

export type IngredientPickerProps = {
  selected: string[];
  onChange: (next: string[]) => void;
  pantryItems?: readonly PantryItem[];
  /** Names from the user's last search. Never invented — see `cook/index`. */
  recent?: readonly string[];
  testID?: string;
};

/** One tappable ingredient. A row, not a chip: bigger target, clearer state. */
function IngredientRow({
  label,
  isSelected,
  onPress,
  testID,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const theme = useTheme();
  const row = useRowDirection();

  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
      onPress={onPress}
      haptic="selection"
      scaleTo={0.99}
      style={{
        flexDirection: row,
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.sm,
        backgroundColor: isSelected ? theme.colors.primarySoft : 'transparent',
      }}
    >
      <Ionicons
        name={isSelected ? 'checkmark-circle' : 'add-circle-outline'}
        size={22}
        color={isSelected ? theme.colors.primary : theme.colors.textTertiary}
      />
      <Text
        variant={isSelected ? 'bodyMedium' : 'body'}
        style={{ flex: 1, color: isSelected ? theme.colors.primarySoftText : theme.colors.text }}
        lines={1}
      >
        {label}
      </Text>
    </PressScale>
  );
}

/** A labelled group of quick-add chips, with an optional "add all". */
function QuickGroup({
  title,
  names,
  selectedKeys,
  onToggle,
  onAddAll,
  addAllLabel,
  idPrefix,
}: {
  title: string;
  names: readonly string[];
  selectedKeys: ReadonlySet<string>;
  onToggle: (name: string) => void;
  onAddAll?: () => void;
  addAllLabel?: string;
  idPrefix: string;
}) {
  const theme = useTheme();
  const displayName = useIngredientName();
  const row = useRowDirection();
  if (names.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="micro" color="textTertiary" style={{ textTransform: 'uppercase', flex: 1 }}>
          {title}
        </Text>
        {onAddAll && addAllLabel ? (
          <PressScale
            testID={`${idPrefix}-add-all`}
            accessibilityRole="button"
            accessibilityLabel={addAllLabel}
            onPress={onAddAll}
            hitSlop={8}
            scaleTo={0.95}
          >
            <Text variant="subhead" style={{ color: theme.colors.primary }}>
              {addAllLabel}
            </Text>
          </PressScale>
        ) : null}
      </View>
      <View style={{ flexDirection: row, flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {names.map((name) => {
          const isSelected = selectedKeys.has(normaliseIngredientName(name));
          return (
            <Chip
              key={name}
              label={displayName(name)}
              size="sm"
              selected={isSelected}
              /*
                SOFT here, solid in the Selected rail — deliberately not the
                same weight.

                An ingredient can appear three times at once: in the rail, in
                Common, and in an open category. When every occurrence was a
                solid cobalt fill, choosing four things turned the screen into
                a field of blue and the rail stopped reading as the summary.
                The tick plus a tint is unambiguous at a glance and leaves the
                rail as the one place that answers "what have I picked".
              */
              emphasis="soft"
              icon={isSelected ? 'checkmark' : undefined}
              onPress={() => onToggle(name)}
              testID={`${idPrefix}-${normaliseIngredientName(name)}`}
            />
          );
        })}
      </View>
    </View>
  );
}

export function IngredientPicker({
  selected,
  onChange,
  pantryItems = [],
  recent = [],
  testID,
}: IngredientPickerProps) {
  const theme = useTheme();
  const { t } = useI18n();
  // Names are stored canonically in English so matching stays language-blind;
  // this turns them into what the user reads. See features/ingredients/display.
  const displayName = useIngredientName();
  const row = useRowDirection();
  const [query, setQuery] = useState('');
  const [openCategory, setOpenCategory] = useState<IngredientCategory | null>(null);

  const selectedKeys = useMemo(
    () => new Set(selected.map(normaliseIngredientName)),
    [selected],
  );

  /**
   * Adds or removes in one gesture.
   *
   * A single toggle rather than separate add and remove paths is what lets a
   * result row stay where it is: the list never has to reflow to reflect what
   * the user just did.
   */
  const toggle = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const name = resolveIngredient(trimmed)?.name ?? trimmed;
      const key = normaliseIngredientName(name);
      if (!key) return;
      onChange(
        selectedKeys.has(key)
          ? selected.filter((entry) => normaliseIngredientName(entry) !== key)
          : [...selected, name],
      );
    },
    [onChange, selected, selectedKeys],
  );

  /** Adds several at once without each call fighting the previous state. */
  const addMany = useCallback(
    (names: readonly string[]) => {
      const next = [...selected];
      const seen = new Set(selectedKeys);
      for (const raw of names) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        const name = resolveIngredient(trimmed)?.name ?? trimmed;
        const key = normaliseIngredientName(name);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        next.push(name);
      }
      onChange(next);
    },
    [onChange, selected, selectedKeys],
  );

  const trimmedQuery = query.trim();
  const results = useMemo(
    () => (trimmedQuery ? searchIngredients(trimmedQuery, SEARCH_LIMIT) : []),
    [trimmedQuery],
  );

  const pantryNames = useMemo(
    () => pantryItems.map((item) => item.ingredientName),
    [pantryItems],
  );
  const unselectedPantry = useMemo(
    () => pantryNames.filter((name) => !selectedKeys.has(normaliseIngredientName(name))),
    [pantryNames, selectedKeys],
  );

  /**
   * Common ingredients, ranked by what recipes actually use.
   *
   * Not `isCommonStaple.slice(0, 18)`, which was the first attempt: that flag
   * carries no ordering and the catalogue is alphabetical, so the list opened
   * with anise, baking powder, bay leaf and caraway. See
   * `features/ingredients/common.ts`.
   */
  /*
    Ten, not eighteen. The ranking is unchanged — this is purely how much of it
    is shown before the user has expressed any interest. Eighteen chips wrapped
    to four rows and pushed browsing off screen, which made the quick-add list
    compete with the thing it is supposed to be a shortcut past. The rest of
    the ranking is still reachable through search and through the categories
    directly beneath.
  */
  const commons = useMemo(() => COMMON_INGREDIENT_NAMES.slice(0, 10), []);

  const categoryItems = useMemo(() => {
    if (!openCategory) return [];
    return INGREDIENT_CATALOGUE.filter((ingredient) => ingredient.category === openCategory);
  }, [openCategory]);

  return (
    <View style={{ gap: theme.spacing.xl }} testID={testID}>
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder={t('cook.inputPlaceholder')}
        leadingIcon="search"
        trailingIcon={trimmedQuery ? 'close-circle' : undefined}
        onTrailingIconPress={trimmedQuery ? () => setQuery('') : undefined}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        testID="ingredient-input"
      />

      {/*
        The selected list is one scrollable line directly under the field, not
        a block that grows downward. At ten ingredients the old wrapping wall
        pushed everything else off screen, which is the moment a fast flow
        stops being fast.
      */}
      {selected.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="micro" color="textTertiary" style={{ textTransform: 'uppercase' }}>
            {t('cook.selected', { count: selected.length })}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.sm, flexDirection: row }}
            testID="cook-selected-rail"
          >
            {selected.map((name) => (
              <Chip
                key={name}
                label={displayName(name)}
                selected
                emphasis="solid"
                size="sm"
                onRemove={() => toggle(name)}
                accessibilityLabel={t('cook.removeIngredient', { name: displayName(name) })}
                testID={`selected-${normaliseIngredientName(name)}`}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {trimmedQuery ? (
        results.length > 0 ? (
          <View testID="ingredient-results">
            {results.map((candidate) => (
              <IngredientRow
                key={candidate.slug}
                label={displayName(candidate.name)}
                isSelected={selectedKeys.has(normaliseIngredientName(candidate.name))}
                onPress={() => toggle(candidate.name)}
                testID={`autocomplete-${candidate.slug}`}
              />
            ))}
          </View>
        ) : (
          /*
            The engine has always accepted an ingredient it does not recognise —
            it just matches on the raw name. Before, the screen said nothing at
            all and looked broken; offering to add it is both honest about the
            gap and the fastest way past it.
          */
          <View style={{ gap: theme.spacing.md }} testID="ingredient-no-results">
            <Text variant="footnote" color="textSecondary">
              {t('cook.noMatches', { query: trimmedQuery })}
            </Text>
            <Button
              label={t('cook.addAnyway', { query: trimmedQuery })}
              icon="add"
              variant="secondary"
              size="md"
              onPress={() => {
                toggle(trimmedQuery);
                setQuery('');
              }}
              testID="ingredient-add-anyway"
            />
          </View>
        )
      ) : (
        <View style={{ gap: theme.spacing.xl }}>
          <QuickGroup
            title={t('cook.fromPantry')}
            names={pantryNames}
            selectedKeys={selectedKeys}
            onToggle={toggle}
            onAddAll={
              unselectedPantry.length > 0 ? () => addMany(unselectedPantry) : undefined
            }
            addAllLabel={unselectedPantry.length > 0 ? t('cook.addAll') : undefined}
            idPrefix="pantry-suggest"
          />

          {/* Only real history. Nothing here is invented when there is none. */}
          <QuickGroup
            title={t('cook.recent')}
            names={recent}
            selectedKeys={selectedKeys}
            onToggle={toggle}
            idPrefix="recent"
          />

          <QuickGroup
            title={t('cook.suggestions')}
            names={commons}
            selectedKeys={selectedKeys}
            onToggle={toggle}
            idPrefix="starter"
          />

          {/*
            Browsing is secondary: one row of category chips, and the list only
            appears for the category actually opened. A screen that shows all
            257 ingredients up front is a catalogue, not a picker.
          */}
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="micro" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              {t('cook.browse')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -theme.layout.screenPadding, flexGrow: 0 }}
              contentContainerStyle={{
                gap: theme.spacing.sm,
                paddingHorizontal: theme.layout.screenPadding,
                flexDirection: row,
              }}
            >
              {BROWSE_ORDER.map((category) => (
                <Chip
                  key={category}
                  label={t(`category.${category}` as const)}
                  size="sm"
                  selected={openCategory === category}
                  onPress={() =>
                    setOpenCategory((current) => (current === category ? null : category))
                  }
                  testID={`category-${category}`}
                />
              ))}
              {/*
                A trailing spacer, because the last chip was rendering as
                "Pan…" — a clipped label reads as a rendering fault, not as a
                hint that the row scrolls.

                `paddingHorizontal` on a horizontal contentContainer is applied
                inconsistently at the far edge across RN and RN-web, so the end
                padding cannot be relied on to give the final item room. An
                actual element always can.
              */}
              <View style={{ width: theme.spacing.xl }} />
            </ScrollView>

            {openCategory ? (
              <View testID={`category-list-${openCategory}`}>
                {categoryItems.map((ingredient) => (
                  <IngredientRow
                    key={ingredient.slug}
                    label={displayName(ingredient.name)}
                    isSelected={selectedKeys.has(normaliseIngredientName(ingredient.name))}
                    onPress={() => toggle(ingredient.name)}
                    testID={`category-item-${ingredient.slug}`}
                  />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

/** Exported for tests: the catalogue entry a stored name resolves to. */
export function catalogueEntryFor(name: string) {
  const resolved = resolveIngredient(name);
  return resolved ? INGREDIENTS_BY_SLUG.get(resolved.slug) : undefined;
}
