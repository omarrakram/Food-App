import {
  isAttemptLive,
  isDraftExpired,
  isIntentTransitionLegal,
  isWithMerchant,
  latestAttempt,
  liveAttempt,
  paymentStatus,
  PAYMENT_INTENT_STATES,
  type PaymentAttempt,
  type PaymentIntentState,
} from '../payment-intent';

/**
 * WHAT THE CUSTOMER IS TOLD ABOUT THEIR MONEY.
 *
 * The database decides whether a payment happened. This decides what to SAY,
 * and the two ways of getting it wrong both cost real money:
 *
 *   CALLING UNCERTAINTY FAILURE. An attempt the provider is still holding
 *   might succeed. Showing "payment failed" beside a "try again" button is how
 *   somebody pays twice for one basket.
 *
 *   CALLING ANYTHING PAID THAT THE SERVER HAS NOT. A success screen is not a
 *   receipt, and the only thing that may produce one here is the order's own
 *   `payment_state`.
 */

const NOW = new Date('2026-09-26T12:00:00.000Z');

function attempt(over: Partial<PaymentAttempt> = {}): PaymentAttempt {
  return {
    id: 'intent-1',
    orderId: 'order-1',
    provider: 'paymob',
    method: 'card',
    amountMinor: 13_000,
    currency: 'EGP',
    state: 'requires_action',
    checkoutUrl: 'https://accept.paymob.com/unifiedcheckout/?publicKey=pk&clientSecret=cs',
    failureCode: null,
    failureMessage: null,
    createdAt: '2026-09-26T11:50:00.000Z',
    settledAt: null,
    ...over,
  };
}

function status(over: Parameters<typeof paymentStatus>[0] extends infer T ? Partial<T> : never) {
  return paymentStatus({
    paymentState: 'unpaid',
    fulfilmentState: 'draft',
    draftExpiresAt: '2026-09-26T12:30:00.000Z',
    attempts: [],
    now: NOW,
    ...over,
  });
}

describe('the attempt state machine', () => {
  it('lets a live attempt reach any outcome', () => {
    expect(isIntentTransitionLegal('requires_action', 'processing')).toBe(true);
    expect(isIntentTransitionLegal('requires_action', 'succeeded')).toBe(true);
    expect(isIntentTransitionLegal('processing', 'failed')).toBe(true);
  });

  // TERMINAL IS TERMINAL. A late callback must never be renderable as though
  // it had undone a settled outcome.
  it.each(['succeeded', 'failed', 'cancelled', 'expired'] as const)(
    'refuses to move out of %s',
    (state) => {
      for (const to of PAYMENT_INTENT_STATES) {
        expect(isIntentTransitionLegal(state, to)).toBe(false);
      }
    },
  );

  it('does not let a processing attempt go back to requires_action', () => {
    expect(isIntentTransitionLegal('processing', 'requires_action')).toBe(false);
  });

  it('counts exactly the two states in which money can still move', () => {
    const live = PAYMENT_INTENT_STATES.filter((state: PaymentIntentState) => isAttemptLive(state));
    expect(live).toEqual(['requires_action', 'processing']);
  });
});

describe('picking an attempt out of the history', () => {
  const older = attempt({ id: 'a', state: 'failed', createdAt: '2026-09-26T10:00:00.000Z' });
  const newer = attempt({ id: 'b', state: 'requires_action', createdAt: '2026-09-26T11:00:00.000Z' });

  it('finds the newest, whatever order it arrived in', () => {
    expect(latestAttempt([older, newer])?.id).toBe('b');
    expect(latestAttempt([newer, older])?.id).toBe('b');
  });

  it('finds the live one even when it is not the newest', () => {
    const liveButOlder = attempt({ id: 'c', state: 'processing', createdAt: '2026-09-26T09:00:00.000Z' });
    const cancelledNewer = attempt({ id: 'd', state: 'cancelled', createdAt: '2026-09-26T11:30:00.000Z' });
    expect(liveAttempt([cancelledNewer, liveButOlder])?.id).toBe('c');
  });

  it('finds none when every attempt is over', () => {
    expect(liveAttempt([older, attempt({ id: 'e', state: 'cancelled' })])).toBeNull();
  });
});

describe('expiry', () => {
  it('is over the moment the timestamp passes', () => {
    expect(isDraftExpired('2026-09-26T11:59:59.000Z', NOW)).toBe(true);
    expect(isDraftExpired('2026-09-26T12:00:01.000Z', NOW)).toBe(false);
  });

  it('never expires a draft with no expiry at all', () => {
    expect(isDraftExpired(null, NOW)).toBe(false);
  });

  // AN UNREADABLE TIMESTAMP IS NOT A LICENCE TO KEEP CHARGING.
  it('treats an unparseable expiry as expired', () => {
    expect(isDraftExpired('not a date', NOW)).toBe(true);
  });
});

describe('what the screen says', () => {
  it('offers payment when nothing has been tried', () => {
    const result = status({});
    expect(result.view).toBe('awaiting_payment');
    expect(result.canPay).toBe(true);
  });

  // THE RULE THAT STOPS A DOUBLE CHARGE.
  it('will not offer a new payment while one is still live', () => {
    const result = status({ paymentState: 'authorising', attempts: [attempt()] });
    expect(result.view).toBe('confirming');
    expect(result.canPay).toBe(false);
  });

  it('offers to resume an attempt the customer walked away from', () => {
    const result = status({ paymentState: 'authorising', attempts: [attempt()] });
    expect(result.canResume).toBe(true);
    expect(result.attempt?.checkoutUrl).toContain('unifiedcheckout');
  });

  // The provider has it. Nobody should touch anything, including the customer.
  it('will not offer to resume an attempt the provider is processing', () => {
    const result = status({
      paymentState: 'authorising',
      attempts: [attempt({ state: 'processing' })],
    });
    expect(result.view).toBe('confirming');
    expect(result.canResume).toBe(false);
    expect(result.canPay).toBe(false);
  });

  it('allows a retry once an attempt has actually failed', () => {
    const result = status({
      paymentState: 'failed',
      fulfilmentState: 'pending',
      attempts: [attempt({ state: 'failed', failureCode: 'insufficient_funds' })],
    });
    expect(result.view).toBe('awaiting_payment');
    expect(result.canPay).toBe(true);
    expect(result.lastFailureCode).toBe('insufficient_funds');
  });

  it('says paid only when the SERVER says captured', () => {
    // A succeeded attempt with an order that has not caught up is still not a
    // receipt: the order is the record, and the attempt is evidence about it.
    const optimistic = status({
      paymentState: 'authorising',
      attempts: [attempt({ state: 'succeeded', settledAt: NOW.toISOString() })],
    });
    expect(optimistic.view).not.toBe('paid');

    const real = status({
      paymentState: 'captured',
      fulfilmentState: 'placed',
      attempts: [attempt({ state: 'succeeded', settledAt: NOW.toISOString() })],
    });
    expect(real.view).toBe('paid');
    expect(real.canPay).toBe(false);
  });

  // A PAID ORDER IS PAID, whatever the clock says. An expiry that has since
  // passed must never make a captured order look unpayable.
  it('keeps a paid order paid after its draft expiry has passed', () => {
    const result = status({
      paymentState: 'captured',
      fulfilmentState: 'placed',
      draftExpiresAt: '2026-09-26T11:00:00.000Z',
      attempts: [attempt({ state: 'succeeded' })],
    });
    expect(result.view).toBe('paid');
  });

  it('sends an expired unpaid draft back rather than letting it be paid', () => {
    const result = status({
      draftExpiresAt: '2026-09-26T11:00:00.000Z',
      attempts: [attempt({ state: 'cancelled' })],
    });
    expect(result.view).toBe('expired');
    expect(result.canPay).toBe(false);
  });

  // AN EXPIRED DRAFT WITH A LIVE ATTEMPT is still confirming: the money may
  // already have moved, and "this expired" would be a lie about it.
  it('prefers confirming over expired when an attempt could still succeed', () => {
    const result = status({
      paymentState: 'authorising',
      draftExpiresAt: '2026-09-26T11:00:00.000Z',
      attempts: [attempt({ state: 'processing' })],
    });
    expect(result.view).toBe('confirming');
  });
});

describe('whether the shop has it', () => {
  it('is false for everything before payment', () => {
    expect(isWithMerchant('draft')).toBe(false);
    expect(isWithMerchant('pending')).toBe(false);
  });

  it('is true from placed onwards', () => {
    expect(isWithMerchant('placed')).toBe(true);
    expect(isWithMerchant('accepted')).toBe(true);
    expect(isWithMerchant('delivered')).toBe(true);
  });

  it('is false for an order that never got there', () => {
    expect(isWithMerchant('cancelled')).toBe(false);
  });
});
