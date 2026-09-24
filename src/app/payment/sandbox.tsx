import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { useRowDirection } from '@/components/ui/direction';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Text } from '@/components/ui/text';
import { usePaymentActions, usePaymentAttempt } from '@/features/commerce/hooks';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/lib/format/money';
import { useTheme } from '@/theme';

/**
 * THE SIMULATOR. Not a payment page.
 *
 * Reached only for an order whose MERCHANT is the development one:
 * `begin_payment` reads `is_demo` off the merchant row and writes
 * `provider = 'demo'`, and `payments-simulate` refuses anything else. Nothing
 * a client sends can route a real order here.
 *
 * It exists because a journey nobody can walk is a journey nobody has checked.
 * The three buttons are the three answers a real provider gives, and the
 * screen says in as many words that no money moves.
 */
export default function PaymentSandboxScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const row = useRowDirection();

  const { intent: intentId } = useLocalSearchParams<{ intent: string }>();
  const attempt = usePaymentAttempt(intentId ?? null);
  const { simulate } = usePaymentActions(attempt.data?.orderId ?? null);

  const finish = (outcome: 'succeeded' | 'failed' | 'pending') => {
    if (!intentId || !attempt.data) return;
    simulate.mutate(
      { intentId, outcome },
      { onSuccess: () => router.replace(`/payment/${attempt.data!.orderId}`) },
    );
  };

  if (attempt.isLoading) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('payment.simulator.title')} />
        <SkeletonList count={3} variant="row" />
      </ScreenScroll>
    );
  }

  if (!attempt.data) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('payment.simulator.title')} />
        <EmptyState
          icon="flask-outline"
          title={t('payment.refused.order_not_found')}
          body={t('payment.simulator.body')}
          action={{ label: t('cart.browse'), onPress: () => router.replace('/') }}
          testID="sandbox-missing"
        />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('payment.simulator.title')} />

      <View
        style={{
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.warningSoft,
        }}
        testID="sandbox-banner"
      >
        <View style={{ flexDirection: row, alignItems: 'center', gap: theme.spacing.xs }}>
          <Ionicons name="flask-outline" size={16} color={theme.colors.warningSoftText} />
          <Text variant="headline" style={{ color: theme.colors.warningSoftText }}>
            {t('payment.simulator.title')}
          </Text>
        </View>
        <Text variant="footnote" style={{ color: theme.colors.warningSoftText }}>
          {t('payment.simulator.body')}
        </Text>
        <Text variant="caption" style={{ color: theme.colors.warningSoftText }}>
          {t('payment.simulator.amount', {
            amount: formatMoney(
              { amountMinor: attempt.data.amountMinor, currency: attempt.data.currency },
              { locale },
            ),
          })}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={t('payment.simulator.succeed')}
          size="lg"
          loading={simulate.isPending}
          onPress={() => finish('succeeded')}
          testID="sandbox-succeed"
        />
        <Button
          label={t('payment.simulator.fail')}
          variant="secondary"
          onPress={() => finish('failed')}
          testID="sandbox-fail"
        />
        <Button
          label={t('payment.simulator.pending')}
          variant="ghost"
          onPress={() => finish('pending')}
          testID="sandbox-pending"
        />
      </View>
    </ScreenScroll>
  );
}
