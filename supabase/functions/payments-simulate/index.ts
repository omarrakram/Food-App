import { authenticate, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from '../_shared/http.ts';

/**
 * The simulator, for orders from the DEMO merchant only.
 *
 * WHY IT EXISTS. Everything else in Commerce-5 can be tested — the database
 * suite drives `record_payment_event` directly, and the HMAC has unit tests —
 * but nobody can WALK the journey without a payment provider, and a journey
 * nobody has walked is a journey nobody has checked. This stands in for the
 * provider so the flow can be opened in a browser.
 *
 * FOUR THINGS STOP IT REACHING A REAL ORDER, and they are independent:
 *
 *   1. `begin_payment` reads `is_demo` off the MERCHANT and writes
 *      `provider = 'demo'`. Nothing in a request can change that.
 *   2. `record_payment_event` refuses an event whose provider is not the
 *      attempt's, so this cannot settle a Paymob attempt even by id.
 *   3. This function refuses outright in a deployed environment.
 *   4. The caller must own the attempt, proved by their own JWT.
 *
 * It is a simulator and says so. No money moves, no provider is contacted, and
 * the order it settles belongs to a merchant that does not exist.
 */

const OUTCOMES = ['succeeded', 'failed', 'pending'] as const;
type Outcome = (typeof OUTCOMES)[number];

/** Deno Deploy sets this. Locally, `supabase functions serve` does not. */
function isDeployed(): boolean {
  return (Deno.env.get('ENVIRONMENT') ?? Deno.env.get('DENO_DEPLOYMENT_ID') ?? '') !== '';
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') return errorResponse('invalid_request', origin);

  // THE FIRST GATE, before anything is read. A simulated payment in a
  // deployment is the worst outcome available to this file.
  if (isDeployed() && Deno.env.get('ALLOW_PAYMENT_SIMULATOR') !== 'true') {
    return jsonResponse({ error: 'simulator_disabled' }, origin, 404);
  }

  const caller = await authenticate(request);
  if (!caller) return errorResponse('unauthorized', origin);

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') return errorResponse('invalid_request', origin);

  const raw = body as Record<string, unknown>;
  const intentId = typeof raw.intentId === 'string' ? raw.intentId : null;
  const outcome = OUTCOMES.includes(raw.outcome as Outcome) ? (raw.outcome as Outcome) : null;
  if (!intentId || !outcome) return errorResponse('invalid_request', origin);

  // OWNERSHIP, through the caller's own client, so RLS answers it rather than
  // a comparison we wrote.
  const { data: intent, error } = await caller.client
    .from('payment_intents')
    .select('id, provider, amount_minor, state')
    .eq('id', intentId)
    .maybeSingle();

  if (error || !intent) return errorResponse('unauthorized', origin);

  // The second gate, in this file: a Paymob attempt is not ours to settle.
  // `record_payment_event` would refuse it too; this makes the refusal legible.
  if (intent.provider !== 'demo') {
    return jsonResponse({ error: 'not_a_simulated_payment' }, origin, 400);
  }

  const admin = serviceClient();
  const eventId = `sim-${intentId}-${outcome}-${Date.now()}`;

  const { data: disposition, error: recordError } = await admin.rpc('record_payment_event', {
    p_provider: 'demo',
    p_kind: 'transaction',
    p_provider_event_id: eventId,
    p_intent_id: intentId,
    p_outcome: outcome,
    p_amount_minor: intent.amount_minor,
    p_provider_reference: eventId,
    p_failure_code: outcome === 'failed' ? 'simulated_decline' : null,
    p_failure_message: outcome === 'failed' ? 'Simulated decline' : null,
    p_payload: { simulated: true, outcome, intentId },
  });

  if (recordError) {
    console.error('simulated record_payment_event failed', recordError.message);
    return errorResponse('server_error', origin);
  }

  return jsonResponse({ disposition, simulated: true }, origin);
});
