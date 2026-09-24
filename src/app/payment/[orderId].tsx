import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenFooter, ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { Divider, Section } from '@/components/ui/section';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { isWithMerchant } from '@/features/commerce/payment-intent';
import { usePaymentActions, usePaymentStatus } from '@/features/commerce/hooks';
import { useI18n, type TranslationKey } from '@/i18n';
import { formatMoney } from '@/lib/format/money';
import { toWesternNumerals } from '@/lib/format/numerals';
import { newId } from '@/lib/storage/local-collection';
import { useTheme } from '@/theme';

/**
 * PAYING FOR ONE ORDER.
 *
 * Four states and no fifth, decided by `paymentStatus` from the server's own
 * answer — never from what happened in the browser:
 *
 *   awaiting payment · confirming · paid · expired
 *
 * THE LANGUAGE RULE. Nothing on this screen says the order was placed,
 * received or sent to the shop until the SERVER says the payment was captured
 * AND the order has actually reached the merchant queue. Those are two
 * separate facts and the copy distinguishes them, because "the shop has your
 * order" is the sentence a customer will quote back to us.
 *
 * "Confirming" is a real answer and is never rendered as failure. An attempt
 * the provider is still holding might succeed, and a "try again" button beside
 * "payment failed" is how one basket gets paid for twice.
 */

const FAILURE_KEYS: Record<string, TranslationKey> = {
  insufficient_funds: 'payment.failure.insufficient_funds',
  declined: 'payment.failure.declined',
  cancelled_by_customer: 'payment.failure.cancelled_by_customer',
  simulated_decline: 'payment.failure.simulated_decline',
};

const METHODS = [
  { id: 'card', label: 'payment.method.card', hint: 'payment.method.cardHint', icon: 'card-outline' },
  {
    id: 'wallet',
    label: 'payment.method.wallet',
    hint: 'payment.method.walletHint',
    icon: 'phone-portrait-outline',
  },
] as const;

type Method = (typeof METHODS)[number]['id'];

/** Opens the provider's page. On web this is a navigation; on native, a browser. */
function openCheckout(url: string): void {
  if (Platform.OS === 'web' && typeof globalThis.location !== 'undefined') {
    globalThis.location.assign(url);
    return;
  }
  void Linking.openURL(url);
}

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

export default function PaymentScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();

  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { order, status, isLoading, refetch } = usePaymentStatus(orderId ?? null);
  const { begin, cancel, refusal, clearPaidBasket } = usePaymentActions(orderId ?? null);

  const [method, setMethod] = useState<Method>('card');
  /**
   * One key per attempt the customer STARTS.
   *
   * Regenerated when they choose to pay again, so a retry is a new attempt —
   * and stable across a re-render, so a double tap on the same button finds
   * the attempt it already made instead of racing itself.
   */
  const [attemptKey, setAttemptKey] = useState(() => newId());

  /*
    THE BASKET GOES ONLY AFTER THE MONEY ARRIVED, and only if it is still the
    basket that was paid for. `clear_paid_cart` compares the cart's revision
    with the order's, so a basket the customer rebuilt while paying survives.

    A REF, NOT STATE, and in an effect rather than during render. Clearing is a
    side effect on the server; doing it in the render body made the component
    re-render from its own side effect, and the ref keeps the "already asked"
    flag out of the render cycle entirely.

    Declared above the early returns below, because hook order cannot depend on
    whether the order has loaded.
  */
  const askedToClear = useRef<string | null>(null);
  const isPaid = status?.view === 'paid';
  const clearBasket = clearPaidBasket.mutate;

  useEffect(() => {
    if (!isPaid || !orderId) return;
    if (askedToClear.current === orderId) return;
    askedToClear.current = orderId;
    clearBasket();
  }, [isPaid, orderId, clearBasket]);

  if (isLoading) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('payment.title')} />
        <SkeletonList count={3} variant="row" />
      </ScreenScroll>
    );
  }

  if (!order || !status || !orderId) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('payment.title')} />
        <EmptyState
          icon="receipt-outline"
          title={t('payment.refused.order_not_found')}
          body={t('cart.emptyBody')}
          action={{ label: t('cart.browse'), onPress: () => router.replace('/') }}
          testID="payment-missing"
        />
      </ScreenScroll>
    );
  }

  const pay = () => {
    begin.mutate(
      { orderId, method, idempotencyKey: attemptKey },
      { onSuccess: (result) => openCheckout(result.checkoutUrl) },
    );
  };

  const retry = () => {
    // A NEW attempt, so a new key. Reusing the old one would return the failed
    // attempt rather than starting a fresh one.
    const key = newId();
    setAttemptKey(key);
    begin.mutate(
      { orderId, method, idempotencyKey: key },
      { onSuccess: (result) => openCheckout(result.checkoutUrl) },
    );
  };

  const summary = (
    <View
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
      testID="payment-summary"
    >
      <Text variant="footnote" color="textSecondary">
        {t('payment.reference', { reference: toWesternNumerals(order.reference) })}
      </Text>
      <Divider />
      <Text variant="title3">{formatMoney(order.total, { locale })}</Text>
    </View>
  );

  return (
    <>
      <ScreenScroll bottomInset={theme.spacing.huge * 2} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('payment.title')} />

        {summary}

        {/* --- Waiting on the provider ------------------------------------- */}
        {status.view === 'confirming' ? (
          <Banner
            tone="warning"
            icon="time-outline"
            title={t('payment.confirming')}
            testID="payment-confirming"
          >
            <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
              {t('payment.confirmingBody')}
            </Text>
            {status.canResume ? (
              <Text variant="caption" style={{ color: theme.colors.warningSoftText }}>
                {t('payment.confirmingResume')}
              </Text>
            ) : null}
          </Banner>
        ) : null}

        {/* --- Paid ---------------------------------------------------------- */}
        {status.view === 'paid' ? (
          <Banner
            tone="success"
            icon="checkmark-circle-outline"
            title={t('payment.confirmed')}
            testID="payment-confirmed"
          >
            <Text variant="footnote" style={{ color: theme.colors.successSoftText }}>
              {/*
                TWO SEPARATE FACTS. The money has arrived; whether the shop has
                the order yet is `fulfilment_state`, and saying so early is the
                sentence a customer would quote back to us.
              */}
              {isWithMerchant(order.fulfilment)
                ? t('payment.confirmedBody')
                : t('payment.confirmedWaiting')}
            </Text>
            <Text variant="headline" style={{ color: theme.colors.successSoftText }}>
              {t('payment.paidTotal', { amount: formatMoney(order.total, { locale }) })}
            </Text>
          </Banner>
        ) : null}

        {/* --- Expired ------------------------------------------------------- */}
        {status.view === 'expired' ? (
          <Banner
            tone="danger"
            icon="hourglass-outline"
            title={t('payment.expiredTitle')}
            testID="payment-expired"
          >
            <Text variant="footnote" style={{ color: theme.colors.danger }}>
              {t('payment.expiredBody')}
            </Text>
          </Banner>
        ) : null}

        {/* --- The last attempt failed --------------------------------------- */}
        {status.view === 'awaiting_payment' && status.lastFailureCode ? (
          <Banner
            tone="danger"
            icon="close-circle-outline"
            title={t('payment.failedTitle')}
            testID="payment-failed"
          >
            <Text variant="footnote" style={{ color: theme.colors.danger }}>
              {FAILURE_KEYS[status.lastFailureCode]
                ? t(FAILURE_KEYS[status.lastFailureCode]!)
                : t('payment.failedBody')}
            </Text>
            <Text variant="caption" style={{ color: theme.colors.danger }}>
              {t('payment.failedBody')}
            </Text>
          </Banner>
        ) : null}

        {/* --- Could not even start ------------------------------------------ */}
        {refusal ? (
          <Banner
            tone="danger"
            icon="alert-circle-outline"
            title={t('payment.failedTitle')}
            testID="payment-refused"
          >
            <Text variant="footnote" style={{ color: theme.colors.danger }}>
              {t(`payment.refused.${refusal}` as TranslationKey)}
            </Text>
          </Banner>
        ) : null}

        {/* --- Choosing how to pay -------------------------------------------- */}
        {status.canPay ? (
          <Section title={t('payment.method')}>
            <ListGroup>
              {METHODS.map((entry) => (
                <ListRow
                  key={entry.id}
                  icon={method === entry.id ? 'radio-button-on' : entry.icon}
                  iconTone={method === entry.id ? 'primary' : 'neutral'}
                  title={t(entry.label)}
                  subtitle={t(entry.hint)}
                  selected={method === entry.id}
                  onPress={() => setMethod(entry.id)}
                  testID={`payment-method-${entry.id}`}
                />
              ))}
            </ListGroup>
            <Text variant="caption" color="textTertiary">
              {t('payment.continueBody')}
            </Text>
          </Section>
        ) : null}

        {/* --- Letting go of a stuck attempt ---------------------------------- */}
        {status.view === 'confirming' && status.canResume && status.attempt ? (
          <View style={{ gap: theme.spacing.xs }}>
            <Button
              label={t('payment.cancelAttempt')}
              variant="ghost"
              loading={cancel.isPending}
              onPress={() => cancel.mutate(status.attempt!.id)}
              testID="payment-cancel-attempt"
            />
            <Text variant="caption" color="textTertiary" style={{ textAlign: 'center' }}>
              {t('payment.cancelAttemptBody')}
            </Text>
          </View>
        ) : null}
      </ScreenScroll>

      <ScreenFooter>
        {status.view === 'paid' ? (
          <Button
            label={t('cart.browse')}
            size="lg"
            onPress={() => router.replace('/')}
            testID="payment-done"
          />
        ) : status.view === 'expired' ? (
          <Button
            label={t('payment.backToCart')}
            size="lg"
            onPress={() => router.replace('/cart')}
            testID="payment-back-to-cart"
          />
        ) : status.view === 'confirming' ? (
          <>
            {status.canResume && status.attempt?.checkoutUrl ? (
              <Button
                label={t('payment.openAgain')}
                size="lg"
                variant="secondary"
                onPress={() => openCheckout(status.attempt!.checkoutUrl!)}
                testID="payment-resume"
              />
            ) : null}
            <Button
              label={t('common.retry')}
              size="lg"
              variant="ghost"
              onPress={refetch}
              testID="payment-refresh"
            />
          </>
        ) : (
          <Button
            label={status.lastFailureCode ? t('payment.retry') : t('payment.continue')}
            size="lg"
            loading={begin.isPending}
            onPress={status.lastFailureCode ? retry : pay}
            testID="payment-continue"
          />
        )}
      </ScreenFooter>
    </>
  );
}
