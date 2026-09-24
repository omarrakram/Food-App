import type { Cart, DeliveryAddress } from '@/types/commerce';

import type { CartValidationResult } from './revalidation';

/**
 * ONE GATE, NOT A BUTTON PER RULE.
 *
 * "Can this person place this order" is asked in several places — the cart's
 * CTA, the review screen, the moment the draft is requested — and if each
 * works it out for itself they will disagree. One of them will be wrong, and
 * the wrong one will be the permissive one, because a missing check looks
 * exactly like a passing check.
 *
 * So the question is answered here, once, and the answer says WHY. Every
 * caller renders the same verdict.
 *
 * CLIENT VALIDATION IS UX. The server re-derives all of this in
 * `create_order_draft` and is the only authority — this exists so the customer
 * is told what is wrong before they tap, not so the database can be trusted
 * less.
 */

export const CHECKOUT_BLOCKERS = [
  /** No account. A draft needs a stable owner for payment, refunds, support. */
  'not_authenticated',
  /** A guest cart from another branch is waiting to be resolved. */
  'pending_cart_conflict',
  'empty_cart',
  'no_address_selected',
  'address_incomplete',
  'outside_delivery_area',
  'merchant_not_accepting',
  /** Nothing has been validated yet. */
  'not_validated',
  /** The cart moved since the validation was taken. */
  'validation_stale',
  /** Something is wrong that accepting will not fix. */
  'blocking_issues',
  /** Prices or fees changed and the customer has not looked at them. */
  'review_not_accepted',
] as const;
export type CheckoutBlocker = (typeof CHECKOUT_BLOCKERS)[number];

/**
 * A customer's "yes, I have seen the new prices", BOUND TO A REVISION.
 *
 * Accepting refreshes the cart's snapshots, which moves the revision, so the
 * acceptance belongs to the revision that resulted. If the cart changes again
 * the acceptance is for a basket that no longer exists, and an old "I accept"
 * must never carry a later change the customer has not seen.
 */
export type ReviewAcceptance = {
  readonly revision: number;
  readonly acceptedAt: string;
};

export type CheckoutReadinessInput = {
  readonly isAuthenticated: boolean;
  readonly hasPendingCartConflict: boolean;
  readonly cart: Cart | null;
  readonly address: DeliveryAddress | null;
  /** Null until the cart has been validated at least once. */
  readonly validation: CartValidationResult | null;
  readonly acceptance: ReviewAcceptance | null;
};

export type CheckoutReadiness = {
  readonly canProceedToDraft: boolean;
  readonly blockers: readonly CheckoutBlocker[];
  /** The revision a draft would be built from. Null when not ready. */
  readonly revision: number | null;
};

export function checkoutReadiness(input: CheckoutReadinessInput): CheckoutReadiness {
  const { isAuthenticated, hasPendingCartConflict, cart, address, validation, acceptance } = input;
  const blockers: CheckoutBlocker[] = [];

  // ORDER MATTERS ONLY FOR READING. Every blocker is collected, so the screen
  // can show the whole truth rather than one thing at a time.
  if (!isAuthenticated) blockers.push('not_authenticated');

  // BEFORE ANYTHING ELSE ABOUT THE CART. While a parked guest cart is
  // unresolved, which basket the customer means is an open question, and
  // validating one of two candidate baskets is meaningless.
  if (hasPendingCartConflict) blockers.push('pending_cart_conflict');

  if (!cart || cart.lines.length === 0) {
    blockers.push('empty_cart');
    return { canProceedToDraft: false, blockers, revision: null };
  }

  if (!address) {
    blockers.push('no_address_selected');
  } else if (!address.areaKey) {
    blockers.push('address_incomplete');
  }

  if (!validation) {
    blockers.push('not_validated');
    return { canProceedToDraft: false, blockers, revision: null };
  }

  // TIME OF CHECK / TIME OF USE. A verdict about revision 8 says nothing about
  // revision 9, whatever it concluded.
  if (validation.revision !== cart.revision) blockers.push('validation_stale');

  if (validation.outcome === 'blocked') {
    blockers.push('blocking_issues');
    // The specific reasons live on the validation result; repeating them here
    // would be a second list to keep in step.
    for (const issue of validation.issues) {
      if (issue.severity !== 'blocking') continue;
      if (issue.kind === 'outside_delivery_area') blockers.push('outside_delivery_area');
      if (issue.kind === 'merchant_not_accepting') blockers.push('merchant_not_accepting');
    }
  }

  if (validation.outcome === 'review_required') {
    // Accepted, and accepted for THIS basket. An acceptance from an earlier
    // revision is an agreement to numbers that have since changed.
    const accepted = acceptance !== null && acceptance.revision === cart.revision;
    if (!accepted) blockers.push('review_not_accepted');
  }

  const unique = [...new Set(blockers)];
  return {
    canProceedToDraft: unique.length === 0,
    blockers: unique,
    revision: unique.length === 0 ? cart.revision : null,
  };
}

/** Whether an acceptance still applies. Exported so a store can discard it. */
export function acceptanceIsCurrent(
  acceptance: ReviewAcceptance | null,
  cart: Cart | null,
): boolean {
  return acceptance !== null && cart !== null && acceptance.revision === cart.revision;
}
