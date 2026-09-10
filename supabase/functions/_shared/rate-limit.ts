import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Per-user rate limiting.
 *
 * Enforced server-side and counted from `ai_usage_events`, which clients
 * cannot write to (RLS grants them SELECT on their own rows only). A client
 * therefore cannot erase or forge history to get more calls.
 */

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterMinutes: number };

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(Deno.env.get(name) ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function checkRateLimit(
  admin: SupabaseClient,
  userId: string,
): Promise<RateLimitVerdict> {
  const hourlyLimit = intFromEnv('AI_RATE_LIMIT_PER_HOUR', 30);
  const dailyLimit = intFromEnv('AI_RATE_LIMIT_PER_DAY', 150);

  const [hourly, daily] = await Promise.all([
    admin.rpc('ai_call_count', { target_user: userId, window_interval: '1 hour' }),
    admin.rpc('ai_call_count', { target_user: userId, window_interval: '24 hours' }),
  ]);

  // A failure to read the counters must not become a free pass, but it also
  // must not lock every user out of the product. Failing open is the
  // deliberate choice here: the cost ceiling is a business concern, and the
  // Anthropic account's own limits remain as a backstop.
  if (hourly.error || daily.error) {
    console.error('rate_limit_read_failed', { code: hourly.error?.code ?? daily.error?.code });
    return { allowed: true };
  }

  const hourlyCount = Number(hourly.data ?? 0);
  const dailyCount = Number(daily.data ?? 0);

  if (hourlyCount >= hourlyLimit) return { allowed: false, retryAfterMinutes: 60 };
  if (dailyCount >= dailyLimit) return { allowed: false, retryAfterMinutes: 24 * 60 };

  return { allowed: true };
}

export type UsageRecord = {
  userId: string;
  functionName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: 'ok' | 'invalid_output' | 'upstream_error' | 'rate_limited' | 'blocked';
  retryCount: number;
};

/**
 * Records one call.
 *
 * PRIVACY: counters and identifiers only. No prompt, no completion, no user
 * text ever reaches this table.
 */
export async function recordUsage(admin: SupabaseClient, record: UsageRecord): Promise<void> {
  const { error } = await admin.from('ai_usage_events').insert({
    user_id: record.userId,
    function_name: record.functionName,
    model: record.model,
    input_tokens: record.inputTokens,
    output_tokens: record.outputTokens,
    latency_ms: record.latencyMs,
    status: record.status,
    retry_count: record.retryCount,
  });

  // Accounting must never fail the user's request.
  if (error) console.error('usage_record_failed', { code: error.code });
}
