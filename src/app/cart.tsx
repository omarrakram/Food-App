import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { PriceTag } from '@/components/recipe/price-tag';
import { Button, IconButton } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { PressScale } from '@/components/ui/press-scale';
import { ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Divider } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { merchantDisplayName, productDisplayName } from '@/features/commerce/display';
import { useCartMutations, useCartView, type CartLineView } from '@/features/commerce/hooks';
import { formatQuantity } from '@/features/pricing/units';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { formatMoney } from '@/lib/format/money';
import { useTheme } from '@/theme';
import type { Money, PricedAmount } from '@/types/domain';

/**
 * THE CART.
 *
 * One basket, one branch — see `cart-repository.ts` for why that is a property
 * of the thing rather than a simplification. This screen's whole job is to be
 * truthful about a basket that cannot yet be bought: every price here is a
 * snapshot taken when the line was added, the catalogue may have moved since,
 * and checkout does not exist. All three of those are said on the screen
 * rather than discovered later.
 */

/** Merchant prices are live reads. Never an estimate, never a `~`. */
function livePrice(money: Money, storeName: string): PricedAmount {
  return { money, source: 'live', storeName, completeness: 'complete' };
}

function CartRow({
  entry,
  merchantName,
  onQuantity,
  onRemove,
}: {
  entry: CartLineView;
  merchantName: string;
  onQuantity: (next: number) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  const { t, language, locale, formatNumber } = useI18n();
  const row = useRowDirection();

  const { line, product } = entry;
  const name = product ? productDisplayName(product, language) : t('cart.unknownProduct');
  const pack = product
    ? formatQuantity(product.packQuantity, product.packUnit, { t, formatNumber })
    : null;

  return (
    <View style={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.md }}>
      <View style={{ flexDirection: row, alignItems: 'flex-start', gap: theme.spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" color={product ? 'text' : 'textTertiary'} numberOfLines={2}>
            {name}
          </Text>
          <Text variant="caption" color="textTertiary">
            {[pack, t('cart.eachPrice', { amount: formatMoney(line.unitPriceSnapshot, { locale }) })]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {/*
            A CHANGED PRICE IS SHOWN ON THE LINE THAT CHANGED, with the old
            number next to the new one. A basket that silently re-totals
            itself is a shop that cannot be held to what it quoted.
          */}
          {entry.priceChanged && entry.currentUnitPrice ? (
            <Text variant="caption" style={{ color: theme.colors.warningSoftText }}>
              {`${formatMoney(entry.currentUnitPrice, { locale })} · ${t('cart.priceWas', {
                amount: formatMoney(line.unitPriceSnapshot, { locale }),
              })}`}
            </Text>
          ) : null}
        </View>
        <PriceTag priced={livePrice(entry.lineTotal, merchantName)} size="sm" showLabel={false} />
      </View>

      <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.md }}>
        <Stepper
          value={line.quantity}
          onChange={onQuantity}
          min={1}
          max={99}
          accessibilityLabel={t('cart.quantity')}
          testID={`cart-quantity-${line.id}`}
        />
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={t('cart.remove')}
          onPress={onRemove}
          hitSlop={10}
          scaleTo={0.9}
          testID={`cart-remove-${line.id}`}
        >
          <Text variant="footnote" color="textTertiary">
            {t('cart.remove')}
          </Text>
        </PressScale>
      </View>
    </View>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const row = useRowDirection();
  return (
    <View style={{ flexDirection: row, justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text variant={strong ? 'headline' : 'footnote'} color={strong ? 'text' : 'textSecondary'}>
        {label}
      </Text>
      <Text variant={strong ? 'headline' : 'footnote'} color={strong ? 'text' : 'textSecondary'}>
        {value}
      </Text>
    </View>
  );
}

export default function CartScreen() {
  const theme = useTheme();
  const { t, locale, language } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const row = useRowDirection();

  const state = useCartView();
  const { setQuantity, removeLine, clear } = useCartMutations();

  const showError = (error: unknown) =>
    toast.show({ message: t(presentError(error).bodyKey), tone: 'danger' });

  const header = (
    <ScreenHeader
      title={t('cart.title')}
      right={
        state.kind === 'ready' || state.kind === 'problem' ? (
          <IconButton
            icon="trash-outline"
            onPress={() => clear.mutate(undefined, { onError: showError })}
            accessibilityLabel={t('cart.clear')}
            size={40}
            testID="cart-clear"
          />
        ) : undefined
      }
    />
  );

  if (state.kind !== 'ready') {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        {header}
        {state.kind === 'loading' ? (
          <SkeletonList count={4} variant="row" />
        ) : state.kind === 'error' ? (
          <ErrorState
            title={t(presentError(state.error).titleKey)}
            body={t('cart.error')}
            action={{ label: t('common.retry'), onPress: state.refetch }}
          />
        ) : state.kind === 'problem' ? (
          /*
            A basket from a branch this build can no longer reach. Shown as a
            dead end with one way out rather than as a list of prices nothing
            can honour — this is the state a production build lands in if a
            demo cart ever survives the flag being turned off.
          */
          <ErrorState
            title={t('cart.unknownMerchant')}
            body={t('cart.unknownMerchantBody')}
            action={{
              label: t('cart.clear'),
              onPress: () => clear.mutate(undefined, { onError: showError }),
            }}
          />
        ) : (
          <EmptyState
            icon="cart-outline"
            title={t('cart.empty')}
            body={t('cart.emptyBody')}
            action={{ label: t('cart.browse'), onPress: () => router.replace('/') }}
            testID="cart-empty"
          />
        )}
      </ScreenScroll>
    );
  }

  const { view } = state;
  const merchantName = merchantDisplayName(view.merchant.merchant, language);
  const changed = view.lines.filter((entry) => entry.priceChanged).length;

  return (
    <>
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        {header}

        {view.isDemo ? (
          <View
            style={{
              gap: theme.spacing.xs,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.warningSoft,
            }}
            testID="cart-demo-badge"
          >
            <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.xs }}>
              <Ionicons name="flask-outline" size={16} color={theme.colors.warningSoftText} />
              <Text variant="headline" style={{ color: theme.colors.warningSoftText }}>
                {t('commerce.demoBadge')}
              </Text>
            </View>
            <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
              {t('commerce.demoBody')}
            </Text>
          </View>
        ) : (
          <Text variant="footnote" color="textSecondary">
            {t('commerce.sourcingFrom', { merchant: merchantName })}
          </Text>
        )}

        {changed > 0 ? (
          <View style={{ gap: 2 }} testID="cart-price-changed">
            <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.xs }}>
              <Ionicons name="pricetag-outline" size={15} color={theme.colors.warningSoftText} />
              <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
                {t('cart.priceChanged')}
              </Text>
            </View>
            <Text variant="caption" color="textTertiary">
              {t('cart.priceChangedBody')}
            </Text>
          </View>
        ) : null}

        <View testID="cart-lines">
          {view.lines.map((entry, index) => (
            <View key={entry.line.id}>
              <CartRow
                entry={entry}
                merchantName={merchantName}
                onQuantity={(next) =>
                  setQuantity.mutate({ lineId: entry.line.id, quantity: next }, { onError: showError })
                }
                onRemove={() => removeLine.mutate(entry.line.id, { onError: showError })}
              />
              {index < view.lines.length - 1 ? <Divider /> : null}
            </View>
          ))}
        </View>

        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
          testID="cart-totals"
        >
          <TotalRow
            label={`${t('cart.subtotal')} · ${t('cart.items', { count: view.itemCount })}`}
            value={formatMoney(view.subtotal, { locale })}
          />
          {view.deliveryFee ? (
            <TotalRow
              label={t('cart.deliveryFee')}
              value={formatMoney(view.deliveryFee, { locale })}
            />
          ) : null}
          <Divider />
          <TotalRow label={t('cart.total')} value={formatMoney(view.total, { locale })} strong />

          {/*
            The branch's own floor. Shown as the gap to close rather than as
            the floor itself, because "minimum order EGP 100" makes the cook do
            the subtraction with a basket already in front of them.
          */}
          {view.shortfall ? (
            <Text
              variant="footnote"
              style={{ color: theme.colors.warningSoftText }}
              testID="cart-shortfall"
            >
              {t('cart.minimumShortfall', {
                amount: formatMoney(view.shortfall, { locale }),
              })}
            </Text>
          ) : null}
        </View>
      </ScreenScroll>

      <ScreenFooter>
        {/*
          CHECKOUT DOES NOT EXIST. A live-looking button that opens an apology
          is worse than a dead one that says the truth on its face, and this
          screen is not going to be the place somebody first learns they cannot
          actually pay.
        */}
        <Button label={t('cart.checkoutSoon')} disabled size="lg" testID="cart-checkout" />
        <Text variant="caption" color="textTertiary" style={{ textAlign: 'center' }}>
          {t('cart.checkoutSoonBody')}
        </Text>
      </ScreenFooter>
    </>
  );
}
