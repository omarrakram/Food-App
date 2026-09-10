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
