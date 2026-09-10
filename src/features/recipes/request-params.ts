import type {
  Cuisine,
  MealRequest,
  MealType,
  UserPreferences,
} from '@/types/domain';
import { CUISINES, MEAL_TYPES } from '@/types/domain';

import { requestDefaultsFrom } from '@/features/preferences/preferences-provider';

/**
 * URL-parameter encoding for a meal request.
 *
 * Results screens read their request from route params rather than a shared
 * store, so a result set is deep-linkable, survives a reload, and back/forward
 * behave correctly. Preference-derived fields (allergens, diet, appliances) are
 * NOT encoded — they are re-read from the user's profile so a shared link can
 * never carry someone else's allergy settings.
 */

export type RequestParams = Record<string, string | undefined>;

export function encodeRequest(request: MealRequest): RequestParams {
  const params: RequestParams = { mode: request.mode };

  if (request.ingredients.length > 0) params.ingredients = request.ingredients.join('|');
  if (request.budgetMinor !== null) params.budget = String(request.budgetMinor);
  if (request.mealType) params.meal = request.mealType;
  if (request.cuisine) params.cuisine = request.cuisine;
  if (request.maxMinutes !== null) params.time = String(request.maxMinutes);
  if (request.minProteinGrams !== null) params.protein = String(request.minProteinGrams);
  if (request.maxCalories !== null) params.calories = String(request.maxCalories);
  if (request.query) params.q = request.query;
  params.servings = String(request.servings);

  return params;
}

function parseIntOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Rebuilds a request from route params, layering the caller's own preferences
 * back on top. Unknown enum values are dropped rather than trusted.
 */
export function decodeRequest(
  params: Record<string, string | string[] | undefined>,
  preferences: UserPreferences,
): MealRequest {
  const defaults = requestDefaultsFrom(preferences);

  const rawMode = first(params.mode);
  const mode: MealRequest['mode'] =
    rawMode === 'budget' || rawMode === 'search' ? rawMode : 'ingredients';

  const rawMeal = first(params.meal);
  const mealType = (MEAL_TYPES as readonly string[]).includes(rawMeal ?? '')
    ? (rawMeal as MealType)
    : null;

  const rawCuisine = first(params.cuisine);
  const cuisine = (CUISINES as readonly string[]).includes(rawCuisine ?? '')
    ? (rawCuisine as Cuisine)
    : null;

  const ingredientsRaw = first(params.ingredients);
  const ingredients = ingredientsRaw
    ? ingredientsRaw
        .split('|')
        .map((entry) => entry.trim())
        .filter(Boolean)
        // Cap the list: a hostile deep link should not be able to build an
        // unbounded prompt or matching workload.
        .slice(0, 40)
    : [];

  const servings = parseIntOrNull(first(params.servings));

  return {
    ...defaults,
    mode,
    ingredients,
    budgetMinor: parseIntOrNull(first(params.budget)),
    mealType,
    cuisine,
    maxMinutes: parseIntOrNull(first(params.time)),
    minProteinGrams: parseIntOrNull(first(params.protein)),
    maxCalories: parseIntOrNull(first(params.calories)),
    query: first(params.q)?.slice(0, 200) ?? null,
    servings: servings && servings > 0 ? Math.min(servings, 20) : defaults.servings,
  };
}

/** Stable cache key for a request, used as a React Query key. */
export function requestFingerprint(request: MealRequest): string {
  return [
    request.mode,
    [...request.ingredients].sort().join(','),
    request.budgetMinor ?? '',
    request.mealType ?? '',
    request.cuisine ?? '',
    request.maxMinutes ?? '',
    request.minProteinGrams ?? '',
    request.maxCalories ?? '',
    request.query ?? '',
    request.servings,
    request.dietaryPreference,
    [...request.allergens].sort().join(','),
  ].join('~');
}
