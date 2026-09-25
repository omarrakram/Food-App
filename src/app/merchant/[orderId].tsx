import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { Input } from '@/components/ui/input';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Divider, Section } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { useMerchantActions, useMerchantOrder, useReplacementOptions } from '@/features/merchant/hooks';
import { merchantActions } from '@/features/merchant/queue';
import { useI18n, type TranslationKey } from '@/i18n';
import { formatMoney } from '@/lib/format/money';
import { toWesternNumerals } from '@/lib/format/numerals';
import { useTheme } from '@/theme';
import type { OrderFulfilmentState } from '@/types/commerce';

/**
 * ONE ORDER, as the shop works it.
 *
 * WHAT TO PICK, WHERE IT GOES, WHAT IT COST, AND WHAT HAPPENED. No status
 * dropdown: the buttons are whatever `merchantActions` says the state machine
 * allows, and pressing one calls `advance_fulfilment`, which checks the same
 * rules again and is the only thing that can actually move the order.
 *
 * THE MONEY IS SHOWN WITHOUT BEING TOUCHABLE. A shop needs to know what the
 * customer paid and what is owed back to price their own reconciliation. They
 * cannot change any of it, and the refund line says in words that calculating
 * one is not paying it.
 */

const ACTION_LABELS: Partial<Record<OrderFulfilmentState, TranslationKey>> = {
  accepted: 'merchant.action.accepted',
  rejected: 'merchant.action.rejected',
  picking: 'merchant.action.picking',
  ready: 'merchant.action.ready',
  dispatched: 'merchant.action.dispatched',
  delivered: 'merchant.action.delivered',
  undeliverable: 'merchant.action.undeliverable',
};

const RULE_LABELS = {
  contact_me: 'merchant.rule.contact_me',
  best_match: 'merchant.rule.best_match',
  remove: 'merchant.rule.remove',
} as const;

const BLOCKED_KEYS: Record<string, TranslationKey> = {
  substitutions_unresolved: 'merchant.blocked.substitutions_unresolved',
  illegal_transition: 'merchant.blocked.illegal_transition',
  order_not_paid: 'merchant.blocked.order_not_paid',
};

function blockedKey(error: unknown): TranslationKey {
  const message = error instanceof Error ? error.message : String(error ?? '');
  for (const [code, key] of Object.entries(BLOCKED_KEYS)) {
    if (message.includes(code)) return key;
  }
  return 'merchant.blocked.unknown';
}

export default function MerchantOrderScreen() {
  const theme = useTheme();
  const { t, locale, language } = useI18n();
  const router = useRouter();
  const row = useRowDirection();

  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const detail = useMerchantOrder(orderId ?? null);
  const { advance, reportUnavailable } = useMerchantActions(orderId ?? null);

  /** The action that needs a sentence before it can be sent. */
  const [pendingAction, setPendingAction] = useState<OrderFulfilmentState | null>(null);
  const [reason, setReason] = useState('');
  const [rider, setRider] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  /** The line the picker is replacing, if any. */
  const [replacing, setReplacing] = useState<string | null>(null);

  const replacements = useReplacementOptions(replacing);

  if (detail.isLoading) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('merchant.title')} />
        <SkeletonList count={5} variant="row" />
      </ScreenScroll>
    );
  }

  if (!detail.data) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('merchant.title')} />
        <EmptyState
          icon="receipt-outline"
          title={t('payment.refused.order_not_found')}
          body={t('merchant.emptyBody')}
          action={{ label: t('merchant.title'), onPress: () => router.replace('/merchant') }}
          testID="merchant-order-missing"
        />
      </ScreenScroll>
    );
  }

  const { order, items, substitutions, events, refund } = detail.data;
  const openSubstitutions = substitutions.filter((sub) => sub.decision === 'pending_customer');
  const actions = merchantActions(order.fulfilment, {
    hasUnresolvedSubstitutions: openSubstitutions.length > 0,
  });

  const substitutionFor = (itemId: string) =>
    substitutions.find((sub) => sub.orderItemId === itemId) ?? null;

  const send = (to: OrderFulfilmentState) => {
    advance.mutate(
      {
        to,
        reason: reason.trim() || null,
        riderName: rider.trim() || null,
        riderPhone: riderPhone.trim() || null,
      },
      {
        onSuccess: () => {
          setPendingAction(null);
          setReason('');
        },
      },
    );
  };

  return (
    <>
      <ScreenScroll bottomInset={theme.spacing.huge * 2} contentGap={theme.spacing.lg}>
        <ScreenHeader
          title={t('merchant.orderTitle', { reference: toWesternNumerals(order.reference) })}
        />

        {/* --- Where it goes ------------------------------------------------ */}
        <Section title={t('merchant.deliverTo')}>
          <Text variant="body">{toWesternNumerals(order.deliverTo.recipientName)}</Text>
          <Text variant="footnote" color="textSecondary" testID="merchant-address">
            {toWesternNumerals(
              [
                order.deliverTo.street,
                order.deliverTo.building,
                order.deliverTo.floor,
                order.deliverTo.apartment,
                order.deliverTo.landmark,
              ]
                .filter(Boolean)
                .join(' · '),
            )}
          </Text>
          <Text variant="footnote" color="textSecondary">
            {toWesternNumerals(order.deliverTo.phone)}
          </Text>
          {order.deliverTo.notes ? (
            <Text variant="caption" color="textTertiary">
              {toWesternNumerals(order.deliverTo.notes)}
            </Text>
          ) : null}
          {order.customerNote ? (
            <Text variant="caption" color="textTertiary" testID="merchant-customer-note">
              {toWesternNumerals(order.customerNote)}
            </Text>
          ) : null}
        </Section>

        {/* --- What to pick ------------------------------------------------- */}
        <Section
          title={t('merchant.items')}
          subtitle={t('merchant.substitutionPreference', {
            rule: t(RULE_LABELS[order.substitutionPreference]),
          })}
        >
          <View testID="merchant-items">
            {items.map((item, index) => {
              const sub = substitutionFor(item.id);
              return (
                <View key={item.id}>
                  <View style={{ paddingVertical: theme.spacing.sm, gap: 2 }}>
                    <View style={{ flexDirection: row, gap: theme.spacing.md }}>
                      <Text variant="body" style={{ flex: 1 }}>
                        {toWesternNumerals(
                          language === 'ar' ? (item.productNameAr ?? item.productName) : item.productName,
                        )}
                      </Text>
                      <Text variant="body">{toWesternNumerals(`× ${item.quantity}`)}</Text>
                      <Text variant="body">{formatMoney(item.lineTotal, { locale })}</Text>
                    </View>

                    {/*
                      THE ORIGINAL LINE STAYS. A substitution is shown beside
                      what was ordered, never in place of it — the customer
                      bought the thing above, and hiding it would hide what
                      changed.
                    */}
                    {sub ? (
                      <Text
                        variant="caption"
                        style={{
                          color:
                            sub.decision === 'pending_customer'
                              ? theme.colors.warningSoftText
                              : theme.colors.textTertiary,
                        }}
                        testID={`merchant-substitution-${item.id}`}
                      >
                        {sub.decision === 'pending_customer'
                          ? t('merchant.waitingOnCustomer')
                          : sub.replacementProductName
                            ? t('orders.decision.replaced', {
                                product: toWesternNumerals(sub.replacementProductName),
                              })
                            : t('orders.decision.removed')}
                      </Text>
                    ) : (
                      <Button
                        label={t('merchant.unavailable')}
                        variant="ghost"
                        size="sm"
                        onPress={() => setReplacing(item.id)}
                        testID={`merchant-unavailable-${item.id}`}
                      />
                    )}
                  </View>
                  {index < items.length - 1 ? <Divider /> : null}
                </View>
              );
            })}
          </View>
        </Section>

        {/* --- Choosing a replacement ---------------------------------------- */}
        {replacing ? (
          <Section
            title={t('merchant.unavailableTitle', {
              product: toWesternNumerals(
                items.find((item) => item.id === replacing)?.productName ?? '',
              ),
            })}
            subtitle={t('merchant.unavailableBody')}
          >
            <ListGroup>
              {(replacements.data ?? [])
                .filter((option) => option.offerable)
                .slice(0, 8)
                .map((option) => (
                  <ListRow
                    key={option.id}
                    icon="swap-horizontal-outline"
                    title={toWesternNumerals(option.name)}
                    value={formatMoney(option.price, { locale })}
                    onPress={() =>
                      reportUnavailable.mutate(
                        { orderItemId: replacing, replacementProductId: option.id },
                        { onSuccess: () => setReplacing(null) },
                      )
                    }
                    testID={`merchant-replacement-${option.id}`}
                  />
                ))}
            </ListGroup>
            <Button
              label={t('merchant.removeInstead')}
              variant="secondary"
              onPress={() =>
                reportUnavailable.mutate(
                  { orderItemId: replacing },
                  { onSuccess: () => setReplacing(null) },
                )
              }
              testID="merchant-remove-item"
            />
          </Section>
        ) : null}

        {/* --- The money ------------------------------------------------------ */}
        <Section title={t('merchant.money')}>
          <View
            style={{
              gap: theme.spacing.xs,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            testID="merchant-money"
          >
            <Text variant="footnote" color="textSecondary">
              {`${t('merchant.captured')}: ${formatMoney(refund.captured, { locale })}`}
            </Text>
            <Text variant="footnote" color="textSecondary">
              {`${t('merchant.fulfilled')}: ${formatMoney(refund.fulfilledGoods, { locale })}`}
            </Text>
            {refund.refundRequired.amountMinor > 0 ? (
              <>
                <Text
                  variant="headline"
                  style={{ color: theme.colors.warningSoftText }}
                  testID="merchant-refund-required"
                >
                  {`${t('merchant.refundRequired')}: ${formatMoney(refund.refundRequired, { locale })}`}
                </Text>
                {/* CALCULATED IS NOT PAID, and the shop should not think it is. */}
                <Text variant="caption" style={{ color: theme.colors.warningSoftText }}>
                  {t('merchant.refundNotExecuted')}
                </Text>
              </>
            ) : null}
          </View>
        </Section>

        {/* --- What happened --------------------------------------------------- */}
        <Section title={t('merchant.history')}>
          <View style={{ gap: 2 }} testID="merchant-history">
            {events.map((event) => (
              <Text key={event.id} variant="caption" color="textTertiary">
                {toWesternNumerals(
                  [event.to ?? event.kind, event.actor, event.note].filter(Boolean).join(' · '),
                )}
              </Text>
            ))}
          </View>
        </Section>

        {/* --- A reason, where one is owed -------------------------------------- */}
        {pendingAction ? (
          <Section title={t('merchant.reason')}>
            <Input
              value={reason}
              onChangeText={setReason}
              multiline
              testID="merchant-reason"
            />
            <Button
              label={t('merchant.confirm')}
              disabled={reason.trim().length === 0}
              loading={advance.isPending}
              onPress={() => send(pendingAction)}
              testID="merchant-confirm-reason"
            />
          </Section>
        ) : null}

        {/* --- The rider, when it goes out --------------------------------------- */}
        {order.fulfilment === 'ready' ? (
          <Section title={t('merchant.rider')}>
            <Input value={rider} onChangeText={setRider} testID="merchant-rider" />
            <Input
              value={riderPhone}
              onChangeText={setRiderPhone}
              keyboardType="phone-pad"
              testID="merchant-rider-phone"
            />
          </Section>
        ) : null}

        {advance.isError ? (
          <Text variant="footnote" color="danger" testID="merchant-blocked">
            {t(blockedKey(advance.error))}
          </Text>
        ) : null}
        {openSubstitutions.length > 0 ? (
          <Text
            variant="footnote"
            style={{ color: theme.colors.warningSoftText }}
            testID="merchant-waiting"
          >
            {t('merchant.waitingOnCustomer')}
          </Text>
        ) : null}
      </ScreenScroll>

      <ScreenFooter>
        {/*
          NO STATUS DROPDOWN. These are the moves the state machine allows for
          a merchant, from this state, right now — and the database checks the
          same thing again when one is pressed.
        */}
        {actions.map((action) => (
          <Button
            key={action.to}
            label={t(ACTION_LABELS[action.to] ?? 'merchant.confirm')}
            variant={action.isPrimary ? 'primary' : 'ghost'}
            size={action.isPrimary ? 'lg' : 'md'}
            loading={advance.isPending && !action.needsReason}
            onPress={() => (action.needsReason ? setPendingAction(action.to) : send(action.to))}
            testID={`merchant-action-${action.to}`}
          />
        ))}
      </ScreenFooter>
    </>
  );
}
