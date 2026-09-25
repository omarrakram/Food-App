import {
  availableFulfilmentActions,
  isTerminalFulfilment,
} from '@/features/commerce/fulfilment-state';
import type { OrderFulfilmentState } from '@/types/commerce';

/**
 * THE QUEUE, as the people in the shop think about it.
 *
 * Five columns, not eleven states. A picker does not care that `undeliverable`
 * and `dispatched` are different rows in a state machine — they care that the
 * order is out with the rider. So the machine keeps its eleven states and this
 * groups them into the five answers to "what should I do next".
 *
 * Nothing here decides whether a transition is legal. That is
 * `checkFulfilmentTransition`, and ultimately `advance_fulfilment` in the
 * database, which is the only thing that can actually move an order.
 */

export const QUEUE_VIEWS = ['new', 'picking', 'ready', 'out', 'completed'] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

/**
 * Which column an order sits in.
 *
 * `accepted` is in PICKING rather than in a column of its own: accepting and
 * starting to pick are the same trip to the shelves, and a column that only
 * ever holds an order for thirty seconds is a column nobody reads.
 */
export function queueViewFor(state: OrderFulfilmentState): QueueView | null {
  switch (state) {
    case 'placed':
      return 'new';
    case 'accepted':
    case 'picking':
      return 'picking';
    case 'ready':
      return 'ready';
    case 'dispatched':
    case 'undeliverable':
      return 'out';
    case 'delivered':
    case 'rejected':
    case 'cancelled':
      return 'completed';
    // Never in the queue at all: nobody has paid.
    case 'draft':
    case 'pending':
    case 'failed':
      return null;
  }
}

/** The states a queue column shows. Used to filter the server query. */
export function statesInView(view: QueueView): readonly OrderFulfilmentState[] {
  return (
    [
      'placed',
      'accepted',
      'picking',
      'ready',
      'dispatched',
      'undeliverable',
      'delivered',
      'rejected',
      'cancelled',
    ] as const
  ).filter((state) => queueViewFor(state) === view);
}

export type MerchantAction = {
  readonly to: OrderFulfilmentState;
  /** True when the action needs a reason before it can be sent. */
  readonly needsReason: boolean;
  /** True when it is the obvious next step rather than an exception. */
  readonly isPrimary: boolean;
};

/**
 * What this operator may do to this order, right now.
 *
 * DERIVED FROM THE STATE MACHINE, never from a list in a screen. A dropdown of
 * every status is how an order gets marked delivered from the queue by
 * somebody clearing their screen, and the machine already knows which moves
 * exist and who may make them.
 */
export function merchantActions(
  state: OrderFulfilmentState,
  options: { readonly hasUnresolvedSubstitutions: boolean },
): readonly MerchantAction[] {
  if (isTerminalFulfilment(state)) return [];

  return availableFulfilmentActions(state, 'merchant')
    .filter((to) => {
      // READY IS NOT OFFERED while somebody is still being asked about a
      // replacement. The database refuses it too — this is so the button is
      // not there to press, rather than there and then apologetic.
      if (to === 'ready' && options.hasUnresolvedSubstitutions) return false;
      return true;
    })
    .map((to) => ({
      to,
      // A rejection and a failed delivery both need somebody to say what
      // happened. Accepting an order does not.
      needsReason: to === 'rejected' || to === 'undeliverable',
      isPrimary: to !== 'rejected' && to !== 'undeliverable',
    }));
}

/**
 * Whether this order is waiting on the SHOP rather than on anybody else.
 *
 * Drives the badge on the queue. An order waiting on a customer's answer is
 * not the picker's problem until they answer, and showing it as urgent teaches
 * people to ignore the badge.
 */
export function needsMerchantAttention(
  state: OrderFulfilmentState,
  options: { readonly hasUnresolvedSubstitutions: boolean },
): boolean {
  if (state === 'placed') return true;
  if (options.hasUnresolvedSubstitutions) return false;
  return state === 'accepted' || state === 'picking' || state === 'ready';
}
