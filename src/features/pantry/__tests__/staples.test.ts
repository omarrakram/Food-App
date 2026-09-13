import {
  UNIVERSAL_BASICS,
  SUGGESTED_KITCHEN_BASICS,
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
    const index = buildAvailabilityIndex([], [], { assumeUniversalBasics: true });

    for (const name of ['eggs', 'milk', 'yogurt', 'butter', 'tomatoes']) {
      expect(index.assumedStaples.has(normaliseIngredientName(name))).toBe(false);
      expect(index.available.has(normaliseIngredientName(name))).toBe(false);
    }
  });

  it('assumes water and salt, and those are the whole list', () => {
    const index = buildAvailabilityIndex([], [], { assumeUniversalBasics: true });

    expect([...index.assumedStaples].sort()).toEqual(['salt', 'water']);
  });

  it('does NOT assume the things a kitchen usually has but can run out of', () => {
    // REGRESSION, reported from the built app. Someone with rice and tomatoes
    // opened Tomato Rice and was told they had six of seven ingredients and
    // needed only coriander, because onions, garlic, stock cube, cumin, tomato
    // paste and oil were all silently on hand. Every one of those is something
    // you can be out of, and being out of it is the thing the user opened the
    // app to find out.
    const index = buildAvailabilityIndex([], [], { assumeUniversalBasics: true });

    for (const name of [
      'onions', 'garlic', 'tomato paste', 'stock cube', 'vegetable oil', 'olive oil',
      'cumin', 'black pepper', 'sugar', 'flour', 'butter', 'milk', 'eggs',
    ]) {
      expect({ name, assumed: index.available.has(normaliseIngredientName(name)) }).toEqual({
        name,
        assumed: false,
      });
    }
  });

  it('never assumes the substance of a dish', () => {
    // REGRESSION, and this was the release-blocking one. The matching engine
    // read `isCommonStaple`, which the pantry UI uses to mean "cupboard item"
    // — so rice, pasta, potatoes, lentils, fava beans and tea were all on hand
    // for everybody. Three recipes became cookable from a completely empty
    // kitchen, and because they needed nothing they matched every search:
    // "chicken and rice" and "banana and oats" both answered koshari.
    const index = buildAvailabilityIndex([], [], { assumeUniversalBasics: true });

    for (const name of ['rice', 'pasta', 'potatoes', 'red lentils', 'fava beans', 'tea']) {
      expect(index.available.has(normaliseIngredientName(name))).toBe(false);
    }
  });

  it('names only slugs that exist, so a typo cannot silently do nothing', () => {
    // `UNIVERSAL_BASICS` is filtered FROM the catalogue, so a misspelled entry
    // in the source list vanishes without a word — which is how
    // "vegetable-oil" (really `sunflower-oil`) once stopped being assumed
    // while every test still passed.
    expect([...UNIVERSAL_BASICS].sort()).toEqual(['salt', 'water']);
    for (const slug of UNIVERSAL_BASICS) {
      expect(INGREDIENTS_BY_SLUG.has(slug)).toBe(true);
    }
  });

  it('offers a suggested kitchen list without assuming any of it', () => {
    // The other half of the fix. Oil, onions and cumin are not assumed for
    // anybody — they are OFFERED, on a screen the user can untick, and only
    // count once that user has said yes.
    expect(SUGGESTED_KITCHEN_BASICS.length).toBeGreaterThan(5);
    for (const slug of SUGGESTED_KITCHEN_BASICS) {
      expect({ slug, known: INGREDIENTS_BY_SLUG.has(slug) }).toEqual({ slug, known: true });
      expect({ slug, assumed: UNIVERSAL_BASICS.has(slug) }).toEqual({ slug, assumed: false });
    }
  });

  it('counts a configured basic once the user has chosen it', () => {
    const index = buildAvailabilityIndex([], [], { alwaysAvailable: ['onions', 'olive oil'] });

    expect(index.available.has(normaliseIngredientName('onions'))).toBe(true);
    expect(index.sourceByName.get(normaliseIngredientName('onions'))).toBe('user_staple');
  });

  it('assumes nothing at all when the caller opts out', () => {
    const index = buildAvailabilityIndex([], [], { assumeUniversalBasics: false });

    expect(index.assumedStaples.size).toBe(0);
  });

  it('holds the invariant at the engine level, not just in the data', () => {
    // Even a catalogue entry that slipped through the importer must not be
    // assumed present, which is why the guard lives in both places.
    const perishableStaple = INGREDIENT_CATALOGUE.find((entry) => entry.isPerishable);
    expect(perishableStaple).toBeDefined();

    const index = buildAvailabilityIndex([], [], { assumeUniversalBasics: true });
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
