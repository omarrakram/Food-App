import { RECIPE_CATALOGUE } from '../../src/features/recipes/catalogue.generated.ts';
import { distinguishingSlugs, similarity } from '../lib/recipe-similarity.ts';

/**
 * A universal basic must not be able to make two dishes different.
 *
 * The near-duplicate check used to compare every non-optional line, salt and
 * water included. Those two are the ingredients the matching engine assumes
 * every kitchen has; they are written down only so the line count and the
 * instructions agree. Counting them meant a recipe could be made less similar
 * to another purely by recording the water it was already using — which is
 * what happened when `sutlac-baked` gained its water line and the suspicious
 * pair count fell from 9 to 8. Neither dish had changed.
 *
 * These tests make that move impossible rather than merely unlikely.
 */

const line = (slug: string, over: { isOptional?: boolean; isGarnish?: boolean } = {}) => ({
  slug,
  isOptional: over.isOptional ?? false,
  isGarnish: over.isGarnish ?? false,
});

describe('adding a universal basic cannot separate two recipes', () => {
  it('leaves similarity at 1 when one recipe writes down its water', () => {
    const a = { ingredients: [line('rice'), line('milk'), line('sugar')] };
    const b = { ingredients: [line('rice'), line('milk'), line('sugar'), line('water')] };

    expect(similarity(a, b)).toBe(1);
  });

  it('leaves similarity at 1 for salt, and for both at once', () => {
    const a = { ingredients: [line('eggs'), line('tomatoes')] };
    expect(similarity(a, { ingredients: [...a.ingredients, line('salt')] })).toBe(1);
    expect(
      similarity(a, { ingredients: [...a.ingredients, line('salt'), line('water')] }),
    ).toBe(1);
  });

  it('is the exact regression: sutlac against muhallabia is unchanged by water', () => {
    // The real pair, from the real catalogue. Whatever the number is, adding
    // water to one of them must not move it.
    const sutlac = RECIPE_CATALOGUE.find((r) => r.slug === 'sutlac-baked')!;
    const muhallabia = RECIPE_CATALOGUE.find((r) => r.slug === 'muhallabia')!;
    expect(sutlac).toBeDefined();
    expect(muhallabia).toBeDefined();

    // Sutlac carries a water line today; stripping it must change nothing.
    const withoutWater = {
      ingredients: sutlac.ingredients.filter((l) => l.slug !== 'water'),
    };
    expect(similarity(sutlac, muhallabia)).toBe(similarity(withoutWater, muhallabia));
  });

  it('still counts the basics the app only SUGGESTS, because those distinguish dishes', () => {
    // Onions, garlic and cumin are offered at onboarding and can be unticked.
    // They are a fact about one cook, not about the world, and a sauce with
    // garlic in it is not the same sauce without.
    const plain = { ingredients: [line('tomatoes'), line('pasta')] };
    const garlicky = { ingredients: [line('tomatoes'), line('pasta'), line('garlic')] };

    expect(similarity(plain, garlicky)).toBeLessThan(1);
  });

  it('still separates genuinely different dishes, so the guard is not vacuous', () => {
    const a = { ingredients: [line('chicken-breast'), line('rice')] };
    const b = { ingredients: [line('flour'), line('sugar'), line('eggs')] };
    expect(similarity(a, b)).toBe(0);
  });

  it('keeps ignoring optional lines and garnishes', () => {
    const a = { ingredients: [line('lentils'), line('onions')] };
    const b = {
      ingredients: [
        line('lentils'),
        line('onions'),
        line('parsley', { isGarnish: true }),
        line('lemon', { isOptional: true }),
      ],
    };
    expect(similarity(a, b)).toBe(1);
  });

  it('drops salt and water from the compared set in the first place', () => {
    const slugs = distinguishingSlugs({
      ingredients: [line('rice'), line('salt'), line('water'), line('milk')],
    });
    expect(slugs.sort()).toEqual(['milk', 'rice']);
  });
});
