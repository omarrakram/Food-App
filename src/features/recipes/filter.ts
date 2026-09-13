import {
  buildAvailabilityIndex,
  resolveIngredient,
  type AvailabilityIndex,
} from '@/features/ingredients/matching';
import { normaliseIngredientName } from '@/features/ingredients/normalise';
import type { PantryItem, Recipe } from '@/types/domain';

import {
  essentialIngredients,
  ingredientSlug,
  isAbsolute,
  recipeContains,
  type IngredientRestriction,
  type RecipeConstraints,
} from './constraints';
import { satisfiesDiet, satisfiesDietFlags, violatesAllergens } from './safety';

/**
 * Hard filtering.
 *
 * This module answers one question per recipe: may it be shown at all? Nothing
 * here scores, weights or nudges — a recipe either satisfies every hard
 * constraint or it is removed. Ranking happens afterwards, on the survivors,
 * and can never resurrect one.
 *
 * That separation is the whole point. The previous engine mixed "does this
 * contain something you are allergic to" with "do you tend to like Italian",
 * which is how an excluded ingredient can end up merely down-ranked and still
 * on screen at position nine.
 */

export const REJECTION_REASONS = [
  'allergen',
  'diet',
  'excluded_ingredient',
  'disliked_ingredient',
  'missing_required_ingredient',
  'appliance',
  'meal_type',
  'cuisine',
  'time',
  'calories',
  'protein',
  'pantry',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

/** Reasons that exist to keep someone safe. Never relaxed, never suggested. */
const SAFETY_REASONS: ReadonlySet<RejectionReason> = new Set<RejectionReason>([
  'allergen',
  'diet',
  'excluded_ingredient',
]);

export function isSafetyReason(reason: RejectionReason): boolean {
  return SAFETY_REASONS.has(reason);
}

export type Rejection = {
  reason: RejectionReason;
  /** The specific thing that failed, for an explainable empty state. */
  detail: string | null;
};

export type FilterVerdict = { recipe: Recipe; rejection: Rejection | null };

// --- Individual checks -----------------------------------------------------

/**
 * SAFETY-CRITICAL: an excluded ingredient must never appear.
 *
 * Allergies and hard avoids look at EVERY line including garnishes and
 * optionals — an allergy does not care that the peanuts were a topping, and
 * "leave it off" is not a decision an app may make on someone's behalf.
 *
 * A dislike is different: it is a preference, so a disliked garnish is
 * tolerable when the user has said they will accept substitutions.
 */
export function findExcludedIngredient(
  recipe: Recipe,
  restrictions: readonly IngredientRestriction[],
  allowDisliked: boolean,
): IngredientRestriction | null {
  for (const restriction of restrictions) {
    const absolute = isAbsolute(restriction);
    if (!absolute && allowDisliked) continue;

    const target = restriction.slug ?? restriction.label;
    if (recipeContains(recipe, target, { includeOptional: absolute })) {
      return restriction;
    }
  }
  return null;
}

/**
 * Required ingredients are a requirement, not a hint.
 *
 * "Something with chicken and rice" means every result contains chicken AND
 * rice. Boosting recipes that happen to contain them, which is what a scoring
 * approach does, produces a list where the third result has neither.
 */
export function findMissingRequirement(recipe: Recipe, required: readonly string[]): string | null {
  for (const wanted of required) {
    if (!wanted.trim()) continue;
    if (!recipeContains(recipe, wanted)) return wanted;
  }
  return null;
}

/**
 * Can this be cooked right now, from what the user actually has?
 *
 * Every essential ingredient — not optional, not a garnish, not a background
 * staple — has to be available. An expired pantry item is not available; the
 * availability index has already removed it, and that is a food-safety rule
 * rather than a matching detail.
 */
export function findUnavailableEssential(recipe: Recipe, index: AvailabilityIndex): string | null {
  for (const line of essentialIngredients(recipe)) {
    const resolved = resolveIngredient(line.name);
    const key = normaliseIngredientName(resolved?.name ?? line.name);
    if (!index.available.has(key)) return line.name;
  }
  return null;
}

// --- The pipeline ----------------------------------------------------------

export type FilterOptions = {
  pantryItems?: readonly PantryItem[];
  /** Pre-built index, so a page of results does not rebuild it per recipe. */
  availability?: AvailabilityIndex;
  now?: Date;
};

export function buildIndexFor(
  constraints: RecipeConstraints,
  options: FilterOptions = {},
): AvailabilityIndex {
  return (
    options.availability ??
    buildAvailabilityIndex(
      constraints.pantryMode === 'off' ? [] : (options.pantryItems ?? []),
      constraints.availableIngredients,
      { now: options.now },
    )
  );
}

/**
 * Runs every hard constraint against one recipe.
 *
 * Order is deliberate: safety first, so the reason a user is shown for an
 * empty result set is the most important one rather than whichever check
 * happened to run first.
 */
export function checkRecipe(
  recipe: Recipe,
  constraints: RecipeConstraints,
  index: AvailabilityIndex,
): Rejection | null {
  if (violatesAllergens(recipe, constraints.allergens)) {
    return { reason: 'allergen', detail: null };
  }

  if (!satisfiesDiet(recipe, constraints.eatingStyle)) {
    return { reason: 'diet', detail: constraints.eatingStyle };
  }
  if (!satisfiesDietFlags(recipe, constraints.dietFlags)) {
    return { reason: 'diet', detail: constraints.dietFlags.join(', ') || null };
  }

  const excluded = findExcludedIngredient(
    recipe,
    constraints.excludedIngredients,
    constraints.allowDislikedIngredients,
  );
  if (excluded) {
    return {
      reason: isAbsolute(excluded) ? 'excluded_ingredient' : 'disliked_ingredient',
      detail: excluded.label,
    };
  }

  const missing = findMissingRequirement(recipe, constraints.requiredIngredients);
  if (missing) return { reason: 'missing_required_ingredient', detail: missing };

  if (constraints.appliances.length > 0) {
    const unavailable = recipe.requiredAppliances.find(
      (appliance) => !constraints.appliances.includes(appliance),
    );
    if (unavailable) return { reason: 'appliance', detail: unavailable };
  }

  if (constraints.mealType && !recipe.mealTypes.includes(constraints.mealType)) {
    return { reason: 'meal_type', detail: constraints.mealType };
  }

  if (constraints.cuisine && recipe.cuisine !== constraints.cuisine) {
    return { reason: 'cuisine', detail: constraints.cuisine };
  }

  if (constraints.maxMinutes && recipe.prepMinutes + recipe.cookMinutes > constraints.maxMinutes) {
    return { reason: 'time', detail: String(constraints.maxMinutes) };
  }

  if (constraints.maxCalories && (recipe.nutrition.calories ?? 0) > constraints.maxCalories) {
    return { reason: 'calories', detail: String(constraints.maxCalories) };
  }

  if (
    constraints.minProteinGrams &&
    (recipe.nutrition.proteinGrams ?? 0) < constraints.minProteinGrams
  ) {
    return { reason: 'protein', detail: String(constraints.minProteinGrams) };
  }

  if (constraints.pantryMode === 'strict') {
    const unavailable = findUnavailableEssential(recipe, index);
    if (unavailable) return { reason: 'pantry', detail: unavailable };
  }

  return null;
}

export function filterRecipes(
  recipes: readonly Recipe[],
  constraints: RecipeConstraints,
  options: FilterOptions = {},
): FilterVerdict[] {
  const index = buildIndexFor(constraints, options);
  return recipes.map((recipe) => ({
    recipe,
    rejection: checkRecipe(recipe, constraints, index),
  }));
}

// --- Explaining an empty result set ----------------------------------------

/**
 * A constraint the user could drop, and what it would get them.
 *
 * SAFETY: allergies, diet and hard avoids never appear here. When nothing
 * matches we say so; we do not offer to stop honouring an allergy, and we
 * never silently do it.
 */
export type Relaxation = {
  reason: RejectionReason;
  detail: string | null;
  /** How many recipes would come back if only this were dropped. */
  wouldReturn: number;
};

/** Removes one constraint, so we can count what it alone is costing. */
function without(constraints: RecipeConstraints, reason: RejectionReason): RecipeConstraints {
  switch (reason) {
    case 'disliked_ingredient':
      return { ...constraints, allowDislikedIngredients: true };
    case 'missing_required_ingredient':
      return { ...constraints, requiredIngredients: [] };
    case 'appliance':
      return { ...constraints, appliances: [] };
    case 'meal_type':
      return { ...constraints, mealType: null };
    case 'cuisine':
      return { ...constraints, cuisine: null };
    case 'time':
      return { ...constraints, maxMinutes: null };
    case 'calories':
      return { ...constraints, maxCalories: null };
    case 'protein':
      return { ...constraints, minProteinGrams: null };
    case 'pantry':
      return { ...constraints, pantryMode: 'partial' };
    default:
      // Safety constraints are not relaxable. Returning them unchanged means
      // `wouldReturn` stays 0 and they never surface as a suggestion.
      return constraints;
  }
}

/**
 * What the user could give up to get results, ranked by how much it would help.
 *
 * Only offered when the result set is empty. Each option is evaluated on its
 * own, so the count shown is honest: "drop the 20-minute limit → 34 recipes"
 * means exactly that, not "somewhere between one and thirty-four depending on
 * what else you also drop".
 */
export function suggestRelaxations(
  recipes: readonly Recipe[],
  constraints: RecipeConstraints,
  options: FilterOptions = {},
): Relaxation[] {
  const verdicts = filterRecipes(recipes, constraints, options);
  const blocking = new Map<RejectionReason, string | null>();

  for (const verdict of verdicts) {
    if (!verdict.rejection) continue;
    if (isSafetyReason(verdict.rejection.reason)) continue;
    if (!blocking.has(verdict.rejection.reason)) {
      blocking.set(verdict.rejection.reason, verdict.rejection.detail);
    }
  }

  const suggestions: Relaxation[] = [];
  for (const [reason, detail] of blocking) {
    const relaxed = filterRecipes(recipes, without(constraints, reason), options);
    const wouldReturn = relaxed.filter((verdict) => !verdict.rejection).length;
    if (wouldReturn > 0) suggestions.push({ reason, detail, wouldReturn });
  }

  return suggestions.sort((a, b) => b.wouldReturn - a.wouldReturn);
}

/**
 * How much of a recipe the user already has, for ranking in `partial` mode.
 *
 * Counts essentials only, so a recipe is not punished for listing a garnish
 * or assuming you own salt.
 */
export function pantryCoverage(recipe: Recipe, index: AvailabilityIndex): number {
  const essentials = essentialIngredients(recipe);
  if (essentials.length === 0) return 1;
  const have = essentials.filter((line) => {
    const resolved = resolveIngredient(line.name);
    return index.available.has(normaliseIngredientName(resolved?.name ?? line.name));
  }).length;
  return have / essentials.length;
}

/** Slugs the user asked for that this recipe actually delivers. */
export function satisfiedRequirements(recipe: Recipe, required: readonly string[]): string[] {
  return required.filter((wanted) => recipeContains(recipe, wanted));
}

/** Exposed for the database layer, which needs the same identity rules. */
export { ingredientSlug };
