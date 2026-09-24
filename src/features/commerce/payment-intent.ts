import type { OrderFulfilmentState, PaymentState } from '@/types/commerce';
import type { CurrencyCode } from '@/types/domain';

/**
 * ONE ATTEMPT TO PAY, and the rules about what may follow it.
 *
 * A separate axis from the order's `payment_state` on purpose. That column
 * answers "where is the money" for the whole order; this answers "what
 * happened when we tried" for a single attempt. An order sitting in `failed`
 * may have a `succeeded` attempt thirty seconds behind it, and one column
 * cannot hold both facts.
 *
 * This module is the client's copy of rules the DATABASE enforces. It exists
 * so a screen can say what is going on without asking the server what a state
 * means — not so anything here can be believed. Nothing in this file decides
 * whether money moved.
 */

export const PAYMENT_INTENT_STATES = [
  /** Created. The customer has not finished at the provider yet. */
  'requires_action',
  /** The provider has it and has not said how it went. */
  'processing',
  'succeeded',
  'failed',
  /** The customer walked away. Nothing was declined. */
  'cancelled',
  /** We stopped waiting; the draft behind it is no longer priceable. */
  'expired',
] as const;
export type PaymentIntentState = (typeof PAYMENT_INTENT_STATES)[number];

export type PaymentAttempt = {
  readonly id: string;
  readonly orderId: string;
  readonly provider: 'demo' | 'paymob' | 'fawry' | 'cash';
  readonly method: 'card' | 'wallet' | 'cash_on_delivery';
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly state: PaymentIntentState;
  readonly checkoutUrl: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly createdAt: string;
  readonly settledAt: string | null;
};

/**
 * Legal moves, mirroring `payment_intents` in the database.
 *
 * Every terminal state is terminal HERE TOO, which is what stops a late
 * callback from being rendered as though it had undone a settled outcome.
 */
export const PAYMENT_INTENT_TRANSITIONS: Record<
  PaymentIntentState,
  readonly PaymentIntentState[]
> = {
  requires_action: ['processing', 'succeeded', 'failed', 'cancelled', 'expired'],
  processing: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export function isIntentTransitionLegal(
  from: PaymentIntentState,
  to: PaymentIntentState,
): boolean {
  return PAYMENT_INTENT_TRANSITIONS[from].includes(to);
}

/**
 * An attempt that could still take the customer's money.
 *
 * THE MOST IMPORTANT PREDICATE IN THIS FILE. While one of these exists, no
 * second attempt may be offered: starting another is how somebody pays twice
 * for one basket.
 */
export function isAttemptLive(state: PaymentIntentState): boolean {
  return state === 'requires_action' || state === 'processing';
}

/** Most recent first. The list is a history and the newest one is the live one. */
export function sortAttempts(attempts: readonly PaymentAttempt[]): readonly PaymentAttempt[] {
  return [...attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function latestAttempt(attempts: readonly PaymentAttempt[]): PaymentAttempt | null {
  return sortAttempts(attempts)[0] ?? null;
}

export function liveAttempt(attempts: readonly PaymentAttempt[]): PaymentAttempt | null {
  return sortAttempts(attempts).find((attempt) => isAttemptLive(attempt.state)) ?? null;
}

/**
 * WHAT THE CUSTOMER IS TOLD. Four answers, and no fifth.
 *
 *   awaiting_payment  nothing has been tried, or the last try is over and
 *                     failed. The customer may pay.
 *   confirming        somebody is waiting on somebody. NEVER rendered as
 *                     either outcome: an attempt the provider is still
 *                     holding might succeed, and calling it a failure invites
 *                     a second payment for the same basket.
 *   paid              the server says captured. Only the webhook can cause it.
 *   expired           the draft is too old to pay for; back to review.
 */
export const PAYMENT_VIEWS = ['awaiting_payment', 'confirming', 'paid', 'expired'] as const;
export type PaymentView = (typeof PAYMENT_VIEWS)[number];

export type PaymentStatusInput = {
  readonly paymentState: PaymentState;
  readonly fulfilmentState: OrderFulfilmentState;
  readonly draftExpiresAt: string | null;
  readonly attempts: readonly PaymentAttempt[];
  readonly now: Date;
};

export type PaymentStatus = {
  readonly view: PaymentView;
  /** The attempt the screen is talking about, if there is one. */
  readonly attempt: PaymentAttempt | null;
  /** True only when a NEW attempt is safe to offer. */
  readonly canPay: boolean;
  /** True when the customer can be sent back to a checkout URL they left. */
  readonly canResume: boolean;
  /** Set when the last attempt failed and the customer may try again. */
  readonly lastFailureCode: string | null;
};

export function isDraftExpired(draftExpiresAt: string | null, now: Date): boolean {
  if (!draftExpiresAt) return false;
  const at = new Date(draftExpiresAt).getTime();
  // An unparseable timestamp is not a licence to keep charging.
  return Number.isNaN(at) ? true : at <= now.getTime();
}

/**
 * The one place the payment screen's question is answered.
 *
 * ORDER MATTERS, and it is: paid, then in-flight, then expired, then free to
 * pay. Paid comes first because a captured order is captured whatever else is
 * true of it — including an expiry that has since passed, which must never
 * make a paid order look unpayable.
 */
export function paymentStatus(input: PaymentStatusInput): PaymentStatus {
  const { paymentState, attempts, draftExpiresAt, now } = input;
  const live = liveAttempt(attempts);
  const latest = latestAttempt(attempts);

  if (paymentState === 'captured' || paymentState === 'authorised') {
    return {
      view: 'paid',
      attempt: sortAttempts(attempts).find((a) => a.state === 'succeeded') ?? latest,
      canPay: false,
      canResume: false,
      lastFailureCode: null,
    };
  }

  if (live) {
    return {
      view: 'confirming',
      attempt: live,
      canPay: false,
      // `requires_action` means the customer never finished at the provider,
      // so the checkout page they abandoned is still the right place to send
      // them. `processing` means the provider has it and nobody should touch
      // anything.
      canResume: live.state === 'requires_action' && live.checkoutUrl !== null,
      lastFailureCode: null,
    };
  }

  if (isDraftExpired(draftExpiresAt, now)) {
    return {
      view: 'expired',
      attempt: latest,
      canPay: false,
      canResume: false,
      lastFailureCode: latest?.failureCode ?? null,
    };
  }

  return {
    view: 'awaiting_payment',
    attempt: latest,
    canPay: true,
    canResume: false,
    lastFailureCode: latest?.state === 'failed' ? latest.failureCode : null,
  };
}

/**
 * Whether this order has reached the merchant.
 *
 * Read off FULFILMENT, not payment, and deliberately not inferred from
 * "captured" — the two are separate axes and the gap between them is real,
 * even if today it is milliseconds wide. Before this is true the app must not
 * say the shop has the order.
 */
export function isWithMerchant(fulfilment: OrderFulfilmentState): boolean {
  return fulfilment !== 'draft' && fulfilment !== 'pending' && fulfilment !== 'cancelled';
}
