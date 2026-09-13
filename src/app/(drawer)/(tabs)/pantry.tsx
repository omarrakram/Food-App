import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { PantryEditorSheet } from '@/components/pantry/pantry-editor-sheet';
import { PantryRow } from '@/components/pantry/pantry-row';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScreenScroll } from '@/components/ui/screen';
import { Divider } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { expiredItems, expiringSoonItems } from '@/features/ingredients/freshness';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { usePantryItems, usePantryMutations } from '@/features/pantry/hooks';
import { groupByCategory, type CreatePantryInput } from '@/features/pantry/repository';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import type { PantryItem } from '@/types/domain';

export default function PantryScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();

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

        {hasAnyItems ? (
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder={t('pantry.searchPlaceholder')}
            leadingIcon="search"
            trailingIcon={search ? 'close-circle' : undefined}
            onTrailingIconPress={() => setSearch('')}
            autoCapitalize="none"
            testID="pantry-search"
          />
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

            {urgent.length > 0 ? (
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="caption" color="warningSoftText">
                  {t('pantry.expiringSoon')}
                </Text>
                {urgent.map((item) => (
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

            <Button
              label={t('pantry.cookFromPantry')}
              icon="restaurant-outline"
              onPress={() => router.push('/cook?fromPantry=1')}
              size="lg"
              style={{ marginTop: theme.spacing.md }}
              testID="pantry-cook"
            />
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
