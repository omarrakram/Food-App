import {
  INTERPRET_JSON_SCHEMA,
  parseInterpretResponse,
} from '../../../src/features/ai/schema.ts';

import { anthropicClient, callStructured } from '../_shared/anthropic.ts';
import { authenticate, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { INTERPRET_SYSTEM_PROMPT } from '../_shared/prompts.ts';
import { checkRateLimit, recordUsage } from '../_shared/rate-limit.ts';
import { sanitiseEnum, sanitiseText } from '../_shared/sanitise.ts';

/**
 * Natural-language query interpretation.
 *
 * The FALLBACK path, not the default: the client parses queries deterministically
 * first (`src/features/search/interpret.ts`) and only calls this when that
 * parser's confidence is low. Most queries never reach here, which keeps the
 * common case instant and free.
 */

const FUNCTION_NAME = 'ai-interpret';
const MAX_QUERY_LENGTH = 200;

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

  const raw = body as Record<string, unknown>;
  const query = sanitiseText(raw.query, MAX_QUERY_LENGTH);
  if (!query) return errorResponse('invalid_request', origin);

  const currency =
    sanitiseEnum(raw.currency, ['EGP', 'SAR', 'AED', 'USD', 'GBP'] as const) ?? 'EGP';

  const admin = serviceClient();

  const verdict = await checkRateLimit(admin, caller.userId);
  if (!verdict.allowed) {
    return errorResponse('rate_limited', origin, {
      retryAfterMinutes: verdict.retryAfterMinutes,
    });
  }

  let client;
  try {
    client = anthropicClient();
  } catch {
    console.error('anthropic_key_missing');
    return errorResponse('ai_unavailable', origin);
  }

  const startedAt = Date.now();
  const result = await callStructured(client, {
    system: INTERPRET_SYSTEM_PROMPT,
    userPayload: { query, currency },
    jsonSchema: INTERPRET_JSON_SCHEMA as Record<string, unknown>,
    parse: parseInterpretResponse,
  });

  await recordUsage(admin, {
    userId: caller.userId,
    functionName: FUNCTION_NAME,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs: Date.now() - startedAt,
    status: result.value ? 'ok' : 'invalid_output',
    retryCount: result.retryCount,
  });

  if (!result.value) {
    console.error('ai_interpret_failed', { reason: result.error, retries: result.retryCount });
    return errorResponse('ai_invalid_output', origin);
  }

  return jsonResponse({ interpretation: result.value }, origin);
});
