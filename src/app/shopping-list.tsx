import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { PriceTag } from '@/components/recipe/price-tag';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PressScale } from '@/components/ui/press-scale';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Divider } from '@/components/ui/section';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { isOrderingAvailable } from '@/features/grocery/registry';
import { CATEGORY_ORDER } from '@/features/pantry/repository';
import { useIngredientName } from '@/features/ingredients/display';
import { formatQuantity } from '@/features/pricing/units';
import { usePreferences } from '@/features/preferences/preferences-provider';
import { useShoppingList, useShoppingMutations, useShoppingTotal } from '@/features/shopping/hooks';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { useTheme } from '@/theme';
import type { ShoppingListItem } from '@/types/domain';

function Row({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingListItem;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const { t, formatNumber } = useI18n();
  const displayName = useIngredientName();
  const name = displayName(item.name);
  const quantityLabel = formatQuantity(item.quantity, item.unit, { t, formatNumber });

  return (
    <PressScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked: item.isChecked }}
      accessibilityLabel={name}
      onPress={onToggle}
      haptic="selection"
      scaleTo={0.99}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
      }}
      testID={`shopping-item-${item.id}`}
    >
      <Ionicons
        name={item.isChecked ? 'checkbox' : 'square-outline'}
        size={22}
        color={item.isChecked ? theme.colors.success : theme.colors.borderStrong}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          variant="body"
          color={item.isChecked ? 'textTertiary' : 'text'}
          style={item.isChecked ? { textDecorationLine: 'line-through' } : undefined}
        >
          {name}
        </Text>
        {item.sourceRecipeIds.length > 1 ? (
          <Text variant="micro" color="textTertiary">
            {t('shopping.mergedNotice')}
          </Text>
        ) : null}
      </View>
      {quantityLabel ? (
        <Text variant="subhead" color="textSecondary">
          {quantityLabel}
        </Text>
      ) : null}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={t('common.remove')}
        onPress={onRemove}
        hitSlop={10}
        scaleTo={0.85}
      >
        <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
      </PressScale>
    </PressScale>
  );
}

export default function ShoppingListScreen() {
  const theme = useTheme();
  const { t } = useI18n();
  const toast = useToast();

  const { preferences } = usePreferences();
  const { data: items, isLoading, isError, error, refetch } = useShoppingList();
  // Asks the provider registry rather than a flag: ordering is available only
  // when a real provider is registered, enabled AND serves this country.
  const orderingAvailable = isOrderingAvailable(preferences.country);
  const { add, toggle, remove, clearChecked } = useShoppingMutations();
  const total = useShoppingTotal(items);

  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [orderOpen, setOrderOpen] = useState(false);

  const grouped = useMemo(() => {
    if (!items) return [];
    const buckets = new Map<string, ShoppingListItem[]>();
    for (const item of items) {
      const bucket = buckets.get(item.category);
      if (bucket) bucket.push(item);
      else buckets.set(item.category, [item]);
    }
    return CATEGORY_ORDER.filter((category) => buckets.has(category)).map((category) => ({
      category,
      items: buckets.get(category) ?? [],
    }));
  }, [items]);

  const checkedCount = (items ?? []).filter((item) => item.isChecked).length;

  const handleAdd = () => {
    const name = newItem.trim();
    if (!name) return;
    add.mutate({ name });
    setNewItem('');
    setAddOpen(false);
  };

  return (
    <>
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader
          title={t('shopping.title')}
          right={
            <IconButton
              icon="add"
              onPress={() => setAddOpen(true)}
              accessibilityLabel={t('shopping.addItem')}
              size={40}
              testID="shopping-add"
            />
          }
        />

        {isLoading ? (
          <SkeletonList count={5} variant="row" />
        ) : isError ? (
          <ErrorState
            title={t(presentError(error).titleKey)}
            body={t(presentError(error).bodyKey)}
            action={{ label: t('common.retry'), onPress: () => void refetch() }}
          />
        ) : (items?.length ?? 0) === 0 ? (
          <EmptyState
            icon="cart-outline"
            title={t('shopping.empty')}
            body={t('shopping.emptyBody')}
            action={{ label: t('shopping.addItem'), onPress: () => setAddOpen(true) }}
            testID="shopping-empty"
          />
        ) : (
          <>
            {total ? (
              <View
                style={{
                  gap: theme.spacing.xs,
                  padding: theme.spacing.lg,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.surface,
                  // Border-first, like every other surface since Phase 3.5.
                  // This screen was not in that pass and kept its shadow.
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
                testID="shopping-total"
              >
                <Text variant="caption" color="textTertiary">
                  {t('shopping.estimatedTotal')}
                </Text>
                <PriceTag priced={total.priced} size="lg" />
                <Text variant="micro" color="textTertiary">
                  {t('shopping.estimatedTotalNote')}
                </Text>
              </View>
            ) : null}

            {/*
              STILL TO BUY COMES FIRST, and what is already in the trolley
              sinks to the bottom.

              Checked items used to stay in place inside their category group,
              so a half-done shop was a list where the next thing to find was
              somewhere among the things already found. In a supermarket, with
              one hand, that is the whole job of this screen. The categories
              still order the unchecked items — that IS the aisle order — and
              the done pile does not need them.
            */}
            {grouped.map((group) => {
              const pending = group.items.filter((item) => !item.isChecked);
              if (pending.length === 0) return null;
              return (
                <View key={group.category} style={{ gap: theme.spacing.xs }}>
                  <Text
                    variant="micro"
                    color="textTertiary"
                    style={{ textTransform: 'uppercase' }}
                  >
                    {t(`category.${group.category}` as const)}
                  </Text>
                  {pending.map((item, index) => (
                    <View key={item.id}>
                      <Row
                        item={item}
                        onToggle={() => toggle.mutate({ id: item.id, isChecked: !item.isChecked })}
                        onRemove={() => remove.mutate(item.id)}
                      />
                      {index < pending.length - 1 ? <Divider /> : null}
                    </View>
                  ))}
                </View>
              );
            })}

            {checkedCount > 0 ? (
              <View style={{ gap: theme.spacing.xs }} testID="shopping-checked-group">
                <Text
                  variant="micro"
                  color="textTertiary"
                  style={{ textTransform: 'uppercase' }}
                >
                  {t('shopping.inTrolley', { count: checkedCount })}
                </Text>
                {/* Receded, not hidden: still reachable to untick a mistake. */}
                <View style={{ opacity: 0.55 }}>
                  {(items ?? [])
                    .filter((item) => item.isChecked)
                    .map((item, index, all) => (
                      <View key={item.id}>
                        <Row
                          item={item}
                          onToggle={() =>
                            toggle.mutate({ id: item.id, isChecked: !item.isChecked })
                          }
                          onRemove={() => remove.mutate(item.id)}
                        />
                        {index < all.length - 1 ? <Divider /> : null}
                      </View>
                    ))}
                </View>
              </View>
            ) : null}

            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              {checkedCount > 0 ? (
                <Button
                  label={t('shopping.clearChecked')}
                  variant="secondary"
                  icon="trash-outline"
                  onPress={() =>
                    clearChecked.mutate(undefined, {
                      onSuccess: () =>
                        toast.show({ message: t('shopping.checked', { count: checkedCount }) }),
                    })
                  }
                  size="md"
                  fullWidth
                  testID="shopping-clear-checked"
                />
              ) : null}

              {/*
                Ordering is a future feature: the only provider that exists is
                a mock, and `enabledProvidersFor` never returns it. An active
                ghost button that opens a sheet saying "not available" is a
                tap spent to learn nothing, so the unavailable state says so on
                its face and cannot be pressed.
              */}
              <Button
                label={orderingAvailable ? t('shopping.orderAll') : t('shopping.orderComingSoon')}
                icon="bag-handle-outline"
                variant="ghost"
                onPress={orderingAvailable ? () => setOrderOpen(true) : undefined}
                disabled={!orderingAvailable}
                size="md"
                fullWidth
                testID="shopping-order"
              />
            </View>
          </>
        )}
      </ScreenScroll>

      <Sheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('shopping.addItem')}
        scrollable={false}
        footer={
          <Button
            label={t('common.add')}
            onPress={handleAdd}
            disabled={!newItem.trim()}
            size="lg"
            testID="shopping-add-submit"
          />
        }
      >
        <Input
          value={newItem}
          onChangeText={setNewItem}
          placeholder={t('cook.inputPlaceholder')}
          autoFocus
          autoCapitalize="none"
          onSubmitEditing={handleAdd}
          testID="shopping-add-input"
        />
      </Sheet>

      <Sheet
        visible={orderOpen}
        onClose={() => setOrderOpen(false)}
        title={t('grocery.notAvailableTitle')}
        scrollable={false}
      >
        <Text variant="body" color="textSecondary">
          {orderingAvailable
            ? t('shopping.orderUnavailable')
            : t('grocery.notAvailableBody', { country: t(`country.${preferences.country}` as const) })}
        </Text>
      </Sheet>
    </>
  );
}
