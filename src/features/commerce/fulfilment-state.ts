import type {
  CommerceActor,
  OrderFulfilmentState,
  PaymentMethod,
  PaymentState,
} from '@/types/commerce';

/**
 * The fulfilment state machine — where the GOODS are.
 *
 * Two things are encoded here that a plain status column cannot hold:
 *
 *   1. WHICH TRANSITIONS EXIST. An order cannot go from `placed` to
 *      `delivered`; something has to pick it first.
 *
 *   2. WHO MAY MAKE THEM. This is the half that usually gets left to the UI,
 *      and the UI is not a boundary — a merchant dashboard is a web page and
 *      a web page can be driven by anything. A merchant marking somebody
 *      else's order delivered, or a customer cancelling an order that is
 *      already on a motorbike, are both refused here rather than hidden.
 *
 * Nothing in this module touches a database or a clock. It answers "is this
 * legal?" and the caller does the writing.
 */

export type FulfilmentTransition = {
  readonly to: OrderFulfilmentState;
  readonly actors: readonly CommerceActor[];
};

/**
 * Every legal move.
 *
 * Read the actor lists as the commercial rules they are:
 *
 * - A customer may cancel up to `placed` and no further. Once a merchant has
 *   accepted, somebody has started committing goods and stock, so a late
 *   cancellation is a commercial decision (who absorbs the cost?) rather than
 *   a button. It goes through AKALT ops.
 *
 * - A merchant may reject an order outright, but only BEFORE accepting it.
 *   After that, an order they cannot fill is a substitution or a removal —
 *   both of which move money and are recorded in the ledger — not a rejection
 *   that would erase the fact they had already taken it on.
 *
 * - `undeliverable` is not terminal. Nobody-was-home is a second attempt most
 *   of the time, and the one time it is not, ops writes it off explicitly.
 */
export const ORDER_FULFILMENT_TRANSITIONS: Record<
  OrderFulfilmentState,
  readonly FulfilmentTransition[]
> = {
  draft: [
    { to: 'pending', actors: ['customer'] },
    { to: 'cancelled', actors: ['customer'] },
  ],
  pending: [
    // Only the system moves an order out of `pending`: it is waiting on the
    // payment provider, and no human knows the answer before it does.
    { to: 'placed', actors: ['system'] },
    { to: 'failed', actors: ['system'] },
    { to: 'cancelled', actors: ['customer', 'akalt'] },
  ],
  placed: [
    { to: 'accepted', actors: ['merchant'] },
    { to: 'rejected', actors: ['merchant'] },
    { to: 'cancelled', actors: ['customer', 'akalt'] },
  ],
  accepted: [
    { to: 'picking', actors: ['merchant'] },
    { to: 'cancelled', actors: ['akalt'] },
  ],
  picking: [
    { to: 'ready', actors: ['merchant'] },
    { to: 'cancelled', actors: ['akalt'] },
  ],
  ready: [
    { to: 'dispatched', actors: ['merchant'] },
    { to: 'cancelled', actors: ['akalt'] },
  ],
  dispatched: [
    { to: 'delivered', actors: ['merchant'] },
    { to: 'undeliverable', actors: ['merchant'] },
  ],
  undeliverable: [
    { to: 'delivered', actors: ['merchant'] },
    { to: 'cancelled', actors: ['akalt'] },
  ],
  delivered: [],
  rejected: [],
  cancelled: [],
  failed: [],
};

/** States from which nothing further can happen. */
export const TERMINAL_FULFILMENT_STATES: readonly OrderFulfilmentState[] = [
  'delivered',
  'rejected',
  'cancelled',
  'failed',
];

/**
 * What the merchant dashboard is allowed to show.
 *
 * `draft` and `pending` are deliberately absent. A merchant must never see an
 * order that has not been paid for — picking an unpaid basket is their loss,
 * and the queue is where that is prevented rather than in a dashboard filter
 * somebody can change.
 */
export const MERCHANT_VISIBLE_STATES: readonly OrderFulfilmentState[] = [
  'placed',
  'accepted',
  'picking',
  'ready',
  'dispatched',
  'delivered',
  'undeliverable',
  'rejected',
  'cancelled',
];

export type TransitionCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'terminal' }
  | { readonly ok: false; readonly reason: 'illegal_transition' }
  | {
      readonly ok: false;
      readonly reason: 'actor_not_permitted';
      readonly allowedActors: readonly CommerceActor[];
    };

export function isTerminalFulfilment(state: OrderFulfilmentState): boolean {
  return TERMINAL_FULFILMENT_STATES.includes(state);
}

export function isVisibleToMerchant(state: OrderFulfilmentState): boolean {
  return MERCHANT_VISIBLE_STATES.includes(state);
}

/** Legal next states from `from`, ignoring who is asking. */
export function nextFulfilmentStates(
  from: OrderFulfilmentState,
): readonly OrderFulfilmentState[] {
  return ORDER_FULFILMENT_TRANSITIONS[from].map((rule) => rule.to);
}

/** Legal next states for this particular actor. Drives dashboard buttons. */
export function availableFulfilmentActions(
  from: OrderFulfilmentState,
  actor: CommerceActor,
): readonly OrderFulfilmentState[] {
  return ORDER_FULFILMENT_TRANSITIONS[from]
    .filter((rule) => rule.actors.includes(actor))
    .map((rule) => rule.to);
}

/**
 * The gate. Returns WHY it refused, because the caller has to say something
 * useful and "invalid state" is not something a merchant can act on.
 */
export function checkFulfilmentTransition(
  from: OrderFulfilmentState,
  to: OrderFulfilmentState,
  actor: CommerceActor,
): TransitionCheck {
  if (isTerminalFulfilment(from)) return { ok: false, reason: 'terminal' };

  const rule = ORDER_FULFILMENT_TRANSITIONS[from].find((entry) => entry.to === to);
  if (!rule) return { ok: false, reason: 'illegal_transition' };

  if (!rule.actors.includes(actor)) {
    return { ok: false, reason: 'actor_not_permitted', allowedActors: rule.actors };
  }

  return { ok: true };
}

/**
 * The cross-axis invariant: an order may not reach the merchant's queue until
 * the money question is settled.
 *
 * Prepaid orders need funds held or taken. Cash on delivery has nothing to
 * hold, so `unpaid` is the correct and expected state at placement — which is
 * exactly why this is a function and not a comparison against `'captured'`
 * somewhere in a submit handler.
 */
export function canEnterMerchantQueue(
  payment: PaymentState,
  method: PaymentMethod,
): boolean {
  if (method === 'cash_on_delivery') return payment === 'unpaid';
  return payment === 'authorised' || payment === 'captured';
}
