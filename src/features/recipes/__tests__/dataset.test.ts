import { INGREDIENT_CATALOGUE } from '@/features/ingredients/catalogue';
import type { Recipe } from '@/types/domain';

import { emptyConstraints } from '../constraints';
import { buildIndexFor, checkRecipe, missingEssentials, suppliedKeys } from '../filter';
import { RECIPE_FIXTURES } from '../fixtures';

/**
 * Is the catalogue good enough to answer the product's question?
 *
 * `recipes:import` is the structural gate and `catalogue.test.ts` covers
 * variety in the abstract. This asks the thing that actually decides whether
 * the app works: can somebody with three ordinary ingredients get a useful,
 * DIFFERENT answer? A hundred and fifty recipes that all need the same eight
 * things is a dataset that passes every other check and helps nobody.
 *
 * Unlike `scripts/audit-recipes.ts` — which reports, and cannot import the
 * engine — this runs the real filter. When the two disagree, this is right.
 */

/** Four kitchens with almost nothing in common. */
const KITCHENS: Record<string, string[]> = {
  'chicken, rice, tomato': ['chicken breast', 'rice', 'tomatoes'],
  'eggs, cheese, tomato': ['eggs', 'white cheese', 'tomatoes'],
  'banana, oats, milk': ['banana', 'oats', 'milk'],
  'beef, pasta, tomato': ['ground beef', 'pasta', 'tomatoes'],
};

function reachable(have: string[], budget: number): Recipe[] {
  const constraints = emptyConstraints({
    availableIngredients: have,
    pantryMode: budget === 0 ? 'strict' : 'partial',
    maxMissingIngredients: budget,
    mustUseSomethingAvailable: true,
  });
  const index = buildIndexFor(constraints);
  const supplied = suppliedKeys(constraints);
  return RECIPE_FIXTURES.filter(
    (recipe) => checkRecipe(recipe, constraints, index, { supplied }) === null,
  );
}

describe('a small kitchen gets a useful answer', () => {
  it.each(Object.entries(KITCHENS))('%s reaches enough to choose from', (_label, have) => {
    // Not "some": a handful is the difference between a product and a demo.
    expect(reachable(have, 2).length).toBeGreaterThanOrEqual(5);
  });

  it.each(Object.entries(KITCHENS))('%s uses at least one thing you have', (_label, have) => {
    const supplied = suppliedKeys(
      emptyConstraints({ availableIngredients: have, pantryMode: 'partial' }),
    );
    for (const recipe of reachable(have, 2)) {
      const usesSomething = recipe.ingredients.some((line) =>
        [...supplied].some((key) => line.name.toLowerCase().includes(key.split(' ')[0]!)),
      );
      expect({ recipe: recipe.slug, usesSomething }).toEqual({
        recipe: recipe.slug,
        usesSomething: true,
      });
    }
  });

  it('gives different kitchens different answers', () => {
    // The bug report, as an assertion. Four disjoint kitchens produced four
    // near-identical lists because the engine was barely consulting them.
    const sets = Object.values(KITCHENS).map((have) =>
      reachable(have, 2)
        .map((r) => r.slug)
        .sort()
        .join('|'),
    );
    expect(new Set(sets).size).toBe(sets.length);
  });

  it('keeps the overlap between unrelated kitchens small', () => {
    // Stronger than "not identical". Two kitchens with nothing in common
    // answering with mostly the same dishes would mean the ingredients were
    // decoration.
    const savoury = new Set(reachable(KITCHENS['beef, pasta, tomato']!, 2).map((r) => r.slug));
    const sweet = new Set(reachable(KITCHENS['banana, oats, milk']!, 2).map((r) => r.slug));
    const shared = [...savoury].filter((slug) => sweet.has(slug)).length;
    expect(shared / Math.min(savoury.size, sweet.size)).toBeLessThan(0.35);
  });

  it('reports a gap budget the results actually honour', () => {
    for (const have of Object.values(KITCHENS)) {
      const constraints = emptyConstraints({
        availableIngredients: have,
        pantryMode: 'partial',
        maxMissingIngredients: 1,
        mustUseSomethingAvailable: true,
      });
      const index = buildIndexFor(constraints);
      for (const recipe of reachable(have, 1)) {
        expect(missingEssentials(recipe, index).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns only zero-gap recipes in exact mode', () => {
    for (const have of Object.values(KITCHENS)) {
      const constraints = emptyConstraints({
        availableIngredients: have,
        pantryMode: 'strict',
        mustUseSomethingAvailable: true,
      });
      const index = buildIndexFor(constraints);
      for (const recipe of reachable(have, 0)) {
        expect(missingEssentials(recipe, index)).toEqual([]);
      }
    }
  });
});

describe('the catalogue is diverse enough to matter', () => {
  const essentialSlugs = (recipe: Recipe) =>
    recipe.ingredients
      .filter((line) => !line.isOptional && !line.isGarnish)
      .map((line) => line.slug)
      .filter((slug): slug is string => slug !== null);

  it('covers fish and seafood, not only land protein', () => {
    // The launch market is on the Nile and the Mediterranean. Two fish
    // recipes in a hundred and fifty was a real gap, not a rounding error.
    const seafoodSlugs = new Set(
      INGREDIENT_CATALOGUE.filter(
        (i) => i.allergens.includes('fish') || i.allergens.includes('shellfish'),
      ).map((i) => i.slug),
    );
    const withSeafood = RECIPE_FIXTURES.filter((recipe) =>
      essentialSlugs(recipe).some((slug) => seafoodSlugs.has(slug)),
    );
    expect(withSeafood.length).toBeGreaterThanOrEqual(10);
  });

  it('does not pad the count with the same dish twice', () => {
    // Jaccard over essential ingredients. Two recipes sharing everything are
    // one recipe and a variant, whatever they are called — `banana-peanut-oats`
    // and a "smoothie" made of the identical six things were exactly that.
    const pairs: string[] = [];
    for (let i = 0; i < RECIPE_FIXTURES.length; i += 1) {
      for (let j = i + 1; j < RECIPE_FIXTURES.length; j += 1) {
        const left = new Set(essentialSlugs(RECIPE_FIXTURES[i]!));
        const right = new Set(essentialSlugs(RECIPE_FIXTURES[j]!));
        if (left.size === 0 || right.size === 0) continue;
        const shared = [...left].filter((slug) => right.has(slug)).length;
        const score = shared / (left.size + right.size - shared);
        if (score >= 0.9) {
          pairs.push(`${RECIPE_FIXTURES[i]!.slug} ~ ${RECIPE_FIXTURES[j]!.slug} (${score.toFixed(2)})`);
        }
      }
    }
    expect(pairs).toEqual([]);
  });

  it('spreads its ingredient use rather than leaning on a handful', () => {
    const used = new Set(RECIPE_FIXTURES.flatMap(essentialSlugs));
    expect(used.size).toBeGreaterThanOrEqual(120);
  });
});
