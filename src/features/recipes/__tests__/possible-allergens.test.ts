import { INGREDIENT_CATALOGUE } from '@/features/ingredients/catalogue';
import { makeRecipe, makeRecipeIngredient } from '@/test-utils/factories';

import { possibleAllergensOf, satisfiesDiet, violatesAllergens } from '../safety';

/**
 * Two different questions about one allergen.
 *
 * `allergens` means the food INTRINSICALLY contains it — milk is dairy, and
 * cannot not be. `possibleAllergens` means a commercial version MAY contain
 * it: generic corn flakes are corn, but mainstream Egyptian brands add barley
 * malt, and a beef patty is beef but commercial ones usually carry rusk.
 *
 * Before the second field existed, both of those were written into the first,
 * because the alternative — saying nothing — risks serving a coeliac user a
 * recipe that makes them ill. That was the right failure direction and the
 * wrong model: the same field also drives vegetarian and vegan filtering, so
 * "may contain dairy" would have made a dish non-vegan.
 *
 * The asymmetry these tests pin down:
 *   exclusion   identical. We do not ask someone with coeliac disease to read
 *               a label we already knew was risky.
 *   diet        ignores it entirely.
 *   declaration never automatic. A recipe does not "contain" what the box might.
 */

/**
 * A recipe built the way the importer builds one.
 *
 * `scripts/import-recipes.ts` refuses a recipe that does not DECLARE every
 * allergen its ingredients intrinsically carry, so a real milk recipe always
 * arrives with `dairy` on it — and `satisfiesDiet` reads that declared list.
 * Leaving it empty here made the first draft of these tests measure a recipe
 * shape that cannot exist, and report a diet bug that was not real.
 *
 * Crucially the derivation reads INTRINSIC allergens only, exactly as the
 * importer does. So a corn-flakes recipe declares nothing, and the exclusion
 * tests below have to work without a declaration to lean on.
 */
const recipeWith = (...slugs: string[]) => {
  const intrinsic = [
    ...new Set(slugs.flatMap((slug) => INGREDIENT_CATALOGUE.find((i) => i.slug === slug)?.allergens ?? [])),
  ];
  return makeRecipe({
    ingredients: slugs.map((slug, index) =>
      makeRecipeIngredient({ id: slug, name: slug, slug, sortOrder: index }),
    ),
    allergens: intrinsic,
    dietTags: [],
  });
};

const entry = (slug: string) => INGREDIENT_CATALOGUE.find((item) => item.slug === slug)!;

describe('the two fields mean different things', () => {
  it('does not make corn flakes or burger patties intrinsically gluten', () => {
    // The whole point. Corn flakes are made of corn; a beef patty is beef.
    for (const slug of ['corn-flakes', 'burger-patty']) {
      expect({ slug, intrinsic: entry(slug).allergens }).toEqual({ slug, intrinsic: [] });
      expect({ slug, possible: entry(slug).possibleAllergens }).toEqual({
        slug,
        possible: ['gluten'],
      });
    }
  });

  it('never lists the same allergen as both certain and possible', () => {
    // The import pipeline rejects this, and the catalogue is asserted here too
    // so the invariant holds for anyone reading the generated file directly.
    const contradictions = INGREDIENT_CATALOGUE.filter((item) =>
      item.possibleAllergens.some((allergen) => item.allergens.includes(allergen)),
    ).map((item) => item.slug);
    expect(contradictions).toEqual([]);
  });
});

describe('allergy filtering treats possible exactly as hard as intrinsic', () => {
  it('still hides generic corn flakes from someone avoiding gluten', () => {
    expect(violatesAllergens(recipeWith('corn-flakes'), ['gluten'])).toBe(true);
  });

  it('still hides generic burger patties from someone avoiding gluten', () => {
    expect(violatesAllergens(recipeWith('burger-patty'), ['gluten'])).toBe(true);
  });

  it('leaves intrinsic behaviour exactly as it was', () => {
    // `semolina` carries gluten intrinsically; `milk` carries dairy.
    expect(violatesAllergens(recipeWith('semolina'), ['gluten'])).toBe(true);
    expect(violatesAllergens(recipeWith('milk'), ['dairy'])).toBe(true);
    expect(violatesAllergens(recipeWith('milk'), ['gluten'])).toBe(false);
    expect(violatesAllergens(recipeWith('rice'), ['gluten'])).toBe(false);
  });

  it('does not exclude a user who did not declare that allergy', () => {
    expect(violatesAllergens(recipeWith('corn-flakes'), ['nuts'])).toBe(false);
    expect(violatesAllergens(recipeWith('corn-flakes'), [])).toBe(false);
  });
});

describe('diet semantics ignore possible allergens', () => {
  it('keeps corn flakes vegan and vegetarian', () => {
    const recipe = recipeWith('corn-flakes', 'rice');
    expect(satisfiesDiet(recipe, 'vegan')).toBe(true);
    expect(satisfiesDiet(recipe, 'vegetarian')).toBe(true);
  });

  it('does not let a possible allergen decide what a food fundamentally is', () => {
    // If `possibleAllergens` fed diet semantics, a `dairy` maybe on any
    // packaged product would quietly strip its vegan status. Corn flakes are
    // the live case: gluten is not a diet tag, so this asserts the principle
    // on the mechanism rather than on the one allergen that happens to apply.
    const cornFlakes = entry('corn-flakes');
    expect(cornFlakes.possibleAllergens.length).toBeGreaterThan(0);
    expect(satisfiesDiet(recipeWith('corn-flakes'), 'vegan')).toBe(true);
  });

  it('still refuses a diet the INTRINSIC allergens contradict', () => {
    expect(satisfiesDiet(recipeWith('milk'), 'vegan')).toBe(false);
    expect(satisfiesDiet(recipeWith('tilapia'), 'vegetarian')).toBe(false);
  });
});

describe('a possible allergen is never the recipe’s own declaration', () => {
  it('reports it separately so a reader can be told without the dish claiming it', () => {
    expect(possibleAllergensOf(recipeWith('corn-flakes'))).toEqual(['gluten']);
    // And the recipe itself declares nothing, because nothing in it certainly
    // contains gluten.
    expect(recipeWith('corn-flakes').allergens).toEqual([]);
  });

  it('does not repeat an allergen the dish certainly contains', () => {
    // Semolina brings gluten intrinsically, so the corn flakes add no doubt.
    expect(possibleAllergensOf(recipeWith('corn-flakes', 'semolina'))).toEqual([]);
  });

  it('is empty for a recipe with nothing brand-dependent in it', () => {
    expect(possibleAllergensOf(recipeWith('rice', 'tomatoes'))).toEqual([]);
  });
});
