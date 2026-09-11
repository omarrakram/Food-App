import { RECIPES_BY_ID } from '@/features/recipes/fixtures';
import type { Recipe, RecipeIngredient } from '@/types/domain';

import { budgetVerdict, costOfIngredient, estimateRecipeCost, toPricedAmount } from '../estimate';
import type { PriceBook, PriceQuote } from '../price-book';

function line(overrides: Partial<RecipeIngredient> = {}): RecipeIngredient {
  return {
    id: 'line',
    ingredientId: null,
    name: 'rice',
    quantity: 300,
    unit: 'g',
    preparation: null,
    isOptional: false,
    sortOrder: 0,
    ...overrides,
  };
}

/** 100 EGP per kilo, so the arithmetic in these assertions is obvious. */
const perKiloQuote: PriceQuote = {
  amountMinor: 10000,
  currency: 'EGP',
  unit: 'kg',
  quantity: 1,
  lowMinor: 8000,
  highMinor: 12000,
  lastUpdated: '2026-08-01',
};

class FakePriceBook implements PriceBook {
  readonly country = 'EG' as const;
  readonly currency = 'EGP' as const;
  readonly lastUpdated = '2026-08-01';

  constructor(private readonly quotes: Record<string, PriceQuote | null>) {}

  quote(name: string): PriceQuote | null {
    return this.quotes[name] ?? null;
  }
}

describe('costOfIngredient', () => {
  it('scales a per-kilo price down to the amount actually used', () => {
    const cost = costOfIngredient(line({ quantity: 300, unit: 'g' }), perKiloQuote, null);
    expect(cost.amountMinor).toBe(3000);
    expect(cost.isApproximate).toBe(false);
  });

  it('carries the low and high bounds through the same scaling', () => {
    const cost = costOfIngredient(line({ quantity: 500, unit: 'g' }), perKiloQuote, null);
    expect(cost.lowMinor).toBe(4000);
    expect(cost.highMinor).toBe(6000);
  });

  it('converts countable units through the per-piece weight', () => {
    // 4 tomatoes at 120 g each = 480 g of a 100 EGP/kg ingredient.
    const cost = costOfIngredient(
      line({ name: 'tomatoes', quantity: 4, unit: 'piece' }),
      perKiloQuote,
      { unit: 'piece', grams: 120 },
    );
    expect(cost.amountMinor).toBe(4800);
  });

  it('uses a direct ratio when the units already agree', () => {
    const perCan: PriceQuote = { ...perKiloQuote, unit: 'can', quantity: 1, amountMinor: 5800 };
    const cost = costOfIngredient(line({ quantity: 2, unit: 'can' }), perCan, null);

    expect(cost.amountMinor).toBe(11600);
    expect(cost.isApproximate).toBe(false);
  });

  it('charges "to taste" nothing rather than a whole packet', () => {
    const cost = costOfIngredient(line({ quantity: null, unit: 'to_taste' }), perKiloQuote, null);
    expect(cost.amountMinor).toBe(0);
  });

  it('bills one whole unit and flags it when the units cannot be reconciled', () => {
    // Over-stating is the safe direction: a user is annoyed by a meal costing
    // less than predicted, not by one costing more.
    const perBunch: PriceQuote = { ...perKiloQuote, unit: 'bunch', quantity: 1 };
    const cost = costOfIngredient(line({ quantity: 2, unit: 'clove' }), perBunch, null);

    expect(cost.amountMinor).toBe(perBunch.amountMinor);
    expect(cost.isApproximate).toBe(true);
  });
});

describe('estimateRecipeCost', () => {
  const recipe: Pick<Recipe, 'ingredients' | 'baseServings'> = {
    baseServings: 2,
    ingredients: [
      line({ id: 'a', name: 'rice', quantity: 200, unit: 'g' }),
      line({ id: 'b', name: 'chicken', quantity: 300, unit: 'g' }),
      line({ id: 'c', name: 'garnish', quantity: 1, unit: 'bunch', isOptional: true }),
    ],
  };

  const book = new FakePriceBook({ rice: perKiloQuote, chicken: perKiloQuote });

  it('sums the required ingredients only', () => {
    const estimate = estimateRecipeCost(recipe, { priceBook: book });
    // 200 g + 300 g at 100 EGP/kg = 50 EGP. The optional garnish is excluded.
    expect(estimate.totalMinor).toBe(5000);
  });

  it('includes optional ingredients on request', () => {
    const withOptional = estimateRecipeCost(recipe, { priceBook: book, includeOptional: true });
    expect(withOptional.lines).toHaveLength(3);
  });

  it('scales with servings', () => {
    const forFour = estimateRecipeCost(recipe, { priceBook: book, servings: 4 });
    expect(forFour.totalMinor).toBe(10000);
  });

  it('reports per-serving cost', () => {
    const estimate = estimateRecipeCost(recipe, { priceBook: book, servings: 2 });
    expect(estimate.perServingMinor).toBe(2500);
  });

  it('COUNTS unpriced ingredients rather than silently treating them as free', () => {
    const partialBook = new FakePriceBook({ rice: perKiloQuote });
    const estimate = estimateRecipeCost(recipe, { priceBook: partialBook });

    expect(estimate.unpricedCount).toBe(1);
    expect(estimate.coverage).toBeCloseTo(0.5);
  });

  it('reports full coverage when everything is priced', () => {
    expect(estimateRecipeCost(recipe, { priceBook: book }).coverage).toBe(1);
  });

  it('prices the real curated catalogue', () => {
    const koshari = [...RECIPES_BY_ID.values()].find((entry) => entry.slug === 'koshari');
    expect(koshari).toBeDefined();

    const estimate = estimateRecipeCost(koshari!, { servings: koshari!.baseServings });
    expect(estimate.totalMinor).toBeGreaterThan(0);
    expect(estimate.coverage).toBe(1);
    expect(estimate.lowMinor).toBeLessThanOrEqual(estimate.totalMinor);
    expect(estimate.highMinor).toBeGreaterThanOrEqual(estimate.totalMinor);
  });
});

describe('toPricedAmount', () => {
  it('ALWAYS marks the result as an estimate', () => {
    // The product rule made structural: there is no code path from the local
    // pricing engine to a `live` price.
    const estimate = estimateRecipeCost(
      { baseServings: 2, ingredients: [line()] },
      { priceBook: new FakePriceBook({ rice: perKiloQuote }) },
    );

    expect(toPricedAmount(estimate).source).toBe('estimate');
  });

  it('flags a fallback when some ingredients were unpriced', () => {
    const estimate = estimateRecipeCost(
      { baseServings: 2, ingredients: [line({ name: 'unknown thing' })] },
      { priceBook: new FakePriceBook({}) },
    );

    expect(toPricedAmount(estimate).isFallback).toBe(true);
  });
});

describe('budgetVerdict', () => {
  it('classifies at and around the boundary', () => {
    expect(budgetVerdict(10000, 10000)).toBe('within');
    expect(budgetVerdict(9999, 10000)).toBe('within');
    expect(budgetVerdict(11000, 10000)).toBe('slightly_over');
    expect(budgetVerdict(11500, 10000)).toBe('slightly_over');
    expect(budgetVerdict(11501, 10000)).toBe('over');
  });

  it('treats a missing budget as no constraint', () => {
    expect(budgetVerdict(99999, 0)).toBe('within');
  });
});

// ---------------------------------------------------------------------------
// Price completeness.
//
// The bug these exist for: a shopping list containing salmon — which we have
// no price for — displayed a total of "~0 EGP" and counted as within budget.
// An incomplete total is a floor, not an answer, and the UI must be able to
// tell the difference.
// ---------------------------------------------------------------------------

describe('estimate completeness', () => {
  const twoLineRecipe: Pick<Recipe, 'ingredients' | 'baseServings'> = {
    baseServings: 2,
    ingredients: [
      line({ id: 'a', name: 'rice', quantity: 300, unit: 'g' }),
      line({ id: 'b', name: 'salmon', quantity: 200, unit: 'g' }),
    ],
  };

  it('reports complete when every required ingredient is priced', () => {
    const book = new FakePriceBook({ rice: perKiloQuote, salmon: perKiloQuote });
    const estimate = estimateRecipeCost(twoLineRecipe, { priceBook: book });

    expect(estimate.completeness).toBe('complete');
    expect(estimate.unpricedCount).toBe(0);
    expect(estimate.totalMinor).toBe(5000);
  });

  it('reports PARTIAL when one ingredient has no price, and does not count it as free', () => {
    const book = new FakePriceBook({ rice: perKiloQuote });
    const estimate = estimateRecipeCost(twoLineRecipe, { priceBook: book });

    expect(estimate.completeness).toBe('partial');
    expect(estimate.unpricedCount).toBe(1);
    // The total covers rice only. It is a floor, and the verdict must say so.
    expect(estimate.totalMinor).toBe(3000);
  });

  it('reports UNAVAILABLE when nothing could be priced, rather than a confident zero', () => {
    const estimate = estimateRecipeCost(twoLineRecipe, { priceBook: new FakePriceBook({}) });

    expect(estimate.completeness).toBe('unavailable');
    expect(estimate.totalMinor).toBe(0);
    expect(estimate.unpricedCount).toBe(2);
  });

  it('distinguishes a legitimate zero cost from an unknown one', () => {
    // "Salt to taste" has no quantity: genuinely free, and genuinely known.
    const freeRecipe: Pick<Recipe, 'ingredients' | 'baseServings'> = {
      baseServings: 2,
      ingredients: [line({ id: 'salt', name: 'salt', quantity: null, unit: 'to_taste' })],
    };
    const estimate = estimateRecipeCost(freeRecipe, {
      priceBook: new FakePriceBook({ salt: perKiloQuote }),
    });

    expect(estimate.totalMinor).toBe(0);
    expect(estimate.completeness).toBe('complete');
    expect(budgetVerdict(0, 15000, estimate.completeness)).toBe('within');
  });

  it('carries completeness onto the PricedAmount the UI renders from', () => {
    const partial = toPricedAmount(
      estimateRecipeCost(twoLineRecipe, { priceBook: new FakePriceBook({ rice: perKiloQuote }) }),
    );

    expect(partial.completeness).toBe('partial');
    expect(partial.unpricedCount).toBe(1);
  });
});

describe('budgetVerdict with incomplete data', () => {
  it('NEVER says "within" on a partial total, because the figure can only grow', () => {
    expect(budgetVerdict(3000, 15000, 'partial')).toBe('unknown');
    expect(budgetVerdict(3000, 15000, 'unavailable')).toBe('unknown');
  });

  it('still says "over" on a partial total — adding the missing prices cannot help', () => {
    expect(budgetVerdict(20000, 15000, 'partial')).toBe('over');
  });

  it('gives a definitive verdict only on complete data', () => {
    expect(budgetVerdict(3000, 15000, 'complete')).toBe('within');
    expect(budgetVerdict(16000, 15000, 'complete')).toBe('slightly_over');
    expect(budgetVerdict(30000, 15000, 'complete')).toBe('over');
  });

  it('defaults to treating a total as complete, so existing callers keep their meaning', () => {
    expect(budgetVerdict(3000, 15000)).toBe('within');
  });
});

describe('what the cook still has to buy', () => {
  const recipe: Pick<Recipe, 'ingredients' | 'baseServings'> = {
    baseServings: 2,
    ingredients: [
      line({ id: 'have', name: 'rice', quantity: 300, unit: 'g' }),
      line({ id: 'need', name: 'beef', quantity: 500, unit: 'g' }),
    ],
  };
  const book = new FakePriceBook({ rice: perKiloQuote, beef: perKiloQuote });

  it('excludes owned ingredients from the amount still to spend', () => {
    const estimate = estimateRecipeCost(recipe, { priceBook: book, ownedIngredientIds: ['have'] });

    expect(estimate.totalMinor).toBe(8000); // whole dish
    expect(estimate.toBuy?.totalMinor).toBe(5000); // just the beef
    expect(estimate.toBuy?.ownedCount).toBe(1);
    expect(estimate.toBuy?.completeness).toBe('complete');
  });

  it('leaves toBuy null when the pantry is unknown, rather than assuming it is empty', () => {
    const estimate = estimateRecipeCost(recipe, { priceBook: book });

    expect(estimate.toBuy).toBeNull();
  });

  it('is complete when the only unpriced ingredient is one they already own', () => {
    const partialBook = new FakePriceBook({ beef: perKiloQuote });
    const estimate = estimateRecipeCost(recipe, {
      priceBook: partialBook,
      ownedIngredientIds: ['have'],
    });

    // The dish as a whole cannot be priced, but their shopping trip can.
    expect(estimate.completeness).toBe('partial');
    expect(estimate.toBuy?.completeness).toBe('complete');
    expect(estimate.toBuy?.totalMinor).toBe(5000);
  });

  it('is partial when something they need has no price', () => {
    const partialBook = new FakePriceBook({ rice: perKiloQuote });
    const estimate = estimateRecipeCost(recipe, {
      priceBook: partialBook,
      ownedIngredientIds: ['have'],
    });

    expect(estimate.toBuy?.completeness).toBe('unavailable');
    expect(estimate.toBuy?.unpricedCount).toBe(1);
    expect(budgetVerdict(estimate.toBuy?.totalMinor ?? 0, 15000, estimate.toBuy?.completeness)).toBe(
      'unknown',
    );
  });

  it('scales the shopping portion with servings', () => {
    const forTwo = estimateRecipeCost(recipe, { priceBook: book, ownedIngredientIds: ['have'] });
    const forFour = estimateRecipeCost(recipe, {
      priceBook: book,
      ownedIngredientIds: ['have'],
      servings: 4,
    });

    expect(forFour.toBuy?.totalMinor).toBe((forTwo.toBuy?.totalMinor ?? 0) * 2);
  });

  it('costs nothing to buy when the cook owns everything', () => {
    const estimate = estimateRecipeCost(recipe, {
      priceBook: book,
      ownedIngredientIds: ['have', 'need'],
    });

    expect(estimate.toBuy?.totalMinor).toBe(0);
    expect(estimate.toBuy?.completeness).toBe('complete');
    expect(budgetVerdict(0, 15000, estimate.toBuy?.completeness)).toBe('within');
  });
});
