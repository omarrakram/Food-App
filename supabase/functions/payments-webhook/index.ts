import { serviceClient } from '../_shared/auth.ts';
import {
  failureFrom,
  metadataFrom,
  outcomeFrom,
  paymobConfig,
  sanitiseCallback,
  verifyHmac,
} from '../_shared/paymob.ts';

/**
 * The provider's callback, which is the only proof of payment there is.
 *
 * WHAT THIS IS NOT: the customer's success screen, the redirect their browser
 * followed, or a parameter in a URL. Every one of those is under the
 * customer's control. This endpoint takes a signed body from Paymob and is the
 * single route by which an order becomes paid.
 *
 * FOUR THINGS IT MUST SURVIVE, because networks do all of them:
 *
 *   DUPLICATE DELIVERY   the same event twice. `record_payment_event` keys on
 *                        the provider's own event id and returns `duplicate`.
 *   OUT OF ORDER         a failure after a success. The database refuses to
 *                        un-settle a settled attempt.
 *   UNKNOWN REFERENCE    an event for something we cannot find. Stored anyway:
 *                        it is the only evidence somebody was charged for
 *                        nothing.
 *   A FORGED BODY        rejected before anything is read out of it.
 *
 * WHAT IT STORES is `sanitiseCallback(body)` — an allow-list of the provider
 * ids, amounts, outcome flags and response codes. Not the billing block, not
 * the customer contact details we already hold on the order, and nothing
 * token-shaped.
 *
 * IT ALWAYS ANSWERS 200 once the signature is good. A provider that receives a
 * 500 retries, and retrying a duplicate forever is a self-inflicted outage —
 * so what we decided goes in the body, and the decision is recorded in
 * `payment_events` either way.
 *
 * DEPLOY WITH --no-verify-jwt. Paymob has no Supabase token; the HMAC is the
 * authentication.
 */

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let config;
  try {
    config = paymobConfig();
  } catch (error) {
    console.error(String(error));
    return new Response('misconfigured', { status: 500 });
  }
  if (!config) {
    // No credentials means no Paymob callback can be genuine. Refusing is the
    // only safe answer; there is nothing to verify against.
    console.error('payments-webhook called with no Paymob credentials configured');
    return new Response('unavailable', { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const obj = (body.obj ?? {}) as Record<string, unknown>;
  const kind = typeof body.type === 'string' ? body.type : 'transaction';

  // The HMAC arrives as a query parameter on the callback URL, and Paymob also
  // places it in the body on some integrations. Both are checked against the
  // same signature; neither is trusted on its own.
  const url = new URL(request.url);
  const provided = url.searchParams.get('hmac') ?? (typeof body.hmac === 'string' ? body.hmac : null);

  if (!(await verifyHmac(config.hmacSecret, obj, provided))) {
    // Nothing is stored. An unverified body is not evidence of anything, and
    // writing it would let anybody fill the log.
    console.warn('rejected a callback with an invalid signature');
    return new Response('invalid signature', { status: 401 });
  }

  const eventId = obj.id === undefined || obj.id === null ? null : String(obj.id);
  if (!eventId) return new Response('missing transaction id', { status: 400 });

  const order = (obj.order ?? {}) as Record<string, unknown>;
  // OUR payment intent id, echoed back. `special_reference` on the way out,
  // `merchant_order_id` on the way back.
  const reference =
    typeof order.merchant_order_id === 'string' ? order.merchant_order_id : null;

  const admin = serviceClient();

  let intentId: string | null = null;
  if (reference) {
    const { data } = await admin
      .from('payment_intents')
      .select('id')
      .eq('id', reference)
      .maybeSingle();
    intentId = data?.id ?? null;
  }
  if (!intentId && order.id !== undefined) {
    // Fallback: match on the provider's own order id, which we stored when the
    // intention was created. Covers a callback whose reference was dropped.
    const { data } = await admin
      .from('payment_intents')
      .select('id')
      .eq('provider', 'paymob')
      .eq('provider_order_id', String(order.id))
      .maybeSingle();
    intentId = data?.id ?? null;
  }

  const outcome = outcomeFrom(obj);
  const failure = failureFrom(obj);
  const amount = obj.amount_cents === undefined ? null : Number(obj.amount_cents);

  const { data: disposition, error } = await admin.rpc('record_payment_event', {
    p_provider: 'paymob',
    p_kind: kind,
    p_provider_event_id: eventId,
    p_intent_id: intentId,
    p_outcome: outcome,
    p_amount_minor: Number.isFinite(amount) ? amount : null,
    p_provider_reference: eventId,
    p_failure_code: failure.code,
    p_failure_message: failure.message,
    // AN ALLOW-LIST, not the raw body. The signed callback echoes the billing
    // block and, on some integrations, a saved-card token; none of that is
    // evidence about a payment and all of it would sit in a table forever.
    p_payload: sanitiseCallback(body),
  });

  if (error) {
    // A genuine server fault. This is the ONE case where a retry is what we
    // want, so it is the one case that answers non-2xx.
    console.error('record_payment_event failed', error.message);
    return new Response('could not record', { status: 500 });
  }

  if (disposition === 'applied' && outcome === 'succeeded' && intentId) {
    // Attach the provider facts worth keeping. An allow-list, never the raw
    // body: the raw body is in `payment_events`, where nobody can read it.
    await admin
      .from('payment_intents')
      .update({ provider_metadata: metadataFrom(obj) })
      .eq('id', intentId);
  }

  return new Response(JSON.stringify({ disposition }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
