/**
 * HTTP plumbing shared by every edge function.
 *
 * Two rules encoded here:
 *   1. a response body never contains an upstream error message — the client
 *      renders from a stable `code`, and details stay in the function log,
 *   2. CORS is explicit rather than `*`, because these endpoints act on the
 *      caller's behalf using their JWT.
 */

/**
 * Origins allowed to call these functions.
 *
 * The mobile app sends no Origin header, so it is unaffected. The web build
 * does, which is why the list is configurable rather than hard-coded — set
 * ALLOWED_ORIGINS to a comma-separated list in production.
 */
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };

  if (allowedOrigins.length === 0) {
    // No allow-list configured: development. Echo the origin so local web
    // builds work, but never in a deployment that sets ALLOWED_ORIGINS.
    headers['Access-Control-Allow-Origin'] = origin ?? '*';
  } else if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

/** Error codes the client maps onto translated messages. */
export type ErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'invalid_request'
  | 'ai_unavailable'
  | 'ai_invalid_output'
  | 'server_error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  rate_limited: 429,
  invalid_request: 400,
  ai_unavailable: 503,
  ai_invalid_output: 502,
  server_error: 500,
};

export function jsonResponse(body: unknown, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  code: ErrorCode,
  origin: string | null,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse({ error: code, ...extra }, origin, STATUS_BY_CODE[code]);
}

/** Reads and size-caps a JSON body. A huge body is rejected before parsing. */
const MAX_BODY_BYTES = 64 * 1024;

export async function readJsonBody(request: Request): Promise<unknown | null> {
  const declared = request.headers.get('content-length');
  if (declared && Number.parseInt(declared, 10) > MAX_BODY_BYTES) return null;

  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
