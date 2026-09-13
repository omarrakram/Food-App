import {
  buildAvailabilityIndex,
  matchRecipeIngredients,
  type AvailabilityIndex,
} from '@/features/ingredients/matching';
import {
  budgetVerdict,
  estimateRecipeCost,
  toPricedAmount,
  toSpendAmount,
} from '@/features/pricing/estimate';
import type { MealRequest, PantryItem, Recipe, RecipeMatch } from '@/types/domain';

import { filterRecipes, type RejectionReason } from './filter';
import { toConstraints } from './to-constraints';

/**
 * Recipe filtering and ranking.
 *
 * Runs entirely on-device against whatever recipe set is supplied (bundled
 * fixtures, cached DB rows, or freshly AI-generated ones). Two responsibilities
 * that must not be confused:
 *
 *   FILTER  — hard constraints. Allergens and diet are safety rules; a recipe
 *             that violates them is removed, never merely down-ranked.
 *   RANK    — soft preferences. Time, budget, cuisine, goals nudge the order.
 */

// --- Hard constraints ------------------------------------------------------
// Moved to `safety.ts` so `filter.ts` can use them too. Re-exported because
// callers and tests import them from here.
import {
  canCookWithAppliances,
  containsDislikedIngredient,
  satisfiesDiet,
  satisfiesDietFlags,
  violatesAllergens,
} from './safety';

export {
  canCookWithAppliances,
  containsDislikedIngredient,
  satisfiesDiet,
  satisfiesDietFlags,
  violatesAllergens,
};

export type FilterReason =
  | 'allergen'
  | 'diet'
  | 'appliance'
  | 'disliked'
  | 'meal_type'
  | 'cuisine'
  | 'time'
  | 'calories'
  | 'protein'
  | 'tag'
  | 'pantry';

export type FilterOutcome = { recipe: Recipe; excludedBy: FilterReason | null };

/**
 * Applies every constraint in the request.
 *
 * Thin wrapper over `filterRecipes`, kept because callers and tests speak in
 * `MealRequest`. The rejection reasons are the filter's, mapped onto the older
 * vocabulary — the filter is the single implementation.
 */
export function applyConstraints(
  recipes: readonly Recipe[],
  request: MealRequest,
  options: {
    availability?: AvailabilityIndex;
    pantryItems?: readonly PantryItem[];
    now?: Date;
  } = {},
): FilterOutcome[] {
  const constraints = toConstraints(request);
  return filterRecipes(recipes, constraints, options).map((verdict) => ({
    recipe: verdict.recipe,
    excludedBy: verdict.rejection ? toFilterReason(verdict.rejection.reason) : null,
  }));
}

function toFilterReason(reason: RejectionReason): FilterReason {
  switch (reason) {
    case 'excluded_ingredient':
    case 'disliked_ingredient':
      return 'disliked';
    case 'missing_required_ingredient':
    case 'pantry':
    case 'uses_nothing_you_have':
      return 'pantry';
    default:
      return reason;
  }
}

/** Kept for tests that assert the old per-check behaviour directly. */
export function applyConstraintsLegacy(
  recipes: readonly Recipe[],
  request: MealRequest,
): FilterOutcome[] {
  return recipes.map((recipe) => {
    if (violatesAllergens(recipe, request.allergens)) {
      return { recipe, excludedBy: 'allergen' as const };
    }
    if (!satisfiesDiet(recipe, request.dietaryPreference)) {
      return { recipe, excludedBy: 'diet' as const };
    }
    if (!satisfiesDietFlags(recipe, request.dietFlags ?? [])) {
      return { recipe, excludedBy: 'diet' as const };
    }
    if (!canCookWithAppliances(recipe, request.appliances)) {
      return { recipe, excludedBy: 'appliance' as const };
    }
    if (containsDislikedIngredient(recipe, request.dislikedIngredients)) {
      return { recipe, excludedBy: 'disliked' as const };
    }
    if (request.mealType && !recipe.mealTypes.includes(request.mealType)) {
      return { recipe, excludedBy: 'meal_type' as const };
    }
    if (request.cuisine && recipe.cuisine !== request.cuisine) {
      return { recipe, excludedBy: 'cuisine' as const };
    }
    if (request.maxMinutes && recipe.prepMinutes + recipe.cookMinutes > request.maxMinutes) {
      return { recipe, excludedBy: 'time' as const };
    }
    if (request.maxCalories && (recipe.nutrition.calories ?? 0) > request.maxCalories) {
      return { recipe, excludedBy: 'calories' as const };
    }
    if (request.minProteinGrams && (recipe.nutrition.proteinGrams ?? 0) < request.minProteinGrams) {
      return { recipe, excludedBy: 'protein' as const };
    }
    return { recipe, excludedBy: null };
  });
}

// --- Ranking ---------------------------------------------------------------

/**
 * Scoring weights. Tuned so ingredient coverage dominates in "cook with what I
 * have" mode while budget fit dominates in budget mode; the caller picks the
 * mode and the weights follow.
 */
const WEIGHTS = {
  ingredients: { match: 60, budget: 5, time: 10, expiring: 15, cuisine: 5, difficulty: 5 },
  budget: { match: 20, budget: 45, time: 10, expiring: 10, cuisine: 10, difficulty: 5 },
  search: { match: 30, budget: 20, time: 15, expiring: 10, cuisine: 20, difficulty: 5 },
} as const;

function budgetScore(totalMinor: number, budgetMinor: number | null): number {
  if (!budgetMinor || budgetMinor <= 0) return 0.5;
  const verdict = budgetVerdict(totalMinor, budgetMinor);
  if (verdict === 'over') return 0;
  if (verdict === 'slightly_over') return 0.4;
  // Reward using the budget well rather than being trivially cheap: something
  // at 70–100% of budget scores highest.
  const ratio = totalMinor / budgetMinor;
  return ratio >= 0.6 ? 1 : 0.6 + ratio * 0.66;
}

function timeScore(totalMinutes: number, maxMinutes: number | null): number {
  if (maxMinutes && totalMinutes > maxMinutes) return 0;
  // Prefer faster, with diminishing returns past an hour.
  return Math.max(0, 1 - totalMinutes / 90);
}

function difficultyScore(recipe: Recipe, skill: MealRequest['skillLevel']): number {
  const rank = { easy: 0, medium: 1, hard: 2 }[recipe.difficulty];
  const ceiling = { beginner: 0, intermediate: 1, advanced: 2 }[skill];
  if (rank <= ceiling) return 1;
  // One level above the user's comfort is acceptable, two is not.
  return rank - ceiling === 1 ? 0.4 : 0;
}

export type RankOptions = {
  pantryItems?: readonly PantryItem[];
  /** Pre-built index; supply it to avoid rebuilding across calls. */
  availability?: AvailabilityIndex;
  now?: Date;
  limit?: number;
};

/**
 * Filters, prices and ranks recipes for a request. This is the function behind
 * both "Cook with what I have" and "Eat within my budget"; the request's `mode`
 * selects the weighting.
 */
export function rankRecipes(
  recipes: readonly Recipe[],
  request: MealRequest,
  options: RankOptions = {},
): RecipeMatch[] {
  const index =
    options.availability ??
    buildAvailabilityIndex(options.pantryItems ?? [], request.ingredients, { now: options.now });

  // The SAME index the filter used, so a recipe cannot pass strict pantry mode
  // against one view of the kitchen and be scored against another.
  const survivors = applyConstraints(recipes, request, { availability: index }).filter(
    (outcome) => !outcome.excludedBy,
  );

  const matches = survivors.map(({ recipe }) => describeMatch(recipe, request, index));

  const ordered = matches.sort((a, b) => b.score - a.score);
  return options.limit ? ordered.slice(0, options.limit) : ordered;
}

/**
 * Prices and scores ONE recipe against a request, without filtering or sorting.
 *
 * Discover needs this: it browses a page the database already ordered by
 * recency, so re-sorting by score would shuffle page two into page one and
 * make the list jump as the user scrolls. It still wants the cost, the time
 * and the pantry coverage — the facts a card is made of.
 *
 * This performs NO safety filtering. Callers must have run the hard filter.
 */
export function describeMatch(
  recipe: Recipe,
  request: MealRequest,
  index: AvailabilityIndex,
): RecipeMatch {
  const weights = WEIGHTS[request.mode];
  const match = matchRecipeIngredients(recipe, index);
  const estimate = estimateRecipeCost(recipe, {
    servings: request.servings,
    country: request.country,
    currency: request.currency,
    // What the cook already has is what makes "I have 150 EGP" answerable:
    // the question is about their wallet, not the dish's worth.
    ownedIngredientIds: match.availableIngredients.map((entry) => entry.recipeIngredientId),
  });
  const spendMinor = estimate.toBuy?.totalMinor ?? estimate.totalMinor;

  const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;
  const cuisineBonus = request.cuisine && recipe.cuisine === request.cuisine ? 1 : 0.5;
  const expiringBonus = match.usesExpiringItems.length > 0 ? 1 : 0;

  const score =
    weights.match * (match.matchPercent / 100) +
    weights.budget * budgetScore(spendMinor, request.budgetMinor) +
    weights.time * timeScore(totalMinutes, request.maxMinutes) +
    weights.expiring * expiringBonus +
    weights.cuisine * cuisineBonus +
    weights.difficulty * difficultyScore(recipe, request.skillLevel);

  return {
    recipe,
    matchPercent: match.matchPercent,
    haveCount: match.haveCount,
    requiredCount: match.requiredCount,
    missingIngredients: match.missingIngredients,
    availableIngredients: match.availableIngredients,
    // Both figures travel: the dish's full cost, and what this cook still
    // has to spend. Rendering one as the other is how a budget lies.
    estimatedCost: toPricedAmount(estimate),
    estimatedSpend: toSpendAmount(estimate),
    usesExpiringItems: match.usesExpiringItems,
    score: Math.round(score * 100) / 100,
  };
}

export type SortMode = 'best' | 'cheapest' | 'fastest' | 'protein';

export function sortMatches(matches: readonly RecipeMatch[], mode: SortMode): RecipeMatch[] {
  const copy = [...matches];
  switch (mode) {
    case 'cheapest':
      return copy.sort(
        (a, b) =>
          (a.estimatedCost?.money.amountMinor ?? Number.MAX_SAFE_INTEGER) -
          (b.estimatedCost?.money.amountMinor ?? Number.MAX_SAFE_INTEGER),
      );
    case 'fastest':
      return copy.sort(
        (a, b) =>
          a.recipe.prepMinutes +
          a.recipe.cookMinutes -
          (b.recipe.prepMinutes + b.recipe.cookMinutes),
      );
    case 'protein':
      return copy.sort(
        (a, b) => (b.recipe.nutrition.proteinGrams ?? 0) - (a.recipe.nutrition.proteinGrams ?? 0),
      );
    case 'best':
    default:
      return copy.sort((a, b) => b.score - a.score);
  }
}
