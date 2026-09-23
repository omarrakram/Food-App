import { PAYMENT_STATES, type PaymentState } from '@/types/commerce';

import {
  PAYMENT_TRANSITIONS,
  TERMINAL_PAYMENT_STATES,
  checkPaymentTransition,
  initialPaymentState,
  isMoneyHeld,
  isTerminalPayment,
} from '../payment-state';

/**
 * The payment machine.
 *
 * The thing worth protecting here is that this stays a SEPARATE axis from
 * fulfilment. Every test below would still pass if someone merged the two
 * unions — and the product would then be unable to express a delivered order
 * awaiting a refund, which is the single most common support case any
 * marketplace has.
 */

describe('the shape of the machine', () => {
  it('gives every non-terminal state somewhere to go', () => {
    const stuck = PAYMENT_STATES.filter(
      (state) => !isTerminalPayment(state) && PAYMENT_TRANSITIONS[state].length === 0,
    );
    expect(stuck).toEqual([]);
  });

  it('can reach every state from unpaid', () => {
    const seen = new Set<PaymentState>(['unpaid']);
    const queue: PaymentState[] = ['unpaid'];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      for (const rule of PAYMENT_TRANSITIONS[current]) {
        if (!seen.has(rule.to)) {
          seen.add(rule.to);
          queue.push(rule.to);
        }
      }
    }

    expect(PAYMENT_STATES.filter((state) => !seen.has(state))).toEqual([]);
  });

  it('does not treat a failed payment as the end', () => {
    // Cards get declined for reasons that stop being true thirty seconds
    // later. A terminal `failed` would turn a retry into a new order, which
    // loses the basket and the customer.
    expect(isTerminalPayment('failed')).toBe(false);
    expect(checkPaymentTransition('failed', 'authorising', 'system')).toEqual({ ok: true });
  });

  it('treats refunded and voided as the end', () => {
    expect(TERMINAL_PAYMENT_STATES).toEqual(['refunded', 'voided']);
    for (const state of TERMINAL_PAYMENT_STATES) {
      expect(PAYMENT_TRANSITIONS[state]).toEqual([]);
    }
  });
});

describe('authorise and capture are different events', () => {
  it('lets funds be held and then taken', () => {
    expect(checkPaymentTransition('unpaid', 'authorising', 'system')).toEqual({ ok: true });
    expect(checkPaymentTransition('authorising', 'authorised', 'system')).toEqual({ ok: true });
    expect(checkPaymentTransition('authorised', 'captured', 'system')).toEqual({ ok: true });
  });

  it('lets a held authorisation be released without taking anything', () => {
    // The order never reached the merchant, so there is nothing to refund —
    // voiding is cheaper, faster and does not appear on the customer's
    // statement as a charge followed by a credit.
    expect(checkPaymentTransition('authorised', 'voided', 'system')).toEqual({ ok: true });
    expect(checkPaymentTransition('captured', 'voided', 'system').ok).toBe(false);
  });

  it('allows providers that capture in a single step', () => {
    expect(checkPaymentTransition('authorising', 'captured', 'system')).toEqual({ ok: true });
  });
});

describe('partial refunds accumulate rather than overwrite', () => {
  it('allows a second partial refund from the partially-refunded state', () => {
    // One item substituted cheaper on Monday, another removed on Tuesday. A
    // machine without this self-loop forces the caller to overwrite the first
    // refund, and the customer is short the difference.
    expect(checkPaymentTransition('partially_refunded', 'partially_refunded', 'akalt')).toEqual({
      ok: true,
    });
  });

  it('allows a partial refund to become a full one', () => {
    expect(checkPaymentTransition('partially_refunded', 'refunded', 'akalt')).toEqual({
      ok: true,
    });
  });
});

describe('who may move money', () => {
  it('lets a merchant record a cash collection, and nothing else', () => {
    // Their rider took the notes at the door; they are the only party who
    // knows it happened.
    expect(checkPaymentTransition('unpaid', 'captured', 'merchant')).toEqual({ ok: true });

    // But they may not declare a card payment captured, nor refund one.
    expect(checkPaymentTransition('authorised', 'captured', 'merchant').ok).toBe(false);
    expect(checkPaymentTransition('captured', 'refunded', 'merchant').ok).toBe(false);
  });

  it('never lets a customer assert their own payment succeeded', () => {
    for (const to of ['authorised', 'captured'] as const) {
      expect(checkPaymentTransition('authorising', to, 'customer').ok).toBe(false);
    }
  });

  it('lets AKALT decide a refund but not invent an authorisation', () => {
    expect(checkPaymentTransition('captured', 'refunded', 'akalt')).toEqual({ ok: true });
    expect(checkPaymentTransition('unpaid', 'authorising', 'akalt').ok).toBe(false);
  });
});

describe('settlement readiness', () => {
  it('knows when AKALT is holding money it has to move', () => {
    expect(isMoneyHeld('captured')).toBe(true);
    expect(isMoneyHeld('partially_refunded')).toBe(true);
    expect(isMoneyHeld('authorised')).toBe(false);
    expect(isMoneyHeld('unpaid')).toBe(false);
    expect(isMoneyHeld('refunded')).toBe(false);
  });

  it('starts every method unpaid, cash included', () => {
    expect(initialPaymentState('card')).toBe('unpaid');
    expect(initialPaymentState('cash_on_delivery')).toBe('unpaid');
  });
});
