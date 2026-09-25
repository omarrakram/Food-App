import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Divider, Section } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useOrderTracking, useSubstitutionDecision } from '@/features/commerce/hooks';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/lib/format/money';
import { toWesternNumerals } from '@/lib/format/numerals';
import { useTheme } from '@/theme';

import { CUSTOMER_STATUS_KEYS } from './status';

/**
 * WHAT HAPPENED TO MY ORDER.
 *
 * Built out of the rows the database wrote, not out of a progress animation. A
 * customer told their order is being picked while it sits in a queue remembers
 * that, and a delivered order with a refund still owed must say both things.
 *
 * THE MONEY IS FOUR SEPARATE SENTENCES, deliberately:
 *
 *   Paid 500 · Value of what arrived 460 · Refund owed 40 · Refunded 0
 *
 * Not "your order is 460". The customer paid 500 and we owe them 40, and
 * rewriting the first number to hide the third is how a refund quietly never
 * happens.
 */
export default function OrderTrackingScreen() {
  const theme = useTheme();
  const { t, locale, language } = useI18n();
  const router = useRouter();
  const row = useRowDirection();

  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const tracking = useOrderTracking(orderId ?? null);
  const decide = useSubstitutionDecision(orderId ?? null);

  if (tracking.isLoading) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('orders.title')} />
        <SkeletonList count={5} variant="row" />
      </ScreenScroll>
    );
  }

  if (!tracking.data) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('orders.title')} />
        <EmptyState
          icon="receipt-outline"
          title={t('payment.refused.order_not_found')}
          body={t('orders.emptyBody')}
          action={{ label: t('orders.title'), onPress: () => router.replace('/orders') }}
          testID="order-missing"
        />
      </ScreenScroll>
    );
  }

  const { order, items, substitutions, events, captured, fulfilledGoods, refunded, refundRequired, riderName } =
    tracking.data;
  const waiting = substitutions.filter((sub) => sub.decision === 'pending_customer');

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={toWesternNumerals(order.reference)} />

      {/* --- Where it is --------------------------------------------------- */}
      <View
        style={{
          gap: theme.spacing.xs,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surfaceAlt,
        }}
        testID="order-status"
      >
        <Text variant="title3">
          {/*
            WAITING ON THE CUSTOMER OUTRANKS THE FULFILMENT STATE. "Being
            picked" is true and useless when the thing actually blocking the
            order is a question nobody has answered.
          */}
          {waiting.length > 0
            ? t('orders.status.awaitingYou')
            : t(CUSTOMER_STATUS_KEYS[order.fulfilment])}
        </Text>
        {riderName ? (
          <Text variant="footnote" color="textSecondary">
            {t('orders.rider', { name: toWesternNumerals(riderName) })}
          </Text>
        ) : null}
      </View>

      {/* --- A question for the customer ------------------------------------ */}
      {waiting.map((sub) => {
        const cheaper =
          sub.replacementUnitPrice !== null &&
          sub.replacementUnitPrice.amountMinor < sub.originalUnitPrice.amountMinor;
        const difference = {
          amountMinor:
            (sub.originalUnitPrice.amountMinor - (sub.replacementUnitPrice?.amountMinor ?? 0)) *
            sub.quantity,
          currency: sub.originalUnitPrice.currency,
        };

        return (
          <View
            key={sub.id}
            style={{
              gap: theme.spacing.sm,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.warningSoft,
            }}
            testID={`order-decision-${sub.id}`}
          >
            <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.xs }}>
              <Ionicons name="help-circle-outline" size={16} color={theme.colors.warningSoftText} />
              <Text variant="headline" style={{ color: theme.colors.warningSoftText }}>
                {t('orders.decision.title')}
              </Text>
            </View>
            <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
              {t('orders.decision.original', {
                product: toWesternNumerals(sub.originalProductName),
              })}
            </Text>
            {sub.replacementProductName ? (
              <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
                {t('orders.decision.suggested', {
                  product: toWesternNumerals(sub.replacementProductName),
                })}
              </Text>
            ) : null}
            {/*
              NEVER A HIGHER PRICE. `report_item_unavailable` refuses a dearer
              replacement outright, so the only two things this can say are
              "same" and "cheaper, and we will refund the difference".
            */}
            <Text variant="caption" style={{ color: theme.colors.warningSoftText }}>
              {cheaper
                ? t('orders.decision.cheaper', { amount: formatMoney(difference, { locale }) })
                : t('orders.decision.samePrice')}
            </Text>

            <View style={{ flexDirection: row, gap: theme.spacing.sm }}>
              <Button
                label={t('orders.decision.accept')}
                size="sm"
                loading={decide.isPending}
                onPress={() => decide.mutate({ substitutionId: sub.id, accept: true })}
                testID={`order-accept-${sub.id}`}
              />
              <Button
                label={t('orders.decision.remove')}
                variant="secondary"
                size="sm"
                onPress={() => decide.mutate({ substitutionId: sub.id, accept: false })}
                testID={`order-remove-${sub.id}`}
              />
            </View>
            <Text variant="caption" style={{ color: theme.colors.warningSoftText }}>
              {t('orders.decision.expires')}
            </Text>
          </View>
        );
      })}

      {/* --- What was ordered ------------------------------------------------ */}
      <Section title={t('checkout.order')}>
        <View testID="order-items">
          {items.map((item, index) => {
            // BY LINE ID, not by product name: an order can contain two lines
            // of the same product, and pairing by name would attach one line's
            // substitution to the other.
            const sub = substitutions.find(
              (entry) => entry.orderItemId === item.id && entry.decision !== 'pending_customer',
            );
            return (
              <View key={item.id}>
                <View style={{ paddingVertical: theme.spacing.sm, gap: 2 }}>
                  <View style={{ flexDirection: row, gap: theme.spacing.md }}>
                    <Text variant="body" style={{ flex: 1 }}>
                      {toWesternNumerals(language === 'ar' ? (item.nameAr ?? item.name) : item.name)}
                    </Text>
                    <Text variant="footnote" color="textSecondary">
                      {toWesternNumerals(`× ${item.quantity}`)}
                    </Text>
                    <Text variant="body">{formatMoney(item.lineTotal, { locale })}</Text>
                  </View>
                  {sub ? (
                    <Text variant="caption" color="textTertiary">
                      {sub.replacementProductName
                        ? t('orders.decision.replaced', {
                            product: toWesternNumerals(sub.replacementProductName),
                          })
                        : t('orders.decision.removed')}
                    </Text>
                  ) : null}
                </View>
                {index < items.length - 1 ? <Divider /> : null}
              </View>
            );
          })}
        </View>
      </Section>

      {/* --- The money, as four separate facts -------------------------------- */}
      <View
        style={{
          gap: theme.spacing.xs,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
        testID="order-money"
      >
        <Text variant="footnote" color="textSecondary">
          {t('orders.paid', { amount: formatMoney(captured, { locale }) })}
        </Text>
        <Text variant="footnote" color="textSecondary">
          {t('orders.fulfilled', { amount: formatMoney(fulfilledGoods, { locale }) })}
        </Text>
        {refundRequired.amountMinor > 0 ? (
          <>
            <Text
              variant="headline"
              style={{ color: theme.colors.warningSoftText }}
              testID="order-refund-pending"
            >
              {t('orders.refundPending', { amount: formatMoney(refundRequired, { locale }) })}
            </Text>
            {/* CALCULATED IS NOT PAID, and the customer is told so plainly. */}
            <Text variant="caption" style={{ color: theme.colors.warningSoftText }}>
              {t('orders.refundPendingBody')}
            </Text>
          </>
        ) : null}
        {refunded.amountMinor > 0 ? (
          <Text variant="footnote" style={{ color: theme.colors.successSoftText }}>
            {t('orders.refunded', { amount: formatMoney(refunded, { locale }) })}
          </Text>
        ) : null}
      </View>

      {/* --- What actually happened -------------------------------------------- */}
      <Section title={t('merchant.history')}>
        <View style={{ gap: 2 }} testID="order-history">
          {events.map((event) => (
            <Text key={event.id} variant="caption" color="textTertiary">
              {toWesternNumerals([event.to ?? event.kind, event.note].filter(Boolean).join(' · '))}
            </Text>
          ))}
        </View>
      </Section>
    </ScreenScroll>
  );
}
