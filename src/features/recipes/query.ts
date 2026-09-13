import type { Recipe } from '@/types/domain';

import { resolveIngredient } from '@/features/ingredients/matching';

import type { RecipeConstraints } from './constraints';

/**
 * Turning constraints into a database query.
 *
 * The catalogue is 153 recipes today and will be thousands once community
 * submissions land, so "fetch everything and filter in React" stops being an
 * implementation detail and becomes the reason the app is slow. The database
 * does the coarse work over indexes; the client does the safety work.
 *
 * **The client-side safety filter still runs on whatever comes back.** That is
 * deliberate duplication, not an oversight:
 *
 *   - the fallback path (offline, or no Supabase project) has no SQL at all,
 *   - an AI-generated recipe never passes through SQL,
 *   - and a query is a thing that can be got wrong, whereas "no recipe with an
 *     allergen reaches the screen" must hold even when it is.
 *
 * So this layer's job is to make the result set small and relevant. It is not
 * the thing standing between a user and an allergen.
 */

export type RecipePage = {
  recipes: Recipe[];
  /** Cursor for the next page, or null at the end. */
  nextCursor: string | null;
  /** True when the source could not be queried and the bundle answered. */
  isFallback: boolean;
};

export const DEFAULT_PAGE_SIZE = 24;
/** Hard ceiling: a hostile or buggy caller must not be able to ask for 10,000. */
export const MAX_PAGE_SIZE = 60;

export type RecipeQuery = {
  constraints: RecipeConstraints;
  /** Opaque cursor from a previous page. */
  cursor?: string | null;
  limit?: number;
};

/**
 * The parts of a constraint set a SQL query can answer over an index.
 *
 * Everything else — allergen implication through ingredients, diet inference,
 * pantry availability, alias-resolved exclusion — stays client-side, because
 * it needs the ingredient catalogue's alias graph, which is not in the
 * database's query plan.
 */
export type QueryPlan = {
  cuisine: string | null;
  mealType: string | null;
  maxTotalMinutes: number | null;
  maxCalories: number | null;
  minProteinGrams: number | null;
  /** Diets the recipe must be tagged with. */
  dietTags: string[];
  /** Collection tags the recipe must carry. */
  tags: string[];
  /** Allergens the recipe must NOT be tagged with. */
  excludeAllergens: string[];
  /** Canonical slugs the recipe MUST contain. */
  requireSlugs: string[];
  /** Canonical slugs the recipe must NOT contain. */
  excludeSlugs: string[];
  /** Appliances the user has; a recipe needing anything else is out. */
  allowedAppliances: string[];
  /** Free-text query for a trigram title search. */
  search: string | null;
  limit: number;
  cursor: string | null;
};

/**
 * Builds the plan.
 *
 * Only ABSOLUTE ingredient restrictions become SQL exclusions. A dislike is a
 * preference the user may override at any moment, and baking it into the query
 * would mean re-querying to change one's mind; the client handles those.
 */
export function planQuery(query: RecipeQuery): QueryPlan {
  const { constraints } = query;

  const toSlug = (value: string): string | null =>
    resolveIngredient(value)?.slug ?? null;

  const requireSlugs = constraints.requiredIngredients
    .map(toSlug)
    .filter((slug): slug is string => slug !== null);

  const excludeSlugs = constraints.excludedIngredients
    .filter(
      (restriction) =>
        restriction.severity === 'allergy' || restriction.severity === 'hard_avoid',
    )
    .map((restriction) => restriction.slug ?? toSlug(restriction.label))
    .filter((slug): slug is string => slug !== null);

  // 'none' carries no requirement; every other eating style is a tag the
  // recipe has to declare.
  const dietTags: string[] = [
    ...(constraints.eatingStyle === 'none' ? [] : [constraints.eatingStyle]),
    ...constraints.dietFlags,
  ];

  return {
    cuisine: constraints.cuisine,
    mealType: constraints.mealType,
    maxTotalMinutes: constraints.maxMinutes,
    maxCalories: constraints.maxCalories,
    minProteinGrams: constraints.minProteinGrams,
    dietTags,
    tags: constraints.tags,
    excludeAllergens: constraints.allergens,
    requireSlugs,
    excludeSlugs,
    allowedAppliances: constraints.appliances,
    search: constraints.query?.trim() || null,
    limit: Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    cursor: query.cursor ?? null,
  };
}

/**
 * Applies the plan to whatever recipes we have in memory.
 *
 * Used by the offline path and by the tests, and it is also what keeps the SQL
 * honest: the same plan run two ways has to agree, which is asserted directly.
 */
export function applyPlanLocally(recipes: readonly Recipe[], plan: QueryPlan): Recipe[] {
  const slugsOf = (recipe: Recipe) =>
    new Set(
      recipe.ingredients
        .map((line) => line.slug ?? resolveIngredient(line.name)?.slug ?? null)
        .filter((slug): slug is string => slug !== null),
    );

  return recipes.filter((recipe) => {
    if (plan.cuisine && recipe.cuisine !== plan.cuisine) return false;
    if (plan.mealType && !recipe.mealTypes.includes(plan.mealType as never)) return false;
    if (
      plan.maxTotalMinutes !== null &&
      recipe.prepMinutes + recipe.cookMinutes > plan.maxTotalMinutes
    ) {
      return false;
    }
    if (plan.maxCalories !== null && (recipe.nutrition.calories ?? 0) > plan.maxCalories) {
      return false;
    }
    if (
      plan.minProteinGrams !== null &&
      (recipe.nutrition.proteinGrams ?? 0) < plan.minProteinGrams
    ) {
      return false;
    }
    for (const diet of plan.dietTags) {
      if (!recipe.dietTags.includes(diet as never)) return false;
    }
    for (const tag of plan.tags) {
      if (!recipe.tags.includes(tag)) return false;
    }
    for (const allergen of plan.excludeAllergens) {
      if (recipe.allergens.includes(allergen as never)) return false;
    }
    if (plan.allowedAppliances.length > 0) {
      const unsupported = recipe.requiredAppliances.some(
        (appliance) => !plan.allowedAppliances.includes(appliance),
      );
      if (unsupported) return false;
    }
    if (plan.requireSlugs.length > 0 || plan.excludeSlugs.length > 0) {
      const slugs = slugsOf(recipe);
      for (const slug of plan.requireSlugs) if (!slugs.has(slug)) return false;
      for (const slug of plan.excludeSlugs) if (slugs.has(slug)) return false;
    }
    if (plan.search) {
      const needle = plan.search.toLowerCase();
      const haystack = `${recipe.title} ${recipe.titleAr ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Cursor encoding.
 *
 * `created_at|id` rather than an offset: an offset re-reads and re-skips rows
 * on every page, and shifts under the user's feet the moment a recipe is
 * approved while they are scrolling.
 */
export function encodeCursor(recipe: Recipe): string {
  return `${recipe.createdAt}|${recipe.id}`;
}

export function decodeCursor(cursor: string | null): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const separator = cursor.lastIndexOf('|');
  if (separator <= 0) return null;
  const createdAt = cursor.slice(0, separator);
  const id = cursor.slice(separator + 1);
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

/** Orders a page the way the database does, so both paths agree. */
export function pageLocally(recipes: readonly Recipe[], plan: QueryPlan): RecipePage {
  const ordered = [...recipes].sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt);
    return byDate !== 0 ? byDate : b.id.localeCompare(a.id);
  });

  const after = decodeCursor(plan.cursor);
  const start = after
    ? ordered.findIndex(
        (recipe) => recipe.createdAt === after.createdAt && recipe.id === after.id,
      ) + 1
    : 0;

  const slice = ordered.slice(start, start + plan.limit);
  const last = slice[slice.length - 1];
  const hasMore = start + plan.limit < ordered.length;

  return {
    recipes: slice,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    isFallback: false,
  };
}

/**
 * Stable cache key for the CONSTRAINTS, not merely the plan.
 *
 * The plan is the coarse SQL half. Two different constraint sets can produce
 * the same plan — the kitchen contents, the gap budget and the relevance rule
 * are all evaluated client-side — and keying on the plan alone would let one
 * of them serve the other's cached answer.
 *
 * That is exactly the failure this app shipped: a user changing their
 * ingredients and getting the same recipes back. The client filter does re-run
 * on the cached rows, so it was not the cause here — but a key that omits an
 * input capable of changing the output is a bug waiting for a refactor to
 * expose it. Everything that can change the result is in here.
 *
 * The cursor is deliberately NOT: it is the page, not the query, and including
 * it would give every page its own entry and defeat `useInfiniteQuery`.
 */
export function constraintsFingerprint(constraints: RecipeConstraints): string {
  const sorted = (values: readonly string[]) => [...values].sort().join(',');
  return [
    sorted(constraints.availableIngredients),
    sorted(constraints.requiredIngredients),
    constraints.excludedIngredients
      .map((entry) => `${entry.severity}:${entry.slug ?? entry.label}`)
      .sort()
      .join(','),
    sorted(constraints.allergens),
    constraints.eatingStyle,
    sorted(constraints.dietFlags),
    constraints.allowDislikedIngredients ? '1' : '0',
    constraints.pantryMode,
    constraints.maxMissingIngredients ?? '',
    constraints.mustUseSomethingAvailable ? '1' : '0',
    constraints.mealType ?? '',
    constraints.cuisine ?? '',
    constraints.maxMinutes ?? '',
    constraints.maxCalories ?? '',
    constraints.minProteinGrams ?? '',
    sorted(constraints.appliances),
    sorted(constraints.tags),
    constraints.servings,
    constraints.budgetMinor ?? '',
    constraints.currency,
    constraints.country,
    constraints.skillLevel,
    constraints.query ?? '',
  ].join('~');
}

/** The SQL half of the key, for callers that only vary the plan. */
export function planFingerprint(plan: QueryPlan): string {
  return [
    plan.cuisine ?? '',
    plan.mealType ?? '',
    plan.maxTotalMinutes ?? '',
    plan.maxCalories ?? '',
    plan.minProteinGrams ?? '',
    [...plan.dietTags].sort().join(','),
    [...plan.tags].sort().join(','),
    [...plan.excludeAllergens].sort().join(','),
    [...plan.requireSlugs].sort().join(','),
    [...plan.excludeSlugs].sort().join(','),
    [...plan.allowedAppliances].sort().join(','),
    plan.search ?? '',
    plan.limit,
  ].join('~');
}
