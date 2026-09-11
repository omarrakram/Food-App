import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useIngredientName } from '@/features/ingredients/display';
import { resolveIngredient, searchIngredients } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import type { PantryItem } from '@/types/domain';

/** Shown before the user types anything, so the screen is never a blank field. */
const STARTER_SUGGESTIONS = [
  'eggs',
  'rice',
  'chicken breast',
  'tomatoes',
  'onions',
  'pasta',
  'potatoes',
  'white cheese',
  'baladi bread',
  'fava beans',
  'red lentils',
  'yogurt',
];

export type IngredientPickerProps = {
  selected: string[];
  onChange: (next: string[]) => void;
  pantryItems?: readonly PantryItem[];
  testID?: string;
};

/**
 * Token input for ingredients.
 *
 * Three ways in — typing with autocomplete, tapping a common ingredient, or
 * pulling from the pantry — because the fastest path differs per user. Camera,
 * barcode and receipt capture land here later as additional sources; the
 * component's contract (a list of names out) does not change.
 */
export function IngredientPicker({
  selected,
  onChange,
  pantryItems = [],
  testID,
}: IngredientPickerProps) {
  const theme = useTheme();
  const { t } = useI18n();
  // Names are stored canonically in English so matching stays language-blind;
  // this turns them into what the user reads. See features/ingredients/display.
  const displayName = useIngredientName();
  const [query, setQuery] = useState('');

  const selectedKeys = useMemo(
    () => new Set(selected.map(normaliseIngredientName)),
    [selected],
  );

  const addIngredient = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const resolved = resolveIngredient(trimmed);
      const name = resolved?.name ?? trimmed;
      const key = normaliseIngredientName(name);
      if (!key || selectedKeys.has(key)) {
        setQuery('');
        return;
      }
      onChange([...selected, name]);
      setQuery('');
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
      setQuery('');
    },
    [onChange, selected, selectedKeys],
  );

  const removeIngredient = useCallback(
    (name: string) => {
      onChange(selected.filter((entry) => entry !== name));
    },
    [onChange, selected],
  );

  const autocomplete = useMemo(() => {
    if (!query.trim()) return [];
    return searchIngredients(query, 6).filter(
      (candidate) => !selectedKeys.has(normaliseIngredientName(candidate.name)),
    );
  }, [query, selectedKeys]);

  const pantrySuggestions = useMemo(
    () =>
      pantryItems.filter(
        (item) => !selectedKeys.has(normaliseIngredientName(item.ingredientName)),
      ),
    [pantryItems, selectedKeys],
  );

  const starters = useMemo(
    () => STARTER_SUGGESTIONS.filter((name) => !selectedKeys.has(normaliseIngredientName(name))),
    [selectedKeys],
  );

  return (
    <View style={{ gap: theme.spacing.lg }} testID={testID}>
      {/*
        Typing is a primary way in, not a fallback, so the field is labelled
        and sits above every suggestion list rather than competing with them.
      */}
      <Input
        label={t('cook.inputLabel')}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => addIngredient(query)}
        placeholder={t('cook.inputPlaceholder')}
        leadingIcon="search"
        trailingIcon={query.trim() ? 'add-circle' : undefined}
        onTrailingIconPress={query.trim() ? () => addIngredient(query) : undefined}
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        testID="ingredient-input"
      />

      {/*
        One tap for "everything I already told you I have", which is the whole
        point of keeping a pantry.
      */}
      {pantrySuggestions.length > 0 ? (
        <Button
          label={t('cook.usePantry', { count: pantrySuggestions.length })}
          icon="file-tray-full-outline"
          variant="secondary"
          size="md"
          fullWidth
          onPress={() => addMany(pantrySuggestions.map((item) => item.ingredientName))}
          testID="cook-use-pantry"
        />
      ) : null}

      {autocomplete.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {autocomplete.map((candidate) => (
            <Chip
              key={candidate.slug}
              label={displayName(candidate.name)}
              icon="add"
              size="sm"
              onPress={() => addIngredient(candidate.name)}
              testID={`autocomplete-${candidate.slug}`}
            />
          ))}
        </View>
      ) : null}

      {selected.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" color="textTertiary">
            {t('cook.selected', { count: selected.length })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {selected.map((name) => (
              <Chip
                key={name}
                label={displayName(name)}
                selected
                // Solid fill and a tick, because these sit a few pixels away
                // from rows of unselected pills that are also pill-shaped. A
                // soft tint was not telling anyone what they had chosen.
                emphasis="solid"
                icon="checkmark"
                onRemove={() => removeIngredient(name)}
                accessibilityLabel={t('cook.removeIngredient', { name: displayName(name) })}
                testID={`selected-${normaliseIngredientName(name)}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {pantrySuggestions.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Ionicons name="file-tray-outline" size={14} color={theme.colors.textTertiary} />
            <Text variant="caption" color="textTertiary">
              {t('cook.fromPantry')}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.sm }}
          >
            {pantrySuggestions.map((item) => (
              <Chip
                key={item.id}
                label={displayName(item.ingredientName)}
                icon="add"
                size="sm"
                onPress={() => addIngredient(item.ingredientName)}
                testID={`pantry-suggest-${item.id}`}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {starters.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" color="textTertiary">
            {t('cook.suggestions')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {starters.slice(0, 10).map((name) => (
              <Chip
                key={name}
                label={displayName(name)}
                size="sm"
                onPress={() => addIngredient(name)}
                testID={`starter-${normaliseIngredientName(name)}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
