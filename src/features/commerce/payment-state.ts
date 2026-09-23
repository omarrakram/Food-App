import type { CommerceActor, PaymentMethod, PaymentState } from '@/types/commerce';

import type { TransitionCheck } from './fulfilment-state';

/**
 * The payment state machine — where the MONEY is.
 *
 * Kept deliberately apart from fulfilment. They move at different speeds, are
 * driven by different actors, and fail independently: a delivered order can be
 * awaiting a refund, and a captured payment can belong to an order the
 * merchant never accepted. One column cannot say both things, and the moment
 * it tries, reconciliation becomes guesswork.
 *
 * `authorised` and `captured` are separate because card payments hold funds
 * before taking them. That gap is where substitutions and removals resolve,
 * and capturing before the basket is final is how a customer gets charged for
 * something that never arrived and then has to ask for it back.
 */

export type PaymentTransition = {
  readonly to: PaymentState;
  readonly actors: readonly CommerceActor[];
};

/**
 * Legal payment moves.
 *
 * Almost everything is `system`, because the payment provider is the authority
 * and a human asserting "this was paid" is how money goes missing. The two
 * exceptions are deliberate:
 *
 * - `unpaid → captured` by a MERCHANT. That is cash on delivery: their rider
 *   took the notes at the door, and they are the only party who knows.
 *
 * - Refunds by AKALT. A refund is a decision, not an observation.
 */
export const PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentTransition[]> = {
  unpaid: [
    { to: 'authorising', actors: ['system'] },
    // Cash on delivery. See the note above.
    { to: 'captured', actors: ['system', 'merchant'] },
    { to: 'failed', actors: ['system'] },
  ],
  authorising: [
    { to: 'authorised', actors: ['system'] },
    // Some providers capture in one step rather than holding first.
    { to: 'captured', actors: ['system'] },
    { to: 'failed', actors: ['system'] },
  ],
  authorised: [
    { to: 'captured', actors: ['system'] },
    // Released without being taken — the order never reached the merchant.
    { to: 'voided', actors: ['system', 'akalt'] },
    { to: 'failed', actors: ['system'] },
  ],
  captured: [
    { to: 'partially_refunded', actors: ['system', 'akalt'] },
    { to: 'refunded', actors: ['system', 'akalt'] },
  ],
  // A self-loop, and it has to be here: a second partial refund is an ordinary
  // event (one item substituted cheaper on Monday, another removed on Tuesday)
  // and a machine that cannot express it will force the caller to overwrite
  // the first refund instead of adding to it.
  partially_refunded: [
    { to: 'partially_refunded', actors: ['system', 'akalt'] },
    { to: 'refunded', actors: ['system', 'akalt'] },
  ],
  // Retrying a failed payment is normal. Cards get declined for reasons that
  // stop being true thirty seconds later.
  failed: [{ to: 'authorising', actors: ['system'] }],
  refunded: [],
  voided: [],
};

/** Nothing further can happen. Note that `failed` is NOT here — retries exist. */
export const TERMINAL_PAYMENT_STATES: readonly PaymentState[] = ['refunded', 'voided'];

export function isTerminalPayment(state: PaymentState): boolean {
  return TERMINAL_PAYMENT_STATES.includes(state);
}

/** True when AKALT is holding money for this order that settlement must move. */
export function isMoneyHeld(state: PaymentState): boolean {
  return state === 'captured' || state === 'partially_refunded';
}

export function nextPaymentStates(from: PaymentState): readonly PaymentState[] {
  return PAYMENT_TRANSITIONS[from].map((rule) => rule.to);
}

export function checkPaymentTransition(
  from: PaymentState,
  to: PaymentState,
  actor: CommerceActor,
): TransitionCheck {
  if (isTerminalPayment(from)) return { ok: false, reason: 'terminal' };

  const rule = PAYMENT_TRANSITIONS[from].find((entry) => entry.to === to);
  if (!rule) return { ok: false, reason: 'illegal_transition' };

  if (!rule.actors.includes(actor)) {
    return { ok: false, reason: 'actor_not_permitted', allowedActors: rule.actors };
  }

  return { ok: true };
}

/**
 * The state a NEW order starts its payment life in.
 *
 * Cash on delivery genuinely starts unpaid and stays that way until the door.
 * Anything prepaid starts unpaid too, but only for the instant before the
 * intent is created — which is why this is one function rather than a literal
 * scattered across the checkout code.
 */
export function initialPaymentState(_method: PaymentMethod): PaymentState {
  return 'unpaid';
}
