import {
  ALLERGENS,
  APPLIANCES,
  CUISINES,
  DIET_FLAGS,
  DIETARY_PREFERENCES,
  MEAL_TYPES,
  SKILL_LEVELS,
} from '../../../src/types/domain.ts';
import {
  AI_LIMITS,
  parseSuggestResponse,
  SUGGEST_JSON_SCHEMA,
} from '../../../src/features/ai/schema.ts';

import { anthropicClient, callStructured } from '../_shared/anthropic.ts';
import { authenticate, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { SUGGEST_SYSTEM_PROMPT } from '../_shared/prompts.ts';
import { checkRateLimit, recordUsage } from '../_shared/rate-limit.ts';
import {
  sanitiseEnum,
  sanitiseEnumList,
  sanitiseInt,
  sanitiseList,
} from '../_shared/sanitise.ts';

/**
 * Recipe generation.
 *
 * Flow: authenticate -> rate limit -> sanitise -> call Claude with a JSON
 * Schema -> validate -> record usage. Any failure returns a stable error code;
 * the client falls back to its local catalogue, so a user never sees a dead
 * end because generation was unavailable.
 */

const FUNCTION_NAME = 'ai-suggest';

/** Builds the model's request payload from the client's, discarding anything unrecognised. */
function buildPayload(body: Record<string, unknown>) {
  return {
    mode: sanitiseEnum(body.mode, ['ingredients', 'budget', 'search'] as const) ?? 'ingredients',
    ingredientsOnHand: sanitiseList(body.ingredients, AI_LIMITS.maxIngredients, 60),
    expiringSoon: sanitiseList(body.expiringSoon, 10, 60),
    // Deliberately NOT a currency amount: the model is told a budget band so it
    // can pitch the dish, but it never returns prices — the app computes cost.
    budgetBand: sanitiseEnum(body.budgetBand, ['low', 'medium', 'high'] as const),
    servings: sanitiseInt(body.servings, 1, AI_LIMITS.maxServings) ?? 2,
    mealType: sanitiseEnum(body.mealType, MEAL_TYPES),
    cuisine: sanitiseEnum(body.cuisine, CUISINES),
    maxMinutes: sanitiseInt(body.maxMinutes, 5, AI_LIMITS.maxMinutes),
    minProteinGrams: sanitiseInt(body.minProteinGrams, 0, 300),
    maxCalories: sanitiseInt(body.maxCalories, 0, 5000),
    // Safety-critical constraints. Narrowed to the known enum, so an unknown
    // value from a tampered client cannot become free-text in the prompt.
    allergensToAvoid: sanitiseEnumList(body.allergens, ALLERGENS),
    diet: sanitiseEnum(body.dietaryPreference, DIETARY_PREFERENCES) ?? 'none',
    // Halal and keto are independent of the eating style, so they travel as
    // their own narrowed list rather than overwriting `diet`.
    dietFlags: sanitiseEnumList(body.dietFlags, DIET_FLAGS),
    dislikedIngredients: sanitiseList(body.dislikedIngredients, 20, 60),
    availableAppliances: sanitiseEnumList(body.appliances, APPLIANCES),
    skillLevel: sanitiseEnum(body.skillLevel, SKILL_LEVELS) ?? 'intermediate',
    country: sanitiseEnum(body.country, ['EG', 'SA', 'AE', 'US', 'GB'] as const) ?? 'EG',
    query: sanitiseList([body.query], 1, 200)[0] ?? null,
  };
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return errorResponse('invalid_request', origin);
  }

  const caller = await authenticate(request);
  if (!caller) return errorResponse('unauthorized', origin);

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') return errorResponse('invalid_request', origin);

  const admin = serviceClient();

  const verdict = await checkRateLimit(admin, caller.userId);
  if (!verdict.allowed) {
    await recordUsage(admin, {
      userId: caller.userId,
      functionName: FUNCTION_NAME,
      model: 'none',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      status: 'rate_limited',
      retryCount: 0,
    });
    // Reported separately so the client can say "we could not check" rather
    // than "you have used your quota", and retry sooner.
    return errorResponse('rate_limited', origin, {
      retryAfterMinutes: verdict.retryAfterMinutes,
      reason: verdict.reason,
    });
  }

  const payload = buildPayload(body as Record<string, unknown>);
  const startedAt = Date.now();

  let client;
  try {
    client = anthropicClient();
  } catch {
    // No API key configured. A deployment gap, not a user error — the client
    // falls back to local results.
    console.error('anthropic_key_missing');
    return errorResponse('ai_unavailable', origin);
  }

  const result = await callStructured(client, {
    system: SUGGEST_SYSTEM_PROMPT,
    userPayload: payload,
    jsonSchema: SUGGEST_JSON_SCHEMA as Record<string, unknown>,
    parse: parseSuggestResponse,
  });

  const latencyMs = Date.now() - startedAt;

  await recordUsage(admin, {
    userId: caller.userId,
    functionName: FUNCTION_NAME,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs,
    status: result.value
      ? 'ok'
      : result.error?.startsWith('upstream_') || result.error === 'refusal'
        ? 'upstream_error'
        : 'invalid_output',
    retryCount: result.retryCount,
  });

  if (!result.value) {
    // Schema paths and codes only — no model output, no user text.
    console.error('ai_suggest_failed', { reason: result.error, retries: result.retryCount });
    return errorResponse(
      result.error?.startsWith('upstream_') || result.error === 'refusal'
        ? 'ai_unavailable'
        : 'ai_invalid_output',
      origin,
    );
  }

  return jsonResponse({ recipes: result.value.recipes }, origin);
});
