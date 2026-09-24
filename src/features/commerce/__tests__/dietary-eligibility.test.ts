import {
  PRODUCT_DIETS,
  type IngredientProductMapping,
  type MerchantProduct,
  type ProductDietaryProfile,
} from '@/types/commerce';
import { DIETARY_PREFERENCES, type Allergen, type Availability } from '@/types/domain';

import { addableLines } from '../basket';
import type { SourcingLine, SourcingResult } from '../ports';
import {
  eligibilityOf,
  requiredDietsFor,
  sourceLine,
  type SourcingCandidateInput,
  type SourcingContext,
} from '../sourcing';

/**
 * PRODUCT-LEVEL DIETARY SAFETY.
 *
 * A canonical ingredient and a packaged SKU are not the same question.
 * `tomatoes` is vegan; a particular tin of them may not be. Only the merchant
 * can answer for the product, and only if they publish it — so the third
 * state, UNKNOWN, is the one these tests spend most of their effort on.
 *
 * UNKNOWN IS NOT SAFE. It is unlabelled. A vegan whose merchant says nothing
 * about a product gets asked, never served.
 */

function product(over: Partial<MerchantProduct> = {}): MerchantProduct {
  return {
    id: 'prod-a',
    merchantId: 'm-1',
    locationId: 'loc-1',
    externalId: 'x-1',
    sku: null,
    name: 'Demo Product 500g',
    nameAr: null,
    brand: null,
    packQuantity: 500,
    packUnit: 'g',
    price: { amountMinor: 5_000, currency: 'EGP' },
    availability: 'in_stock' as Availability,
    imageUrl: null,
    isActive: true,
    fetchedAt: '2026-09-24T09:00:00.000Z',
    ...over,
  };
}

function mapping(over: Partial<IngredientProductMapping> = {}): IngredientProductMapping {
  return {
    id: 'map-a',
    ingredientSlug: 'tomatoes',
    merchantProductId: 'prod-a',
    confidence: 0.95,
    source: 'name_match',
    isVerified: false,
    verifiedAt: null,
    verifiedBy: null,
    isBlocked: false,
    createdAt: '2026-09-24T09:00:00.000Z',
    updatedAt: '2026-09-24T09:00:00.000Z',
    ...over,
  };
}

function candidate(
  diets: ProductDietaryProfile | null,
  allergens: readonly Allergen[] | null = [],
  mappingOver: Partial<IngredientProductMapping> = {},
): SourcingCandidateInput {
  return {
    product: product(),
    mapping: mapping(mappingOver),
    productAllergens: allergens,
    productDiets: diets,
  };
}

function context(over: Partial<SourcingContext> = {}): SourcingContext {
  return { avoidAllergens: [], requireDiets: [], perPieceFor: () => null, ...over };
}

const LINE: SourcingLine = {
  ingredientSlug: 'tomatoes',
  quantity: 500,
  unit: 'g',
  amount: 'measured',
  sourceRecipeId: 'r-1',
  requestLineId: 'ri-1',
};

function resultOf(input: SourcingCandidateInput, ctx: SourcingContext): SourcingResult {
  return {
    merchantId: 'm-1',
    locationId: 'loc-1',
    lines: [sourceLine(LINE, [input], ctx)],
    unresolvedCount: 0,
  };
}

// --- The user's own vocabulary, not a second one ---------------------------

describe('the product diets come from the app\'s one dietary taxonomy', () => {
  it('covers every dietary preference a product could satisfy or violate', () => {
    // `none` is not a claim and `other` is not checkable, so both are out.
    // Adding a real diet to the app without deciding about products here is a
    // silent gap for whoever keeps that diet, so it fails this instead.
    const expected = DIETARY_PREFERENCES.filter(
      (diet) => diet !== 'none' && diet !== 'other',
    ).sort();
    expect([...PRODUCT_DIETS].sort()).toEqual(expected);
  });

  it('folds the eating style and the diet flags into one list', () => {
    // A halal keto vegetarian is an ordinary person, not an edge case.
    expect(requiredDietsFor('vegetarian', ['halal', 'keto'])).toEqual([
      'vegetarian',
      'halal',
      'keto',
    ]);
  });

  it('treats "none" as no constraint rather than as a diet', () => {
    expect(requiredDietsFor('none', [])).toEqual([]);
  });
});

// --- The three states ------------------------------------------------------

describe('a SKU the merchant says is COMPATIBLE', () => {
  const input = candidate({ vegan: 'compatible', vegetarian: 'compatible' });

  it('is eligible for a vegan', () => {
    expect(eligibilityOf(input, context({ requireDiets: ['vegan'] }))).toBe('eligible');
  });

  it('is matched and can be added without asking', () => {
    const result = resultOf(input, context({ requireDiets: ['vegan'] }));
    expect(result.lines[0]?.status).toBe('matched');
    expect(addableLines(result)).toHaveLength(1);
  });
});

describe('a SKU the merchant says is INCOMPATIBLE', () => {
  const input = candidate({ vegan: 'incompatible', vegetarian: 'compatible' });

  it('is ineligible for a vegan', () => {
    expect(eligibilityOf(input, context({ requireDiets: ['vegan'] }))).toBe('ineligible');
  });

  it('produces no_eligible_match, and no product is offered as safe', () => {
    const result = resultOf(input, context({ requireDiets: ['vegan'] }));
    expect(result.lines[0]?.status).toBe('no_eligible_match');
    expect(result.lines[0]?.chosen).toBeNull();
    expect(result.lines[0]?.candidates).toEqual([]);
    expect(addableLines(result)).toEqual([]);
  });

  it('records WHY it was excluded, on the eligibility axis', () => {
    const result = resultOf(input, context({ requireDiets: ['vegan'] }));
    expect(result.lines[0]?.exclusions).toEqual([
      { productId: 'prod-a', axis: 'eligibility', reason: 'diet' },
    ]);
  });

  it('is still fine for the vegetarian it IS compatible with', () => {
    expect(eligibilityOf(input, context({ requireDiets: ['vegetarian'] }))).toBe('eligible');
  });
});

describe('a SKU the merchant has said NOTHING about', () => {
  it('is unknown when no dietary data is published at all', () => {
    expect(eligibilityOf(candidate(null), context({ requireDiets: ['vegan'] }))).toBe('unknown');
  });

  it('is unknown for a diet missing from a map that covers others', () => {
    // The merchant publishes a dietary section and is silent on halal. That
    // is not a halal certification.
    const partial = candidate({ vegan: 'compatible' });
    expect(eligibilityOf(partial, context({ requireDiets: ['halal'] }))).toBe('unknown');
  });

  it('asks rather than choosing, and is never auto-added', () => {
    const result = resultOf(candidate(null), context({ requireDiets: ['vegan'] }));
    expect(result.lines[0]?.status).toBe('needs_confirmation');
    expect(result.lines[0]?.chosen).toBeNull();
    expect(addableLines(result)).toEqual([]);
  });

  it('is still OFFERED, so the cook can look at it and decide', () => {
    // The distinction between "not for you" and "we cannot vouch for this" is
    // the whole point: one hides the product, the other shows it and waits.
    const result = resultOf(candidate(null), context({ requireDiets: ['vegan'] }));
    expect(result.lines[0]?.candidates).toHaveLength(1);
    expect(result.lines[0]?.candidates[0]?.reasons).toContain('eligibility_unknown');
  });
});

describe('a cook with no dietary restriction', () => {
  it('is unaffected by missing dietary data', () => {
    expect(eligibilityOf(candidate(null), context())).toBe('eligible');
  });

  it('is unaffected by an incompatible verdict they did not ask about', () => {
    // Somebody who is not vegan can buy the non-vegan product. Obvious, and
    // worth pinning: over-filtering is the other way to get this wrong.
    const result = resultOf(candidate({ vegan: 'incompatible' }), context());
    expect(result.lines[0]?.status).toBe('matched');
    expect(addableLines(result)).toHaveLength(1);
  });
});

// --- The two axes together -------------------------------------------------

describe('an allergy and a diet at the same time', () => {
  it('excludes on the allergen even when the diet is fine', () => {
    const input = candidate({ vegan: 'compatible' }, ['gluten']);
    const ctx = context({ avoidAllergens: ['gluten'], requireDiets: ['vegan'] });
    expect(eligibilityOf(input, ctx)).toBe('ineligible');
  });

  it('excludes on the diet even when the allergens are fine', () => {
    const input = candidate({ vegan: 'incompatible' }, []);
    const ctx = context({ avoidAllergens: ['gluten'], requireDiets: ['vegan'] });
    expect(eligibilityOf(input, ctx)).toBe('ineligible');
  });

  it('is unknown when EITHER axis is unpublished', () => {
    const noAllergenData = candidate({ vegan: 'compatible' }, null);
    const noDietData = candidate(null, []);
    const ctx = context({ avoidAllergens: ['gluten'], requireDiets: ['vegan'] });

    expect(eligibilityOf(noAllergenData, ctx)).toBe('unknown');
    expect(eligibilityOf(noDietData, ctx)).toBe('unknown');
  });

  it('lets a definite NO beat an unknown, rather than asking about a dead product', () => {
    // Diet says no, allergens unpublished. There is nothing to ask about: the
    // product is already out. Surfacing it as "we are not sure" would invite
    // the cook to confirm something we know is wrong for them.
    const input = candidate({ vegan: 'incompatible' }, null);
    const ctx = context({ avoidAllergens: ['gluten'], requireDiets: ['vegan'] });
    expect(eligibilityOf(input, ctx)).toBe('ineligible');
  });

  it('is eligible only when both axes are explicitly clear', () => {
    const input = candidate({ vegan: 'compatible', halal: 'compatible' }, ['soy']);
    const ctx = context({ avoidAllergens: ['gluten'], requireDiets: ['vegan', 'halal'] });
    expect(eligibilityOf(input, ctx)).toBe('eligible');
  });

  it('requires EVERY declared diet, not just the first', () => {
    const input = candidate({ vegan: 'compatible', halal: 'incompatible' });
    const ctx = context({ requireDiets: ['vegan', 'halal'] });
    expect(eligibilityOf(input, ctx)).toBe('ineligible');
  });
});

// --- Mapping strength does not buy dietary safety --------------------------

describe('a verified or hand-pinned mapping does NOT bypass dietary safety', () => {
  /*
    THE RULE COMMERCE-2 ESTABLISHED, now extended to diet.

    Mapping correctness and user eligibility are different questions. "A human
    confirmed this SKU is the tomatoes the recipe means" says nothing about
    whether that tin suits a vegan, and letting the first answer the second is
    how a confident mapping becomes a wrong purchase.
  */
  const ctx = context({ requireDiets: ['vegan'] });

  it('a VERIFIED mapping is still excluded by an incompatible verdict', () => {
    const input = candidate({ vegan: 'incompatible' }, [], {
      isVerified: true,
      verifiedAt: '2026-09-24T09:00:00.000Z',
      verifiedBy: 'ops',
    });
    expect(eligibilityOf(input, ctx)).toBe('ineligible');
    expect(resultOf(input, ctx).lines[0]?.status).toBe('no_eligible_match');
  });

  it('a MANUAL mapping is still excluded by an incompatible verdict', () => {
    const input = candidate({ vegan: 'incompatible' }, [], { source: 'manual', confidence: 1 });
    expect(eligibilityOf(input, ctx)).toBe('ineligible');
    expect(resultOf(input, ctx).lines[0]?.status).toBe('no_eligible_match');
  });

  it('a VERIFIED mapping with unpublished dietary data still only asks', () => {
    // The strongest possible mapping signal, and it still cannot answer a
    // question the merchant never answered.
    const input = candidate(null, [], {
      isVerified: true,
      source: 'manual',
      confidence: 1,
      verifiedAt: '2026-09-24T09:00:00.000Z',
      verifiedBy: 'ops',
    });
    const result = resultOf(input, ctx);
    expect(result.lines[0]?.status).toBe('needs_confirmation');
    expect(addableLines(result)).toEqual([]);
  });
});
