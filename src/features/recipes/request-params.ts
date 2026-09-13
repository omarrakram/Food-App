import type { Cuisine, MealRequest, MealType, UserPreferences } from '@/types/domain';
import { CUISINES, MEAL_TYPES } from '@/types/domain';

import { requestDefaultsFrom } from '@/features/preferences/preferences-provider';

import type { RejectionReason } from './filter';

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
  if (request.requiredIngredients.length > 0) {
    params.must = request.requiredIngredients.join('|');
  }
  // Only the user's own explicit exclusions travel in the URL, and only their
  // labels. Allergies come from the profile at decode time and are never
  // encoded, so a shared link can neither leak nor drop someone's allergy.
  const avoid = request.excludedIngredients
    .filter((entry) => entry.severity !== 'allergy')
    .map((entry) => `${entry.severity === 'hard_avoid' ? '!' : ''}${entry.label}`);
  if (avoid.length > 0) params.avoid = avoid.join('|');
  if (request.pantryMode !== 'off') params.pantry = request.pantryMode;
  // Carried explicitly: "allow 1 missing" and "allow 2 missing" are both
  // `partial`, and a link that lost the number would silently widen or narrow
  // the search the user shared.
  if (request.maxMissingIngredients !== null) {
    params.missing = String(request.maxMissingIngredients);
  }
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

  const splitList = (value: string | undefined) =>
    value
      ? value
          .split('|')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];

  const rawPantry = first(params.pantry);
  const pantryMode: MealRequest['pantryMode'] =
    rawPantry === 'strict' || rawPantry === 'partial' ? rawPantry : 'off';

  // The user's own avoid list from the link, plus everything their profile
  // says. Profile dislikes are `dislike`; a saved allergy is an allergy and
  // is applied through `allergens` as well, so it cannot be lost here.
  const excludedIngredients: MealRequest['excludedIngredients'] = [
    ...splitList(first(params.avoid)).map((label) => ({
      slug: null,
      label: label.startsWith('!') ? label.slice(1) : label,
      severity: (label.startsWith('!') ? 'hard_avoid' : 'dislike') as 'hard_avoid' | 'dislike',
    })),
    ...defaults.dislikedIngredients.map((label) => ({
      slug: null,
      label,
      severity: 'dislike' as const,
    })),
  ];

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
    requiredIngredients: splitList(first(params.must)),
    excludedIngredients,
    pantryMode,
    maxMissingIngredients: clampMissing(parseIntOrNull(first(params.missing))),
    servings: servings && servings > 0 ? Math.min(servings, 20) : defaults.servings,
  };
}

/** A gap budget from a URL is user input; a negative or huge one is not. */
function clampMissing(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.trunc(value), MAX_ALLOWED_MISSING);
}

/**
 * The most gaps the UI will ever offer.
 *
 * Past three, "you could cook this" stops being true in any useful sense —
 * it is a shopping list with a recipe attached.
 */
export const MAX_ALLOWED_MISSING = 3;

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
    [...(request.dietFlags ?? [])].sort().join(','),
    [...request.allergens].sort().join(','),
    [...request.requiredIngredients].sort().join(','),
    request.excludedIngredients
      .map((entry) => `${entry.severity}:${entry.label}`)
      .sort()
      .join(','),
    request.pantryMode,
    request.maxMissingIngredients ?? '',
    request.allowDislikedIngredients ? '1' : '0',
  ].join('~');
}

/**
 * Drops one non-safety constraint from a request.
 *
 * Used by the empty-results screen when the user accepts a relaxation offer.
 * SAFETY: there is deliberately no case for `allergen`, `diet` or
 * `excluded_ingredient` — the default returns the request untouched, so even a
 * caller that asked for one gets no change rather than an unsafe result set.
 */
export function relaxRequest(request: MealRequest, reason: RejectionReason): MealRequest {
  switch (reason) {
    case 'disliked_ingredient':
      return { ...request, allowDislikedIngredients: true };
    case 'missing_required_ingredient':
      return { ...request, requiredIngredients: [] };
    case 'appliance':
      return { ...request, appliances: [] };
    case 'meal_type':
      return { ...request, mealType: null };
    case 'cuisine':
      return { ...request, cuisine: null };
    case 'time':
      return { ...request, maxMinutes: null };
    case 'calories':
      return { ...request, maxCalories: null };
    case 'protein':
      return { ...request, minProteinGrams: null };
    case 'pantry':
      return { ...request, pantryMode: 'partial' };
    default:
      return request;
  }
}
