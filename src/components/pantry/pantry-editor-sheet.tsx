import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ListRow } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { todayISO } from '@/features/ingredients/freshness';
import { resolveIngredient, searchIngredients } from '@/features/ingredients/matching';
import { CATEGORY_ORDER, type CreatePantryInput } from '@/features/pantry/repository';
import { useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { UNITS, type IngredientCategory, type PantryItem, type Unit } from '@/types/domain';

/** Units offered in the picker — the long tail stays available via the API. */
const COMMON_UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'piece', 'pack', 'can', 'bunch', 'tbsp', 'tsp'];

/** Quick expiry presets, in days from today. */
const EXPIRY_PRESETS = [
  { days: 1, labelKey: 'pantry.expiresTomorrow' as const },
  { days: 3, labelKey: null, label: '3d' },
  { days: 7, labelKey: null, label: '1w' },
  { days: 30, labelKey: null, label: '1m' },
];

function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

export type PantryEditorSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Provided when editing; omitted when adding. */
  item?: PantryItem | null;
  onSubmit: (input: CreatePantryInput) => void;
};

/**
 * Add / edit sheet for a pantry item.
 *
 * Autocomplete resolves free text against the ingredient catalogue so the
 * matching engine gets a canonical name. Anything unrecognised is still
 * accepted verbatim — we never block a user because we do not know their
 * ingredient.
 */
export function PantryEditorSheet({ visible, onClose, item, onSubmit }: PantryEditorSheetProps) {
  const theme = useTheme();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<Unit | null>(null);
  const [category, setCategory] = useState<IngredientCategory>('other');
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
  const [isStaple, setIsStaple] = useState(false);
  const [showAllUnits, setShowAllUnits] = useState(false);

  // Reset the form each time the sheet opens on a different item, so a previous
  // edit never leaks in. Done during render (React's documented "adjust state
  // when props change" pattern) rather than in an effect: an effect would paint
  // one frame of stale values first. `formKey` is null while the sheet is
  // closed, so the reset does not fire during the dismiss animation.
  const formKey = visible ? (item?.id ?? 'new') : null;
  const [lastFormKey, setLastFormKey] = useState<string | null>(null);

  if (formKey !== null && formKey !== lastFormKey) {
    setLastFormKey(formKey);
    setName(item?.ingredientName ?? '');
    setQuantity(item?.quantity != null ? String(item.quantity) : '');
    setUnit(item?.unit ?? null);
    setCategory(item?.category ?? 'other');
    setExpiresOn(item?.expiresOn ?? null);
    setIsStaple(item?.isStaple ?? false);
    setShowAllUnits(false);
  }

  const suggestions = useMemo(() => (item ? [] : searchIngredients(name, 6)), [name, item]);

  const applySuggestion = (suggestionName: string) => {
    const resolved = resolveIngredient(suggestionName);
    setName(resolved?.name ?? suggestionName);
    if (resolved) {
      setCategory(resolved.category);
      setUnit((current) => current ?? resolved.defaultUnit);
      setIsStaple(resolved.isCommonStaple);
    }
  };

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const parsedQuantity = quantity.trim() ? Number.parseFloat(quantity.trim()) : null;
    onSubmit({
      ingredientName: trimmedName,
      quantity: parsedQuantity !== null && Number.isFinite(parsedQuantity) ? parsedQuantity : null,
      unit,
      category,
      expiresOn,
      isStaple,
    });
    onClose();
  };

  const unitsToShow = showAllUnits ? UNITS : COMMON_UNITS;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={item ? t('common.edit') : t('pantry.addItem')}
      testID="pantry-editor"
      footer={
        <Button
          label={item ? t('common.save') : t('common.add')}
          onPress={handleSubmit}
          disabled={!canSubmit}
          size="lg"
          testID="pantry-editor-submit"
        />
      }
    >
      <View style={{ gap: theme.spacing.lg }}>
        <Input
          label={t('cook.inputPlaceholder')}
          value={name}
          onChangeText={setName}
          placeholder={t('cook.inputPlaceholder')}
          autoFocus={!item}
          autoCapitalize="none"
          leadingIcon="search"
          testID="pantry-editor-name"
        />

        {suggestions.length > 0 && trimmedName.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.sm }}
          >
            {suggestions.map((suggestion) => (
              <Chip
                key={suggestion.slug}
                label={suggestion.name}
                size="sm"
                onPress={() => applySuggestion(suggestion.name)}
                testID={`pantry-suggestion-${suggestion.slug}`}
              />
            ))}
          </ScrollView>
        ) : null}

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Input
            label={t('pantry.quantity')}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="1"
            containerStyle={{ flex: 1 }}
            testID="pantry-editor-quantity"
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="textSecondary">
            {t('pantry.unit')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {unitsToShow.map((candidate) => (
              <Chip
                key={candidate}
                label={candidate}
                size="sm"
                selected={unit === candidate}
                onPress={() => setUnit(unit === candidate ? null : candidate)}
              />
            ))}
            {!showAllUnits ? (
              <Chip label="…" size="sm" onPress={() => setShowAllUnits(true)} />
            ) : null}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="textSecondary">
            {t('pantry.category')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {CATEGORY_ORDER.map((candidate) => (
              <Chip
                key={candidate}
                label={t(`category.${candidate}` as const)}
                size="sm"
                selected={category === candidate}
                onPress={() => setCategory(candidate)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="textSecondary">
            {t('pantry.expiry')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            <Chip
              label={t('pantry.noExpiry')}
              size="sm"
              selected={expiresOn === null}
              onPress={() => setExpiresOn(null)}
            />
            {EXPIRY_PRESETS.map((preset) => {
              const iso = isoInDays(preset.days);
              return (
                <Chip
                  key={preset.days}
                  label={preset.labelKey ? t(preset.labelKey) : (preset.label ?? '')}
                  size="sm"
                  selected={expiresOn === iso}
                  onPress={() => setExpiresOn(iso)}
                />
              );
            })}
          </View>
          <Input
            value={expiresOn ?? ''}
            onChangeText={(value) => setExpiresOn(value.trim() ? value.trim() : null)}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            hint={t('common.optional')}
            testID="pantry-editor-expiry"
          />
        </View>

        <ListRow
          title={t('pantry.staple')}
          subtitle={t('pantry.stapleHint')}
          icon="star-outline"
          toggle={{ value: isStaple, onChange: setIsStaple }}
        />
      </View>
    </Sheet>
  );
}
