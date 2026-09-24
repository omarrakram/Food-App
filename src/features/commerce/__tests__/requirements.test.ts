import { INGREDIENTS_BY_SLUG } from '@/features/ingredients/catalogue';
import { buildAvailabilityIndex, matchRecipeIngredients } from '@/features/ingredients/matching';
import { perPieceWeightFor } from '@/features/pricing/units';
import { RECIPE_FIXTURES } from '@/features/recipes/fixtures';
import type { IngredientMatch, PantryItem } from '@/types/domain';

import { demoCandidatesFor } from '../demo-adapter';
import { requirementsFor } from '../requirements';
import { sourceRequest, type SourcingContext } from '../sourcing';

/**
 * The quantity pipeline, end to end.
 *
 *   recipe ingredient → IngredientMatch → missing → SourcingLine → pack maths
 *
 * `IngredientMatch` used to drop `slug`, `quantity` and `unit`, which made
 * `missingIngredients` — the exact list the UI already renders as YOU NEED —
 * impossible to hand to anything that had to buy the ingredient. These tests
 * pin the widened projection so it cannot be narrowed again by somebody
 * tidying up a type.
 */

function match(over: Partial<IngredientMatch> = {}): IngredientMatch {
  return {
    recipeIngredientId: 'ri-1',
    name: 'Cooking cream',
    slug: 'cream',
    quantity: 200,
    unit: 'ml',
    isAvailable: false,
    matchedVia: null,
    availableVia: null,
    excludedReason: null,
    isOptional: false,
    ...over,
  };
}

describe('the recipe amount survives the whole way', () => {
  it('carries slug, quantity and unit off a real recipe into a sourcing line', () => {
    // A REAL recipe from the catalogue, matched against an empty kitchen, so
    // this breaks if the projection narrows anywhere along the path.
    const recipe = RECIPE_FIXTURES.find((entry) => entry.slug === 'chicken-alfredo-light')
      ?? RECIPE_FIXTURES[0];
    if (!recipe) throw new Error('no fixtures');

    const index = buildAvailabilityIndex([], []);
    const result = matchRecipeIngredients(recipe, index);

    expect(result.missingIngredients.length).toBeGreaterThan(0);
    for (const missing of result.missingIngredients) {
      expect(missing.slug).not.toBeNull();
    }

    const { lines } = requirementsFor(result.missingIngredients, recipe.id);

    // Every required line reached sourcing with its own recipe amount intact.
    for (const line of lines) {
      const source = recipe.ingredients.find((i) => i.slug === line.ingredientSlug);
      expect(source).toBeDefined();
      if (line.amount === 'measured') {
        expect(line.quantity).toBe(source?.quantity);
        expect(line.unit).toBe(source?.unit);
      }
    }
  });

  it('passes the amount through to the pack arithmetic', () => {
    const context: SourcingContext = {
      avoidAllergens: [],
      requireDiets: [],
      perPieceFor: (slug) => perPieceWeightFor(INGREDIENTS_BY_SLUG.get(slug) ?? null),
    };

    // 900 g of chicken. Two 500 g packs is 180.00; one 1 kg is 170.00.
    const { lines } = requirementsFor(
      [match({ slug: 'chicken-breast', name: 'Chicken breast', quantity: 900, unit: 'g' })],
      'r-1',
    );
    const result = sourceRequest(
      { lines, merchantId: 'demo-merchant', locationId: 'demo-location' },
      demoCandidatesFor,
      context,
    );

    expect(result.lines[0]?.chosen?.product.name).toBe('Fresh Chicken Breast 1kg');
    expect(result.lines[0]?.chosen?.packsNeeded).toBe(1);
  });
});

describe('amounts a recipe did not give', () => {
  it('labels "to taste" rather than pretending it is a number', () => {
    const { lines } = requirementsFor(
      [match({ slug: 'salt', name: 'Salt', quantity: 1, unit: 'to_taste' })],
      'r-1',
    );

    expect(lines[0]).toMatchObject({
      ingredientSlug: 'salt',
      quantity: null,
      unit: null,
      amount: 'to_taste',
    });
  });

  it('labels an unquantified line as unspecified', () => {
    const { lines } = requirementsFor(
      [match({ slug: 'cream', quantity: null, unit: null })],
      'r-1',
    );
    expect(lines[0]?.amount).toBe('unspecified');
  });

  it('buys one pack for an unmeasured requirement, and says why', () => {
    // One is the honest minimum: the cook needs some, and computing a number
    // from a recipe that gave none would be an invention. Returning nothing
    // would leave a line that cannot go in a basket at all.
    const context: SourcingContext = { avoidAllergens: [], requireDiets: [], perPieceFor: () => null };
    const { lines } = requirementsFor(
      [match({ slug: 'cumin', name: 'Cumin', quantity: 1, unit: 'to_taste' })],
      'r-1',
    );

    const result = sourceRequest(
      { lines, merchantId: 'demo-merchant', locationId: 'demo-location' },
      demoCandidatesFor,
      context,
    );

    expect(result.lines[0]?.status).toBe('matched');
    expect(result.lines[0]?.chosen?.packsNeeded).toBe(1);
    expect(result.lines[0]?.chosen?.reasons).toContain('amount_unspecified');
  });
});

describe('what cannot be bought at all', () => {
  it('reports an ingredient with no canonical slug instead of guessing by name', () => {
    // An AI-proposed ingredient the catalogue never canonicalised. Matching it
    // on its display name would mean buying whatever a fuzzy search turned up.
    const { lines, unsourceable } = requirementsFor(
      [match({ slug: null, name: 'Smoked paprika aioli' })],
      'r-1',
    );

    expect(lines).toEqual([]);
    expect(unsourceable).toEqual([
      { name: 'Smoked paprika aioli', reason: 'no_canonical_ingredient', requestLineId: 'ri-1' },
    ]);
  });
});

describe('what the pantry does and does not tell us', () => {
  it('does not re-filter what the matcher already decided', () => {
    // `missingIngredients` has already dropped optional lines, garnishes,
    // staples and everything the cook has. A second filter here is how the two
    // would eventually disagree about what "missing" means.
    const { lines } = requirementsFor(
      [match({ slug: 'cream' }), match({ slug: 'parmesan', recipeIngredientId: 'ri-2' })],
      'r-1',
    );
    expect(lines).toHaveLength(2);
  });

  it('asks for the FULL recipe amount, because pantry quantities are not trustworthy', () => {
    /**
     * THE DEFICIT IS NOT SUPPORTED, AND THIS TEST IS THE RECORD OF WHY.
     *
     * A pantry row saying 200 g of chicken does not reduce the ask to 300 g,
     * because availability in this app is a set of NAMES: `PantryItem.quantity`
     * is read in one place, as `<= 0` meaning "used up", the editor leaves it
     * blank by default, and nothing decrements it when somebody cooks.
     *
     * Under-buying is the one error a cook discovers with a pan already hot.
     * When pantry amounts become trustworthy, the caller passes a smaller
     * quantity here and nothing downstream changes.
     */
    const pantry: PantryItem[] = [
      {
        id: 'p-1',
        userId: 'u-1',
        ingredientId: 'chicken-breast',
        ingredientName: 'chicken breast',
        category: 'protein',
        quantity: 200,
        unit: 'g',
        expiresOn: null,
        isStaple: false,
        note: null,
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
      },
    ];

    const index = buildAvailabilityIndex(pantry, []);

    // 200 g in the pantry makes chicken AVAILABLE, not partially available.
    // There is no deficit to compute because there is no arithmetic being done.
    expect(index.available.has('chicken breast')).toBe(true);

    // And an ingredient they genuinely lack is asked for in full.
    const { lines } = requirementsFor(
      [match({ slug: 'chicken-breast', name: 'Chicken breast', quantity: 500, unit: 'g' })],
      'r-1',
    );
    expect(lines[0]?.quantity).toBe(500);
  });
});

describe('pairing a result back to the recipe row it came from', () => {
  it('echoes the recipe ingredient id onto every line', () => {
    const { lines } = requirementsFor([match({ recipeIngredientId: 'ri-42' })], 'r-1');
    expect(lines[0]?.requestLineId).toBe('ri-42');
  });

  it('keeps two rows of the same ingredient apart', () => {
    // Fresh tomatoes and tinned tomatoes both canonicalise to `tomatoes`, so
    // the slug is NOT a key. A screen pairing by slug would put one line's
    // product under the other line's ingredient.
    const { lines } = requirementsFor(
      [
        match({ recipeIngredientId: 'ri-fresh', slug: 'tomatoes', quantity: 3, unit: 'piece' }),
        match({ recipeIngredientId: 'ri-tinned', slug: 'tomatoes', quantity: 400, unit: 'g' }),
      ],
      'r-1',
    );

    expect(lines.map((line) => line.requestLineId)).toEqual(['ri-fresh', 'ri-tinned']);
    expect(lines.map((line) => line.quantity)).toEqual([3, 400]);
  });

  it('carries the id onto an ingredient that cannot be sourced at all', () => {
    const { lines, unsourceable } = requirementsFor(
      [match({ recipeIngredientId: 'ri-odd', slug: null, name: 'Saffron dust' })],
      'r-1',
    );

    expect(lines).toHaveLength(0);
    expect(unsourceable).toEqual([
      { name: 'Saffron dust', reason: 'no_canonical_ingredient', requestLineId: 'ri-odd' },
    ]);
  });

  it('survives sourcing, so the result can be paired with no positional guess', () => {
    const context: SourcingContext = {
      avoidAllergens: [],
      requireDiets: [],
      perPieceFor: (slug) => perPieceWeightFor(INGREDIENTS_BY_SLUG.get(slug) ?? null),
    };

    const { lines } = requirementsFor(
      [
        match({ recipeIngredientId: 'ri-a', slug: 'cream', quantity: 200, unit: 'ml' }),
        match({ recipeIngredientId: 'ri-b', slug: 'parmesan', quantity: 50, unit: 'g' }),
      ],
      'r-1',
    );

    const result = sourceRequest(
      { lines, merchantId: 'merchant-demo', locationId: 'location-demo' },
      demoCandidatesFor,
      context,
    );

    expect(result.lines.map((line) => line.requested.requestLineId)).toEqual(['ri-a', 'ri-b']);
  });
});
