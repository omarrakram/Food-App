import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
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
      <Input
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => addIngredient(query)}
        placeholder={t('cook.inputPlaceholder')}
        leadingIcon="add-circle-outline"
        returnKeyType="done"
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={false}
        testID="ingredient-input"
      />

      {autocomplete.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {autocomplete.map((candidate) => (
            <Chip
              key={candidate.slug}
              label={candidate.name}
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
                label={name}
                selected
                onRemove={() => removeIngredient(name)}
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
                label={item.ingredientName}
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
                label={name}
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
