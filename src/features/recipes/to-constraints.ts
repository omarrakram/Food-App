import type { MealRequest } from '@/types/domain';

import type { RecipeConstraints } from './constraints';

/**
 * The UI-level request, as the canonical constraint model.
 *
 * Every screen still builds a `MealRequest`; this is the single place it turns
 * into the thing the filter actually reads, so a screen cannot accidentally
 * express a constraint the filter does not know about.
 */
export function toConstraints(request: MealRequest): RecipeConstraints {
  return {
    allergens: request.allergens,
    eatingStyle: request.dietaryPreference,
    dietFlags: request.dietFlags ?? [],
    excludedIngredients: [
      ...request.excludedIngredients,
      // A saved "food I avoid" is a dislike unless the user said otherwise.
      // It filters, rather than merely down-ranking, which is what makes the
      // preference mean something.
      ...request.dislikedIngredients.map((label) => ({
        slug: null,
        label,
        severity: 'dislike' as const,
      })),
    ],
    allowDislikedIngredients: request.allowDislikedIngredients,
    requiredIngredients: request.requiredIngredients,
    appliances: request.appliances,
    mealType: request.mealType,
    cuisine: request.cuisine,
    maxMinutes: request.maxMinutes,
    maxCalories: request.maxCalories,
    minProteinGrams: request.minProteinGrams,
    // Collections are chosen on a screen rather than saved in preferences, so
    // a request never carries one; callers add them to the constraints.
    tags: [],
    pantryMode: request.pantryMode,
    maxMissingIngredients: request.maxMissingIngredients ?? null,
    // "Cook with what I have" is the flow where a recipe using none of it is
    // a non-answer. Discover and budget do not supply ingredients, so this is
    // inert for them.
    mustUseSomethingAvailable: request.mode === 'ingredients',
    availableIngredients: request.ingredients,
    servings: request.servings,
    budgetMinor: request.budgetMinor,
    currency: request.currency,
    country: request.country,
    skillLevel: request.skillLevel,
    preferredCuisines: request.cuisine ? [request.cuisine] : [],
    alwaysAvailableIngredients: request.alwaysAvailableIngredients ?? [],
    query: request.query,
  };
}
