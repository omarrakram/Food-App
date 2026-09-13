import { makeRecipe, makeRecipeIngredient } from '@/test-utils/factories';
import type { PantryItem, Recipe } from '@/types/domain';

import { RECIPE_FIXTURES } from '../fixtures';
import { emptyConstraints, recipeContains, toRestriction } from '../constraints';
import {
  checkRecipe,
  buildIndexFor,
  filterRecipes,
  isSafetyReason,
  pantryCoverage,
  suggestRelaxations,
} from '../filter';

/**
 * Hard filtering, against the whole real catalogue wherever possible.
 *
 * The product promise these tests defend is narrow and absolute: **if the user
 * said no to something, it does not appear.** Not ranked lower. Not shown with
 * a warning. Absent.
 *
 * Several assertions run over all 153 recipes rather than a hand-built one,
 * because the failure mode being guarded against is "the filter works on the
 * example I wrote it for".
 */

const NOW = new Date('2026-09-13T12:00:00.000Z');

function pantryItem(name: string, overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: `pantry-${name}`,
    userId: 'user-1',
    ingredientId: 'ingredient-1',
    ingredientName: name,
    category: 'other',
    quantity: 1,
    unit: null,
    expiresOn: null,
    isStaple: false,
    note: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function surviving(recipes: readonly Recipe[], constraints = emptyConstraints(), options = {}) {
  return filterRecipes(recipes, constraints, { now: NOW, ...options })
    .filter((verdict) => !verdict.rejection)
    .map((verdict) => verdict.recipe);
}

// ---------------------------------------------------------------------------
// Excluded ingredients. If anything in this block fails, the app is serving
// someone food they explicitly refused.
// ---------------------------------------------------------------------------

describe('an excluded ingredient never appears', () => {
  it('removes every recipe containing it, across the whole catalogue', () => {
    const constraints = emptyConstraints({
      excludedIngredients: [toRestriction('bell pepper', 'hard_avoid')!],
    });

    const results = surviving(RECIPE_FIXTURES, constraints);
    const leaked = results.filter((recipe) => recipeContains(recipe, 'bell pepper'));

    expect(leaked.map((recipe) => recipe.slug)).toEqual([]);
    // And it actually removed something, or the assertion above is vacuous.
    expect(results.length).toBeLessThan(RECIPE_FIXTURES.length);
  });

  it('counts the aliases, because the user does not know our vocabulary', () => {
    // "capsicum", "red pepper" and «فلفل ألوان» are the same food. Excluding
    // any spelling has to exclude all of them.
    for (const spelling of ['capsicum', 'red pepper', 'فلفل ألوان', 'bell peppers']) {
      const constraints = emptyConstraints({
        excludedIngredients: [toRestriction(spelling, 'hard_avoid')!],
      });
      const leaked = surviving(RECIPE_FIXTURES, constraints).filter((recipe) =>
        recipeContains(recipe, 'bell pepper'),
      );
      expect({ spelling, leaked: leaked.map((r) => r.slug) }).toEqual({ spelling, leaked: [] });
    }
  });

  it('excludes on a garnish too, when the restriction is absolute', () => {
    const recipe = makeRecipe({
      ingredients: [
        makeRecipeIngredient({ name: 'rice', slug: 'rice' }),
        makeRecipeIngredient({ name: 'peanuts', slug: 'peanuts', isGarnish: true }),
      ],
    });

    const rejection = checkRecipe(
      recipe,
      emptyConstraints({ excludedIngredients: [toRestriction('peanuts', 'allergy')!] }),
      buildIndexFor(emptyConstraints()),
    );

    expect(rejection?.reason).toBe('excluded_ingredient');
  });

  it('tolerates a disliked garnish, because a dislike is a preference', () => {
    const recipe = makeRecipe({
      ingredients: [
        makeRecipeIngredient({ name: 'rice', slug: 'rice' }),
        makeRecipeIngredient({ name: 'coriander', slug: 'coriander', isGarnish: true }),
      ],
    });

    const rejection = checkRecipe(
      recipe,
      emptyConstraints({ excludedIngredients: [toRestriction('coriander', 'dislike')!] }),
      buildIndexFor(emptyConstraints()),
    );

    expect(rejection).toBeNull();
  });

  it('still removes a disliked ingredient when it is a real part of the dish', () => {
    const recipe = makeRecipe({
      ingredients: [makeRecipeIngredient({ name: 'coriander', slug: 'coriander' })],
    });

    const rejection = checkRecipe(
      recipe,
      emptyConstraints({ excludedIngredients: [toRestriction('coriander', 'dislike')!] }),
      buildIndexFor(emptyConstraints()),
    );

    expect(rejection?.reason).toBe('disliked_ingredient');
  });

  it('lets the user override a dislike but NEVER an allergy or a hard avoid', () => {
    const recipe = makeRecipe({
      ingredients: [
        makeRecipeIngredient({ name: 'coriander', slug: 'coriander' }),
        makeRecipeIngredient({ name: 'peanuts', slug: 'peanuts' }),
      ],
    });
    const index = buildIndexFor(emptyConstraints());

    const dislikeOverridden = checkRecipe(
      recipe,
      emptyConstraints({
        excludedIngredients: [toRestriction('coriander', 'dislike')!],
        allowDislikedIngredients: true,
      }),
      index,
    );
    expect(dislikeOverridden).toBeNull();

    for (const severity of ['allergy', 'hard_avoid'] as const) {
      const rejection = checkRecipe(
        recipe,
        emptyConstraints({
          excludedIngredients: [toRestriction('peanuts', severity)!],
          allowDislikedIngredients: true,
        }),
        index,
      );
      expect({ severity, reason: rejection?.reason }).toEqual({
        severity,
        reason: 'excluded_ingredient',
      });
    }
  });

  it('marks allergies and hard avoids as unrelaxable', () => {
    expect(isSafetyReason('allergen')).toBe(true);
    expect(isSafetyReason('excluded_ingredient')).toBe(true);
    expect(isSafetyReason('diet')).toBe(true);
    expect(isSafetyReason('time')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Allergens
// ---------------------------------------------------------------------------

describe('allergens', () => {
  it('removes every recipe carrying the allergen, declared or implied', () => {
    const constraints = emptyConstraints({ allergens: ['peanuts'] });
    const results = surviving(RECIPE_FIXTURES, constraints);

    const leaked = results.filter(
      (recipe) =>
        recipe.allergens.includes('peanuts') ||
        recipe.ingredients.some((line) => line.slug === 'peanuts' || line.slug === 'peanut-butter'),
    );

    expect(leaked.map((recipe) => recipe.slug)).toEqual([]);
  });

  it('applies every declared allergen at once', () => {
    const constraints = emptyConstraints({ allergens: ['gluten', 'dairy', 'eggs'] });
    const results = surviving(RECIPE_FIXTURES, constraints);

    for (const recipe of results) {
      for (const allergen of ['gluten', 'dairy', 'eggs'] as const) {
        expect({ slug: recipe.slug, allergen, has: recipe.allergens.includes(allergen) }).toEqual({
          slug: recipe.slug,
          allergen,
          has: false,
        });
      }
    }
    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Required ingredients
// ---------------------------------------------------------------------------

describe('required ingredients constrain rather than boost', () => {
  it('returns only recipes containing every required ingredient', () => {
    const constraints = emptyConstraints({ requiredIngredients: ['chicken', 'rice'] });
    const results = surviving(RECIPE_FIXTURES, constraints);

    expect(results.length).toBeGreaterThan(0);
    for (const recipe of results) {
      expect({
        slug: recipe.slug,
        chicken: recipeContains(recipe, 'chicken'),
        rice: recipeContains(recipe, 'rice'),
      }).toEqual({ slug: recipe.slug, chicken: true, rice: true });
    }
  });

  it('returns nothing rather than something close', () => {
    const constraints = emptyConstraints({
      requiredIngredients: ['chicken', 'chocolate', 'molokhia'],
    });
    expect(surviving(RECIPE_FIXTURES, constraints)).toEqual([]);
  });

  it('resolves a required ingredient through its aliases', () => {
    const byAlias = surviving(
      RECIPE_FIXTURES,
      emptyConstraints({ requiredIngredients: ['فراخ'] }),
    );
    const byName = surviving(
      RECIPE_FIXTURES,
      emptyConstraints({ requiredIngredients: ['chicken breast'] }),
    );

    expect(byAlias.length).toBeGreaterThan(0);
    expect(byAlias.map((r) => r.slug)).toEqual(expect.arrayContaining(byName.map((r) => r.slug)));
  });
});

// ---------------------------------------------------------------------------
// Pantry modes
// ---------------------------------------------------------------------------

describe('strict pantry mode means the user can actually cook it', () => {
  const shakshuka = RECIPE_FIXTURES.find((recipe) => recipe.slug === 'shakshuka')!;

  it('returns nothing when the kitchen is empty', () => {
    const constraints = emptyConstraints({ pantryMode: 'strict' });
    expect(surviving([shakshuka], constraints, { pantryItems: [] })).toEqual([]);
  });

  it('returns the recipe once every essential ingredient is present', () => {
    const essentials = shakshuka.ingredients
      .filter((line) => !line.isOptional && !line.isGarnish && !line.isPantryStaple)
      .map((line) => line.name);

    const constraints = emptyConstraints({ pantryMode: 'strict' });
    const results = surviving([shakshuka], constraints, {
      pantryItems: essentials.map((name) => pantryItem(name)),
    });

    expect(results.map((recipe) => recipe.slug)).toEqual(['shakshuka']);
  });

  it('does not demand salt and oil the user never listed', () => {
    // Background staples are in the dish but must not gate "can I cook this".
    const staples = shakshuka.ingredients.filter((line) => line.isPantryStaple);
    expect(staples.length).toBeGreaterThan(0);

    const essentials = shakshuka.ingredients
      .filter((line) => !line.isOptional && !line.isGarnish && !line.isPantryStaple)
      .map((line) => line.name);

    const results = surviving([shakshuka], emptyConstraints({ pantryMode: 'strict' }), {
      pantryItems: essentials.map((name) => pantryItem(name)),
    });

    expect(results).toHaveLength(1);
  });

  it('FOOD SAFETY: an expired pantry item does not count as available', () => {
    const essentials = shakshuka.ingredients
      .filter((line) => !line.isOptional && !line.isGarnish && !line.isPantryStaple)
      .map((line) => line.name);

    const withOneExpired = essentials.map((name, index) =>
      index === 0 ? pantryItem(name, { expiresOn: '2026-09-01' }) : pantryItem(name),
    );

    const results = surviving([shakshuka], emptyConstraints({ pantryMode: 'strict' }), {
      pantryItems: withOneExpired,
    });

    expect(results).toEqual([]);
  });

  it('counts an ingredient the user typed in, not only the pantry', () => {
    const essentials = shakshuka.ingredients
      .filter((line) => !line.isOptional && !line.isGarnish && !line.isPantryStaple)
      .map((line) => line.name);

    const results = surviving(
      [shakshuka],
      emptyConstraints({ pantryMode: 'strict', availableIngredients: essentials }),
    );

    expect(results).toHaveLength(1);
  });
});

describe('partial pantry mode admits recipes with gaps', () => {
  const shakshuka = RECIPE_FIXTURES.find((recipe) => recipe.slug === 'shakshuka')!;

  it('does not filter on availability at all', () => {
    const results = surviving([shakshuka], emptyConstraints({ pantryMode: 'partial' }), {
      pantryItems: [],
    });
    expect(results).toHaveLength(1);
  });

  it('reports coverage so the caller can rank and explain the gap', () => {
    const empty = buildIndexFor(emptyConstraints({ pantryMode: 'partial' }));
    expect(pantryCoverage(shakshuka, empty)).toBeLessThan(1);

    const full = buildIndexFor(
      emptyConstraints({
        pantryMode: 'partial',
        availableIngredients: shakshuka.ingredients.map((line) => line.name),
      }),
    );
    expect(pantryCoverage(shakshuka, full)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Everything else the user can ask for
// ---------------------------------------------------------------------------

describe('the ordinary filters are filters, not hints', () => {
  it('honours meal type', () => {
    const results = surviving(RECIPE_FIXTURES, emptyConstraints({ mealType: 'breakfast' }));
    expect(results.length).toBeGreaterThan(0);
    for (const recipe of results) expect(recipe.mealTypes).toContain('breakfast');
  });

  it('honours cuisine', () => {
    const results = surviving(RECIPE_FIXTURES, emptyConstraints({ cuisine: 'italian' }));
    expect(results.length).toBeGreaterThan(0);
    for (const recipe of results) expect(recipe.cuisine).toBe('italian');
  });

  it('honours a time limit', () => {
    const results = surviving(RECIPE_FIXTURES, emptyConstraints({ maxMinutes: 20 }));
    expect(results.length).toBeGreaterThan(0);
    for (const recipe of results) {
      expect(recipe.prepMinutes + recipe.cookMinutes).toBeLessThanOrEqual(20);
    }
  });

  it('honours a protein target', () => {
    const results = surviving(RECIPE_FIXTURES, emptyConstraints({ minProteinGrams: 30 }));
    expect(results.length).toBeGreaterThan(0);
    for (const recipe of results) {
      expect(recipe.nutrition.proteinGrams ?? 0).toBeGreaterThanOrEqual(30);
    }
  });

  it('honours a calorie ceiling', () => {
    const results = surviving(RECIPE_FIXTURES, emptyConstraints({ maxCalories: 300 }));
    expect(results.length).toBeGreaterThan(0);
    for (const recipe of results) expect(recipe.nutrition.calories ?? 0).toBeLessThanOrEqual(300);
  });

  it('never suggests a recipe needing an appliance the user does not have', () => {
    const results = surviving(RECIPE_FIXTURES, emptyConstraints({ appliances: ['stove'] }));
    expect(results.length).toBeGreaterThan(0);
    for (const recipe of results) {
      for (const appliance of recipe.requiredAppliances) expect(appliance).toBe('stove');
    }
  });

  it('honours a diet across the whole catalogue', () => {
    const results = surviving(RECIPE_FIXTURES, emptyConstraints({ eatingStyle: 'vegan' }));
    expect(results.length).toBeGreaterThanOrEqual(20);
    for (const recipe of results) {
      expect({ slug: recipe.slug, dairy: recipe.allergens.includes('dairy') }).toEqual({
        slug: recipe.slug,
        dairy: false,
      });
    }
  });

  it('applies several constraints at once without any of them being dropped', () => {
    const constraints = emptyConstraints({
      eatingStyle: 'vegetarian',
      allergens: ['nuts'],
      maxMinutes: 40,
      mealType: 'dinner',
      excludedIngredients: [toRestriction('mushroom', 'hard_avoid')!],
    });

    const results = surviving(RECIPE_FIXTURES, constraints);
    expect(results.length).toBeGreaterThan(0);

    for (const recipe of results) {
      expect(recipe.mealTypes).toContain('dinner');
      expect(recipe.prepMinutes + recipe.cookMinutes).toBeLessThanOrEqual(40);
      expect(recipe.allergens).not.toContain('nuts');
      expect(recipeContains(recipe, 'mushroom')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Zero results
// ---------------------------------------------------------------------------

describe('when nothing matches', () => {
  it('offers to relax the constraints that are actually costing results', () => {
    const constraints = emptyConstraints({ maxMinutes: 5, mealType: 'dessert' });
    expect(surviving(RECIPE_FIXTURES, constraints)).toEqual([]);

    const relaxations = suggestRelaxations(RECIPE_FIXTURES, constraints, { now: NOW });
    expect(relaxations.length).toBeGreaterThan(0);
    for (const relaxation of relaxations) expect(relaxation.wouldReturn).toBeGreaterThan(0);
  });

  it('NEVER offers to relax an allergy, a diet or a hard avoid', () => {
    const constraints = emptyConstraints({
      allergens: ['gluten', 'dairy', 'eggs', 'nuts', 'peanuts', 'fish', 'shellfish', 'soy', 'sesame'],
      eatingStyle: 'vegan',
      excludedIngredients: [toRestriction('rice', 'hard_avoid')!],
      maxMinutes: 10,
    });

    const relaxations = suggestRelaxations(RECIPE_FIXTURES, constraints, { now: NOW });
    const reasons = relaxations.map((relaxation) => relaxation.reason);

    expect(reasons).not.toContain('allergen');
    expect(reasons).not.toContain('diet');
    expect(reasons).not.toContain('excluded_ingredient');
  });

  it('reports honest counts — relaxing one thing at a time', () => {
    const constraints = emptyConstraints({ cuisine: 'italian', mealType: 'breakfast' });
    const relaxations = suggestRelaxations(RECIPE_FIXTURES, constraints, { now: NOW });

    for (const relaxation of relaxations) {
      const dropped =
        relaxation.reason === 'cuisine'
          ? emptyConstraints({ mealType: 'breakfast' })
          : emptyConstraints({ cuisine: 'italian' });
      expect(relaxation.wouldReturn).toBe(surviving(RECIPE_FIXTURES, dropped).length);
    }
  });
});
