import { serviceClient } from '../_shared/auth.ts';
import { paymobConfig, refundTransaction } from '../_shared/paymob.ts';

/**
 * The thing that actually sends money back.
 *
 * Everything before this was bookkeeping: `order_refund_position` could say a
 * customer was owed 45.00 EGP and nothing in the system could pay it. This is
 * the other end of that sentence.
 *
 * FOUR PROPERTIES IT HAS TO HAVE, and each one is a way a refund system
 * ordinarily goes wrong:
 *
 *   IT NEVER CHOOSES AN AMOUNT. The amount was derived in the database by
 *   `request_refund`, from the capture and the adjustment ledger. This function
 *   reads it off the claimed row and sends exactly that.
 *
 *   IT CLAIMS BEFORE IT CALLS. `claim_refund_attempts` marks the row
 *   `processing` and increments the attempt counter in the same statement, with
 *   `for update skip locked`. Two copies of this function running at once take
 *   different rows; a crash mid-flight leaves a `processing` row for the
 *   stalled sweep, not a row the next pass re-sends.
 *
 *   IT DISTINGUISHES "NO" FROM "NO ANSWER". A refusal is retried on a backoff.
 *   A timeout, a 5xx or an unreadable body is `ambiguous`, which stops
 *   automatic retry dead and asks for a person — because the request may have
 *   succeeded, and the cost of guessing wrong is paying the customer twice.
 *   That is also Paymob's own instruction for this endpoint.
 *
 *   IT IS BOUNDED. One pass, a handful of refunds. A backlog drains across
 *   passes rather than in one transaction holding a lock.
 *
 * SERVICE ROLE ONLY. There is no user here and nothing a customer or a
 * merchant could usefully ask it to do.
 *
 * DEMO PAYMENTS ARE SETTLED LOCALLY, and that is not a shortcut: a `demo`
 * provider attempt never moved real money, so there is nothing at Paymob to
 * reverse. The refund is recorded against the demo provider with its own
 * synthetic reference, and `record_payment_event`'s provider check keeps the
 * two worlds from ever settling each other.
 */

/** One pass sends a few. The scheduler runs every five minutes. */
const BATCH = 10;

type Claimed = {
  id: string;
  order_id: string;
  provider: string;
  provider_transaction_id: string | null;
  amount_minor: number;
  currency: string;
  attempts: number;
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const authorization = request.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || authorization !== `Bearer ${serviceKey}`) {
    return new Response('unauthorized', { status: 401 });
  }

  let config;
  try {
    config = paymobConfig();
  } catch (error) {
    // Half-configured credentials. Claiming rows we cannot act on would move
    // them into `processing` for the sweeper to abandon, so we stop first.
    console.error(String(error));
    return new Response('misconfigured', { status: 500 });
  }

  const admin = serviceClient();

  const { data: claimed, error } = await admin.rpc('claim_refund_attempts', { p_limit: BATCH });
  if (error) {
    console.error('could not claim refunds', error.message);
    return new Response('could not claim', { status: 500 });
  }

  const work = (claimed ?? []) as Claimed[];
  let succeeded = 0;
  let failed = 0;
  let ambiguous = 0;

  for (const refund of work) {
    let outcome: 'succeeded' | 'failed' | 'ambiguous';
    let reference: string | null = null;
    let code: string | null = null;
    let message: string | null = null;

    if (refund.provider === 'demo') {
      outcome = 'succeeded';
      reference = `demo-refund:${refund.id}`;
    } else if (refund.provider !== 'paymob') {
      // A provider nothing in this build can talk to. Recorded as a refusal so
      // the debt stays visible and somebody has to decide what to do.
      outcome = 'failed';
      code = 'unsupported_provider';
      message = `no refund path for provider ${refund.provider}`;
    } else if (!config) {
      outcome = 'failed';
      code = 'paymob_not_configured';
      message = 'no Paymob credentials in this environment';
    } else {
      const result = await refundTransaction(
        config,
        refund.provider_transaction_id ?? '',
        refund.amount_minor,
      );
      outcome = result.outcome;
      reference = result.reference;
      code = result.code;
      message = result.message;
    }

    const { error: recordError } = await admin.rpc('record_refund_result', {
      p_refund_id: refund.id,
      p_outcome: outcome,
      p_reference: reference,
      p_error_code: code,
      p_error_message: message,
    });

    if (recordError) {
      // The money may have moved and we could not write it down. That is the
      // worst state available, so it is logged loudly and left `processing`
      // for the stalled sweep to hand to a person.
      console.error('could not record refund result', refund.id, recordError.message);
      ambiguous += 1;
      continue;
    }

    if (outcome === 'succeeded') succeeded += 1;
    else if (outcome === 'failed') failed += 1;
    else ambiguous += 1;
  }

  return new Response(
    JSON.stringify({
      claimed: work.length,
      succeeded,
      failed,
      ambiguous,
      ...(config ? {} : { note: 'paymob_not_configured' }),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
