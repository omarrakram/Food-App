import { INGREDIENTS_BY_SLUG } from '@/features/ingredients/catalogue';
import { CUISINES, DIFFICULTIES, MEAL_TYPES } from '@/types/domain';

import { RECIPE_CATALOGUE } from '../catalogue.generated';
import { COLLECTIONS, RECIPE_FIXTURES } from '../fixtures';
import { LOCAL_RECIPE_IMAGES } from '../image-assets.generated';

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

  it('never describes a photograph that is not there', () => {
    // THIS TEST USED TO DEMAND THE OPPOSITE, and that is how the defect got in.
    // It read "has image metadata for every recipe" and asserted every recipe
    // had a non-null `image`, on the reasoning that the branded fallback should
    // be the exception. So the ninety-four recipes WITHOUT a photograph were
    // given a block to satisfy it: `curated/<slug>.jpg`, "generated", "Akla
    // kitchen", CC0 — an asset that has never existed in this repository.
    //
    // A test that cannot be satisfied truthfully gets satisfied untruthfully.
    // The honest invariant is the one below: a non-null image block means a
    // real bundled photograph, and nothing else. `image: null` is the correct,
    // supported state for a recipe on the fallback, and RecipeImage draws the
    // branded plate from it.
    const lying = RECIPE_CATALOGUE.filter(
      (recipe) => recipe.image && !(recipe.slug && recipe.slug in LOCAL_RECIPE_IMAGES),
    ).map((recipe) => `${recipe.slug} → ${recipe.image?.path}`);

    expect(lying).toEqual([]);
  });

  it('gives every bundled photograph a recipe that points at it', () => {
    // The converse, so a promotion cannot bundle bytes the catalogue ignores.
    const unclaimed = Object.keys(LOCAL_RECIPE_IMAGES).filter((slug) => {
      const recipe = RECIPE_CATALOGUE.find((entry) => entry.slug === slug);
      return !recipe?.image;
    });

    expect(unclaimed).toEqual([]);
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

describe('the generated catalogue carries real database keys', () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('gives every ingredient line the catalogue ingredient it refers to', () => {
    // REGRESSION: the importer emitted `entry.id` for this, and catalogue
    // entries have no `id` — every one of the 1,318 lines shipped the literal
    // string 'undefined'. Nothing in the app read it, so nothing failed; the
    // first symptom would have been saving a recipe, where it is written into
    // a uuid column in Postgres.
    for (const recipe of RECIPE_FIXTURES) {
      for (const line of recipe.ingredients) {
        expect(line.ingredientId).toMatch(UUID);
      }
    }
  });

  it('gives one ingredient one id everywhere it appears', () => {
    // The id is derived from the slug, exactly as the seed generator derives
    // it, so the bundled catalogue and the seeded database agree on identity.
    const byId = new Map<string, string>();
    for (const recipe of RECIPE_FIXTURES) {
      for (const line of recipe.ingredients) {
        if (!line.slug) continue;
        const seen = byId.get(line.slug);
        if (seen) expect(line.ingredientId).toBe(seen);
        else byId.set(line.slug, line.ingredientId ?? '');
      }
    }
    expect(byId.size).toBeGreaterThan(150);
  });

  it('gives every recipe ingredient line its own row id', () => {
    for (const recipe of RECIPE_FIXTURES) {
      const ids = recipe.ingredients.map((line) => line.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(UUID);
    }
  });
});
