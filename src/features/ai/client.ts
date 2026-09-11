import * as Crypto from 'expo-crypto';

import { AppError } from '@/lib/errors';
import { logError, logInfo } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase/client';
import type { MealRequest, Recipe } from '@/types/domain';

import {
  parseInterpretResponse,
  parseSuggestResponse,
  toDomainRecipe,
  type InterpretResponse,
} from './schema.ts';

/**
 * Client side of the AI edge functions.
 *
 * Every call here is optional to the product: the caller already has local
 * results, and this either adds to them or does not. That is why failures
 * return an empty result rather than throwing, except for the rate limit,
 * which the user should actually be told about.
 */

/**
 * Budget is sent as a BAND, never an amount.
 *
 * The model must not see a currency figure, because a model that sees prices
 * starts quoting them — and the app's whole pricing story is that costs are
 * computed deterministically and labelled as estimates. A band lets it pitch
 * the dish (street food vs. a roast) without inventing a number.
 */
/**
 * Per-serving thresholds, in EGP minor units. 30 EGP a head is a tight
 * everyday budget in the launch market; 100 EGP a head is a treat.
 * Boundaries are inclusive at the low end, so exactly 30 reads as `low`.
 */
const LOW_BAND_CEILING_MINOR = 3000;
const HIGH_BAND_FLOOR_MINOR = 10000;

export function budgetBandFor(
  budgetMinor: number | null,
  servings: number,
): 'low' | 'medium' | 'high' | null {
  if (budgetMinor === null || servings <= 0) return null;
  const perServing = budgetMinor / servings;
  if (perServing <= LOW_BAND_CEILING_MINOR) return 'low';
  if (perServing >= HIGH_BAND_FLOOR_MINOR) return 'high';
  return 'medium';
}

export type SuggestInput = {
  request: MealRequest;
  /** Names of pantry items close to their date, so the model prioritises them. */
  expiringSoon?: string[];
};

/** Maps an edge-function error code onto the app's error taxonomy. */
function toAppErrorFromCode(code: unknown, extra: Record<string, unknown>): AppError {
  switch (code) {
    case 'rate_limited':
      return new AppError('rate_limited', {
        values: {
          minutes: typeof extra.retryAfterMinutes === 'number' ? extra.retryAfterMinutes : 60,
        },
      });
    case 'unauthorized':
      return new AppError('session_expired');
    case 'ai_invalid_output':
      return new AppError('ai_invalid_output');
    case 'invalid_request':
      return new AppError('validation');
    default:
      return new AppError('ai_unavailable');
  }
}

export type SuggestResult = {
  recipes: Recipe[];
  /** Set when generation was unavailable. Callers still render local results. */
  error: AppError | null;
};

/**
 * Requests generated recipes.
 *
 * Returns an empty list plus an error rather than throwing: the results screen
 * shows the local catalogue either way, and a thrown error would turn a
 * degraded experience into a broken one.
 */
export async function requestSuggestions(input: SuggestInput): Promise<SuggestResult> {
  const supabase = getSupabase();
  if (!supabase) return { recipes: [], error: null };

  const { request } = input;

  const { data, error } = await supabase.functions.invoke('ai-suggest', {
    body: {
      mode: request.mode,
      ingredients: request.ingredients,
      expiringSoon: input.expiringSoon ?? [],
      budgetBand: budgetBandFor(request.budgetMinor, request.servings),
      servings: request.servings,
      mealType: request.mealType,
      cuisine: request.cuisine,
      maxMinutes: request.maxMinutes,
      minProteinGrams: request.minProteinGrams,
      maxCalories: request.maxCalories,
      // Safety constraints are re-sent every time rather than cached
      // server-side, so a preference edit takes effect on the next request.
      allergens: request.allergens,
      dietaryPreference: request.dietaryPreference,
      dietFlags: request.dietFlags,
      dislikedIngredients: request.dislikedIngredients,
      appliances: request.appliances,
      skillLevel: request.skillLevel,
      country: request.country,
      query: request.query,
    },
  });

  if (error) {
    // supabase-js puts a non-2xx body on the error's context.
    const body = await readErrorBody(error);
    const appError = toAppErrorFromCode(body?.error, body ?? {});
    logError('ai_suggest_request_failed', error, { code: String(body?.error ?? 'unknown') });
    return { recipes: [], error: appError };
  }

  const parsed = parseSuggestResponse(data);
  if (!parsed.ok) {
    // The function validates too; reaching here means the contract drifted.
    logError('ai_suggest_response_invalid', new Error(parsed.error));
    return { recipes: [], error: new AppError('ai_invalid_output') };
  }

  const recipes = parsed.value.recipes.map((generated) =>
    toDomainRecipe(generated, () => Crypto.randomUUID()),
  );

  logInfo('ai_suggest_ok', { count: recipes.length });
  return { recipes, error: null };
}

export type InterpretResult = {
  interpretation: InterpretResponse | null;
  error: AppError | null;
};

/**
 * Asks the model to decompose a query the deterministic parser could not.
 *
 * Only called when `interpretQuery` scores below `LOW_CONFIDENCE` — the common
 * case never reaches the network.
 */
export async function requestInterpretation(
  query: string,
  currency: string,
): Promise<InterpretResult> {
  const supabase = getSupabase();
  if (!supabase) return { interpretation: null, error: null };

  const { data, error } = await supabase.functions.invoke('ai-interpret', {
    body: { query, currency },
  });

  if (error) {
    const body = await readErrorBody(error);
    return { interpretation: null, error: toAppErrorFromCode(body?.error, body ?? {}) };
  }

  const payload = (data as { interpretation?: unknown } | null)?.interpretation;
  const parsed = parseInterpretResponse(payload);
  if (!parsed.ok) {
    return { interpretation: null, error: new AppError('ai_invalid_output') };
  }

  return { interpretation: parsed.value, error: null };
}

/**
 * Reads the JSON body off a FunctionsHttpError.
 *
 * supabase-js exposes the failing Response on `context`; without it we cannot
 * tell a rate limit from an outage, and the user would get the wrong message.
 */
async function readErrorBody(
  error: unknown,
): Promise<(Record<string, unknown> & { error?: unknown }) | null> {
  const context = (error as { context?: unknown }).context;
  if (!context || typeof (context as Response).json !== 'function') return null;
  try {
    return (await (context as Response).json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
