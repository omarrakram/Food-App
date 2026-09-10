import Anthropic from '@anthropic-ai/sdk';

import { extractJson, type ParseResult } from '../../../src/features/ai/schema.ts';

/**
 * The Claude call.
 *
 * SECURITY: the API key is read from the function's environment and never
 * leaves this process. Nothing in the mobile bundle can reach it — that is the
 * entire reason recipe generation goes through an edge function rather than
 * calling Anthropic from the app.
 */

/**
 * Model default. Overridable with ANTHROPIC_MODEL so a deployment can move
 * without a code change.
 */
const DEFAULT_MODEL = 'claude-opus-5';

/**
 * Reasoning effort.
 *
 * A user is staring at a loading state while this runs, and the task is
 * well-specified with a strict output schema — so `medium` is the default
 * rather than the API's `high`. Raise it with ANTHROPIC_EFFORT if generated
 * recipes turn out to need more care than they cost.
 */
const DEFAULT_EFFORT: Effort = 'medium';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const EFFORT_LEVELS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function effortFromEnv(): Effort {
  const raw = Deno.env.get('ANTHROPIC_EFFORT');
  return EFFORT_LEVELS.includes(raw as Effort) ? (raw as Effort) : DEFAULT_EFFORT;
}

/** Non-streaming, so keep max_tokens under the SDK's HTTP timeout budget. */
const MAX_TOKENS = 16000;

export type StructuredCallResult<T> = {
  value: T | null;
  /** Why it failed, when `value` is null. Loggable — carries no user text. */
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  retryCount: number;
  model: string;
};

export type StructuredCallOptions<T> = {
  system: string;
  /** The request payload. Serialised as JSON so user text is data, not prose. */
  userPayload: unknown;
  /** JSON Schema the response is constrained to. */
  jsonSchema: Record<string, unknown>;
  /** Validates the parsed JSON. Returns the typed value or a reason. */
  parse: (raw: unknown) => ParseResult<T>;
};

export function anthropicClient(): Anthropic {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}

function textFrom(content: Anthropic.ContentBlock[]): string {
  // With structured outputs the JSON arrives in a text block. Thinking blocks
  // may precede it, so filter rather than taking content[0].
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Calls Claude with a JSON Schema constraint and validates the result.
 *
 * Retries exactly once on a response that fails validation, telling the model
 * what was wrong. A second failure returns null: the caller falls back to
 * local results rather than retrying indefinitely at the user's expense.
 */
export async function callStructured<T>(
  client: Anthropic,
  options: StructuredCallOptions<T>,
): Promise<StructuredCallResult<T>> {
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
  const effort = effortFromEnv();

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: JSON.stringify(options.userPayload) },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastError = 'unknown';

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: options.system,
        messages,
        // `output_config` carries both the reasoning effort and the JSON
        // Schema constraint. The cast is on the schema only: the SDK types it
        // more narrowly than the JSON Schema object Zod produces.
        output_config: {
          effort,
          format: {
            type: 'json_schema',
            schema: options.jsonSchema as Record<string, never>,
          },
        },
      });
    } catch (error) {
      // Upstream failure (network, 5xx, rate limit at Anthropic). Not worth a
      // second attempt here — the client falls back to local results.
      const name = error instanceof Error ? error.name : 'unknown';
      return {
        value: null,
        error: `upstream_${name}`,
        inputTokens,
        outputTokens,
        retryCount: attempt,
        model,
      };
    }

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    // Opus-family models can decline a request outright. Treat it as an
    // unavailable generation rather than a malformed one — retrying the same
    // prompt would decline again.
    if (response.stop_reason === 'refusal') {
      return {
        value: null,
        error: 'refusal',
        inputTokens,
        outputTokens,
        retryCount: attempt,
        model,
      };
    }

    const text = textFrom(response.content);
    const extracted = extractJson(text);

    if (extracted.ok) {
      const parsed = options.parse(extracted.value);
      if (parsed.ok) {
        return {
          value: parsed.value,
          error: null,
          inputTokens,
          outputTokens,
          retryCount: attempt,
          model,
        };
      }
      lastError = parsed.error;
    } else {
      lastError = extracted.error;
    }

    if (attempt === 0) {
      // Feed the failure back so the retry is informed rather than identical.
      // `lastError` is schema paths and codes only — no model text is echoed
      // into the log, though the model does see its own previous attempt.
      //
      // The user turn after it matters: a trailing assistant message would be
      // a prefill, which the Opus-family models reject with a 400.
      messages.push(
        { role: 'assistant', content: text.slice(0, 2000) || '(empty)' },
        {
          role: 'user',
          content: `The previous response did not satisfy the schema (${lastError}). Return only valid JSON matching the schema exactly.`,
        },
      );
    }
  }

  return {
    value: null,
    error: lastError,
    inputTokens,
    outputTokens,
    retryCount: 1,
    model,
  };
}
