import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { PantryEditorSheet } from '@/components/pantry/pantry-editor-sheet';
import { PantryRow } from '@/components/pantry/pantry-row';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScreenScroll } from '@/components/ui/screen';
import { useRowDirection } from '@/components/ui/direction';
import { PressScale } from '@/components/ui/press-scale';
import { Divider } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { expiredItems, expiringSoonItems } from '@/features/ingredients/freshness';
import { resolveIngredient, searchIngredients } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { useIngredientName } from '@/features/ingredients/display';
import { usePantryItems, usePantryMutations } from '@/features/pantry/hooks';
import { groupByCategory, type CreatePantryInput } from '@/features/pantry/repository';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import type { PantryItem } from '@/types/domain';

export default function PantryScreen() {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const row = useRowDirection();
  const displayName = useIngredientName();

  const { data: items, isLoading, isError, error, refetch } = usePantryItems();
  const { add, update, remove } = usePantryMutations();

  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);

  const filtered = useMemo(() => {
    if (!items) return [];
    const term = normaliseIngredientName(search);
    if (!term) return items;
    return items.filter((item) => normaliseIngredientName(item.ingredientName).includes(term));
  }, [items, search]);

  /**
   * ONE FIELD DOES BOTH JOBS: it filters what you have, and it offers what you
   * do not.
   *
   * Adding used to mean tapping "+" in the header and filling in a sheet with
   * a quantity, a unit and a date — a form, for the sentence "I bought
   * tomatoes". Typing a name is the fastest expression of that thought, and
   * the same typing is also how you find something you already own, so the two
   * are the same field. Catalogue matches you do not already hold appear as
   * one-tap adds; the sheet stays for the details, reached by tapping a row.
   */
  const addable = useMemo(() => {
    const term = search.trim();
    if (!term || !items) return [];
    const held = new Set(items.map((item) => normaliseIngredientName(item.ingredientName)));
    return searchIngredients(term, 6).filter(
      (candidate) => !held.has(normaliseIngredientName(candidate.name)),
    );
  }, [search, items]);

  const quickAdd = (name: string) => {
    // No quantity, no unit, no date. All three are optional to every consumer
    // of a pantry item, and demanding them at the door is what made adding
    // three things feel like data entry.
    add.mutate(
      { ingredientName: resolveIngredient(name)?.name ?? name },
      {
        onSuccess: (created) => {
          setSearch('');
          toast.show({
            message: t('pantry.itemAdded', { name: displayName(created.ingredientName) }),
            tone: 'success',
          });
        },
        onError: (mutationError) =>
          toast.show({ message: t(presentError(mutationError).titleKey), tone: 'danger' }),
      },
    );
  };

  const urgent = useMemo(() => expiringSoonItems(filtered), [filtered]);
  const expired = useMemo(() => expiredItems(filtered), [filtered]);
  const urgentIds = useMemo(
    () => new Set([...urgent, ...expired].map((item) => item.id)),
    [urgent, expired],
  );
  const grouped = useMemo(
    () => groupByCategory(filtered.filter((item) => !urgentIds.has(item.id))),
    [filtered, urgentIds],
  );

  const openEditor = (item: PantryItem | null) => {
    setEditingItem(item);
    setEditorOpen(true);
  };

  const handleSubmit = (input: CreatePantryInput) => {
    if (editingItem) {
      update.mutate({
        id: editingItem.id,
        patch: {
          ingredientName: input.ingredientName,
          quantity: input.quantity ?? null,
          unit: input.unit ?? null,
          category: input.category ?? editingItem.category,
          expiresOn: input.expiresOn ?? null,
          isStaple: input.isStaple ?? false,
        },
      });
      return;
    }
    add.mutate(input, {
      onSuccess: (created) =>
        toast.show({ message: t('pantry.itemAdded', { name: created.ingredientName }), tone: 'success' }),
      onError: (mutationError) =>
        toast.show({ message: t(presentError(mutationError).titleKey), tone: 'danger' }),
    });
  };

  const handleRemove = (item: PantryItem) => {
    remove.mutate(item.id, {
      onSuccess: () =>
        toast.show({ message: t('pantry.itemRemoved', { name: item.ingredientName }) }),
    });
  };

  const hasAnyItems = (items?.length ?? 0) > 0;

  return (
    <>
      <ScreenScroll bottomInset={theme.layout.tabBarHeight} contentGap={theme.spacing.lg}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            paddingTop: theme.spacing.md,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="title1">{t('pantry.title')}</Text>
            <Text variant="callout" color="textSecondary">
              {t('pantry.subtitle')}
            </Text>
          </View>
          <IconButton
            icon="add"
            onPress={() => openEditor(null)}
            accessibilityLabel={t('pantry.addItem')}
            size={44}
            testID="pantry-add"
          />
        </View>

        {/*
          Always present, including on an empty pantry — the field IS the add
          control, so hiding it until there is something to search meant the
          one screen that most needed a way in did not have one.
        */}
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder={t('pantry.searchOrAdd')}
          leadingIcon="search"
          trailingIcon={search ? 'close-circle' : undefined}
          onTrailingIconPress={() => setSearch('')}
          autoCapitalize="none"
          testID="pantry-search"
        />

        {addable.length > 0 ? (
          <View style={{ gap: theme.spacing.xs }} testID="pantry-add-suggestions">
            <Text variant="micro" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              {t('pantry.addToPantry')}
            </Text>
            {addable.map((candidate) => (
              <PressScale
                key={candidate.slug}
                testID={`pantry-add-${candidate.slug}`}
                accessibilityRole="button"
                accessibilityLabel={t('pantry.addNamed', {
                  name: displayName(candidate.name),
                })}
                onPress={() => quickAdd(candidate.name)}
                haptic="selection"
                scaleTo={0.99}
                style={{
                  flexDirection: row,
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.sm,
                  backgroundColor: theme.colors.primarySoft,
                }}
              >
                <Ionicons name="add-circle" size={22} color={theme.colors.primary} />
                <Text
                  variant="bodyMedium"
                  style={{ flex: 1, color: theme.colors.primarySoftText }}
                  lines={1}
                >
                  {displayName(candidate.name)}
                </Text>
              </PressScale>
            ))}
          </View>
        ) : null}

        {isLoading ? (
          <SkeletonList count={5} variant="row" />
        ) : isError ? (
          <ErrorState
            title={t(presentError(error).titleKey)}
            body={t(presentError(error).bodyKey)}
            action={{ label: t('common.retry'), onPress: () => void refetch() }}
          />
        ) : !hasAnyItems ? (
          <EmptyState
            icon="file-tray-outline"
            title={t('pantry.empty')}
            body={t('pantry.emptyBody')}
            action={{ label: t('pantry.emptyCta'), onPress: () => openEditor(null) }}
            testID="pantry-empty"
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title={t('search.noResults')}
            body={t('search.noResultsBody')}
          />
        ) : (
          <>
            {expired.length > 0 ? (
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" color="danger">
                  {t('pantry.expired')}
                </Text>
                {expired.map((item) => (
                  <PantryRow
                    key={item.id}
                    item={item}
                    onPress={() => openEditor(item)}
                    onRemove={() => handleRemove(item)}
                    testID={`pantry-item-${item.id}`}
                  />
                ))}
              </View>
            ) : null}

            {/*
              EXPIRING SOON IS THE ONE BLOCK THAT SHOULD INTERRUPT YOU. It was
              a caption in the same weight as a category heading, so "three
              things are about to go off" looked exactly like "dairy". It now
              has a tinted, bordered surface and its own way to act on it —
              which is the whole point of the section, and the reason it is
              placed above the inventory rather than inside it.

              The action carries `expiring=1`, so the cook flow starts from
              these items rather than the whole pantry. Nothing is removed or
              changed here; the pantry is untouched by cooking.
            */}
            {urgent.length > 0 ? (
              <View
                style={{
                  gap: theme.spacing.sm,
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.warningSoft,
                  borderWidth: 1,
                  borderColor: theme.colors.warning,
                }}
                testID="pantry-expiring-block"
              >
                <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.sm }}>
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={theme.colors.warningSoftText}
                  />
                  <Text
                    variant="subhead"
                    style={{ color: theme.colors.warningSoftText, flex: 1 }}
                  >
                    {t('pantry.expiringSoon')}
                  </Text>
                  <Text variant="caption" style={{ color: theme.colors.warningSoftText }}>
                    {formatNumber(urgent.length)}
                  </Text>
                </View>
                {urgent.map((item) => (
                  <PantryRow
                    key={item.id}
                    item={item}
                    onPress={() => openEditor(item)}
                    onRemove={() => handleRemove(item)}
                    testID={`pantry-item-${item.id}`}
                  />
                ))}
                <Button
                  label={t('pantry.cookWithExpiring')}
                  icon="restaurant-outline"
                  variant="secondary"
                  size="md"
                  fullWidth
                  onPress={() => router.push('/cook?fromPantry=1&expiring=1')}
                  testID="pantry-cook-expiring"
                />
              </View>
            ) : null}

            {/*
              MOVED UP FROM THE BOTTOM. With thirty ingredients the primary
              action sat below all of them, so the thing the pantry exists to
              enable was the last thing you could reach.
            */}
            <Button
              label={t('pantry.cookFromPantry')}
              icon="restaurant-outline"
              onPress={() => router.push('/cook?fromPantry=1')}
              size="lg"
              testID="pantry-cook"
            />

            <Text variant="micro" color="textTertiary" style={{ textTransform: 'uppercase' }}>
              {t('pantry.countLabel', { count: filtered.length })}
            </Text>

            {grouped.map((group) => (
              <View key={group.category} style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" color="textTertiary">
                  {t(`category.${group.category}` as const)}
                </Text>
                {group.items.map((item, index) => (
                  <View key={item.id}>
                    <PantryRow
                      item={item}
                      onPress={() => openEditor(item)}
                      onRemove={() => handleRemove(item)}
                      testID={`pantry-item-${item.id}`}
                    />
                    {index < group.items.length - 1 ? <Divider /> : null}
                  </View>
                ))}
              </View>
            ))}

            {/*
              Basics are user-configured and deliberately quiet: they change
              every match in the app, so they need a route, but they are not
              what someone opens the pantry to do. Editing stays on the
              existing Settings screen rather than being duplicated here.
            */}
            <PressScale
              testID="pantry-basics"
              accessibilityRole="button"
              accessibilityLabel={t('pantry.basicsLink')}
              onPress={() => router.push('/settings/basics')}
              haptic="light"
              scaleTo={0.99}
              style={{
                flexDirection: row,
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingVertical: theme.spacing.lg,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
                marginTop: theme.spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyMedium">{t('pantry.basicsLink')}</Text>
                <Text variant="footnote" color="textSecondary" lines={2}>
                  {t('pantry.basicsHint')}
                </Text>
              </View>
              <Ionicons
                name={row === 'row-reverse' ? 'chevron-back' : 'chevron-forward'}
                size={17}
                color={theme.colors.textTertiary}
              />
            </PressScale>
          </>
        )}
      </ScreenScroll>

      <PantryEditorSheet
        visible={editorOpen}
        onClose={() => setEditorOpen(false)}
        item={editingItem}
        onSubmit={handleSubmit}
      />
    </>
  );
}
