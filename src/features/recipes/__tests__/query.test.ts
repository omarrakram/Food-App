import { DEFAULT_PREFERENCES } from '@/types/domain';

import { emptyConstraints, missingBudgetFor, toRestriction } from '../constraints';
import { requestDefaultsFrom } from '@/features/preferences/preferences-provider';
import { decodeRequest, encodeRequest, relaxRequest } from '../request-params';
import { toConstraints } from '../to-constraints';
import { RECIPE_FIXTURES } from '../fixtures';
import { checkRecipe, buildIndexFor, relaxedConstraints } from '../filter';
import {
  applyPlanLocally,
  constraintsFingerprint,
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
  pageLocally,
  planFingerprint,
  planQuery,
} from '../query';

/**
 * The query layer.
 *
 * Two things have to hold. The plan must be a faithful, if coarser, version of
 * the constraints — anything it lets through is re-checked, but anything it
 * WRONGLY removes is a recipe the user should have seen and never will. And
 * paging must be stable, because the catalogue grows while people scroll.
 */

describe('planning a query from constraints', () => {
  it('never pushes a dislike into the query', () => {
    // A dislike can be overridden at any moment. Baking it into SQL would mean
    // a round trip to change your mind, and the client can drop it for free.
    const plan = planQuery({
      constraints: emptyConstraints({
        excludedIngredients: [
          toRestriction('coriander', 'dislike')!,
          toRestriction('peanuts', 'allergy')!,
        ],
      }),
    });

    expect(plan.excludeSlugs).toEqual(['peanuts']);
  });

  it('resolves required and excluded ingredients to canonical slugs', () => {
    const plan = planQuery({
      constraints: emptyConstraints({
        requiredIngredients: ['صدر فراخ'],
        excludedIngredients: [toRestriction('capsicum', 'hard_avoid')!],
      }),
    });

    expect(plan.requireSlugs).toEqual(['chicken-breast']);
    expect(plan.excludeSlugs).toEqual(['bell-pepper']);
  });

  it('leaves a word naming several ingredients out of the SQL narrowing', () => {
    /*
      `فراخ` used to appear here as `['chicken-breast']`, which was wrong twice
      over: it narrowed the query to ONE cut, and it did so because that row
      happened to own the alias.

      SQL cannot express "any of these six" through `requireSlugs`, which is an
      AND. So a family word contributes nothing to the query and the client
      filter enforces it instead — the same division of labour dislikes have
      always used, and safe for the same reason: every page the database
      returns is filtered again before it is shown.
    */
    const plan = planQuery({
      constraints: emptyConstraints({ requiredIngredients: ['فراخ'] }),
    });

    expect(plan.requireSlugs).toEqual([]);
  });

  it('caps the page size whatever the caller asks for', () => {
    const plan = planQuery({ constraints: emptyConstraints(), limit: 10_000 });
    expect(plan.limit).toBe(MAX_PAGE_SIZE);
  });

  it('carries the eating style and diet flags as required tags', () => {
    const plan = planQuery({
      constraints: emptyConstraints({ eatingStyle: 'vegan', dietFlags: ['halal'] }),
    });
    expect(plan.dietTags).toEqual(['vegan', 'halal']);
  });

  it('asks for nothing when the user has no eating style', () => {
    const plan = planQuery({ constraints: emptyConstraints({ eatingStyle: 'none' }) });
    expect(plan.dietTags).toEqual([]);
  });

  it('pushes a collection tag into the query rather than filtering after', () => {
    // Discover's collections used to be a `.filter()` over a fetched page,
    // which turned a page of twenty-four into three visible cards and made the
    // infinite scroll look broken. The tag is a query clause now.
    const plan = planQuery({ constraints: emptyConstraints({ tags: ['quick'] }) });
    expect(plan.tags).toEqual(['quick']);

    const results = applyPlanLocally(RECIPE_FIXTURES, plan);
    expect(results.length).toBeGreaterThan(0);
    for (const recipe of results) expect(recipe.tags).toContain('quick');
  });
});

describe('the plan never removes a recipe the constraints would have kept', () => {
  // This is the assertion that matters. The database narrows; the client
  // decides. If the plan is stricter than the constraints, a user is silently
  // denied a valid result and no test downstream would ever notice.
  const cases = [
    emptyConstraints({ cuisine: 'italian' }),
    emptyConstraints({ mealType: 'breakfast' }),
    emptyConstraints({ maxMinutes: 25 }),
    emptyConstraints({ maxCalories: 350 }),
    emptyConstraints({ minProteinGrams: 30 }),
    emptyConstraints({ eatingStyle: 'vegan' }),
    emptyConstraints({ allergens: ['gluten'] }),
    emptyConstraints({ appliances: ['stove'] }),
    emptyConstraints({ requiredIngredients: ['chicken'] }),
    emptyConstraints({ excludedIngredients: [toRestriction('bell pepper', 'hard_avoid')!] }),
    emptyConstraints({ tags: ['high-protein'] }),
    emptyConstraints({ tags: ['egyptian'], maxMinutes: 45 }),
  ];

  it.each(cases.map((constraints, index) => [index, constraints] as const))(
    'case %i keeps everything the client-side filter would keep',
    (_index, constraints) => {
      const plan = planQuery({ constraints, limit: MAX_PAGE_SIZE });
      const fromPlan = new Set(applyPlanLocally(RECIPE_FIXTURES, plan).map((r) => r.id));

      const index = buildIndexFor(constraints);
      const allowed = RECIPE_FIXTURES.filter(
        (recipe) => checkRecipe(recipe, constraints, index) === null,
      );

      const dropped = allowed.filter((recipe) => !fromPlan.has(recipe.id));
      expect(dropped.map((recipe) => recipe.slug)).toEqual([]);
    },
  );

  it('is allowed to be looser — the client tightens it back up', () => {
    // The plan cannot see allergens implied by ingredients, only declared
    // ones. So it may return a mis-tagged recipe; the client removes it.
    const constraints = emptyConstraints({ allergens: ['dairy'] });
    const plan = planQuery({ constraints, limit: MAX_PAGE_SIZE });
    const fromPlan = applyPlanLocally(RECIPE_FIXTURES, plan);
    const index = buildIndexFor(constraints);

    const survivors = fromPlan.filter(
      (recipe) => checkRecipe(recipe, constraints, index) === null,
    );

    expect(survivors.length).toBeLessThanOrEqual(fromPlan.length);
    for (const recipe of survivors) expect(recipe.allergens).not.toContain('dairy');
  });
});

describe('paging', () => {
  const plan = planQuery({ constraints: emptyConstraints(), limit: 10 });

  it('returns a page and a cursor', () => {
    const page = pageLocally(RECIPE_FIXTURES, plan);
    expect(page.recipes).toHaveLength(10);
    expect(page.nextCursor).not.toBeNull();
  });

  it('walks the whole catalogue exactly once', () => {
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 100; guard += 1) {
      const page = pageLocally(RECIPE_FIXTURES, { ...plan, cursor });
      seen.push(...page.recipes.map((recipe) => recipe.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(seen).toHaveLength(RECIPE_FIXTURES.length);
    expect(new Set(seen).size).toBe(RECIPE_FIXTURES.length);
  });

  it('round-trips a cursor', () => {
    const recipe = RECIPE_FIXTURES[0]!;
    expect(decodeCursor(encodeCursor(recipe))).toEqual({
      createdAt: recipe.createdAt,
      id: recipe.id,
    });
  });

  it('treats a malformed cursor as the beginning rather than throwing', () => {
    for (const bad of ['', 'garbage', '|', '|abc']) {
      expect(decodeCursor(bad)).toBeNull();
    }
    const page = pageLocally(RECIPE_FIXTURES, { ...plan, cursor: 'garbage' });
    expect(page.recipes).toHaveLength(10);
  });

  it('never returns the whole catalogue in one call', () => {
    const page = pageLocally(RECIPE_FIXTURES, planQuery({ constraints: emptyConstraints() }));
    expect(page.recipes.length).toBeLessThan(RECIPE_FIXTURES.length);
  });
});

describe('the whole catalogue is never fetched at once', () => {
  // The point of the layer. A screen that asks for "recipes" and gets 153 rows
  // has a performance problem it cannot see yet and will not notice until the
  // catalogue is thousands.
  it('caps a default query well below the catalogue size', () => {
    const plan = planQuery({ constraints: emptyConstraints() });
    expect(plan.limit).toBeLessThan(RECIPE_FIXTURES.length);
  });

  it('pages a filtered query too, not just an unfiltered one', () => {
    const plan = planQuery({ constraints: emptyConstraints({ mealType: 'dinner' }), limit: 5 });
    const filtered = applyPlanLocally(RECIPE_FIXTURES, plan);
    expect(filtered.length).toBeGreaterThan(5);

    const first = pageLocally(filtered, plan);
    expect(first.recipes).toHaveLength(5);
    expect(first.nextCursor).not.toBeNull();

    const second = pageLocally(filtered, { ...plan, cursor: first.nextCursor });
    const overlap = second.recipes.filter((recipe) =>
      first.recipes.some((earlier) => earlier.id === recipe.id),
    );
    expect(overlap).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The cache key. This is the one the reported bug looked like: a user changes
// their ingredients, presses the button, and is handed the previous answer.
// ---------------------------------------------------------------------------

describe('the cache key cannot serve one search the answer to another', () => {
  it('separates two different kitchens', () => {
    const a = emptyConstraints({ availableIngredients: ['chicken breast', 'rice', 'tomatoes'] });
    const b = emptyConstraints({ availableIngredients: ['banana', 'oats', 'milk'] });

    expect(constraintsFingerprint(a)).not.toBe(constraintsFingerprint(b));
  });

  it('separates the same kitchen at different gap budgets', () => {
    const available = ['chicken breast', 'rice'];
    const keys = [0, 1, 2].map((maxMissingIngredients) =>
      constraintsFingerprint(
        emptyConstraints({
          availableIngredients: available,
          pantryMode: maxMissingIngredients === 0 ? 'strict' : 'partial',
          maxMissingIngredients,
        }),
      ),
    );

    expect(new Set(keys).size).toBe(3);
  });

  it('is stable under the order the user happened to type things in', () => {
    // Otherwise the same question asked twice is two cache entries, and the
    // second one pays for a refetch that changes nothing.
    const a = emptyConstraints({ availableIngredients: ['rice', 'tomatoes', 'eggs'] });
    const b = emptyConstraints({ availableIngredients: ['eggs', 'rice', 'tomatoes'] });

    expect(constraintsFingerprint(a)).toBe(constraintsFingerprint(b));
  });

  it('covers EVERY field of the constraints', () => {
    // The guard that matters. A new constraint added without a line in the
    // fingerprint is a field that can change the results while two searches go
    // on sharing a cache entry — which is precisely the shape of the bug this
    // whole pass exists to fix, and it would not show up in any other test.
    const base = emptyConstraints();
    const untouched: string[] = [];

    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      const current = base[key];
      // A different value of the right type for each field shape.
      const changed =
        typeof current === 'boolean' ? !current
        : typeof current === 'number' ? current + 7
        : Array.isArray(current) ? [...current, 'sentinel-value']
        : typeof current === 'string' ? `${current}-sentinel`
        : current === null ? 'sentinel-value'
        : current;

      const mutated = { ...base, [key]: changed };
      if (constraintsFingerprint(mutated) === constraintsFingerprint(base)) {
        untouched.push(String(key));
      }
    }

    expect(untouched).toEqual([]);
  });

  it('is not the plan fingerprint — the plan is only the SQL half', () => {
    // Two searches the database cannot tell apart, because the kitchen and the
    // gap budget are evaluated client-side. Keying on the plan alone is what
    // would let one serve the other's rows.
    const a = emptyConstraints({ availableIngredients: ['chicken breast'] });
    const b = emptyConstraints({ availableIngredients: ['banana'] });

    const plan = (constraints: typeof a) =>
      planFingerprint(planQuery({ constraints }));

    expect(plan(a)).toBe(plan(b));
    expect(constraintsFingerprint(a)).not.toBe(constraintsFingerprint(b));
  });
});

// ---------------------------------------------------------------------------
// Relaxation is implemented twice — on the constraints, to work out what to
// OFFER, and on the request, to carry the offer through the URL. If the two
// disagree, the screen promises a number of recipes and then shows a
// different one.
// ---------------------------------------------------------------------------

describe('taking a relaxation does what offering it promised', () => {
  // Built the way a screen builds one — through the URL codec, from the
  // preference defaults — so the test exercises the path the app uses.
  const request = decodeRequest(
    encodeRequest({
      ...requestDefaultsFrom(DEFAULT_PREFERENCES),
      mode: 'ingredients',
      ingredients: ['bananas', 'oats', 'milk'],
      pantryMode: 'strict',
      maxMissingIngredients: 0,
      budgetMinor: null,
      servings: 2,
      mealType: null,
      cuisine: null,
      maxMinutes: null,
      minProteinGrams: null,
      maxCalories: null,
      query: null,
    }),
    DEFAULT_PREFERENCES,
  );

  it('widens the gap budget by exactly one, as the offer was computed with', () => {
    // REGRESSION: this used to set only `pantryMode: 'partial'` and leave the
    // budget at 0 — and `missingBudgetFor('partial', 0)` is 0, because `0 ?? 2`
    // is 0. The button was inert: the empty state offered a way forward and
    // then produced the same empty state.
    const relaxed = relaxRequest(request, 'pantry');

    expect(relaxed.maxMissingIngredients).toBe(1);
    expect(relaxed.pantryMode).toBe('partial');
  });

  it('agrees with the constraint-level relaxation the offer is measured by', () => {
    const viaRequest = toConstraints(relaxRequest(request, 'pantry'));
    const viaConstraints = relaxedConstraints(toConstraints(request), 'pantry');

    expect(missingBudgetFor(viaRequest.pantryMode, viaRequest.maxMissingIngredients)).toBe(
      missingBudgetFor(viaConstraints.pantryMode, viaConstraints.maxMissingIngredients),
    );
  });

  it('keeps widening rather than stopping after one step', () => {
    const twice = relaxRequest(relaxRequest(request, 'pantry'), 'pantry');

    expect(twice.maxMissingIngredients).toBe(2);
  });
});
