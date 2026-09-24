import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Divider, Section } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { areaByKey, areaDisplayName } from '@/features/commerce/delivery-areas';
import {
  locationDisplayName,
  merchantDisplayName,
  productDisplayName,
} from '@/features/commerce/display';
import {
  useAddresses,
  useCartView,
  useCheckout,
  useDeliveryAreas,
} from '@/features/commerce/hooks';
import type { OrderDraftFailure } from '@/features/commerce/order-draft';
import type { CheckoutBlocker } from '@/features/commerce/checkout-readiness';
import type {
  BlockingIssueKind,
  ValidationIssue,
} from '@/features/commerce/revalidation';
import { useI18n, type TranslationKey } from '@/i18n';
import { formatMoney } from '@/lib/format/money';
import { toWesternNumerals } from '@/lib/format/numerals';
import { useTheme } from '@/theme';
import type { DeliveryAddress, DeliveryArea } from '@/types/commerce';

/**
 * THE CHECKOUT REVIEW.
 *
 * The last screen before money would change hands — and in Commerce-4, money
 * never does. What this screen can produce is an UNPAID ORDER DRAFT: a real
 * row, priced by the server, that a payment provider could later be pointed
 * at. It is not a payment, not a reservation and not something the shop has
 * been told about, and every string here is written so none of those can be
 * misread.
 *
 * NOTHING ON THIS SCREEN DECIDES ANYTHING. Whether the order can go ahead is
 * `checkoutReadiness`; what it costs is `revalidateCart`, from the current
 * shelf rather than from the basket's snapshots; whether the branch delivers
 * is `canDeliver`. This renders their verdicts, and the database re-derives
 * all three before it will write a draft.
 */

const BLOCKER_KEYS = {
  not_authenticated: 'checkout.blocker.not_authenticated',
  pending_cart_conflict: 'checkout.blocker.pending_cart_conflict',
  empty_cart: 'checkout.blocker.empty_cart',
  no_address_selected: 'checkout.blocker.no_address_selected',
  address_incomplete: 'checkout.blocker.address_incomplete',
  outside_delivery_area: 'checkout.blocker.outside_delivery_area',
  merchant_not_accepting: 'checkout.blocker.merchant_not_accepting',
  not_validated: 'checkout.blocker.not_validated',
  validation_stale: 'checkout.blocker.validation_stale',
  blocking_issues: 'checkout.blocker.blocking_issues',
  review_not_accepted: 'checkout.blocker.review_not_accepted',
} as const satisfies Record<CheckoutBlocker, TranslationKey>;

const REFUSAL_KEYS = {
  not_authenticated: 'checkout.refused.not_authenticated',
  cart_empty: 'checkout.refused.cart_empty',
  stale_cart_revision: 'checkout.refused.stale_cart_revision',
  merchant_not_enabled: 'checkout.refused.merchant_not_enabled',
  merchant_not_accepting: 'checkout.refused.merchant_not_accepting',
  address_not_found: 'checkout.refused.address_not_found',
  address_incomplete: 'checkout.refused.address_incomplete',
  outside_delivery_area: 'checkout.refused.outside_delivery_area',
  product_delisted: 'checkout.refused.product_delisted',
  product_out_of_stock: 'checkout.refused.product_out_of_stock',
  price_changed: 'checkout.refused.price_changed',
  below_minimum: 'checkout.refused.below_minimum',
  unknown: 'checkout.refused.unknown',
} as const satisfies Record<OrderDraftFailure, TranslationKey>;

const ISSUE_KEYS = {
  merchant_not_enabled: 'validation.issue.merchant_not_enabled',
  merchant_not_accepting: 'validation.issue.merchant_not_accepting',
  outside_delivery_area: 'validation.issue.outside_delivery_area',
  no_address_selected: 'validation.issue.no_address_selected',
  address_incomplete: 'validation.issue.address_incomplete',
  product_delisted: 'validation.issue.product_delisted',
  out_of_stock: 'validation.issue.out_of_stock',
  invalid_quantity: 'validation.issue.invalid_quantity',
  pack_invalid: 'validation.issue.pack_invalid',
  no_longer_allergen_eligible: 'validation.issue.no_longer_allergen_eligible',
  no_longer_diet_eligible: 'validation.issue.no_longer_diet_eligible',
  eligibility_unknown: 'validation.issue.eligibility_unknown',
  below_minimum: 'validation.issue.below_minimum',
  empty_cart: 'validation.issue.empty_cart',
} as const satisfies Record<BlockingIssueKind, TranslationKey>;

function Banner({
  tone,
  icon,
  title,
  children,
  testID,
}: {
  tone: 'warning' | 'danger' | 'success';
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children?: React.ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const row = useRowDirection();
  const palette = {
    warning: { bg: theme.colors.warningSoft, fg: theme.colors.warningSoftText },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger },
    success: { bg: theme.colors.successSoft, fg: theme.colors.successSoftText },
  }[tone];

  return (
    <View
      style={{
        gap: theme.spacing.xs,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: palette.bg,
      }}
      testID={testID}
    >
      <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.xs }}>
        <Ionicons name={icon} size={16} color={palette.fg} />
        <Text variant="headline" style={{ color: palette.fg }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function TotalRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
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

function addressSummary(
  address: DeliveryAddress,
  areas: readonly DeliveryArea[],
  language: 'en' | 'ar',
): string {
  const area = areaByKey(areas, address.areaKey);
  return toWesternNumerals(
    [
      address.street,
      address.building,
      address.apartment,
      area ? areaDisplayName(area, language) : null,
      address.phone,
    ]
      .filter(Boolean)
      .join(' · '),
  );
}

export default function CheckoutScreen() {
  const theme = useTheme();
  const { t, locale, language } = useI18n();
  const router = useRouter();

  const addresses = useAddresses();
  const areas = useDeliveryAreas();
  const cartState = useCartView();

  /**
   * The chosen destination, held here rather than in the domain.
   *
   * "Which address" is a screen's question; everything that follows from it —
   * deliverability, the blockers, the totals — is answered by `useCheckout`
   * from the id alone.
   */
  const [addressId, setAddressId] = useState<string | null>(null);
  const chosen =
    addressId ?? (addresses.data && addresses.data.length === 1 ? addresses.data[0]!.id : null);

  const checkout = useCheckout(chosen);
  const { validation, readiness, draft, refusal, merchant } = checkout;

  if (cartState.kind === 'loading' || addresses.isLoading) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('checkout.title')} />
        <SkeletonList count={5} variant="row" />
      </ScreenScroll>
    );
  }

  if (cartState.kind !== 'ready' || !merchant) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('checkout.title')} />
        <EmptyState
          icon="cart-outline"
          title={t('cart.empty')}
          body={t('cart.emptyBody')}
          action={{ label: t('cart.browse'), onPress: () => router.replace('/') }}
          testID="checkout-empty"
        />
      </ScreenScroll>
    );
  }

  const { view } = cartState;
  const merchantName = merchantDisplayName(merchant.merchant, language);
  const currency = view.cart.currency;
  const reviewing = (validation?.issues ?? []).filter((issue) => issue.severity === 'review');
  const blocking = (validation?.issues ?? []).filter((issue) => issue.severity === 'blocking');

  /**
   * A blocking issue, in words.
   *
   * The map is `satisfies Record<BlockingIssueKind, TranslationKey>`, so a new
   * blocking kind fails to compile until somebody writes the sentence for it.
   * A reason the customer cannot read is a dead end they cannot act on.
   */
  const issueText = (issue: ValidationIssue & { severity: 'blocking' }): string =>
    t(ISSUE_KEYS[issue.kind], { name: issue.productName ?? '' });

  return (
    <>
      <ScreenScroll bottomInset={theme.spacing.huge * 2} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('checkout.title')} />

        {/*
          A DEMO CATALOGUE IS SAID BEFORE ANYTHING ELSE. This is the screen
          where a fixture would be easiest to mistake for a shop.
        */}
        {view.isDemo ? (
          <Banner tone="warning" icon="flask-outline" title={t('commerce.demoBadge')} testID="checkout-demo-badge">
            <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
              {t('commerce.demoBody')}
            </Text>
          </Banner>
        ) : null}

        {/* --- Deliver to ------------------------------------------------- */}
        <Section
          title={t('checkout.deliverTo')}
          action={{ label: t('checkout.addAddress'), onPress: () => router.push('/addresses/form') }}
        >
          {(addresses.data ?? []).length === 0 ? (
            <Text variant="footnote" color="textSecondary" testID="checkout-no-address">
              {t('address.noneBody')}
            </Text>
          ) : (
            <ListGroup>
              {(addresses.data ?? []).map((address) => (
                <ListRow
                  key={address.id}
                  icon={chosen === address.id ? 'radio-button-on' : 'radio-button-off'}
                  iconTone={chosen === address.id ? 'primary' : 'neutral'}
                  title={toWesternNumerals(address.label ?? address.recipientName)}
                  subtitle={addressSummary(address, areas.data ?? [], language)}
                  onPress={() => setAddressId(address.id)}
                  testID={`checkout-address-${address.id}`}
                />
              ))}
            </ListGroup>
          )}
        </Section>

        {/* --- The order ---------------------------------------------------- */}
        <Section title={t('checkout.order')}>
          <View testID="checkout-lines">
            {view.lines.map((entry, index) => (
              <View key={entry.line.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    gap: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                  }}
                >
                  <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>
                    {entry.product
                      ? productDisplayName(entry.product, language)
                      : t('cart.unknownProduct')}
                  </Text>
                  <Text variant="footnote" color="textSecondary">
                    {toWesternNumerals(`× ${entry.line.quantity}`)}
                  </Text>
                  <Text variant="body">
                    {formatMoney(
                      {
                        amountMinor:
                          (entry.currentUnitPrice ?? entry.line.unitPriceSnapshot).amountMinor *
                          entry.line.quantity,
                        currency,
                      },
                      { locale },
                    )}
                  </Text>
                </View>
                {index < view.lines.length - 1 ? <Divider /> : null}
              </View>
            ))}
          </View>
        </Section>

        {/* --- The shop ----------------------------------------------------- */}
        <Section title={t('checkout.merchant')}>
          <Text variant="body">{merchantName}</Text>
          <Text variant="footnote" color="textSecondary">
            {locationDisplayName(merchant.location, language)}
          </Text>
        </Section>

        {/* --- Prices that moved -------------------------------------------- */}
        {reviewing.length > 0 ? (
          <Banner
            tone="warning"
            icon="pricetag-outline"
            title={t('validation.reviewTitle')}
            testID="checkout-review"
          >
            <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
              {t('validation.reviewBody')}
            </Text>
            {reviewing.map((issue, index) =>
              issue.severity === 'review' ? (
                <Text
                  key={`${issue.kind}-${issue.lineId ?? index}`}
                  variant="caption"
                  style={{ color: theme.colors.warningSoftText }}
                >
                  {issue.kind === 'delivery_fee_changed'
                    ? t('validation.deliveryFeeChanged', {
                        was: formatMoney(issue.was, { locale }),
                        now: formatMoney(issue.now, { locale }),
                      })
                    : t('validation.priceChangedLine', {
                        name: issue.productName ?? '',
                        was: formatMoney(issue.was, { locale }),
                        now: formatMoney(issue.now, { locale }),
                      })}
                </Text>
              ) : null,
            )}
            <Button
              label={t('validation.accept')}
              variant="secondary"
              size="sm"
              loading={checkout.acceptChanges.isPending}
              onPress={() => checkout.acceptChanges.mutate()}
              testID="checkout-accept"
            />
          </Banner>
        ) : null}

        {/* --- Why it cannot go ahead --------------------------------------- */}
        {blocking.length > 0 ? (
          <Banner
            tone="danger"
            icon="alert-circle-outline"
            title={t('checkout.blocked')}
            testID="checkout-blocked"
          >
            {blocking.map((issue, index) => (
              <Text
                key={`${issue.kind}-${issue.lineId ?? index}`}
                variant="footnote"
                style={{ color: theme.colors.danger }}
              >
                {issueText(issue)}
              </Text>
            ))}
          </Banner>
        ) : null}

        {/* --- Summary ------------------------------------------------------ */}
        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
          testID="checkout-summary"
        >
          <TotalRow
            label={t('checkout.merchandise')}
            value={formatMoney(
              validation?.itemsSubtotal ?? view.subtotal,
              { locale },
            )}
          />
          {(validation?.deliveryFee ?? view.deliveryFee) ? (
            <TotalRow
              label={t('checkout.delivery')}
              value={formatMoney((validation?.deliveryFee ?? view.deliveryFee)!, { locale })}
            />
          ) : null}
          <Divider />
          <TotalRow
            label={t('checkout.total')}
            value={formatMoney(validation?.total ?? view.total, { locale })}
            strong
          />
          {validation?.shortfall ? (
            <Text
              variant="footnote"
              style={{ color: theme.colors.warningSoftText }}
              testID="checkout-shortfall"
            >
              {t('cart.minimumShortfall', {
                amount: formatMoney(validation.shortfall, { locale }),
              })}
            </Text>
          ) : null}
        </View>

        {/* --- What is still in the way ------------------------------------- */}
        {!readiness.canProceedToDraft && !checkout.isValidating ? (
          <View style={{ gap: 2 }} testID="checkout-blockers">
            {readiness.blockers.map((blocker) => (
              <Text key={blocker} variant="footnote" color="textSecondary">
                {t(BLOCKER_KEYS[blocker])}
              </Text>
            ))}
          </View>
        ) : null}

        {/* --- The server said no ------------------------------------------- */}
        {refusal ? (
          <Banner
            tone="danger"
            icon="close-circle-outline"
            title={t('checkout.refused')}
            testID="checkout-refused"
          >
            <Text variant="footnote" style={{ color: theme.colors.danger }}>
              {t(REFUSAL_KEYS[refusal])}
            </Text>
          </Banner>
        ) : null}

        {/*
          THE DRAFT.

          "Checkout ready", never "Order placed". Nothing has been charged, no
          provider was called, and the shop has not been told — the body says
          all three, because a reference number looks exactly like a receipt if
          nobody says otherwise.
        */}
        {draft ? (
          <Banner
            tone="success"
            icon="document-text-outline"
            title={t('checkout.draftReady')}
            testID="checkout-draft"
          >
            <Text variant="footnote" style={{ color: theme.colors.successSoftText }}>
              {t('checkout.draftReadyBody')}
            </Text>
            <Text
              variant="headline"
              style={{ color: theme.colors.successSoftText }}
              testID="checkout-draft-reference"
            >
              {t('checkout.reference', { reference: toWesternNumerals(draft.reference) })}
            </Text>
          </Banner>
        ) : null}
      </ScreenScroll>

      <ScreenFooter>
        {draft ? (
          <>
            {/*
              PAYMENT IS NOT BUILT. A live-looking button that opens an apology
              is worse than a dead one that says so on its face.
            */}
            <Button label={t('checkout.continueToPayment')} disabled size="lg" testID="checkout-pay" />
            <Text variant="caption" color="textTertiary" style={{ textAlign: 'center' }}>
              {t('checkout.continueToPaymentBody')}
            </Text>
          </>
        ) : (
          <Button
            label={checkout.isValidating ? t('checkout.validating') : t('checkout.prepareDraft')}
            size="lg"
            disabled={!readiness.canProceedToDraft || checkout.isValidating}
            loading={checkout.prepareDraft.isPending}
            onPress={() => checkout.prepareDraft.mutate()}
            testID="checkout-prepare"
          />
        )}
      </ScreenFooter>
    </>
  );
}
