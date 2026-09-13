import { emptyConstraints, toRestriction } from '../constraints';
import { buildIndexFor, checkRecipe, suppliedKeys } from '../filter';
import { RECIPE_FIXTURES } from '../fixtures';
import { applyPlanLocally, pageLocally, planQuery, MAX_PAGE_SIZE } from '../query';

/**
 * The two repositories must mean the same thing.
 *
 * `LocalRecipeRepository` runs the plan over the bundle; the Supabase one
 * pushes it into SQL. A user cannot tell which answered — and must not be able
 * to, because the preview runs one and production the other. Semantics that
 * drift between them produce a bug report nobody can reproduce.
 *
 * What is asserted here is the CONTRACT both implement: the plan is a coarser
 * version of the constraints that never removes something the constraints
 * would keep, filtering happens before paging, and the client filter is what
 * decides. The Supabase half is exercised against a real database by
 * `supabase/tests`; this covers the shared logic both sides run.
 */

const CASES = [
  {
    name: 'chicken, rice, tomato — nothing missing allowed',
    constraints: emptyConstraints({
      availableIngredients: ['chicken breast', 'rice', 'tomatoes'],
      pantryMode: 'strict',
      mustUseSomethingAvailable: true,
    }),
  },
  {
    name: 'eggs, cheese, tomato — one missing allowed',
    constraints: emptyConstraints({
      availableIngredients: ['eggs', 'white cheese', 'tomatoes'],
      pantryMode: 'partial',
      maxMissingIngredients: 1,
      mustUseSomethingAvailable: true,
    }),
  },
  {
    name: 'beef, pasta, tomato — dairy excluded',
    constraints: emptyConstraints({
      availableIngredients: ['ground beef', 'pasta', 'tomatoes'],
      pantryMode: 'partial',
      maxMissingIngredients: 2,
      mustUseSomethingAvailable: true,
      allergens: ['dairy'],
    }),
  },
  {
    name: 'a hard avoid plus a cuisine',
    constraints: emptyConstraints({
      cuisine: 'italian',
      excludedIngredients: [toRestriction('bell pepper', 'hard_avoid')!],
    }),
  },
];

/** What the client filter alone would keep — the answer both sides must reach. */
function decidedLocally(constraints: ReturnType<typeof emptyConstraints>) {
  const index = buildIndexFor(constraints);
  const supplied = suppliedKeys(constraints);
  return RECIPE_FIXTURES.filter(
    (recipe) => checkRecipe(recipe, constraints, index, { supplied }) === null,
  ).map((recipe) => recipe.id);
}

describe.each(CASES)('$name', ({ constraints }) => {
  const plan = planQuery({ constraints, limit: MAX_PAGE_SIZE });

  it('the plan never removes a recipe the constraints would keep', () => {
    const fromPlan = new Set(applyPlanLocally(RECIPE_FIXTURES, plan).map((r) => r.id));
    const dropped = decidedLocally(constraints).filter((id) => !fromPlan.has(id));
    expect(dropped).toEqual([]);
  });

  it('filtering happens before paging, so a page is a page of RESULTS', () => {
    // The failure this guards: SELECT the first N rows, then filter those N.
    // Every request then returns the same first page whatever the constraints,
    // which is precisely the bug that made this flow useless.
    const smallPlan = planQuery({ constraints, limit: 5 });
    const filtered = applyPlanLocally(RECIPE_FIXTURES, smallPlan);
    const page = pageLocally(filtered, smallPlan);

    const unfilteredFirstFive = pageLocally(RECIPE_FIXTURES, smallPlan).recipes.map((r) => r.id);
    const pageIds = page.recipes.map((r) => r.id);

    expect(pageIds.length).toBeLessThanOrEqual(5);
    for (const id of pageIds) {
      expect(applyPlanLocally(RECIPE_FIXTURES, smallPlan).some((r) => r.id === id)).toBe(true);
    }
    // When the constraints actually exclude something, the page must differ
    // from the unfiltered first five — otherwise the filter did nothing.
    if (filtered.length < RECIPE_FIXTURES.length) {
      expect(pageIds).not.toEqual(unfilteredFirstFive);
    }
  });

  it('walking every page reaches the same set as filtering the whole bundle', () => {
    const smallPlan = planQuery({ constraints, limit: 7 });
    const filtered = applyPlanLocally(RECIPE_FIXTURES, smallPlan);

    const walked: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 60; guard += 1) {
      const page = pageLocally(filtered, { ...smallPlan, cursor });
      walked.push(...page.recipes.map((r) => r.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    expect(new Set(walked).size).toBe(walked.length);
    expect(new Set(walked)).toEqual(new Set(filtered.map((r) => r.id)));
  });
});

it('two disjoint kitchens cannot return the same recipes', () => {
  // The report that started this: "different ingredients, same results". The
  // sets below share nothing, so an implementation that ignores the kitchen
  // fails here and an implementation that honours it cannot.
  const savoury = emptyConstraints({
    availableIngredients: ['ground beef', 'pasta', 'tomatoes'],
    pantryMode: 'partial',
    maxMissingIngredients: 2,
    mustUseSomethingAvailable: true,
  });
  const sweet = emptyConstraints({
    availableIngredients: ['banana', 'oats', 'milk'],
    pantryMode: 'partial',
    maxMissingIngredients: 2,
    mustUseSomethingAvailable: true,
  });

  const a = decidedLocally(savoury);
  const b = decidedLocally(sweet);

  expect(a.length).toBeGreaterThan(0);
  expect(b.length).toBeGreaterThan(0);
  expect(a).not.toEqual(b);

  // Not merely "not identical" — the overlap has to be small. Two kitchens
  // with nothing in common answering with mostly the same dishes would mean
  // the ingredients were barely consulted.
  const overlap = a.filter((id) => b.includes(id)).length;
  expect(overlap / Math.min(a.length, b.length)).toBeLessThan(0.5);
});
