import { INGREDIENTS_BY_SLUG } from '@/features/ingredients/catalogue';
import { CUISINES, DIFFICULTIES, MEAL_TYPES } from '@/types/domain';

import { RECIPE_CATALOGUE } from '../catalogue.generated';
import { COLLECTIONS, RECIPE_FIXTURES } from '../fixtures';

/**
 * The catalogue as a product asset, not just as valid data.
 *
 * `scripts/import-recipes.ts` already refuses to emit a dataset with a broken
 * ingredient reference or an undeclared allergen — that is the structural
 * gate. These assertions cover the things a schema cannot: is the catalogue
 * big enough to be a real product, is it varied enough to answer more than one
 * question, and did anyone quietly pad the count with fourteen near-identical
 * chicken traybakes.
 */

/** Below this the app is a demo, not a product. */
const MINIMUM_RECIPES = 150;

describe('the recipe catalogue is a real catalogue', () => {
  it(`has at least ${MINIMUM_RECIPES} recipes`, () => {
    expect(RECIPE_CATALOGUE.length).toBeGreaterThanOrEqual(MINIMUM_RECIPES);
  });

  it('gives every recipe a unique id and slug', () => {
    const ids = new Set(RECIPE_CATALOGUE.map((recipe) => recipe.id));
    const slugs = new Set(RECIPE_CATALOGUE.map((recipe) => recipe.slug));
    expect(ids.size).toBe(RECIPE_CATALOGUE.length);
    expect(slugs.size).toBe(RECIPE_CATALOGUE.length);
  });

  it('resolves every ingredient line to the canonical catalogue', () => {
    // A recipe ingredient with no catalogue slug cannot be excluded, required,
    // matched against a pantry, priced or translated. It is invisible to every
    // engine in the product.
    const orphans = RECIPE_CATALOGUE.flatMap((recipe) =>
      recipe.ingredients
        .filter((line) => !line.slug || !INGREDIENTS_BY_SLUG.has(line.slug))
        .map((line) => `${recipe.slug}: ${line.name}`),
    );

    expect(orphans).toEqual([]);
  });

  it('gives every recipe at least two ordered steps', () => {
    const bad = RECIPE_CATALOGUE.filter(
      (recipe) =>
        recipe.steps.length < 2 ||
        recipe.steps.some((step, index) => step.stepNumber !== index + 1),
    ).map((recipe) => recipe.slug);

    expect(bad).toEqual([]);
  });

  it('leaves every recipe with something a cook actually has to have', () => {
    // If every line is optional, a garnish or a staple, "can I cook this?"
    // answers yes for an empty kitchen.
    const bad = RECIPE_CATALOGUE.filter(
      (recipe) =>
        recipe.ingredients.filter(
          (line) => !line.isOptional && !line.isGarnish && !line.isPantryStaple,
        ).length === 0,
    ).map((recipe) => recipe.slug);

    expect(bad).toEqual([]);
  });

  it('keeps servings, times and nutrition inside believable bounds', () => {
    for (const recipe of RECIPE_CATALOGUE) {
      const total = recipe.prepMinutes + recipe.cookMinutes;
      expect(recipe.baseServings).toBeGreaterThanOrEqual(1);
      expect(recipe.baseServings).toBeLessThanOrEqual(12);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(600);
      if (recipe.nutrition.calories !== null) {
        expect(recipe.nutrition.calories).toBeGreaterThanOrEqual(40);
        expect(recipe.nutrition.calories).toBeLessThanOrEqual(2000);
      }
    }
  });

  it('uses only known cuisines, meal types and difficulties', () => {
    for (const recipe of RECIPE_CATALOGUE) {
      expect(CUISINES).toContain(recipe.cuisine);
      expect(DIFFICULTIES).toContain(recipe.difficulty);
      expect(recipe.mealTypes.length).toBeGreaterThan(0);
      for (const meal of recipe.mealTypes) expect(MEAL_TYPES).toContain(meal);
    }
  });

  it('records image provenance for every recipe that has a photograph', () => {
    const unlicensed = RECIPE_CATALOGUE.filter(
      (recipe) => recipe.image && (!recipe.image.license || !recipe.image.source),
    ).map((recipe) => recipe.slug);

    expect(unlicensed).toEqual([]);
  });

  it('has image metadata for every recipe', () => {
    // The branded fallback is meant to be the exception, not the normal state.
    const withoutImages = RECIPE_CATALOGUE.filter((recipe) => !recipe.image).map(
      (recipe) => recipe.slug,
    );

    expect(withoutImages).toEqual([]);
  });
});

describe('the catalogue is varied enough to answer more than one question', () => {
  const countBy = <T>(values: readonly T[]) => {
    const counts = new Map<T, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return counts;
  };

  it('covers every cuisine the app can filter by', () => {
    const byCuisine = countBy(RECIPE_CATALOGUE.map((recipe) => recipe.cuisine));
    const empty = CUISINES.filter((cuisine) => !byCuisine.get(cuisine));
    expect(empty).toEqual([]);
  });

  it('leads with the launch market', () => {
    const egyptian = RECIPE_CATALOGUE.filter((recipe) => recipe.cuisine === 'egyptian');
    expect(egyptian.length).toBeGreaterThanOrEqual(25);
  });

  it('covers every meal type, including the ones that are easy to forget', () => {
    const byMeal = countBy(RECIPE_CATALOGUE.flatMap((recipe) => recipe.mealTypes));
    for (const meal of MEAL_TYPES) {
      expect(byMeal.get(meal) ?? 0).toBeGreaterThanOrEqual(8);
    }
  });

  it('has enough for someone who does not eat meat', () => {
    const vegetarian = RECIPE_CATALOGUE.filter((recipe) =>
      recipe.dietTags.includes('vegetarian'),
    );
    const vegan = RECIPE_CATALOGUE.filter((recipe) => recipe.dietTags.includes('vegan'));

    expect(vegetarian.length).toBeGreaterThanOrEqual(40);
    expect(vegan.length).toBeGreaterThanOrEqual(25);
  });

  it('fills every Discover collection', () => {
    // An empty collection chip is a dead end the user taps once and distrusts.
    const empty = COLLECTIONS.filter(
      (collection) =>
        !RECIPE_FIXTURES.some((recipe) => recipe.tags.includes(collection.tag)),
    ).map((collection) => collection.slug);

    expect(empty).toEqual([]);
  });

  it('has quick options, because that is the most common ask', () => {
    const quick = RECIPE_CATALOGUE.filter(
      (recipe) => recipe.prepMinutes + recipe.cookMinutes <= 30,
    );
    expect(quick.length).toBeGreaterThanOrEqual(30);
  });

  it('has no-cook options for when the stove is not available', () => {
    const noCook = RECIPE_CATALOGUE.filter((recipe) => recipe.requiredAppliances.length === 0);
    expect(noCook.length).toBeGreaterThanOrEqual(8);
  });

  it('does not pad the count with near-duplicate titles', () => {
    // The importer enforces this at build time; asserting it here means a
    // hand-edited generated file cannot slip past.
    const normalised = RECIPE_CATALOGUE.map((recipe) =>
      recipe.title.toLowerCase().replace(/[^a-z0-9]/g, ''),
    );
    expect(new Set(normalised).size).toBe(normalised.length);
  });
});
