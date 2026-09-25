import type { TranslationKey } from '@/i18n';
import type { OrderFulfilmentState } from '@/types/commerce';

/**
 * What the customer is told, per state.
 *
 * ONE MAP, EXHAUSTIVE OVER THE MACHINE, so a new fulfilment state cannot ship
 * without somebody writing the sentence a customer reads. The pre-payment
 * states are here too and say nothing reassuring: `draft` and `pending` are
 * not "on the way", they are "we have not taken your money yet".
 */
export const CUSTOMER_STATUS_KEYS = {
  draft: 'checkout.title',
  pending: 'payment.confirming',
  placed: 'orders.status.placed',
  accepted: 'orders.status.accepted',
  picking: 'orders.status.picking',
  ready: 'orders.status.ready',
  dispatched: 'orders.status.dispatched',
  delivered: 'orders.status.delivered',
  rejected: 'orders.status.rejected',
  cancelled: 'orders.status.cancelled',
  undeliverable: 'orders.status.undeliverable',
  failed: 'payment.failedTitle',
} as const satisfies Record<OrderFulfilmentState, TranslationKey>;
