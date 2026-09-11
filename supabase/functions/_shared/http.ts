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
 * The mobile app sends no Origin header and is unaffected by any of this — CORS
 * is a browser mechanism. Only the web build is governed here.
 *
 * Set ALLOWED_ORIGINS to a comma-separated list in any deployment that serves
 * a web client.
 */
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

/**
 * Localhost origins permitted while developing.
 *
 * Named explicitly rather than reached by echoing whatever Origin arrives.
 * Development convenience should be a development rule, not a permissive
 * production fallback that nobody notices is still in place.
 */
const DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** Deno deploy sets this; locally `supabase functions serve` does not. */
const isProduction = (Deno.env.get('ENVIRONMENT') ?? Deno.env.get('DENO_DEPLOYMENT_ID') ?? '') !== '';

export function isOriginAllowed(origin: string | null): boolean {
  // No Origin at all is a native app or a server-to-server call, not a
  // cross-site browser request. Nothing to allow or deny.
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  // Localhost is allowed only when no allow-list is configured AND we are not
  // running in a deployment — i.e. genuinely on a developer's machine.
  return allowedOrigins.length === 0 && !isProduction && DEV_ORIGIN_PATTERN.test(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };

  // Previously this echoed any Origin back whenever ALLOWED_ORIGINS was unset,
  // which turns a forgotten environment variable into "every website may call
  // this with the visitor's credentials". An unlisted origin now simply gets
  // no allow header, and the browser refuses the response.
  if (origin && isOriginAllowed(origin)) {
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
