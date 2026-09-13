import {
  ASSUMED_ON_HAND_SLUGS,
  INGREDIENT_CATALOGUE,
  INGREDIENTS_BY_SLUG,
} from '@/features/ingredients/catalogue';
import { buildAvailabilityIndex, resolveIngredient } from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';

/**
 * "Always assume I have this" is reasonable for salt and oil, and wrong for
 * eggs. Eight ingredients — eggs, milk, yogurt, butter, white cheese, bread,
 * tomatoes and lemon — were flagged as both common staples and perishable, so
 * the app quietly assumed a fresh egg was in the fridge and recommended meals
 * the cook could not make.
 */
describe('staple assumptions', () => {
  it('marks NO perishable ingredient as a common staple', () => {
    const offenders = INGREDIENT_CATALOGUE.filter(
      (entry) => entry.isCommonStaple && entry.isPerishable,
    );

    expect(offenders.map((entry) => entry.slug)).toEqual([]);
  });

  it('does not assume perishables are in the kitchen', () => {
    const index = buildAvailabilityIndex([], [], { assumeCommonStaples: true });

    for (const name of ['eggs', 'milk', 'yogurt', 'butter', 'tomatoes']) {
      expect(index.assumedStaples.has(normaliseIngredientName(name))).toBe(false);
      expect(index.available.has(normaliseIngredientName(name))).toBe(false);
    }
  });

  it('still assumes the things that genuinely keep', () => {
    const index = buildAvailabilityIndex([], [], { assumeCommonStaples: true });

    // Keyed on the canonical name, which is what the index stores.
    for (const name of ['salt', 'black pepper', 'vegetable oil', 'onions', 'garlic']) {
      expect(index.assumedStaples.has(normaliseIngredientName(name))).toBe(true);
    }
  });

  it('never assumes the substance of a dish', () => {
    // REGRESSION, and this was the release-blocking one. The matching engine
    // read `isCommonStaple`, which the pantry UI uses to mean "cupboard item"
    // — so rice, pasta, potatoes, lentils, fava beans and tea were all on hand
    // for everybody. Three recipes became cookable from a completely empty
    // kitchen, and because they needed nothing they matched every search:
    // "chicken and rice" and "banana and oats" both answered koshari.
    const index = buildAvailabilityIndex([], [], { assumeCommonStaples: true });

    for (const name of ['rice', 'pasta', 'potatoes', 'red lentils', 'fava beans', 'tea']) {
      expect(index.available.has(normaliseIngredientName(name))).toBe(false);
    }
  });

  it('names only slugs that exist, so a typo cannot silently do nothing', () => {
    // `ASSUMED_ON_HAND_SLUGS` is filtered FROM the catalogue, so a misspelled
    // entry in the source list vanishes without a word — which is how
    // "vegetable-oil" (really `sunflower-oil`) stopped being assumed while
    // every test still passed.
    expect(ASSUMED_ON_HAND_SLUGS.size).toBeGreaterThan(30);
    for (const slug of ASSUMED_ON_HAND_SLUGS) {
      expect(INGREDIENTS_BY_SLUG.has(slug)).toBe(true);
    }
    for (const slug of ['water', 'olive-oil', 'sunflower-oil', 'onions', 'garlic', 'salt']) {
      expect(ASSUMED_ON_HAND_SLUGS.has(slug)).toBe(true);
    }
  });

  it('assumes nothing at all when the caller opts out', () => {
    const index = buildAvailabilityIndex([], [], { assumeCommonStaples: false });

    expect(index.assumedStaples.size).toBe(0);
  });

  it('holds the invariant at the engine level, not just in the data', () => {
    // Even a catalogue entry that slipped through the importer must not be
    // assumed present, which is why the guard lives in both places.
    const perishableStaple = INGREDIENT_CATALOGUE.find((entry) => entry.isPerishable);
    expect(perishableStaple).toBeDefined();

    const index = buildAvailabilityIndex([], [], { assumeCommonStaples: true });
    expect(index.assumedStaples.has(normaliseIngredientName(perishableStaple!.name))).toBe(false);
  });

  it('infers the metadata a pantry entry needs from the catalogue', () => {
    // The editor fills category and unit from these, so an ordinary item is
    // never manual classification work.
    const expectations: Record<string, { category: string; defaultUnit: string }> = {
      eggs: { category: 'protein', defaultUnit: 'piece' },
      milk: { category: 'dairy', defaultUnit: 'ml' },
      'chicken breast': { category: 'protein', defaultUnit: 'g' },
      rice: { category: 'carbs', defaultUnit: 'g' },
    };

    for (const [name, expected] of Object.entries(expectations)) {
      const resolved = resolveIngredient(name);
      expect(resolved?.category).toBe(expected.category);
      expect(resolved?.defaultUnit).toBe(expected.defaultUnit);
    }
  });
});
