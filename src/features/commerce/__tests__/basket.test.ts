import type { IngredientProductMapping, MerchantProduct } from '@/types/commerce';
import type { Availability } from '@/types/domain';

import { addableLines } from '../basket';
import type { SourcingLine, SourcingResult } from '../ports';
import { sourceLine, type SourcingCandidateInput, type SourcingContext } from '../sourcing';

/**
 * WHAT MAY BE PUT IN SOMEBODY'S BASKET WITHOUT THEM LOOKING AT IT.
 *
 * "Add 6 to cart" is a single tap that spends money on six decisions. Four of
 * the five sourcing statuses are open questions — is this the right product,
 * is it safe for this person, can the shop supply it, does the shop carry it
 * at all — and a bulk action that answered any of them silently would be the
 * app choosing what somebody eats. These tests drive the REAL sourcer rather
 * than hand-built `SourcedLine` literals, so a change to the status rules has
 * to come past them.
 */

function product(over: Partial<MerchantProduct> = {}): MerchantProduct {
  return {
    id: 'prod-a',
    merchantId: 'm-1',
    locationId: 'loc-1',
    externalId: 'x-1',
    sku: null,
    name: 'Fresh Chicken Breast 500g',
    nameAr: null,
    brand: null,
    packQuantity: 500,
    packUnit: 'g',
    price: { amountMinor: 9_000, currency: 'EGP' },
    availability: 'in_stock' as Availability,
    imageUrl: null,
    isActive: true,
    fetchedAt: '2026-09-23T09:00:00.000Z',
    ...over,
  };
}

function mapping(over: Partial<IngredientProductMapping> = {}): IngredientProductMapping {
  return {
    id: 'map-a',
    ingredientSlug: 'chicken-breast',
    merchantProductId: 'prod-a',
    confidence: 0.95,
    source: 'name_match',
    isVerified: true,
    verifiedAt: '2026-09-23T09:00:00.000Z',
    verifiedBy: 'ops',
    isBlocked: false,
    createdAt: '2026-09-23T09:00:00.000Z',
    updatedAt: '2026-09-23T09:00:00.000Z',
    ...over,
  };
}

function candidate(
  productOver: Partial<MerchantProduct> = {},
  mappingOver: Partial<IngredientProductMapping> = {},
): SourcingCandidateInput {
  return { product: product(productOver), mapping: mapping(mappingOver), productAllergens: [] };
}

const CONTEXT: SourcingContext = { avoidAllergens: [], perPieceFor: () => null };

function line(over: Partial<SourcingLine> = {}): SourcingLine {
  return {
    ingredientSlug: 'chicken-breast',
    quantity: 500,
    unit: 'g',
    amount: 'measured',
    sourceRecipeId: 'r-1',
    requestLineId: 'ri-1',
    ...over,
  };
}

function resultOf(
  cases: readonly { line: SourcingLine; candidates: readonly SourcingCandidateInput[] }[],
  context: SourcingContext = CONTEXT,
): SourcingResult {
  return {
    merchantId: 'm-1',
    locationId: 'loc-1',
    lines: cases.map((entry) => sourceLine(entry.line, entry.candidates, context)),
    unresolvedCount: 0,
  };
}

describe('only a matched line may be added without asking', () => {
  it('adds a confidently matched, in-stock, eligible product', () => {
    const result = resultOf([{ line: line(), candidates: [candidate()] }]);

    expect(result.lines[0]?.status).toBe('matched');
    expect(addableLines(result)).toHaveLength(1);
  });

  it('never adds a line whose allergen data nobody published', () => {
    // `null` allergens is NOT "no allergens". Nobody said either way, so the
    // sourcer says `needs_confirmation` — and a bulk add must respect that
    // even though a product is sitting right there, in stock, well mapped.
    const result = resultOf(
      [
        {
          line: line(),
          candidates: [{ ...candidate(), productAllergens: null }],
        },
      ],
      { avoidAllergens: ['gluten'], perPieceFor: () => null },
    );

    expect(result.lines[0]?.status).toBe('needs_confirmation');
    expect(result.lines[0]?.chosen).toBeNull();
    expect(addableLines(result)).toEqual([]);
  });

  it('never adds a line the shop has none of', () => {
    const result = resultOf([
      { line: line(), candidates: [candidate({ availability: 'out_of_stock' })] },
    ]);

    expect(result.lines[0]?.status).toBe('no_purchasable_match');
    expect(addableLines(result)).toEqual([]);
  });

  it('never adds a line every option of which conflicts with an allergy', () => {
    const result = resultOf(
      [{ line: line(), candidates: [{ ...candidate(), productAllergens: ['gluten'] }] }],
      { avoidAllergens: ['gluten'], perPieceFor: () => null },
    );

    expect(result.lines[0]?.status).toBe('no_eligible_match');
    expect(addableLines(result)).toEqual([]);
  });

  it('never adds an ingredient the shop does not carry', () => {
    const result = resultOf([{ line: line({ ingredientSlug: 'za-atar' }), candidates: [] }]);

    expect(result.lines[0]?.status).toBe('unmapped');
    expect(addableLines(result)).toEqual([]);
  });

  it('adds the matched lines of a mixed basket and leaves the rest alone', () => {
    const result = resultOf([
      { line: line({ requestLineId: 'ri-ok' }), candidates: [candidate()] },
      {
        line: line({ requestLineId: 'ri-gone' }),
        candidates: [candidate({ availability: 'out_of_stock' })],
      },
      { line: line({ requestLineId: 'ri-none' }), candidates: [] },
    ]);

    expect(addableLines(result).map((entry) => entry.requested.requestLineId)).toEqual(['ri-ok']);
  });

  it('refuses a blocked mapping however good it looks', () => {
    const result = resultOf([
      { line: line(), candidates: [candidate({}, { isBlocked: true })] },
    ]);

    expect(addableLines(result)).toEqual([]);
  });
});

describe('how many packs actually go in', () => {
  it('buys what the pack maths worked out', () => {
    const result = resultOf([
      { line: line({ quantity: 900, unit: 'g' }), candidates: [candidate()] },
    ]);

    expect(result.lines[0]?.chosen?.packsNeeded).toBe(2);
    expect(addableLines(result)).toHaveLength(1);
  });

  it('buys one pack for "to taste", which is the smallest thing on sale', () => {
    // The recipe gave no amount, so there is nothing to divide. One pack is
    // not an estimate of the amount — it is the floor, and the sourcer sets it
    // rather than the basket inventing it.
    const result = resultOf([
      {
        line: line({ quantity: null, unit: null, amount: 'to_taste' }),
        candidates: [candidate()],
      },
    ]);

    expect(result.lines[0]?.chosen?.packsNeeded).toBe(1);
    expect(addableLines(result)).toHaveLength(1);
  });

  it('buys one pack for an unquantified line too', () => {
    const result = resultOf([
      {
        line: line({ quantity: null, unit: null, amount: 'unspecified' }),
        candidates: [candidate()],
      },
    ]);

    expect(result.lines[0]?.chosen?.packsNeeded).toBe(1);
  });

  it('refuses to add a measured line the merchant never sized', () => {
    // Matched, in stock, eligible — and we still do not know whether one pack
    // is 200 g or 2 kg against a 500 g requirement. Under-buying is the error
    // the cook only finds with a pan already hot.
    const result = resultOf([
      {
        line: line({ quantity: 500, unit: 'g' }),
        candidates: [candidate({ packQuantity: null, packUnit: null })],
      },
    ]);

    expect(result.lines[0]?.status).toBe('matched');
    expect(result.lines[0]?.chosen?.packsNeeded).toBeNull();
    expect(addableLines(result)).toEqual([]);
  });

  it('refuses a measured line whose units do not convert', () => {
    const result = resultOf([
      {
        line: line({ quantity: 2, unit: 'cup' }),
        candidates: [candidate({ packQuantity: 12, packUnit: 'piece' })],
      },
    ]);

    expect(result.lines[0]?.chosen?.packsNeeded).toBeNull();
    expect(addableLines(result)).toEqual([]);
  });
});
