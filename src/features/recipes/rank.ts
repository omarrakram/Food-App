import {
  buildAvailabilityIndex,
  matchRecipeIngredients,
  resolveIngredient,
  type AvailabilityIndex,
} from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import { budgetVerdict, estimateRecipeCost, toPricedAmount } from '@/features/pricing/estimate';
import type {
  Allergen,
  DietFlag,
  DietaryPreference,
  MealRequest,
  PantryItem,
  Recipe,
  RecipeMatch,
} from '@/types/domain';

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

/**
 * Diets that forbid whole ingredient categories. A recipe qualifies either by
 * carrying the tag explicitly or by containing no forbidden ingredient.
 */
const DIET_FORBIDDEN_TAGS: Partial<Record<DietaryPreference, Allergen[]>> = {
  vegan: ['dairy', 'eggs', 'fish', 'shellfish'],
  vegetarian: ['fish', 'shellfish'],
};

const MEAT_SLUGS = new Set([
  'chicken-breast',
  'chicken-thigh',
  'ground-beef',
  'beef-cubes',
  'sausage',
  'liver',
]);

const SEAFOOD_SLUGS = new Set(['tilapia', 'shrimp', 'tuna-can']);

function recipeIngredientSlugs(recipe: Recipe): Set<string> {
  const slugs = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    const resolved = resolveIngredient(ingredient.name);
    if (resolved) slugs.add(resolved.slug);
  }
  return slugs;
}

/**
 * ALLERGY SAFETY: a declared allergen is an absolute exclusion.
 *
 * We check both the recipe's declared allergen list and the allergens implied
 * by its ingredients, so a mis-tagged recipe still gets caught. We never reason
 * about "only a trace" or "they could substitute".
 */
export function violatesAllergens(recipe: Recipe, allergens: readonly Allergen[]): boolean {
  if (allergens.length === 0) return false;
  const declared = new Set<Allergen>(recipe.allergens);
  for (const ingredient of recipe.ingredients) {
    const resolved = resolveIngredient(ingredient.name);
    resolved?.allergens.forEach((allergen) => declared.add(allergen));
  }
  return allergens.some((allergen) => declared.has(allergen));
}

export function satisfiesDiet(recipe: Recipe, diet: DietaryPreference): boolean {
  if (diet === 'none' || diet === 'other') return true;
  if (recipe.dietTags.includes(diet)) return true;

  const slugs = recipeIngredientSlugs(recipe);
  const forbiddenAllergens = DIET_FORBIDDEN_TAGS[diet] ?? [];

  const hasForbiddenAllergen = forbiddenAllergens.some((allergen) =>
    recipe.allergens.includes(allergen),
  );

  switch (diet) {
    case 'vegan':
    case 'vegetarian': {
      const hasMeat = [...slugs].some((slug) => MEAT_SLUGS.has(slug));
      const hasSeafood = [...slugs].some((slug) => SEAFOOD_SLUGS.has(slug));
      return !hasMeat && !hasSeafood && !hasForbiddenAllergen;
    }
    case 'pescatarian':
      return ![...slugs].some((slug) => MEAT_SLUGS.has(slug));
    case 'halal':
      // Our curated set contains no pork or alcohol; an untagged recipe from
      // the model is treated as not-yet-verified rather than assumed halal.
      return recipe.dietTags.includes('halal') || recipe.source === 'curated';
    case 'keto':
      return (recipe.nutrition.carbsGrams ?? 999) <= 25;
    default:
      return true;
  }
}

/**
 * Diet flags are checked on top of the eating style, not instead of it.
 *
 * Each flag is its own constraint, so a halal keto user must satisfy both —
 * previously only one diet value could be held at a time, and choosing "halal"
 * silently discarded "vegetarian".
 */
export function satisfiesDietFlags(recipe: Recipe, flags: readonly DietFlag[]): boolean {
  return flags.every((flag) => satisfiesDiet(recipe, flag));
}

/** A recipe the user has no way to cook is not a suggestion. */
export function canCookWithAppliances(
  recipe: Recipe,
  appliances: readonly string[],
): boolean {
  if (appliances.length === 0) return true;
  return recipe.requiredAppliances.every((required) => appliances.includes(required));
}

/** Soft preference, applied as a filter only when the user was explicit. */
export function containsDislikedIngredient(
  recipe: Recipe,
  disliked: readonly string[],
): boolean {
  if (disliked.length === 0) return false;
  const dislikedKeys = new Set(disliked.map(normaliseIngredientName).filter(Boolean));
  return recipe.ingredients.some((ingredient) => {
    if (ingredient.isOptional) return false;
    const resolved = resolveIngredient(ingredient.name);
    const key = resolved
      ? normaliseIngredientName(resolved.name)
      : normaliseIngredientName(ingredient.name);
    return dislikedKeys.has(key);
  });
}

export type FilterReason =
  | 'allergen'
  | 'diet'
  | 'appliance'
  | 'disliked'
  | 'meal_type'
  | 'cuisine'
  | 'time'
  | 'calories'
  | 'protein';

export type FilterOutcome = { recipe: Recipe; excludedBy: FilterReason | null };

/**
 * Applies every constraint in the request. Returns each recipe with the reason
 * it was excluded (or null) so the UI can explain an empty result set instead
 * of just saying "nothing found".
 */
export function applyConstraints(recipes: readonly Recipe[], request: MealRequest): FilterOutcome[] {
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
    if (
      request.minProteinGrams &&
      (recipe.nutrition.proteinGrams ?? 0) < request.minProteinGrams
    ) {
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

  const weights = WEIGHTS[request.mode];
  const survivors = applyConstraints(recipes, request).filter((outcome) => !outcome.excludedBy);

  const matches: RecipeMatch[] = survivors.map(({ recipe }) => {
    const match = matchRecipeIngredients(recipe, index);
    const estimate = estimateRecipeCost(recipe, {
      servings: request.servings,
      country: request.country,
      currency: request.currency,
    });

    const totalMinutes = recipe.prepMinutes + recipe.cookMinutes;
    const cuisineBonus = request.cuisine && recipe.cuisine === request.cuisine ? 1 : 0.5;
    const expiringBonus = match.usesExpiringItems.length > 0 ? 1 : 0;

    const score =
      weights.match * (match.matchPercent / 100) +
      weights.budget * budgetScore(estimate.totalMinor, request.budgetMinor) +
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
      estimatedCost: estimate.coverage > 0 ? toPricedAmount(estimate) : null,
      usesExpiringItems: match.usesExpiringItems,
      score: Math.round(score * 100) / 100,
    };
  });

  const ordered = matches.sort((a, b) => b.score - a.score);
  return options.limit ? ordered.slice(0, options.limit) : ordered;
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
