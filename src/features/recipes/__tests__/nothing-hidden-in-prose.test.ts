import { RECIPE_CATALOGUE } from '../catalogue.generated';

/**
 * Nothing the cook has to buy may live only in the instructions.
 *
 * `lokmet-el-qadi` shipped as a five-line recipe and then asked for 250ml of
 * warm water in step one. The water was real, measured and required, and it was
 * invisible to the shopping list, to pantry matching and to the ≤5 count that
 * the whole batch was built around. Sweeping the dataset for the same shape
 * found thirty-two more, every one of them water in a soup or a rice pot.
 *
 * The importer now refuses it (`ingredientsHiddenInProse`). This is the
 * catalogue-side assertion: it reads what actually shipped, so it fails even if
 * somebody edits the generated file by hand or weakens the importer's rule.
 */

/** The units a recipe measures things in, as they appear in English prose. */
const MEASURED =
  /(\d+(?:[.,]\d+)?)\s*(ml|l|kg|tbsp|tsp|cups?|tablespoons?|teaspoons?)\b\s*(?:of\s+)?(the\s+)?([a-z][a-z-]*)/gi;

describe('nothing required hides in the instructions', () => {
  it('never measures water in a step without listing water', () => {
    // Water is the case this actually happens in, and the one the app is most
    // tempted to wave through — "everyone has water" is true of a splash and
    // false of 1.2 litres.
    const offenders: string[] = [];

    for (const recipe of RECIPE_CATALOGUE) {
      const listed = new Set(recipe.ingredients.map((line) => line.slug));
      for (const [index, step] of recipe.steps.entries()) {
        for (const match of step.instruction.matchAll(MEASURED)) {
          if (match[3]) continue; // "the water" — a back-reference
          if ((match[4] ?? '').toLowerCase() !== 'water') continue;
          if (listed.has('water')) continue;
          offenders.push(`${recipe.slug} step ${index + 1}: "${match[0].trim()}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('pins the regression that found it', () => {
    const lokmet = RECIPE_CATALOGUE.find((recipe) => recipe.slug === 'lokmet-el-qadi');
    expect(lokmet).toBeDefined();

    const slugs = lokmet!.ingredients.map((line) => line.slug);
    expect(slugs).toContain('water');

    // And the dish it became: the authentic syrup is sugar, water and lemon,
    // not warmed honey. If honey ever comes back, the name has to change too.
    expect(slugs).toContain('sugar');
    expect(slugs).toContain('lemon');
    expect(slugs).not.toContain('honey');
  });

  it('keeps the sweep honest — the catalogue really does measure water', () => {
    const measuringWater = RECIPE_CATALOGUE.filter((recipe) =>
      recipe.ingredients.some((line) => line.slug === 'water'),
    ).length;

    // If this collapses, the first test stops proving anything.
    expect(measuringWater).toBeGreaterThanOrEqual(30);
  });
});
