import { emptyConstraints, toRestriction } from '../constraints';
import { RECIPE_FIXTURES } from '../fixtures';
import { planQuery } from '../query';
import { LocalRecipeRepository } from '../repository';

/**
 * The repository contract.
 *
 * Both implementations answer the same `search(plan)`. The Supabase one pushes
 * the plan into SQL, this one runs it over the bundle — and the app must not be
 * able to tell which answered, beyond the `isFallback` flag. So the guarantees
 * asserted here are the ones the screen depends on either way: a page is a
 * page, a cursor walks forward, and a hard constraint is honoured.
 */

jest.mock('@/lib/storage/local-collection', () => ({
  LocalCollectionKeys: { aiRecipes: 'ai-recipes' },
  LocalCollection: class {
    async list() {
      return [];
    }
    async replaceAll() {
      /* no-op */
    }
  },
}));

describe('LocalRecipeRepository.search', () => {
  const repository = new LocalRecipeRepository();

  it('returns a page, not the catalogue', async () => {
    const page = await repository.search(planQuery({ constraints: emptyConstraints() }));
    expect(page.recipes.length).toBeLessThan(RECIPE_FIXTURES.length);
    expect(page.nextCursor).not.toBeNull();
    expect(page.isFallback).toBe(false);
  });

  it('walks to the end without repeating or skipping a recipe', async () => {
    const plan = planQuery({ constraints: emptyConstraints(), limit: 25 });
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 50; guard += 1) {
      const page = await repository.search({ ...plan, cursor });
      seen.push(...page.recipes.map((recipe) => recipe.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(RECIPE_FIXTURES.length);
  });

  it('honours a hard exclusion on every page', async () => {
    // The database is not the thing standing between a user and an allergen,
    // but it must not be the thing that lets one through either.
    const plan = planQuery({
      constraints: emptyConstraints({
        excludedIngredients: [toRestriction('bell pepper', 'allergy')!],
      }),
      limit: 25,
    });

    let cursor: string | null = null;
    let pages = 0;

    for (let guard = 0; guard < 50; guard += 1) {
      const page = await repository.search({ ...plan, cursor });
      pages += 1;
      for (const recipe of page.recipes) {
        const slugs = recipe.ingredients.map((line) => line.slug);
        expect(slugs).not.toContain('bell-pepper');
      }
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(pages).toBeGreaterThan(1);
  });

  it('narrows to a collection tag', async () => {
    const plan = planQuery({ constraints: emptyConstraints({ tags: ['air-fryer'] }) });
    const page = await repository.search(plan);
    expect(page.recipes.length).toBeGreaterThan(0);
    for (const recipe of page.recipes) expect(recipe.tags).toContain('air-fryer');
  });
});
