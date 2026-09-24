import type {
  AdjustmentKind,
  OrderAdjustment,
  OrderCharge,
  OrderFinancials,
  OrderSubstitution,
  PaymentMethod,
  SettlementDirection,
} from '@/types/commerce';
import type { CurrencyCode } from '@/types/domain';

/**
 * The money.
 *
 * ONE RULE ABOVE ALL OTHERS: an order's financial position is a FOLD over an
 * append-only list of adjustments, never a set of mutable columns. A
 * substitution, a removal, a cancellation and a goodwill credit are all the
 * same kind of row. That is what makes "why was I charged this?" answerable
 * and what stops a total drifting away from the history that produced it.
 *
 * Every amount is an integer in the currency's minor unit, as everywhere else
 * in this app. Nothing here produces a float.
 *
 * Nothing in this module reads a clock, a database or a user. It is arithmetic
 * over values, so it can be tested exhaustively and run identically on the
 * client, in an edge function and in the merchant dashboard.
 */

/** Adjustments that change what the MERCHANT actually handed over. */
const GOODS_ADJUSTMENT_KINDS: readonly AdjustmentKind[] = [
  'substitution',
  'item_removed',
  'quantity_reduced',
  'order_cancelled',
];

/**
 * Adjustments AKALT absorbs.
 *
 * A waived delivery fee and a goodwill credit both reduce what the customer
 * pays without reducing what the merchant delivered — so the merchant is still
 * owed in full and the gap comes out of our margin. Modelling them as goods
 * adjustments would quietly bill the merchant for our apology.
 */
export function isGoodsAdjustment(kind: AdjustmentKind): boolean {
  return GOODS_ADJUSTMENT_KINDS.includes(kind);
}

export type LedgerInput = {
  readonly charge: OrderCharge;
  readonly adjustments: readonly OrderAdjustment[];
  readonly capturedMinor: number;
  readonly refundedMinor: number;
  readonly paymentMethod: PaymentMethod;
};

/** The commercial terms from the merchant agreement. */
export type MerchantTerms = {
  readonly commissionRateBasisPoints: number;
  /**
   * The merchant owns the rider, so normally they keep what the customer paid
   * for delivery. It is a term in the agreement, not a law, and the settlement
   * maths reads it.
   */
  readonly merchantKeepsDeliveryFee: boolean;
};

/** What the customer was asked to pay before anything changed. */
export function authorisedTotalMinor(charge: OrderCharge): number {
  return (
    charge.itemsSubtotalMinor +
    charge.deliveryFeeMinor +
    charge.serviceFeeMinor -
    charge.discountMinor
  );
}

/** Signed sum. Negative reduces what the customer owes. */
export function adjustmentsTotalMinor(adjustments: readonly OrderAdjustment[]): number {
  return adjustments.reduce((sum, entry) => sum + entry.amountMinor, 0);
}

function goodsAdjustmentsTotalMinor(adjustments: readonly OrderAdjustment[]): number {
  return adjustments
    .filter((entry) => isGoodsAdjustment(entry.kind))
    .reduce((sum, entry) => sum + entry.amountMinor, 0);
}

/**
 * Basis points, so the rate is an integer and cannot drift.
 *
 * `Math.round` rather than floor: over thousands of orders, always rounding
 * commission down is a systematic transfer from us to the merchant, and always
 * rounding up is the reverse. Neither is defensible as an accident.
 */
function applyBasisPoints(baseMinor: number, basisPoints: number): number {
  if (baseMinor <= 0) return 0;
  return Math.round((baseMinor * basisPoints) / 10_000);
}

// --- The invariant ---------------------------------------------------------

export type AdjustmentCheck =
  | { readonly ok: true }
  /**
   * The adjustment would make the customer owe more than they authorised.
   *
   * REFUSED, always. Most payment providers cannot capture above an
   * authorisation, so an order in this state is not merely impolite, it is
   * unsettleable — and the customer agreed to a number. A substitute that
   * costs more is handled by explicit customer approval and a fresh
   * authorisation, or it is not handled at all.
   */
  | {
      readonly ok: false;
      readonly reason: 'exceeds_authorisation';
      readonly authorisedTotalMinor: number;
      readonly wouldBeMinor: number;
    }
  | { readonly ok: false; readonly reason: 'negative_total'; readonly wouldBeMinor: number };

/** Would this adjustment leave the order in a payable state? */
export function checkAdjustment(
  input: LedgerInput,
  proposedAmountMinor: number,
): AdjustmentCheck {
  const authorised = authorisedTotalMinor(input.charge);
  const wouldBe = authorised + adjustmentsTotalMinor(input.adjustments) + proposedAmountMinor;

  if (wouldBe > authorised) {
    return {
      ok: false,
      reason: 'exceeds_authorisation',
      authorisedTotalMinor: authorised,
      wouldBeMinor: wouldBe,
    };
  }
  if (wouldBe < 0) return { ok: false, reason: 'negative_total', wouldBeMinor: wouldBe };

  return { ok: true };
}

/**
 * The signed adjustment a substitution produces.
 *
 * Positive when the replacement costs more — which `checkAdjustment` will then
 * refuse unless the customer has approved it and the authorisation was raised.
 * Computing it here rather than at the call site is deliberate: delta times
 * quantity is exactly the arithmetic people get wrong, and getting it wrong
 * means charging somebody for a tomato they did not get.
 */
export function substitutionAdjustmentMinor(substitution: OrderSubstitution): number {
  if (substitution.decision === 'rejected' || substitution.decision === 'removed') {
    // The customer turned the offer down, or there was never a safe
    // equal-or-cheaper one to make. Either way the line comes off whole.
    return -(substitution.originalUnitPrice.amountMinor * substitution.quantity);
  }
  if (substitution.replacementProductId === null) {
    // Nothing was offered in its place — that is a removal wearing a
    // substitution's clothes, and it refunds the full line.
    return -(substitution.originalUnitPrice.amountMinor * substitution.quantity);
  }
  return substitution.unitPriceDeltaMinor * substitution.quantity;
}

// --- Settlement ------------------------------------------------------------

/**
 * The whole financial position of one order.
 *
 * `settlementDirection` is not decoration. Prepaid, we hold the customer's
 * money and owe the merchant their share. Cash on delivery, their rider took
 * the notes and THEY owe US the commission. Both are normal, and a settlement
 * model that assumes money always flows one way will silently invoice the
 * wrong party the first time a COD order is reconciled.
 */
export function settleOrder(input: LedgerInput, terms: MerchantTerms): OrderFinancials {
  const currency: CurrencyCode = input.charge.currency;
  const authorised = authorisedTotalMinor(input.charge);

  const amountDue = Math.max(0, authorised + adjustmentsTotalMinor(input.adjustments));

  const goodsFulfilled = Math.max(
    0,
    input.charge.itemsSubtotalMinor + goodsAdjustmentsTotalMinor(input.adjustments),
  );

  const keptDeliveryFee = terms.merchantKeepsDeliveryFee ? input.charge.deliveryFeeMinor : 0;

  /**
   * Commission is charged on NET FULFILLED MERCHANDISE and nothing else.
   *
   * Not on delivery, not on the service fee, and not on goods that were
   * removed, substituted away or refunded — `goodsFulfilled` already has those
   * netted out, which is the whole reason it is computed from the adjustment
   * fold rather than read off the original basket.
   */
  const commission = applyBasisPoints(goodsFulfilled, terms.commissionRateBasisPoints);

  /** What the merchant has earned, whoever is currently holding the cash. */
  const merchantEntitlement = goodsFulfilled + keptDeliveryFee - commission;

  const isCashOnDelivery = input.paymentMethod === 'cash_on_delivery';

  // Prepaid: we hold the money, so we owe the merchant what they earned.
  // COD:     they hold `amountDue`, so they owe us whatever exceeds it.
  const signedSettlement = isCashOnDelivery
    ? amountDue - merchantEntitlement
    : -merchantEntitlement;

  const settlementDirection: SettlementDirection =
    signedSettlement >= 0 ? 'merchant_owes_akalt' : 'akalt_owes_merchant';

  // COD money never left the customer's hand for undelivered goods — the rider
  // collects the adjusted total at the door — so there is nothing to give back.
  const refundDue = isCashOnDelivery
    ? 0
    : Math.max(0, input.capturedMinor - input.refundedMinor - amountDue);

  return {
    currency,
    authorisedTotalMinor: authorised,
    amountDueMinor: amountDue,
    goodsFulfilledMinor: goodsFulfilled,
    refundDueMinor: refundDue,
    commissionMinor: commission,
    settlementDirection,
    settlementAmountMinor: Math.abs(signedSettlement),
  };
}
