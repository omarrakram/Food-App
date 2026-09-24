import type { Cart, DeliveryAddress } from '@/types/commerce';

import { acceptanceIsCurrent, checkoutReadiness } from '../checkout-readiness';
import type { CartValidationResult } from '../revalidation';

/**
 * ONE GATE. Every screen that asks "can they order" gets the same answer.
 *
 * The failure this prevents is subtle: several places each working the rule
 * out for themselves, one of them missing a check, and the permissive one
 * winning — because a missing check looks exactly like a passing check.
 */

const ADDRESS = { id: 'addr-1', areaKey: 'demo-maadi' } as DeliveryAddress;

function cart(revision = 8, lines = 1): Cart {
  return {
    id: 'cart-1',
    userId: 'user-1',
    merchantId: 'm',
    locationId: 'l',
    currency: 'EGP',
    revision,
    deliveryFeeSnapshot: null,
    lines: Array.from({ length: lines }, (_, i) => ({
      id: `line-${i}`,
      merchantProductId: 'p',
      sourceIngredientSlug: null,
      sourceRecipeId: null,
      quantity: 1,
      unitPriceSnapshot: { amountMinor: 1_000, currency: 'EGP' as const },
      addedAt: '2026-09-25T09:00:00.000Z',
    })),
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
  };
}

function validation(over: Partial<CartValidationResult> = {}): CartValidationResult {
  return {
    outcome: 'clean',
    revision: 8,
    issues: [],
    itemsSubtotal: { amountMinor: 1_000, currency: 'EGP' },
    deliveryFee: null,
    total: { amountMinor: 1_000, currency: 'EGP' },
    shortfall: null,
    ...over,
  };
}

function ready(over: Partial<Parameters<typeof checkoutReadiness>[0]> = {}) {
  return checkoutReadiness({
    isAuthenticated: true,
    hasPendingCartConflict: false,
    cart: cart(),
    address: ADDRESS,
    validation: validation(),
    acceptance: null,
    ...over,
  });
}

describe('the happy path', () => {
  it('proceeds, and names the revision a draft would be built from', () => {
    const result = ready();
    expect(result.canProceedToDraft).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.revision).toBe(8);
  });
});

describe('each rule, one at a time', () => {
  it('blocks a guest', () => {
    expect(ready({ isAuthenticated: false }).blockers).toContain('not_authenticated');
  });

  it('blocks while a parked guest cart is unresolved', () => {
    // Which basket the customer means is an open question; validating one of
    // two candidates is meaningless.
    expect(ready({ hasPendingCartConflict: true }).blockers).toContain('pending_cart_conflict');
  });

  it('blocks an empty cart', () => {
    expect(ready({ cart: cart(8, 0) }).blockers).toContain('empty_cart');
  });

  it('blocks with no address', () => {
    expect(ready({ address: null }).blockers).toContain('no_address_selected');
  });

  it('blocks an address with no area chosen', () => {
    expect(ready({ address: { ...ADDRESS, areaKey: '' } }).blockers).toContain(
      'address_incomplete',
    );
  });

  it('blocks before anything has been validated', () => {
    expect(ready({ validation: null }).blockers).toContain('not_validated');
  });

  it('blocks on any blocking validation issue', () => {
    const result = ready({
      validation: validation({
        outcome: 'blocked',
        issues: [
          { severity: 'blocking', kind: 'out_of_stock', lineId: 'l1', productName: 'Rice' },
        ],
      }),
    });
    expect(result.canProceedToDraft).toBe(false);
    expect(result.blockers).toContain('blocking_issues');
  });

  it('surfaces the branch and area reasons by name, for the screen', () => {
    const result = ready({
      validation: validation({
        outcome: 'blocked',
        issues: [
          { severity: 'blocking', kind: 'outside_delivery_area', lineId: null, productName: null },
          { severity: 'blocking', kind: 'merchant_not_accepting', lineId: null, productName: null },
        ],
      }),
    });
    expect(result.blockers).toEqual(
      expect.arrayContaining(['outside_delivery_area', 'merchant_not_accepting']),
    );
  });
});

describe('time of check, time of use', () => {
  it('blocks when the cart moved after validation', () => {
    // Validate revision 7, cart is now 8.
    const result = ready({ cart: cart(8), validation: validation({ revision: 7 }) });
    expect(result.canProceedToDraft).toBe(false);
    expect(result.blockers).toContain('validation_stale');
  });

  it('blocks a stale validation even when it concluded CLEAN', () => {
    // The dangerous case: a clean verdict about a basket that no longer
    // exists is not a clean verdict.
    const result = ready({
      cart: cart(9),
      validation: validation({ revision: 8, outcome: 'clean' }),
    });
    expect(result.canProceedToDraft).toBe(false);
  });
});

describe('an acceptance belongs to one revision', () => {
  const reviewNeeded = validation({
    outcome: 'review_required',
    issues: [
      {
        severity: 'review',
        kind: 'price_changed',
        lineId: 'l1',
        productName: 'Rice',
        was: { amountMinor: 4_000, currency: 'EGP' },
        now: { amountMinor: 4_200, currency: 'EGP' },
      },
    ],
  });

  it('blocks until the customer has looked at the new numbers', () => {
    const result = ready({ validation: reviewNeeded, acceptance: null });
    expect(result.blockers).toContain('review_not_accepted');
  });

  it('proceeds once accepted FOR THIS revision', () => {
    const result = ready({
      validation: reviewNeeded,
      acceptance: { revision: 8, acceptedAt: '2026-09-25T09:00:00.000Z' },
    });
    expect(result.canProceedToDraft).toBe(true);
  });

  it('does NOT let an older acceptance carry a later change', () => {
    // Accepted at revision 8; the cart is now 9 and the prices moved again.
    // An old "I accept" must never cover numbers the customer has not seen.
    const result = ready({
      cart: cart(9),
      validation: { ...reviewNeeded, revision: 9 },
      acceptance: { revision: 8, acceptedAt: '2026-09-25T09:00:00.000Z' },
    });
    expect(result.canProceedToDraft).toBe(false);
    expect(result.blockers).toContain('review_not_accepted');
  });

  it('is not needed at all for a clean basket', () => {
    expect(ready({ acceptance: null }).canProceedToDraft).toBe(true);
  });

  it('knows when a stored acceptance has expired', () => {
    const acceptance = { revision: 8, acceptedAt: '2026-09-25T09:00:00.000Z' };
    expect(acceptanceIsCurrent(acceptance, cart(8))).toBe(true);
    expect(acceptanceIsCurrent(acceptance, cart(9))).toBe(false);
    expect(acceptanceIsCurrent(null, cart(8))).toBe(false);
  });
});

describe('the whole truth, not one thing at a time', () => {
  it('collects every blocker so the screen can show them together', () => {
    const result = checkoutReadiness({
      isAuthenticated: false,
      hasPendingCartConflict: true,
      cart: cart(),
      address: null,
      validation: null,
      acceptance: null,
    });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'not_authenticated',
        'pending_cart_conflict',
        'no_address_selected',
        'not_validated',
      ]),
    );
  });

  it('never reports the same blocker twice', () => {
    const result = ready({
      validation: validation({
        outcome: 'blocked',
        issues: [
          { severity: 'blocking', kind: 'outside_delivery_area', lineId: null, productName: null },
          { severity: 'blocking', kind: 'outside_delivery_area', lineId: null, productName: null },
        ],
      }),
    });
    expect(new Set(result.blockers).size).toBe(result.blockers.length);
  });

  it('gives no revision when it is not ready', () => {
    expect(ready({ isAuthenticated: false }).revision).toBeNull();
  });
});
