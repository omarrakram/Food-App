import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { useRowDirection } from '@/components/ui/direction';
import { ListGroup, ListRow } from '@/components/ui/list-row';
import { ScreenHeader, ScreenScroll } from '@/components/ui/screen';
import { SkeletonList } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import {
  useIsMerchantStaff,
  useMerchantQueue,
} from '@/features/merchant/hooks';
import { needsMerchantAttention, QUEUE_VIEWS, type QueueView } from '@/features/merchant/queue';
import { useI18n, type TranslationKey } from '@/i18n';
import { presentError } from '@/lib/errors';
import { formatMoney } from '@/lib/format/money';
import { toWesternNumerals } from '@/lib/format/numerals';
import { useTheme } from '@/theme';

/**
 * THE SHOP'S QUEUE.
 *
 * Operations over polish. A picker reads this on a tablet on a shelf, so it is
 * five columns, a reference, an item count and a badge — not a chart.
 *
 * NEW PAID ORDERS ARRIVE WITHOUT A REFRESH. A shop that has to remember to
 * reload finds a paid order forty minutes late, so the queue listens to the
 * database. The socket only says "something moved"; the rows come back through
 * RLS, because a realtime message is not a permission check.
 *
 * NOTHING HERE WRITES A STATUS. Every action is `advance_fulfilment`, on the
 * detail screen, through the state machine.
 */

const VIEW_LABELS = {
  new: 'merchant.view.new',
  picking: 'merchant.view.picking',
  ready: 'merchant.view.ready',
  out: 'merchant.view.out',
  completed: 'merchant.view.completed',
} as const satisfies Record<QueueView, TranslationKey>;

export default function MerchantQueueScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const router = useRouter();
  const row = useRowDirection();

  const [view, setView] = useState<QueueView>('new');
  const { isStaff, isLoading: checkingAccess } = useIsMerchantStaff();
  const queue = useMerchantQueue(view);

  if (checkingAccess) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('merchant.title')} />
        <SkeletonList count={4} variant="row" />
      </ScreenScroll>
    );
  }

  // NOT A URL SOMEBODY KNOWS. The membership is the gate here, and RLS is the
  // gate that matters — this screen would show an empty queue either way.
  if (!isStaff) {
    return (
      <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
        <ScreenHeader title={t('merchant.title')} />
        <EmptyState
          icon="lock-closed-outline"
          title={t('merchant.noAccess')}
          body={t('merchant.noAccessBody')}
          action={{ label: t('cart.browse'), onPress: () => router.replace('/') }}
          testID="merchant-no-access"
        />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll bottomInset={theme.spacing.huge} contentGap={theme.spacing.lg}>
      <ScreenHeader title={t('merchant.title')} />

      <View
        style={{ flexDirection: row, flexWrap: 'wrap', gap: theme.spacing.xs }}
        testID="merchant-views"
      >
        {QUEUE_VIEWS.map((entry) => (
          <Chip
            key={entry}
            label={t(VIEW_LABELS[entry])}
            selected={view === entry}
            emphasis="solid"
            onPress={() => setView(entry)}
            testID={`merchant-view-${entry}`}
          />
        ))}
      </View>

      {queue.isLoading ? (
        <SkeletonList count={4} variant="row" />
      ) : queue.isError ? (
        <ErrorState
          title={t(presentError(queue.error).titleKey)}
          body={t(presentError(queue.error).bodyKey)}
          action={{ label: t('common.retry'), onPress: () => void queue.refetch() }}
        />
      ) : (queue.data ?? []).length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title={t('merchant.empty')}
          body={t('merchant.emptyBody')}
          testID="merchant-empty"
        />
      ) : (
        <ListGroup>
          {(queue.data ?? []).map((order) => {
            const waiting = order.pendingSubstitutions > 0;
            return (
              <ListRow
                key={order.id}
                icon={
                  needsMerchantAttention(order.fulfilment, {
                    hasUnresolvedSubstitutions: waiting,
                  })
                    ? 'alert-circle'
                    : 'receipt-outline'
                }
                iconTone={
                  waiting
                    ? 'warning'
                    : needsMerchantAttention(order.fulfilment, {
                          hasUnresolvedSubstitutions: false,
                        })
                      ? 'primary'
                      : 'neutral'
                }
                title={toWesternNumerals(order.reference)}
                subtitle={toWesternNumerals(
                  [
                    t('cart.items', { count: order.itemCount }),
                    formatMoney(order.total, { locale }),
                    order.deliverTo.recipientName,
                    waiting ? t('merchant.waitingOnCustomer') : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                )}
                showChevron
                onPress={() => router.push(`/merchant/${order.id}`)}
                testID={`merchant-order-${order.id}`}
              />
            );
          })}
        </ListGroup>
      )}
    </ScreenScroll>
  );
}
