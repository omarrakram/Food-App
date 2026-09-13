import { RECIPE_FIXTURES } from '../fixtures';
import {
  applyConstraints,
  canCookWithAppliances,
  containsDislikedIngredient,
  rankRecipes,
  satisfiesDiet,
  satisfiesDietFlags,
  sortMatches,
  violatesAllergens,
} from '../rank';
import { makeRecipe, makeRecipeIngredient } from '@/test-utils/factories';
import type { Allergen, MealRequest } from '@/types/domain';

function baseRequest(overrides: Partial<MealRequest> = {}): MealRequest {
  return {
    mode: 'ingredients',
    ingredients: [],
    alwaysAvailableIngredients: [],
    maxMissingIngredients: null,
    budgetMinor: null,
    currency: 'EGP',
    country: 'EG',
    servings: 2,
    mealType: null,
    cuisine: null,
    maxMinutes: null,
    minProteinGrams: null,
    maxCalories: null,
    query: null,
    dietaryPreference: 'none',
    dietFlags: [],
    allergens: [],
    dislikedIngredients: [],
    appliances: [],
    skillLevel: 'intermediate',
    requiredIngredients: [],
    excludedIngredients: [],
    pantryMode: 'off',
    allowDislikedIngredients: false,
    ...overrides,
  };
}


function ingredient(name: string, isOptional = false) {
  return makeRecipeIngredient({ id: name, name, isOptional, sortOrder: 0 });
}

// ---------------------------------------------------------------------------
// Allergens. If any assertion in this block fails, the app can serve someone
// food that will hurt them.
// ---------------------------------------------------------------------------

describe('violatesAllergens', () => {
  it('catches an allergen the recipe declares', () => {
    const recipe = makeRecipe({ allergens: ['dairy'] });
    expect(violatesAllergens(recipe, ['dairy'])).toBe(true);
  });

  it('catches an allergen the recipe FAILED to declare but its ingredients imply', () => {
    // A mis-tagged recipe — exactly what a generated one might be.
    const recipe = makeRecipe({ allergens: [], ingredients: [ingredient('milk')] });
    expect(violatesAllergens(recipe, ['dairy'])).toBe(true);
  });

  it('catches an allergen carried by an OPTIONAL ingredient', () => {
    // An optional ingredient is still in the bowl if the cook adds it.
    const recipe = makeRecipe({ ingredients: [ingredient('walnuts', true)] });
    expect(violatesAllergens(recipe, ['nuts'])).toBe(true);
  });

  it('composes multiple allergies', () => {
    const recipe = makeRecipe({ ingredients: [ingredient('pasta')] });
    expect(violatesAllergens(recipe, ['shellfish', 'gluten'])).toBe(true);
    expect(violatesAllergens(recipe, ['shellfish', 'nuts'])).toBe(false);
  });

  it('passes a safe recipe through', () => {
    const recipe = makeRecipe({ ingredients: [ingredient('rice')] });
    expect(violatesAllergens(recipe, ['dairy', 'nuts'])).toBe(false);
  });

  it('is a no-op when the user has no allergies', () => {
    const recipe = makeRecipe({ allergens: ['dairy', 'nuts', 'gluten'] });
    expect(violatesAllergens(recipe, [])).toBe(false);
  });
});

describe('allergen filtering in rankRecipes', () => {
  const allergens: Allergen[] = ['dairy'];

  it('REMOVES an unsafe recipe rather than ranking it lower', () => {
    const safe = makeRecipe({ id: 'safe', ingredients: [ingredient('rice')] });
    const unsafe = makeRecipe({ id: 'unsafe', allergens: ['dairy'] });

    const matches = rankRecipes([safe, unsafe], baseRequest({ allergens }));

    expect(matches.map((entry) => entry.recipe.id)).toEqual(['safe']);
  });

  it('removes unsafe AI-generated recipes on the same code path', () => {
    // Generated recipes get no special trust: same filter, same result.
    const generated = makeRecipe({
      id: 'generated',
      source: 'ai_generated',
      allergens: [],
      ingredients: [ingredient('mozzarella')],
    });

    const matches = rankRecipes([generated], baseRequest({ allergens }));
    expect(matches).toHaveLength(0);
  });

  it('filters the real curated catalogue without exception', () => {
    const matches = rankRecipes(RECIPE_FIXTURES, baseRequest({ allergens: ['dairy', 'gluten'] }));

    for (const match of matches) {
      expect(violatesAllergens(match.recipe, ['dairy', 'gluten'])).toBe(false);
    }
    // Sanity: the filter is doing work, not returning everything.
    expect(matches.length).toBeLessThan(RECIPE_FIXTURES.length);
  });

  it('reports the exclusion reason so an empty result can be explained', () => {
    const unsafe = makeRecipe({ allergens: ['nuts'] });
    const [outcome] = applyConstraints([unsafe], baseRequest({ allergens: ['nuts'] }));

    expect(outcome?.excludedBy).toBe('allergen');
  });
});

// ---------------------------------------------------------------------------
// Diet
// ---------------------------------------------------------------------------

describe('satisfiesDiet', () => {
  it('accepts anything when the user has no restriction', () => {
    expect(satisfiesDiet(makeRecipe({ ingredients: [ingredient('ground beef')] }), 'none')).toBe(
      true,
    );
  });

  it('excludes meat and seafood for vegetarians, permits dairy and eggs', () => {
    expect(
      satisfiesDiet(makeRecipe({ ingredients: [ingredient('chicken breast')] }), 'vegetarian'),
    ).toBe(false);
    expect(satisfiesDiet(makeRecipe({ ingredients: [ingredient('tilapia')] }), 'vegetarian')).toBe(
      false,
    );
    expect(
      satisfiesDiet(
        makeRecipe({ ingredients: [ingredient('eggs'), ingredient('milk')] }),
        'vegetarian',
      ),
    ).toBe(true);
  });

  it('excludes dairy and eggs for vegans', () => {
    expect(
      satisfiesDiet(
        makeRecipe({ allergens: ['dairy'], ingredients: [ingredient('milk')] }),
        'vegan',
      ),
    ).toBe(false);
    expect(satisfiesDiet(makeRecipe({ ingredients: [ingredient('rice')] }), 'vegan')).toBe(true);
  });

  it('permits seafood but not meat for pescatarians', () => {
    expect(satisfiesDiet(makeRecipe({ ingredients: [ingredient('tilapia')] }), 'pescatarian')).toBe(
      true,
    );
    expect(
      satisfiesDiet(makeRecipe({ ingredients: [ingredient('ground beef')] }), 'pescatarian'),
    ).toBe(false);
  });

  it('uses the carb threshold for keto', () => {
    expect(
      satisfiesDiet(makeRecipe({ nutrition: { ...makeRecipe().nutrition, carbsGrams: 12 } }), 'keto'),
    ).toBe(true);
    expect(
      satisfiesDiet(makeRecipe({ nutrition: { ...makeRecipe().nutrition, carbsGrams: 80 } }), 'keto'),
    ).toBe(false);
  });

  it('does not assume an untagged AI recipe is halal', () => {
    const generated = makeRecipe({ source: 'ai_generated', dietTags: [] });
    const curated = makeRecipe({ source: 'curated', dietTags: [] });

    expect(satisfiesDiet(generated, 'halal')).toBe(false);
    expect(satisfiesDiet(curated, 'halal')).toBe(true);
  });

  it('honours an explicit diet tag', () => {
    const tagged = makeRecipe({
      source: 'ai_generated',
      dietTags: ['vegan'],
      ingredients: [ingredient('rice')],
    });
    expect(satisfiesDiet(tagged, 'vegan')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Appliances, dislikes, other constraints
// ---------------------------------------------------------------------------

describe('canCookWithAppliances', () => {
  it('excludes a recipe the kitchen cannot make', () => {
    const ovenRecipe = makeRecipe({ requiredAppliances: ['oven'] });
    expect(canCookWithAppliances(ovenRecipe, ['stove'])).toBe(false);
    expect(canCookWithAppliances(ovenRecipe, ['stove', 'oven'])).toBe(true);
  });

  it('does not filter when appliances are unknown', () => {
    expect(canCookWithAppliances(makeRecipe({ requiredAppliances: ['oven'] }), [])).toBe(true);
  });
});

describe('containsDislikedIngredient', () => {
  it('matches through normalisation', () => {
    const recipe = makeRecipe({ ingredients: [ingredient('tomatoes')] });
    expect(containsDislikedIngredient(recipe, ['Tomato'])).toBe(true);
  });

  it('ignores optional ingredients — the cook can leave them out', () => {
    const recipe = makeRecipe({ ingredients: [ingredient('coriander', true)] });
    expect(containsDislikedIngredient(recipe, ['coriander'])).toBe(false);
  });
});

describe('applyConstraints', () => {
  it('reports the first reason a recipe was excluded', () => {
    const recipe = makeRecipe({
      mealTypes: ['breakfast'],
      prepMinutes: 30,
      cookMinutes: 40,
    });

    expect(applyConstraints([recipe], baseRequest({ mealType: 'dinner' }))[0]?.excludedBy).toBe(
      'meal_type',
    );
    expect(applyConstraints([recipe], baseRequest({ maxMinutes: 20 }))[0]?.excludedBy).toBe('time');
    expect(
      applyConstraints([recipe], baseRequest({ minProteinGrams: 50 }))[0]?.excludedBy,
    ).toBe('protein');
    expect(applyConstraints([recipe], baseRequest({ maxCalories: 100 }))[0]?.excludedBy).toBe(
      'calories',
    );
  });

  it('keeps a recipe that satisfies everything', () => {
    expect(applyConstraints([makeRecipe()], baseRequest())[0]?.excludedBy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

describe('rankRecipes', () => {
  it('ranks a fully-matched recipe above one missing ingredients', () => {
    const complete = makeRecipe({ id: 'complete', ingredients: [ingredient('rice')] });
    const partial = makeRecipe({
      id: 'partial',
      ingredients: [ingredient('rice'), ingredient('shrimp'), ingredient('walnuts')],
    });

    const matches = rankRecipes([partial, complete], baseRequest({ ingredients: ['rice'] }));
    expect(matches[0]?.recipe.id).toBe('complete');
  });

  it('prices every result deterministically as an estimate', () => {
    const matches = rankRecipes(RECIPE_FIXTURES, baseRequest());

    for (const match of matches) {
      if (match.estimatedCost) {
        expect(match.estimatedCost.source).toBe('estimate');
        expect(match.estimatedCost.money.currency).toBe('EGP');
      }
    }
  });

  it('respects the limit', () => {
    expect(rankRecipes(RECIPE_FIXTURES, baseRequest(), { limit: 3 })).toHaveLength(3);
  });

  it('is deterministic — the same inputs give the same order', () => {
    const request = baseRequest({ ingredients: ['eggs', 'tomatoes'] });
    const first = rankRecipes(RECIPE_FIXTURES, request).map((entry) => entry.recipe.id);
    const second = rankRecipes(RECIPE_FIXTURES, request).map((entry) => entry.recipe.id);

    expect(first).toEqual(second);
  });
});

describe('sortMatches', () => {
  const matches = rankRecipes(RECIPE_FIXTURES, baseRequest());

  it('sorts cheapest first', () => {
    const sorted = sortMatches(matches, 'cheapest');
    const costs = sorted.map((entry) => entry.estimatedCost?.money.amountMinor ?? Infinity);

    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });

  it('sorts fastest first', () => {
    const sorted = sortMatches(matches, 'fastest');
    const times = sorted.map((entry) => entry.recipe.prepMinutes + entry.recipe.cookMinutes);

    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('sorts most protein first', () => {
    const sorted = sortMatches(matches, 'protein');
    const protein = sorted.map((entry) => entry.recipe.nutrition.proteinGrams ?? 0);

    expect([...protein].sort((a, b) => b - a)).toEqual(protein);
  });

  it('does not mutate the input', () => {
    const original = matches.map((entry) => entry.recipe.id);
    sortMatches(matches, 'cheapest');

    expect(matches.map((entry) => entry.recipe.id)).toEqual(original);
  });
});

/**
 * Before the split, diet was a single value: choosing "halal" overwrote
 * "vegetarian", so the app silently stopped honouring the eating style. These
 * pin the two down as independent constraints that compose.
 */
describe('diet flags compose with the eating style', () => {
  const ketoFriendly = makeRecipe({
    id: 'keto-ok',
    dietTags: [],
    nutrition: { calories: 400, proteinGrams: 30, carbsGrams: 10, fatGrams: 20, fiberGrams: 4 },
  });
  const carbHeavy = makeRecipe({
    id: 'carb-heavy',
    dietTags: [],
    nutrition: { calories: 700, proteinGrams: 20, carbsGrams: 90, fatGrams: 15, fiberGrams: 6 },
  });

  it('applies keto as its own constraint', () => {
    expect(satisfiesDietFlags(ketoFriendly, ['keto'])).toBe(true);
    expect(satisfiesDietFlags(carbHeavy, ['keto'])).toBe(false);
  });

  it('requires EVERY flag to pass, not just one', () => {
    // Curated, so halal passes; carb-heavy, so keto must fail the pair.
    expect(satisfiesDietFlags(carbHeavy, ['halal'])).toBe(true);
    expect(satisfiesDietFlags(carbHeavy, ['halal', 'keto'])).toBe(false);
  });

  it('treats no flags as no constraint', () => {
    expect(satisfiesDietFlags(carbHeavy, [])).toBe(true);
  });

  it('EXCLUDES via flags during ranking even when the eating style allows it', () => {
    const request = baseRequest({ dietaryPreference: 'none', dietFlags: ['keto'] });
    const outcomes = applyConstraints([ketoFriendly, carbHeavy], request);

    expect(outcomes.find((entry) => entry.recipe.id === 'keto-ok')?.excludedBy).toBeNull();
    expect(outcomes.find((entry) => entry.recipe.id === 'carb-heavy')?.excludedBy).toBe('diet');
  });

  it('enforces the style and the flag together', () => {
    const meaty = makeRecipe({
      id: 'meaty',
      dietTags: [],
      ingredients: [ingredient('chicken breast')],
      nutrition: { calories: 400, proteinGrams: 40, carbsGrams: 5, fatGrams: 15, fiberGrams: 2 },
    });
    const request = baseRequest({ dietaryPreference: 'vegetarian', dietFlags: ['keto'] });
    const outcomes = applyConstraints([meaty, ketoFriendly], request);

    // Keto alone would admit the chicken; vegetarian is still in force.
    expect(outcomes.find((entry) => entry.recipe.id === 'meaty')?.excludedBy).toBe('diet');
    expect(outcomes.find((entry) => entry.recipe.id === 'keto-ok')?.excludedBy).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ordering. Two rules, in this order: how many things you would still have to
// buy, and then — among recipes that ask the same of you — how much of what
// you actually named the dish uses.
// ---------------------------------------------------------------------------

describe('ordering puts what you can cook first', () => {
  const wanted = ['ground beef', 'pasta', 'tomatoes'];
  const request = baseRequest({
    ingredients: wanted,
    pantryMode: 'partial',
    maxMissingIngredients: 2,
  });

  const usesAllThree = makeRecipe({
    id: 'uses-all-three',
    title: 'Beef Ragu with Pasta',
    ingredients: [
      makeRecipeIngredient({ name: 'ground beef' }),
      makeRecipeIngredient({ name: 'pasta' }),
      makeRecipeIngredient({ name: 'tomatoes' }),
      makeRecipeIngredient({ name: 'carrots' }),
    ],
  });

  const usesOne = makeRecipe({
    id: 'uses-one',
    title: 'Tomato Bread',
    ingredients: [makeRecipeIngredient({ name: 'tomatoes' })],
  });

  it('ranks by how many things you would still have to buy, first', () => {
    // `usesOne` needs nothing you do not have; `usesAllThree` needs carrots.
    // The gap count is the promise the mode makes — "allow up to two missing"
    // has to mean the cookable ones come first — so it beats every other
    // signal, including how much of your shopping the other one uses.
    const ranked = rankRecipes([usesAllThree, usesOne], request);

    expect(ranked.map((match) => match.recipe.id)).toEqual(['uses-one', 'uses-all-three']);
  });

  it('and then by how much of what you named it actually uses', () => {
    // THE fix. Both of these are cookable right now, so the gap count cannot
    // separate them and coverage says they are both perfect. Someone who typed
    // "ground beef" wants the one with beef in it.
    const twoOfThree = makeRecipe({
      id: 'two-of-three',
      title: 'Beef and Tomatoes',
      ingredients: [
        makeRecipeIngredient({ name: 'ground beef' }),
        makeRecipeIngredient({ name: 'tomatoes' }),
      ],
    });

    const ranked = rankRecipes([usesOne, twoOfThree], request);

    expect(ranked.map((match) => match.recipe.id)).toEqual(['two-of-three', 'uses-one']);
  });

  it('does not order by gaps in budget mode, where no kitchen was described', () => {
    // Ordering on an answer nobody gave. A budget search is about the wallet.
    const ranked = rankRecipes([usesAllThree, usesOne], baseRequest({
      mode: 'budget',
      ingredients: [],
      budgetMinor: 20_000,
    }));

    expect(ranked.length).toBe(2);
  });
});
