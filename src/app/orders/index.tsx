import { useRouter } from 'expo-router';

import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useCustomerOrders } from '@/features/commerce/hooks';
import { useI18n } from '@/i18n';
import { presentError } from '@/lib/errors';
import { formatMoney } from '@/lib/format/money';
import { toWesternNumerals } from '@/lib/format/numerals';
import { useTheme } from '@/theme';

import { CUSTOMER_STATUS_KEYS } from './status';

/**
 * Every order this account has paid for.
 *
 * The status on each row is the SERVER'S fulfilment state, translated. There
 * is no progress animation and no inferred step: a customer who is told their
 * order is being picked when it is sitting in a queue will remember that.
 */
export default function OrdersScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const orders = useCustomerOrders();

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('orders.title')} />

      {orders.isLoading ? (
        <SkeletonList count={4} variant="row" />
      ) : orders.isError ? (
        <ErrorState
          title={t(presentError(orders.error).titleKey)}
          body={t(presentError(orders.error).bodyKey)}
          action={{ label: t('common.retry'), onPress: () => void orders.refetch() }}
        />
      ) : (orders.data ?? []).length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={t('orders.empty')}
          body={t('orders.emptyBody')}
          action={{ label: t('cart.browse'), onPress: () => router.replace('/') }}
          testID="orders-empty"
        />
      ) : (
        <ListGroup>
          {(orders.data ?? []).map((order) => (
            <ListRow
              key={order.id}
              icon="receipt-outline"
              title={toWesternNumerals(order.reference)}
              subtitle={toWesternNumerals(
                [
                  t(CUSTOMER_STATUS_KEYS[order.fulfilment]),
                  formatMoney(order.total, { locale }),
                ].join(' · '),
              )}
              showChevron
              onPress={() => router.push(`/orders/${order.id}`)}
              testID={`orders-row-${order.id}`}
            />
          ))}
        </ListGroup>
      )}
    </ScreenScroll>
  );
}
