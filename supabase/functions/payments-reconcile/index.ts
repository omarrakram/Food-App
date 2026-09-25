import { serviceClient } from '../_shared/auth.ts';
import {
  failureFrom,
  fetchTransactionByReference,
  outcomeFrom,
  paymobConfig,
  sanitiseCallback,
} from '../_shared/paymob.ts';

/**
 * Attempts the webhook never came back about.
 *
 * COMMERCE-5 LEFT THIS HOLE AND NAMED IT: an intent stuck in `processing`
 * because a callback was lost looks exactly like one still in flight, and the
 * customer sits on "confirming your payment" forever while their money may or
 * may not have moved.
 *
 * WEBHOOK FIRST, ALWAYS. This is not a poller: it asks the provider only about
 * attempts that have been abnormal for longer than a threshold, and it applies
 * the answer through `record_payment_event` — the same function, the same
 * duplicate guard, the same state rules. A reconciled payment is not a
 * different kind of payment.
 *
 * SERVICE ROLE ONLY. Deploy without a public route, or behind a scheduler.
 */

/** Below this, the callback is simply still on its way. */
const STUCK_AFTER_MINUTES = 15;
/** One pass does a bounded amount of work; a backlog drains over passes. */
const BATCH = 25;

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

  // The caller must present the service-role key. There is no user here and
  // nothing a customer could usefully ask this to do.
  const authorization = request.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || authorization !== `Bearer ${serviceKey}`) {
    return new Response('unauthorized', { status: 401 });
  }

  let config;
  try {
    config = paymobConfig();
  } catch (error) {
    console.error(String(error));
    return new Response('misconfigured', { status: 500 });
  }

  const admin = serviceClient();
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60_000).toISOString();

  const { data: stuck, error } = await admin
    .from('payment_intents')
    .select('id, amount_minor, provider, state, created_at')
    .eq('provider', 'paymob')
    .in('state', ['requires_action', 'processing'])
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error('could not list stuck attempts', error.message);
    return new Response('could not list', { status: 500 });
  }

  const attempts = stuck ?? [];

  /*
    NO CREDENTIALS, NO INVENTED ANSWERS.

    With Paymob unconfigured this reports what it WOULD have asked about and
    stops. Returning "all clear" would be a lie about money, and making one up
    would be worse.
  */
  if (!config) {
    return new Response(
      JSON.stringify({ checked: 0, stuck: attempts.length, skipped: 'paymob_not_configured' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let applied = 0;
  let unresolved = 0;

  for (const attempt of attempts) {
    let transaction: Record<string, unknown> | null = null;
    try {
      transaction = await fetchTransactionByReference(config, attempt.id);
    } catch (lookupError) {
      // A provider that is down is not an answer about this payment.
      console.error('paymob lookup failed', String(lookupError));
      unresolved += 1;
      continue;
    }

    if (!transaction) {
      // The provider has never heard of it. That is not a failure either — the
      // customer may simply never have opened the checkout page — so the
      // attempt is left alone and expires on its own.
      unresolved += 1;
      continue;
    }

    const outcome = outcomeFrom(transaction);
    if (outcome === 'pending') {
      unresolved += 1;
      continue;
    }

    const failure = failureFrom(transaction);
    const eventId = String(transaction.id ?? `reconcile-${attempt.id}`);
    const amount = transaction.amount_cents === undefined ? null : Number(transaction.amount_cents);

    const { data: disposition, error: recordError } = await admin.rpc('record_payment_event', {
      p_provider: 'paymob',
      // A distinct kind, so the log says this came from a lookup rather than
      // from a callback. Same duplicate guard either way: if the callback does
      // arrive later, it is a different kind and is applied, and the state
      // rules make the second one a no-op.
      p_kind: 'reconciliation',
      p_provider_event_id: eventId,
      p_intent_id: attempt.id,
      p_outcome: outcome,
      p_amount_minor: Number.isFinite(amount) ? amount : null,
      p_provider_reference: eventId,
      p_failure_code: failure.code,
      p_failure_message: failure.message,
      p_payload: sanitiseCallback({ type: 'RECONCILIATION', obj: transaction }),
    });

    if (recordError) {
      console.error('reconciliation could not be recorded', recordError.message);
      unresolved += 1;
      continue;
    }
    if (disposition === 'applied') applied += 1;
  }

  return new Response(
    JSON.stringify({ checked: attempts.length, applied, unresolved }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
