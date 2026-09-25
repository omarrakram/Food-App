import { multiplyMoney } from '@/lib/format/money';
import type {
  Cart,
  MerchantLocation,
  MerchantProduct,
  PublicMerchant,
} from '@/types/commerce';
import type { Money } from '@/types/domain';

import { canDeliver, type DeliverabilityReason } from './delivery-areas';
import {
  eligibilityDetail,
  type SourcingCandidateInput,
  type SourcingContext,
} from './sourcing';

/**
 * WHAT IS STILL TRUE, IMMEDIATELY BEFORE AN ORDER EXISTS.
 *
 * A cart is a set of decisions taken at various times against a shop that has
 * moved since. Between adding cooking cream on Tuesday and checking out on
 * Thursday, the product can be delisted, sold out, repriced, or become
 * something this cook must not eat because they declared an allergy in
 * between. The branch can stop taking orders. The delivery fee can change.
 *
 * COMMERCE-3'S SAFETY VERDICT DOES NOT KEEP. It was computed when the line was
 * added and is not a property of the line. Everything is asked again here,
 * against a fresh read, and `unknown` still does not become safe.
 *
 * This is a DOMAIN function: plain values in, a verdict out. No React, no
 * network, no cache. What it is given is what it judges — the caller is
 * responsible for that read being fresh, and `revision` is what ties the
 * verdict to a specific basket.
 */

/**
 * BLOCKING — the order cannot proceed. Something is wrong that accepting will
 * not fix.
 */
export const BLOCKING_ISSUES = [
  'merchant_not_enabled',
  'merchant_not_accepting',
  'outside_delivery_area',
  'no_address_selected',
  'address_incomplete',
  'product_delisted',
  'out_of_stock',
  'invalid_quantity',
  'pack_invalid',
  'no_longer_allergen_eligible',
  'no_longer_diet_eligible',
  'eligibility_unknown',
  'below_minimum',
  'empty_cart',
] as const;
export type BlockingIssueKind = (typeof BLOCKING_ISSUES)[number];

/**
 * REVIEW REQUIRED — the order can proceed, but only once the customer has SEEN
 * the new number. Never charge somebody an amount they did not look at.
 */
export const REVIEW_ISSUES = ['price_changed', 'delivery_fee_changed'] as const;
export type ReviewIssueKind = (typeof REVIEW_ISSUES)[number];

export type ValidationIssue =
  | {
      readonly severity: 'blocking';
      readonly kind: BlockingIssueKind;
      /** Null for issues about the basket or the branch rather than one line. */
      readonly lineId: string | null;
      readonly productName: string | null;
      readonly reason?: DeliverabilityReason;
    }
  | {
      readonly severity: 'review';
      readonly kind: ReviewIssueKind;
      readonly lineId: string | null;
      readonly productName: string | null;
      /** What the customer last saw. */
      readonly was: Money;
      /** What it is now. */
      readonly now: Money;
    };

export type ValidationOutcome = 'clean' | 'review_required' | 'blocked';

export type CartValidationResult = {
  readonly outcome: ValidationOutcome;
  /** THE BASKET THIS VERDICT IS ABOUT. A different revision is a different cart. */
  readonly revision: number;
  readonly issues: readonly ValidationIssue[];
  /** Recomputed from the CURRENT shelf, not from the cart's snapshots. */
  readonly itemsSubtotal: Money;
  readonly deliveryFee: Money | null;
  readonly total: Money;
  /** Null when the branch has no floor, or the basket clears it. */
  readonly shortfall: Money | null;
};

export type RevalidationInput = {
  readonly cart: Cart;
  readonly revision: number;
  readonly merchant: PublicMerchant;
  readonly location: MerchantLocation;
  /** Fresh catalogue rows, by product id. A missing id is a delisted product. */
  readonly products: ReadonlyMap<string, SourcingCandidateInput>;
  /** Null when the customer has not chosen one yet. */
  readonly address: { readonly areaKey: string } | null;
  readonly context: SourcingContext;
};

function blocking(
  kind: BlockingIssueKind,
  lineId: string | null = null,
  productName: string | null = null,
  reason?: DeliverabilityReason,
): ValidationIssue {
  return { severity: 'blocking', kind, lineId, productName, ...(reason ? { reason } : {}) };
}

export function revalidateCart(input: RevalidationInput): CartValidationResult {
  const { cart, merchant, location, products, address, context } = input;
  const issues: ValidationIssue[] = [];
  const currency = cart.currency;

  // --- The branch ---------------------------------------------------------
  if (!merchant.isEnabled) issues.push(blocking('merchant_not_enabled'));
  if (!location.isAcceptingOrders) issues.push(blocking('merchant_not_accepting'));

  // --- Where it is going --------------------------------------------------
  if (!address) {
    issues.push(blocking('no_address_selected'));
  } else {
    const verdict = canDeliver(location, address);
    if (!verdict.deliverable) {
      issues.push(
        verdict.reason === 'no_area_selected'
          ? blocking('address_incomplete', null, null, verdict.reason)
          : blocking('outside_delivery_area', null, null, verdict.reason),
      );
    }
  }

  // --- Every line, against a fresh read -----------------------------------
  let subtotalMinor = 0;

  if (cart.lines.length === 0) issues.push(blocking('empty_cart'));

  for (const line of cart.lines) {
    const candidate = products.get(line.merchantProductId);

    // Absent from a fresh catalogue read is DELISTED. Not "assume it is fine".
    if (!candidate) {
      issues.push(blocking('product_delisted', line.id, null));
      continue;
    }

    const product: MerchantProduct = candidate.product;
    const name = product.name;

    if (!product.isActive) {
      issues.push(blocking('product_delisted', line.id, name));
      continue;
    }
    if (product.availability === 'out_of_stock') {
      issues.push(blocking('out_of_stock', line.id, name));
      continue;
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      issues.push(blocking('invalid_quantity', line.id, name));
      continue;
    }
    // A pack the merchant can no longer describe cannot be ordered: one pack
    // might be 200 g against a 500 g need, and under-buying is the error the
    // cook only finds with a pan already hot.
    if (product.packQuantity !== null && product.packQuantity <= 0) {
      issues.push(blocking('pack_invalid', line.id, name));
      continue;
    }

    // SAFETY IS ASKED AGAIN. The verdict taken when this was added is not a
    // property of the line: the user may have declared an allergy since, and
    // the merchant may have published — or withdrawn — a dietary claim.
    const eligibility = eligibilityDetail(candidate, context);
    if (eligibility.verdict === 'ineligible') {
      issues.push(
        blocking(
          eligibility.reason === 'diet'
            ? 'no_longer_diet_eligible'
            : 'no_longer_allergen_eligible',
          line.id,
          name,
        ),
      );
      continue;
    }
    if (eligibility.verdict === 'unknown') {
      // Unknown is unlabelled, not safe — the same rule as sourcing, applied
      // again because sitting in a cart does not make a product known.
      issues.push(blocking('eligibility_unknown', line.id, name));
      continue;
    }

    if (product.price.amountMinor !== line.unitPriceSnapshot.amountMinor) {
      issues.push({
        severity: 'review',
        kind: 'price_changed',
        lineId: line.id,
        productName: name,
        was: line.unitPriceSnapshot,
        now: product.price,
      });
    }

    // THE CURRENT PRICE, always. A review issue is the customer's to accept;
    // the arithmetic never uses the stale number.
    subtotalMinor += product.price.amountMinor * line.quantity;
  }

  const itemsSubtotal: Money = { amountMinor: subtotalMinor, currency };

  // --- The money ----------------------------------------------------------
  const deliveryFee = location.deliveryFee;
  if (
    deliveryFee &&
    cart.deliveryFeeSnapshot &&
    deliveryFee.amountMinor !== cart.deliveryFeeSnapshot.amountMinor
  ) {
    issues.push({
      severity: 'review',
      kind: 'delivery_fee_changed',
      lineId: null,
      productName: null,
      was: cart.deliveryFeeSnapshot,
      now: deliveryFee,
    });
  }

  const minimum = location.minimumOrder;
  const shortfall =
    minimum && minimum.amountMinor > subtotalMinor
      ? { amountMinor: minimum.amountMinor - subtotalMinor, currency }
      : null;

  // Only worth saying when the basket is otherwise orderable — telling
  // somebody to spend more on a branch that is closed is noise.
  if (shortfall && cart.lines.length > 0) issues.push(blocking('below_minimum'));

  const total: Money = {
    amountMinor: subtotalMinor + (deliveryFee?.amountMinor ?? 0),
    currency,
  };

  const outcome: ValidationOutcome = issues.some((issue) => issue.severity === 'blocking')
    ? 'blocked'
    : issues.length > 0
      ? 'review_required'
      : 'clean';

  return { outcome, revision: input.revision, issues, itemsSubtotal, deliveryFee, total, shortfall };
}

/** The lines a review issue is about, for a screen that lists them. */
export function reviewIssues(result: CartValidationResult) {
  return result.issues.filter((issue) => issue.severity === 'review');
}

export function blockingIssues(result: CartValidationResult) {
  return result.issues.filter((issue) => issue.severity === 'blocking');
}

/** Sum of a line's current price, for a screen that shows the refreshed basket. */
export function lineTotalAt(price: Money, quantity: number): Money {
  return multiplyMoney(price, quantity);
}
