import type {
  IngredientProductMapping,
  MerchantProduct,
} from '@/types/commerce';
import type { Allergen, Availability } from '@/types/domain';

import type { SourcingLine } from '../ports';
import {
  eligibilityOf,
  sourceLine,
  sourceRequest,
  type SourcingCandidateInput,
  type SourcingContext,
} from '../sourcing';

/**
 * Which product to buy.
 *
 * A wrong SKU is a trust failure of a different order from a wrong recipe
 * suggestion: it is somebody's money, spent on the wrong thing, delivered to
 * their door. Every test here is a way that could happen.
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
    confidence: 0.9,
    source: 'name_match',
    isVerified: false,
    verifiedAt: null,
    verifiedBy: null,
    isBlocked: false,
    createdAt: '2026-09-23T09:00:00.000Z',
    updatedAt: '2026-09-23T09:00:00.000Z',
    ...over,
  };
}

function candidate(
  productOver: Partial<MerchantProduct> = {},
  mappingOver: Partial<IngredientProductMapping> = {},
  productAllergens: readonly Allergen[] | null = [],
): SourcingCandidateInput {
  const p = product(productOver);
  return { product: p, mapping: mapping({ merchantProductId: p.id, ...mappingOver }), productAllergens };
}

const CONTEXT: SourcingContext = {
  avoidAllergens: [],
  perPieceFor: () => null,
};

/** 500 g of chicken breast — the worked example throughout. */
const LINE: SourcingLine = {
  ingredientSlug: 'chicken-breast',
  quantity: 500,
  unit: 'g',
  sourceRecipeId: 'recipe-1',
};

describe('safety is a filter, never a weight', () => {
  it('removes a product carrying an allergen the cook must avoid', () => {
    // This product wins on EVERY other axis: verified, manual, in stock,
    // exact pack fit, and free. If allergens were a ranking weight it would
    // still come top. They are not, so it does not appear at all.
    const dangerous = candidate(
      { id: 'prod-marinated', price: { amountMinor: 1, currency: 'EGP' } },
      { isVerified: true, verifiedAt: '2026-09-23T09:00:00.000Z', source: 'manual' },
      ['dairy'],
    );
    const safe = candidate({ id: 'prod-plain' });

    const result = sourceLine(LINE, [dangerous, safe], {
      ...CONTEXT,
      avoidAllergens: ['dairy'],
    });

    expect(result.candidates.map((c) => c.product.id)).toEqual(['prod-plain']);
    expect(result.chosen?.product.id).toBe('prod-plain');
  });

  it('reports which axis removed each product', () => {
    const result = sourceLine(
      LINE,
      [
        candidate({ id: 'p-blocked' }, { isBlocked: true }),
        candidate({ id: 'p-delisted', isActive: false }),
        candidate({ id: 'p-nuts' }, {}, ['nuts']),
        candidate({ id: 'p-fine' }),
      ],
      { ...CONTEXT, avoidAllergens: ['nuts'] },
    );

    expect(result.exclusions).toEqual([
      { productId: 'p-blocked', axis: 'mapping', reason: 'blocked' },
      { productId: 'p-delisted', axis: 'purchasability', reason: 'delisted' },
      { productId: 'p-nuts', axis: 'eligibility', reason: 'allergen' },
    ]);
    expect(result.candidates.map((c) => c.product.id)).toEqual(['p-fine']);
  });

  it('separates mapping correctness from user eligibility', () => {
    const dairyProduct = candidate({}, {}, ['dairy']);

    // Same product, same mapping. Only the USER differs.
    expect(eligibilityOf(dairyProduct, CONTEXT)).toBe('eligible');
    expect(eligibilityOf(dairyProduct, { ...CONTEXT, avoidAllergens: ['dairy'] })).toBe(
      'ineligible',
    );
  });

  it('never proposes a mapping a human has refused', () => {
    // Blocked rows are kept rather than deleted precisely so the matcher
    // cannot re-derive the same wrong product next week.
    const blocked = candidate({ id: 'prod-wrong' }, { isBlocked: true, isVerified: false });
    const result = sourceLine(LINE, [blocked], CONTEXT);

    expect(result.status).toBe('unmapped');
    expect(result.candidates).toEqual([]);
  });
});

describe('a human beats a machine', () => {
  it('puts a verified mapping above a cheaper, better-fitting guess', () => {
    const verified = candidate(
      { id: 'prod-verified', price: { amountMinor: 12_000, currency: 'EGP' }, packQuantity: 1, packUnit: 'kg' },
      { isVerified: true, verifiedAt: '2026-09-23T09:00:00.000Z', confidence: 0.6 },
    );
    const guess = candidate(
      { id: 'prod-guess', price: { amountMinor: 5_000, currency: 'EGP' } },
      { confidence: 0.95, source: 'sku_exact' },
    );

    const result = sourceLine(LINE, [guess, verified], CONTEXT);

    expect(result.chosen?.product.id).toBe('prod-verified');
    expect(result.chosen?.reasons).toContain('verified_mapping');
  });

  it('puts a manual pin above a fuzzy name match, whatever the confidence says', () => {
    // `confidence` is a MATCHER score, and nothing computed one for a row a
    // human created by choosing the product. Gating the pin on it would mean
    // refusing to use the mapping we are surest of.
    const pinned = candidate({ id: 'prod-pinned' }, { source: 'manual', confidence: 0.5 });
    const fuzzy = candidate({ id: 'prod-fuzzy' }, { source: 'name_match', confidence: 0.99 });

    const result = sourceLine(LINE, [fuzzy, pinned], CONTEXT);

    expect(result.candidates[0]?.product.id).toBe('prod-pinned');
    expect(result.status).toBe('matched');
    expect(result.chosen?.product.id).toBe('prod-pinned');
  });
});

describe('stock beats a better match that is not there', () => {
  it('prefers in stock to low stock to unknown', () => {
    const inStock = candidate({ id: 'p-in', availability: 'in_stock' });
    const low = candidate({ id: 'p-low', availability: 'low_stock' });
    const unknown = candidate({ id: 'p-unk', availability: 'unknown' });

    const result = sourceLine(LINE, [unknown, low, inStock], CONTEXT);
    expect(result.candidates.map((c) => c.product.id)).toEqual(['p-in', 'p-low', 'p-unk']);
  });

  it('never chooses something out of stock, however strong its mapping', () => {
    // Verified AND manual AND the only option. Mapping relevance is not
    // purchasability: the strongest mapping in the catalogue is still not
    // something anybody can put in a bag today.
    const out = candidate(
      { id: 'p-out', availability: 'out_of_stock' },
      { isVerified: true, verifiedAt: 'x', source: 'manual' },
    );
    const result = sourceLine(LINE, [out], CONTEXT);

    expect(result.status).toBe('no_purchasable_match');
    expect(result.chosen).toBeNull();
    // Still listed: "usually this one, currently unavailable" is useful, and
    // hiding it would make the ingredient look unmapped when it is not.
    expect(result.candidates).toHaveLength(1);
  });

  it('distinguishes "cannot be bought" from "we do not stock it"', () => {
    // Every mapping delisted. Reporting `unmapped` would read as a catalogue
    // gap for us to fix; the truth is that we mapped it and the merchant
    // dropped the product.
    const delisted = sourceLine(LINE, [candidate({ id: 'p-gone', isActive: false })], CONTEXT);
    expect(delisted.status).toBe('no_purchasable_match');

    const nothing = sourceLine(LINE, [], CONTEXT);
    expect(nothing.status).toBe('unmapped');
  });

  it('reports no eligible match when every option is ruled out for this user', () => {
    const result = sourceLine(
      LINE,
      [candidate({ id: 'p-a' }, {}, ['dairy']), candidate({ id: 'p-b' }, {}, ['dairy'])],
      { ...CONTEXT, avoidAllergens: ['dairy'] },
    );

    expect(result.status).toBe('no_eligible_match');
    expect(result.chosen).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});

describe('price means what it actually costs', () => {
  it('compares effective cost, not shelf price', () => {
    // 500 g needed. Two 450 g packs at 50.00 is 100.00; one 1 kg pack at
    // 90.00 is 90.00. The shelf price says the small pack is cheaper and the
    // shelf price is wrong — this is the classic supermarket-app error.
    const small = candidate({
      id: 'p-small',
      packQuantity: 450,
      packUnit: 'g',
      price: { amountMinor: 5_000, currency: 'EGP' },
    });
    const large = candidate({
      id: 'p-large',
      packQuantity: 1,
      packUnit: 'kg',
      price: { amountMinor: 9_000, currency: 'EGP' },
    });

    const result = sourceLine(LINE, [small, large], CONTEXT);

    expect(result.candidates[0]?.effectiveCostMinor).toBe(9_000);
    expect(result.candidates[1]?.effectiveCostMinor).toBe(10_000);
    expect(result.chosen?.product.id).toBe('p-large');
  });

  it('marks the least wasteful of several imperfect fits', () => {
    // 500 g wanted. 600 g wastes least of the three, and saying which one is
    // "smallest overbuy" is the difference between a ranking and a black box.
    const tight = candidate({ id: 'p-600', packQuantity: 600, packUnit: 'g' });
    const loose = candidate({ id: 'p-900', packQuantity: 900, packUnit: 'g' });
    const huge = candidate({ id: 'p-2000', packQuantity: 2, packUnit: 'kg' });

    const result = sourceLine(LINE, [huge, loose, tight], CONTEXT);

    expect(result.candidates[0]?.product.id).toBe('p-600');
    expect(result.candidates[0]?.reasons).toContain('smallest_overbuy');
    expect(result.candidates[1]?.reasons).toContain('overbuy');
    expect(result.candidates[1]?.reasons).not.toContain('smallest_overbuy');
  });

  it('does not penalise the only candidate for being the dearest', () => {
    const only = candidate({ id: 'p-only' });
    const result = sourceLine(LINE, [only], CONTEXT);
    expect(result.chosen?.reasons).toContain('lowest_effective_cost');
  });
});

describe('pack fit', () => {
  it('prefers the size that wastes less', () => {
    const exact = candidate({
      id: 'p-exact',
      packQuantity: 500,
      packUnit: 'g',
      price: { amountMinor: 9_000, currency: 'EGP' },
    });
    const oversized = candidate({
      id: 'p-big',
      packQuantity: 5,
      packUnit: 'kg',
      price: { amountMinor: 9_000, currency: 'EGP' },
    });

    const result = sourceLine(LINE, [oversized, exact], CONTEXT);
    expect(result.chosen?.product.id).toBe('p-exact');
    expect(result.chosen?.reasons).toContain('exact_quantity_fit');
  });

  it('flags a pack whose size the merchant has not told us', () => {
    const sizeless = candidate({ id: 'p-sizeless', packQuantity: null, packUnit: null });
    const result = sourceLine(LINE, [sizeless], CONTEXT);

    expect(result.candidates[0]?.packsNeeded).toBeNull();
    expect(result.candidates[0]?.reasons).toContain('pack_size_unknown');
  });
});

describe('when it is not sure, it asks', () => {
  it('needs confirmation below the confidence bar', () => {
    const shaky = candidate({ id: 'p-shaky' }, { confidence: 0.4, isVerified: false });
    const result = sourceLine(LINE, [shaky], CONTEXT);

    expect(result.status).toBe('needs_confirmation');
    expect(result.chosen).toBeNull();
    // The options are still returned — the cook picks one, rather than being
    // told nothing matched.
    expect(result.candidates).toHaveLength(1);
  });

  it('matches at or above the bar', () => {
    const solid = candidate({ id: 'p-solid' }, { confidence: 0.75, isVerified: false });
    expect(sourceLine(LINE, [solid], CONTEXT).status).toBe('matched');
  });

  it('a verified mapping matches however low its confidence is', () => {
    // Verification is a person saying "yes, this one". A number computed by a
    // matcher does not overrule it.
    const verified = candidate(
      { id: 'p-v' },
      { confidence: 0.1, isVerified: true, verifiedAt: '2026-09-23T09:00:00.000Z' },
    );
    expect(sourceLine(LINE, [verified], CONTEXT).status).toBe('matched');
  });

  it('reports nothing mapped when there is nothing to offer', () => {
    const result = sourceLine(LINE, [], CONTEXT);
    expect(result).toEqual({
      requested: LINE,
      status: 'unmapped',
      candidates: [],
      chosen: null,
      exclusions: [],
    });
  });
});

describe('the same basket ranks the same way twice', () => {
  it('breaks ties on product id rather than input order', () => {
    // Two products identical in every scored respect. Without the final
    // tie-break the order is whatever the database returned, the list
    // reshuffles on refresh, and the suite passes on Tuesday and fails on
    // Wednesday.
    const first = candidate({ id: 'prod-aaa' });
    const second = candidate({ id: 'prod-bbb' });

    const forward = sourceLine(LINE, [first, second], CONTEXT);
    const reversed = sourceLine(LINE, [second, first], CONTEXT);

    expect(forward.candidates.map((c) => c.product.id)).toEqual(['prod-aaa', 'prod-bbb']);
    expect(reversed.candidates.map((c) => c.product.id)).toEqual(['prod-aaa', 'prod-bbb']);
    expect(forward.candidates[0]?.score).toBe(reversed.candidates[0]?.score);
  });
});

describe('sourcing a whole basket', () => {
  it('counts what the cook still has to resolve', () => {
    const lines: SourcingLine[] = [
      { ingredientSlug: 'chicken-breast', quantity: 500, unit: 'g', sourceRecipeId: 'r1' },
      { ingredientSlug: 'cream', quantity: 200, unit: 'ml', sourceRecipeId: 'r1' },
      { ingredientSlug: 'parmesan', quantity: 50, unit: 'g', sourceRecipeId: 'r1' },
    ];

    const result = sourceRequest(
      { lines, merchantId: 'm-1', locationId: 'loc-1' },
      (slug) => {
        if (slug === 'chicken-breast') return [candidate({ id: 'p-chicken' })];
        if (slug === 'cream') {
          return [candidate({ id: 'p-cream' }, { confidence: 0.3 })];
        }
        return []; // parmesan is not mapped at this merchant
      },
      CONTEXT,
    );

    expect(result.lines.map((l) => l.status)).toEqual([
      'matched',
      'needs_confirmation',
      'unmapped',
    ]);
    expect(result.unresolvedCount).toBe(2);
  });
});

describe('a manual mapping settles what a SKU is, not who may have it', () => {
  /**
   * The rule this whole block exists for: verification is an assertion about
   * MAPPING CORRECTNESS. A human confirming that Brand X Milk 1L is milk has
   * said nothing about whether this particular cook can drink it, and nothing
   * about whether the shop has any. If verification could override either, a
   * hand-checked mapping would be a route to handing somebody an allergen.
   */
  const handChecked = { isVerified: true, verifiedAt: 'x', source: 'manual' as const };

  it('overrides the confidence bar', () => {
    const pinned = candidate({ id: 'p-pin' }, { ...handChecked, confidence: 0.05 });
    expect(sourceLine(LINE, [pinned], CONTEXT).status).toBe('matched');
  });

  it('does NOT override an allergen', () => {
    const pinned = candidate({ id: 'p-pin' }, handChecked, ['dairy']);
    const result = sourceLine(LINE, [pinned], { ...CONTEXT, avoidAllergens: ['dairy'] });

    expect(result.status).toBe('no_eligible_match');
    expect(result.chosen).toBeNull();
    expect(result.exclusions).toEqual([
      { productId: 'p-pin', axis: 'eligibility', reason: 'allergen' },
    ]);
  });

  it('does NOT override the shelf being empty', () => {
    const pinned = candidate({ id: 'p-pin', availability: 'out_of_stock' }, handChecked);
    const result = sourceLine(LINE, [pinned], CONTEXT);

    expect(result.status).toBe('no_purchasable_match');
    expect(result.chosen).toBeNull();
  });

  it('does NOT override the product being delisted', () => {
    const pinned = candidate({ id: 'p-pin', isActive: false }, handChecked);
    expect(sourceLine(LINE, [pinned], CONTEXT).status).toBe('no_purchasable_match');
  });
});

describe('missing allergen data is not an absence of allergens', () => {
  /**
   * `null` means the merchant publishes nothing; `[]` means they declare none.
   * Treating them alike would mean that the day we integrate a catalogue
   * without allergen data, every product silently becomes safe for everybody —
   * quietly, at scale, for exactly the users who can least afford it.
   */
  it('will not auto-select an unknown for a cook with allergies', () => {
    const unknownData = candidate({ id: 'p-unknown' }, { isVerified: true, verifiedAt: 'x' }, null);
    const result = sourceLine(LINE, [unknownData], { ...CONTEXT, avoidAllergens: ['dairy'] });

    expect(result.status).toBe('needs_confirmation');
    expect(result.chosen).toBeNull();
    // Offered, not hidden: the cook can look at the packet themselves, which
    // is more than we can do.
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.reasons).toContain('eligibility_unknown');
  });

  it('is irrelevant to a cook with no restrictions', () => {
    const unknownData = candidate({ id: 'p-unknown' }, { isVerified: true, verifiedAt: 'x' }, null);
    const result = sourceLine(LINE, [unknownData], CONTEXT);

    expect(result.status).toBe('matched');
    // And the reason is not emitted at all, rather than emitted as noise on
    // every line of every basket.
    expect(result.candidates[0]?.reasons).not.toContain('eligibility_unknown');
    expect(result.candidates[0]?.reasons).not.toContain('dietary_eligible');
  });

  it('prefers a declared-safe product over one with no data', () => {
    const declared = candidate({ id: 'p-declared' }, {}, []);
    const silent = candidate({ id: 'p-silent' }, {}, null);

    const result = sourceLine(LINE, [silent, declared], {
      ...CONTEXT,
      avoidAllergens: ['dairy'],
    });

    expect(result.status).toBe('matched');
    expect(result.chosen?.product.id).toBe('p-declared');
    expect(result.chosen?.reasons).toContain('dietary_eligible');
  });
});
