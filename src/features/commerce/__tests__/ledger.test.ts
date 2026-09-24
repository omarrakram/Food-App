import type {
  AdjustmentKind,
  OrderAdjustment,
  OrderCharge,
  OrderSubstitution,
  PaymentMethod,
} from '@/types/commerce';
import type { Money } from '@/types/domain';

import {
  adjustmentsTotalMinor,
  authorisedTotalMinor,
  checkAdjustment,
  isGoodsAdjustment,
  settleOrder,
  substitutionAdjustmentMinor,
  type LedgerInput,
  type MerchantTerms,
} from '../ledger';

/**
 * The money.
 *
 * Every figure below is in piastres. A basket of 200.00 EGP, 25.00 delivery,
 * 10.00 service — an ordinary Cairo grocery order — so the arithmetic can be
 * checked by hand against a real receipt rather than against round numbers
 * chosen to make the test pass.
 */

const EGP = (amountMinor: number): Money => ({ amountMinor, currency: 'EGP' });

function charge(over: Partial<OrderCharge> = {}): OrderCharge {
  return {
    currency: 'EGP',
    itemsSubtotalMinor: 20_000,
    deliveryFeeMinor: 2_500,
    serviceFeeMinor: 1_000,
    discountMinor: 0,
    ...over,
  };
}

function adjustment(
  amountMinor: number,
  kind: AdjustmentKind = 'item_removed',
): OrderAdjustment {
  return {
    id: `adj-${kind}-${amountMinor}`,
    orderId: 'order-1',
    orderItemId: kind === 'fee_waived' || kind === 'goodwill' ? null : 'item-1',
    kind,
    amountMinor,
    reason: null,
    actor: 'merchant',
    actorId: null,
    createdAt: '2026-09-23T10:00:00.000Z',
  };
}

function ledger(over: Partial<LedgerInput> = {}): LedgerInput {
  return {
    charge: charge(),
    adjustments: [],
    capturedMinor: 23_500,
    refundedMinor: 0,
    paymentMethod: 'card' as PaymentMethod,
    ...over,
  };
}

/**
 * The development assumption: 10% on net fulfilled merchandise. The merchant
 * runs the rider, so they keep the delivery fee.
 */
const TERMS: MerchantTerms = {
  commissionRateBasisPoints: 1_000,
  merchantKeepsDeliveryFee: true,
};

describe('what the customer was asked to pay', () => {
  it('adds the fees and subtracts the discount', () => {
    expect(authorisedTotalMinor(charge())).toBe(23_500);
    expect(authorisedTotalMinor(charge({ discountMinor: 1_500 }))).toBe(22_000);
  });

  it('sums adjustments with their signs intact', () => {
    expect(adjustmentsTotalMinor([adjustment(-5_000), adjustment(-1_200)])).toBe(-6_200);
  });
});

describe('the authorisation is a ceiling', () => {
  it('accepts an adjustment that reduces the bill', () => {
    expect(checkAdjustment(ledger(), -5_000)).toEqual({ ok: true });
  });

  it('REFUSES anything that would charge more than the customer agreed to', () => {
    // This is the rule that stops a merchant swapping in a more expensive
    // brand and quietly billing the difference. Most providers cannot capture
    // above an authorisation anyway, so an order in this state is not merely
    // rude — it is unsettleable.
    const result = checkAdjustment(ledger(), 100);

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'exceeds_authorisation') {
      expect(result.authorisedTotalMinor).toBe(23_500);
      expect(result.wouldBeMinor).toBe(23_600);
    } else {
      throw new Error('expected an authorisation refusal');
    }
  });

  it('allows a dearer swap once earlier credits have left room under the ceiling', () => {
    // THE CEILING IS A PAYMENT CONSTRAINT, NOT A CONSENT ONE, and the two are
    // easy to conflate. −5,000 then +100 lands at 18,600, well under the
    // 23,500 the customer authorised, so it is capturable and this function
    // allows it.
    //
    // The worry it does NOT address — a merchant quietly upgrading one item
    // using the credit from another they removed — is real, and it belongs to
    // `SubstitutionDecision`: a swap the customer has not approved sits at
    // `pending_customer` and never becomes an adjustment at all. Enforcing
    // consent here instead would block every legitimate substitution on an
    // order that happened to shrink, which is most of them.
    const withCredit = ledger({ adjustments: [adjustment(-5_000)] });
    expect(checkAdjustment(withCredit, 100)).toEqual({ ok: true });
  });

  it('refuses an adjustment that would take the bill below zero', () => {
    const result = checkAdjustment(ledger(), -30_000);
    expect(result).toEqual({ ok: false, reason: 'negative_total', wouldBeMinor: -6_500 });
  });
});

describe('a substitution turns into exactly one signed number', () => {
  function substitution(over: Partial<OrderSubstitution> = {}): OrderSubstitution {
    return {
      id: 'sub-1',
      orderId: 'order-1',
      orderItemId: 'item-1',
      originalProductId: 'p-1',
      originalProductName: 'Juhayna Full Cream Milk 1L',
      originalUnitPrice: EGP(4_500),
      replacementProductId: 'p-2',
      replacementProductName: 'Lamar Full Cream Milk 1L',
      replacementUnitPrice: EGP(4_000),
      unitPriceDeltaMinor: -500,
      quantity: 2,
      decision: 'auto_approved',
      decidedAt: '2026-09-23T10:00:00.000Z',
      proposedBy: 'merchant',
      createdAt: '2026-09-23T10:00:00.000Z',
      ...over,
    };
  }

  it('multiplies the per-unit difference by the quantity', () => {
    // Two litres, 5.00 cheaper each. Getting this wrong by dropping the
    // quantity is the single most likely arithmetic slip in the whole flow.
    expect(substitutionAdjustmentMinor(substitution())).toBe(-1_000);
  });

  it('refunds the whole line when the customer rejects the replacement', () => {
    expect(
      substitutionAdjustmentMinor(substitution({ decision: 'rejected' })),
    ).toBe(-9_000);
  });

  it('refunds the whole line when nothing was offered in its place', () => {
    // A "substitution" with no replacement is a removal wearing the wrong
    // label, and it must refund the original rather than a delta of zero.
    expect(
      substitutionAdjustmentMinor(
        substitution({
          replacementProductId: null,
          replacementProductName: null,
          replacementUnitPrice: null,
          unitPriceDeltaMinor: 0,
        }),
      ),
    ).toBe(-9_000);
  });

  it('produces a positive number for a dearer replacement, which the ceiling then refuses', () => {
    const dearer = substitution({
      replacementUnitPrice: EGP(5_000),
      unitPriceDeltaMinor: 500,
    });
    const delta = substitutionAdjustmentMinor(dearer);

    expect(delta).toBe(1_000);
    expect(checkAdjustment(ledger(), delta).ok).toBe(false);
  });
});

describe('settlement, prepaid', () => {
  it('leaves AKALT owing the merchant their goods plus the delivery fee, less commission', () => {
    const result = settleOrder(ledger(), TERMS);

    expect(result.goodsFulfilledMinor).toBe(20_000);
    expect(result.commissionMinor).toBe(2_000); // 10% of 200.00
    expect(result.settlementDirection).toBe('akalt_owes_merchant');
    expect(result.settlementAmountMinor).toBe(20_500); // 20,000 + 2,500 − 2,000
    expect(result.refundDueMinor).toBe(0);
  });

  it('refunds the customer the value of a removed item', () => {
    const input = ledger({ adjustments: [adjustment(-5_000, 'item_removed')] });
    const result = settleOrder(input, TERMS);

    expect(result.amountDueMinor).toBe(18_500);
    expect(result.goodsFulfilledMinor).toBe(15_000);
    expect(result.refundDueMinor).toBe(5_000);
    // Commission follows the goods down — we do not take a cut of something
    // the merchant never handed over. THIS is what "net fulfilled
    // merchandise" means, and it is why the base is folded from the
    // adjustments rather than read off the original basket.
    expect(result.commissionMinor).toBe(1_500);
    expect(result.settlementAmountMinor).toBe(16_000);
  });

  it('charges a goodwill credit to AKALT, not to the merchant', () => {
    const input = ledger({ adjustments: [adjustment(-1_000, 'goodwill')] });
    const result = settleOrder(input, TERMS);

    expect(result.amountDueMinor).toBe(22_500); // the customer pays less
    expect(result.goodsFulfilledMinor).toBe(20_000); // the merchant delivered it all
    expect(result.settlementAmountMinor).toBe(20_500); // and is paid in full
    // We collected 1,000 less and paid out the same: our apology, our margin.
  });

  it('charges a waived delivery fee to AKALT too', () => {
    const input = ledger({ adjustments: [adjustment(-2_500, 'fee_waived')] });
    const result = settleOrder(input, TERMS);

    expect(result.amountDueMinor).toBe(21_000);
    expect(result.goodsFulfilledMinor).toBe(20_000);
    expect(result.settlementAmountMinor).toBe(20_500);
  });
});

describe('settlement, cash on delivery', () => {
  it('REVERSES the direction, because the merchant is holding the cash', () => {
    // The rider took 235.00 at the door. The merchant has earned 205.00, so
    // they owe us the 30.00 difference — our service fee plus our commission.
    // A settlement model that assumes money only ever flows from AKALT to the
    // merchant invoices the wrong party here, every time.
    const result = settleOrder(ledger({ paymentMethod: 'cash_on_delivery' }), TERMS);

    expect(result.settlementDirection).toBe('merchant_owes_akalt');
    expect(result.settlementAmountMinor).toBe(3_000);
    // And it decomposes exactly into the two things AKALT is owed, which is
    // what makes the figure defensible in a reconciliation dispute.
    expect(result.commissionMinor + charge().serviceFeeMinor).toBe(
      result.settlementAmountMinor,
    );
  });

  it('never owes the customer a refund, because nothing was prepaid', () => {
    const input = ledger({
      paymentMethod: 'cash_on_delivery',
      capturedMinor: 0,
      adjustments: [adjustment(-5_000, 'item_removed')],
    });
    const result = settleOrder(input, TERMS);

    // The rider collects the ADJUSTED total at the door, so there is no
    // overpayment to give back.
    expect(result.amountDueMinor).toBe(18_500);
    expect(result.refundDueMinor).toBe(0);
  });
});

describe('commission arithmetic', () => {
  it('never touches the delivery or service fee', () => {
    // 10% of the 200.00 of merchandise, not of the 235.00 the customer paid.
    // There is no setting that changes this: a second basis option could only
    // ever produce an invoice that disagrees with the agreement.
    const result = settleOrder(ledger(), TERMS);
    expect(result.commissionMinor).toBe(2_000);

    const biggerFees = settleOrder(
      ledger({ charge: charge({ deliveryFeeMinor: 9_900, serviceFeeMinor: 5_000 }) }),
      TERMS,
    );
    expect(biggerFees.commissionMinor).toBe(2_000);
  });

  it('rounds to the nearest piastre rather than always down', () => {
    // 3.35 EGP at 10% is 0.335 — 34 piastres rounded, 33 floored. Always
    // flooring is a systematic transfer from us to the merchant across
    // thousands of orders; always ceiling is the reverse. Neither is
    // defensible as an accident.
    const result = settleOrder(
      ledger({ charge: charge({ itemsSubtotalMinor: 335 }) }),
      TERMS,
    );
    expect(result.commissionMinor).toBe(34);
  });

  it('takes no commission on an order with nothing left in it', () => {
    const input = ledger({ adjustments: [adjustment(-20_000, 'order_cancelled')] });
    const result = settleOrder(input, TERMS);

    expect(result.goodsFulfilledMinor).toBe(0);
    expect(result.commissionMinor).toBe(0);
  });
});

describe('which adjustments touch the merchant', () => {
  it('counts goods changes and excludes the ones AKALT absorbs', () => {
    expect(isGoodsAdjustment('substitution')).toBe(true);
    expect(isGoodsAdjustment('item_removed')).toBe(true);
    expect(isGoodsAdjustment('quantity_reduced')).toBe(true);
    expect(isGoodsAdjustment('order_cancelled')).toBe(true);

    expect(isGoodsAdjustment('fee_waived')).toBe(false);
    expect(isGoodsAdjustment('goodwill')).toBe(false);
  });
});
