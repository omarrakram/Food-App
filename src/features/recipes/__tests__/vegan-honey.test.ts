import { RECIPE_CATALOGUE } from '../catalogue.generated';
import { satisfiesDiet } from '../safety';

/**
 * Honey is an animal product, and nothing in the recipe schema says so.
 *
 * `satisfiesDiet` infers vegan and vegetarian from three signals: meat,
 * seafood, and the dairy and eggs allergens. Honey is none of those. So a
 * recipe of flour, yeast, sugar, oil and honey answered YES to vegan, and two
 * recipes already in the catalogue — cold sesame noodles and the peanut salad
 * — were tagged vegan while containing it.
 *
 * Nothing had exposed it because no recipe existed that was honey-sweetened
 * and otherwise plant-based. Writing one did. These tests are here so that
 * writing the next one does not.
 *
 * The rule has two halves and both matter, because a declared tag
 * short-circuits the inference: the ENGINE must not infer vegan through
 * honey, and the IMPORTER must not let a recipe declare it. The second half is
 * asserted in the dataset itself rather than in the importer, because the
 * dataset is what ships.
 */

const ANIMAL_PRODUCTS_WITHOUT_AN_ALLERGEN = ['honey', 'honeycomb', 'gelatin'] as const;

describe('honey is not vegan', () => {
  it('never infers vegan for a recipe containing one of them', () => {
    const wrong = RECIPE_CATALOGUE.filter(
      (recipe) =>
        recipe.ingredients.some((line) =>
          (ANIMAL_PRODUCTS_WITHOUT_AN_ALLERGEN as readonly string[]).includes(line.slug ?? ''),
        ) && satisfiesDiet(recipe, 'vegan'),
    ).map((recipe) => recipe.slug);

    expect(wrong).toEqual([]);
  });

  it('never lets one of them be DECLARED vegan, which would skip the inference', () => {
    const claimed = RECIPE_CATALOGUE.filter(
      (recipe) =>
        recipe.dietTags.includes('vegan') &&
        recipe.ingredients.some((line) =>
          (ANIMAL_PRODUCTS_WITHOUT_AN_ALLERGEN as readonly string[]).includes(line.slug ?? ''),
        ),
    ).map((recipe) => recipe.slug);

    expect(claimed).toEqual([]);
  });

  it('still calls a honey recipe vegetarian, because it is', () => {
    // The fix must not overshoot. Honey disqualifies vegan and nothing else.
    const honeyed = RECIPE_CATALOGUE.filter((recipe) =>
      recipe.ingredients.some((line) => line.slug === 'honey'),
    );
    expect(honeyed.length).toBeGreaterThan(0);

    const notVegetarian = honeyed
      .filter((recipe) => !recipe.ingredients.some((line) => line.slug === 'gelatin'))
      .filter((recipe) => recipe.dietTags.includes('vegetarian') && !satisfiesDiet(recipe, 'vegetarian'))
      .map((recipe) => recipe.slug);

    expect(notVegetarian).toEqual([]);
  });

  it('keeps the guard from being vacuous — the catalogue really does use honey', () => {
    const honeyed = RECIPE_CATALOGUE.filter((recipe) =>
      recipe.ingredients.some((line) => line.slug === 'honey'),
    ).map((recipe) => recipe.slug);

    // If this ever drops to zero the two tests above stop proving anything.
    // `lokmet-el-qadi` used to be named here and is not any more: it was
    // rewritten to the authentic sugar syrup, which is the correct dish and
    // happens to make it vegan.
    expect(honeyed.length).toBeGreaterThanOrEqual(3);
    expect(honeyed).toContain('batata-mashwiya');
  });
});
