import { RECIPE_CATALOGUE } from '../catalogue.generated';
import { emptyConstraints } from '../constraints';
import { buildIndexFor, checkRecipe } from '../filter';

/**
 * A required appliance is a HARD FILTER, so declaring one you do not need
 * deletes the recipe from somebody's results.
 *
 * `salatet-tahina` declared `["other"]`. It is a bowl, a spoon and a lemon —
 * it needs no equipment at all. A user who ticked their actual kitchen (stove,
 * oven, blender) and did not tick the meaningless "other" box lost a sauce
 * that needs nothing, and nothing in the app would have explained why.
 *
 * Nineteen no-equipment recipes already expressed this correctly with an empty
 * array, so this was one recipe out of step with an established convention
 * rather than a missing rule. These tests make the convention enforceable.
 */

const EQUIPMENT = ['stove', 'oven', 'blender', 'kettle', 'microwave'] as const;

describe('a recipe that needs no equipment says so', () => {
  it('keeps a no-cook recipe when the user lists their real kitchen', () => {
    const tahina = RECIPE_CATALOGUE.find((recipe) => recipe.slug === 'salatet-tahina');
    expect(tahina).toBeDefined();

    // The exact shape of the bug: real appliances ticked, "other" not.
    const constraints = emptyConstraints({ appliances: [...EQUIPMENT] });
    const index = buildIndexFor(constraints);

    expect(checkRecipe(tahina!, constraints, index)).toBeNull();
  });

  it('refuses the placeholder appliance across the whole catalogue', () => {
    // "other" as a REQUIREMENT cannot mean anything a user could tick. If a
    // recipe genuinely needs an unusual tool, name it; if it needs nothing,
    // require nothing.
    const placeholder = RECIPE_CATALOGUE.filter((recipe) =>
      recipe.requiredAppliances.includes('other'),
    ).map((recipe) => recipe.slug);

    expect(placeholder).toEqual([]);
  });

  it('never loses a no-equipment recipe to an appliance filter', () => {
    const noEquipment = RECIPE_CATALOGUE.filter(
      (recipe) => recipe.requiredAppliances.length === 0,
    );
    expect(noEquipment.length).toBeGreaterThan(10);

    const constraints = emptyConstraints({ appliances: ['stove'] });
    const index = buildIndexFor(constraints);

    const dropped = noEquipment
      .filter((recipe) => checkRecipe(recipe, constraints, index)?.reason === 'appliance')
      .map((recipe) => recipe.slug);

    expect(dropped).toEqual([]);
  });

  it('still filters a recipe that genuinely needs an appliance, so the guard is not vacuous', () => {
    const ovenOnly = RECIPE_CATALOGUE.find(
      (recipe) =>
        recipe.requiredAppliances.includes('oven') && !recipe.requiredAppliances.includes('stove'),
    );
    expect(ovenOnly).toBeDefined();

    const constraints = emptyConstraints({ appliances: ['stove'] });
    const index = buildIndexFor(constraints);

    expect(checkRecipe(ovenOnly!, constraints, index)).toEqual({
      reason: 'appliance',
      detail: 'oven',
    });
  });
});
