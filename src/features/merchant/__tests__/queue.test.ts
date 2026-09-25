import { ORDER_FULFILMENT_STATES } from '@/types/commerce';

import {
  merchantActions,
  needsMerchantAttention,
  QUEUE_VIEWS,
  queueViewFor,
  statesInView,
} from '../queue';

/**
 * THE FIVE COLUMNS, and what may be pressed in each.
 *
 * Two rules carry the weight:
 *
 *   AN UNPAID ORDER IS IN NO COLUMN AT ALL. The database refuses to show it;
 *   this refuses to place it, so a bug in one is not covered by the other.
 *
 *   THE ACTIONS COME FROM THE STATE MACHINE. A screen that listed them itself
 *   would eventually offer DELIVERED on a new order to somebody clearing their
 *   queue.
 */

describe('which column an order is in', () => {
  it('puts nothing unpaid in the queue', () => {
    expect(queueViewFor('draft')).toBeNull();
    expect(queueViewFor('pending')).toBeNull();
    expect(queueViewFor('failed')).toBeNull();
  });

  it('places every other state in exactly one column', () => {
    const placed = ORDER_FULFILMENT_STATES.filter((state) => queueViewFor(state) !== null);
    for (const state of placed) {
      const view = queueViewFor(state)!;
      expect(QUEUE_VIEWS).toContain(view);
      expect(statesInView(view)).toContain(state);
    }
  });

  it('gives every column its states back, and no others', () => {
    for (const view of QUEUE_VIEWS) {
      for (const state of statesInView(view)) {
        expect(queueViewFor(state)).toBe(view);
      }
    }
  });

  it('treats accepted and picking as one trip to the shelves', () => {
    expect(queueViewFor('accepted')).toBe('picking');
    expect(queueViewFor('picking')).toBe('picking');
  });
});

describe('what the shop may do', () => {
  const settled = { hasUnresolvedSubstitutions: false };
  const waiting = { hasUnresolvedSubstitutions: true };

  it('offers accept and reject on a new order, and nothing else', () => {
    expect(
      merchantActions('placed', settled)
        .map((a) => a.to)
        .sort(),
    ).toEqual(['accepted', 'rejected']);
  });

  // THE ONE THAT MATTERS. A dropdown of every status is how this goes wrong.
  it('never offers delivered on a new order', () => {
    expect(merchantActions('placed', settled).map((a) => a.to)).not.toContain('delivered');
  });

  it('withholds READY while a customer is still being asked', () => {
    expect(merchantActions('picking', settled).map((a) => a.to)).toContain('ready');
    expect(merchantActions('picking', waiting).map((a) => a.to)).not.toContain('ready');
  });

  it('asks for a reason only where one is owed', () => {
    const reject = merchantActions('placed', settled).find((a) => a.to === 'rejected');
    const accept = merchantActions('placed', settled).find((a) => a.to === 'accepted');
    expect(reject?.needsReason).toBe(true);
    expect(accept?.needsReason).toBe(false);
  });

  it('offers nothing once an order is finished', () => {
    expect(merchantActions('delivered', settled)).toEqual([]);
    expect(merchantActions('rejected', settled)).toEqual([]);
    expect(merchantActions('cancelled', settled)).toEqual([]);
  });

  // Cancelling belongs to the customer and to AKALT ops, not to the shop.
  it('never offers the shop a cancellation', () => {
    for (const state of ORDER_FULFILMENT_STATES) {
      expect(merchantActions(state, settled).map((a) => a.to)).not.toContain('cancelled');
    }
  });
});

describe('what the badge counts', () => {
  it('counts an order nobody has looked at', () => {
    expect(needsMerchantAttention('placed', { hasUnresolvedSubstitutions: false })).toBe(true);
  });

  // An order waiting on a customer is not the picker's problem yet, and a
  // badge that counts it teaches people to ignore the badge.
  it('does not count an order waiting on the customer', () => {
    expect(needsMerchantAttention('picking', { hasUnresolvedSubstitutions: true })).toBe(false);
  });

  it('does not count one that has already gone out', () => {
    expect(needsMerchantAttention('dispatched', { hasUnresolvedSubstitutions: false })).toBe(false);
    expect(needsMerchantAttention('delivered', { hasUnresolvedSubstitutions: false })).toBe(false);
  });
});
