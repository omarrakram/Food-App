import { authenticate, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, jsonResponse, readJsonBody } from '../_shared/http.ts';
import {
  checkoutUrl,
  createIntention,
  paymobConfig,
  PaymobNotConfigured,
} from '../_shared/paymob.ts';

/**
 * Start paying for an order.
 *
 * THE TRUSTED BOUNDARY. Two things happen here and neither can happen anywhere
 * else:
 *
 *   1. `begin_payment` runs AS THE CALLER, with their JWT, so `auth.uid()` is
 *      real and the ownership, freshness and amount checks are the database's
 *      rather than ours. The amount is derived there, from the order. Nothing
 *      in the request body can name a price.
 *
 *   2. The provider call uses a SECRET KEY, which is why this is a function and
 *      not a client-side fetch. The key is read from the environment, never
 *      returned and never logged.
 *
 * The response carries a URL to send the customer to and nothing else that
 * matters. The success of what happens at that URL is decided by the signed
 * callback in `payments-webhook`, not by the customer coming back.
 */

const METHODS = ['card', 'wallet'] as const;
type Method = (typeof METHODS)[number];

/** Refusals `begin_payment` can raise, as codes a screen can translate. */
const REFUSALS = new Set([
  'not_authenticated',
  'order_not_found',
  'already_paid',
  'payment_in_flight',
  'attempt_in_flight',
  'order_not_payable',
  'draft_expired',
  'merchant_not_enabled',
  'merchant_not_accepting',
  'product_delisted',
  'product_out_of_stock',
  'price_changed',
  'amount_not_payable',
  'method_not_supported',
  'idempotency_key_reused',
]);

function refusalFrom(message: string | undefined): string | null {
  if (!message) return null;
  for (const code of REFUSALS) {
    if (message.includes(code)) return code;
  }
  return null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') return errorResponse('invalid_request', origin);

  const caller = await authenticate(request);
  if (!caller) return errorResponse('unauthorized', origin);

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') return errorResponse('invalid_request', origin);

  const raw = body as Record<string, unknown>;
  const orderId = typeof raw.orderId === 'string' ? raw.orderId : null;
  const idempotencyKey =
    typeof raw.idempotencyKey === 'string' && raw.idempotencyKey.length <= 200
      ? raw.idempotencyKey
      : null;
  const method = METHODS.includes(raw.method as Method) ? (raw.method as Method) : null;

  if (!orderId || !idempotencyKey || !method) return errorResponse('invalid_request', origin);

  // --- The database decides whether this may happen at all -----------------
  const { data: intent, error } = await caller.client.rpc('begin_payment', {
    p_order_id: orderId,
    p_method: method,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    const refusal = refusalFrom(error.message);
    if (refusal) return jsonResponse({ error: 'payment_refused', reason: refusal }, origin, 409);
    console.error('begin_payment failed', error.message);
    return errorResponse('server_error', origin);
  }
  if (!intent) return errorResponse('server_error', origin);

  const attempt = intent as Record<string, unknown>;
  const intentId = String(attempt.id);
  const provider = String(attempt.provider);
  const amountMinor = Number(attempt.amount_minor);
  const currency = String(attempt.currency);

  // A RETRY OF THE SAME ATTEMPT. `begin_payment` returned the attempt it had
  // already made, so the provider side already exists — creating a second
  // intention for it would be a second thing the customer could pay.
  if (typeof attempt.checkout_url === 'string' && attempt.checkout_url.length > 0) {
    return jsonResponse(
      {
        intentId,
        provider,
        state: attempt.state,
        amountMinor,
        currency,
        checkoutUrl: attempt.checkout_url,
      },
      origin,
    );
  }

  const admin = serviceClient();

  /*
    THE SIMULATOR.

    Reached only when the ORDER'S MERCHANT is a demo one — `begin_payment`
    reads `is_demo` off the merchant row and writes `provider = 'demo'`, so
    there is no argument here that could route a real order to it. The customer
    is sent to a page inside the app that says, in as many words, that no money
    moves.
  */
  if (provider === 'demo') {
    const url = `${appBaseUrl(request)}/payment/sandbox?intent=${encodeURIComponent(intentId)}`;
    const { error: attachError } = await admin.rpc('attach_payment_provider', {
      p_intent_id: intentId,
      p_provider_intention_id: `sim-${intentId}`,
      p_provider_order_id: null,
      p_client_secret: null,
      p_checkout_url: url,
    });
    if (attachError) {
      console.error('attach (simulated) failed', attachError.message);
      return errorResponse('server_error', origin);
    }
    return jsonResponse(
      { intentId, provider, state: 'requires_action', amountMinor, currency, checkoutUrl: url },
      origin,
    );
  }

  // --- The real provider ---------------------------------------------------
  let config;
  try {
    config = paymobConfig();
  } catch (configError) {
    console.error(String(configError));
    return errorResponse('server_error', origin);
  }
  if (!config) {
    // A REAL MERCHANT AND NO CREDENTIALS is a deployment mistake, not a
    // reason to fall back to something that looks like a payment.
    console.error('a real order reached payments-begin with no Paymob credentials');
    return jsonResponse({ error: 'payment_unavailable' }, origin, 503);
  }

  const { data: order } = await caller.client
    .from('orders')
    .select('reference, contact_phone, delivery_snapshot')
    .eq('id', orderId)
    .single();

  const snapshot = (order?.delivery_snapshot ?? {}) as Record<string, unknown>;
  const recipient = String(snapshot.recipientName ?? 'Customer').trim();
  const [firstName, ...rest] = recipient.split(/\s+/);

  try {
    const intention = await createIntention(config, {
      amountMinor,
      currency,
      // OUR id. It comes back as `order.merchant_order_id` on the callback and
      // is how a signed event finds the attempt it belongs to.
      reference: intentId,
      method,
      customer: {
        firstName: firstName || 'Customer',
        lastName: rest.join(' ') || 'Customer',
        phone: String(order?.contact_phone ?? snapshot.phone ?? ''),
        // Paymob requires one. The account's own address is not ours to hand
        // to a third party for a field they only use for receipts.
        email: `orders+${String(order?.reference ?? intentId)}@akalt.app`,
      },
      // ONE LINE. The basket is already itemised on our side, and sending a
      // customer's shopping list to a payment processor is data they do not
      // need to take the money.
      items: [{ name: String(order?.reference ?? 'Order'), amountMinor, quantity: 1 }],
      notificationUrl: `${functionsBaseUrl()}/payments-webhook`,
      redirectionUrl: `${appBaseUrl(request)}/payment/${encodeURIComponent(orderId)}`,
    });

    const url = checkoutUrl(config, intention.clientSecret);
    const { error: attachError } = await admin.rpc('attach_payment_provider', {
      p_intent_id: intentId,
      p_provider_intention_id: intention.intentionId,
      p_provider_order_id: intention.orderId,
      p_client_secret: intention.clientSecret,
      p_checkout_url: url,
    });
    if (attachError) {
      console.error('attach failed', attachError.message);
      return errorResponse('server_error', origin);
    }

    return jsonResponse(
      { intentId, provider, state: 'requires_action', amountMinor, currency, checkoutUrl: url },
      origin,
    );
  } catch (providerError) {
    if (providerError instanceof PaymobNotConfigured) {
      console.error(String(providerError));
      return jsonResponse({ error: 'payment_unavailable' }, origin, 503);
    }
    console.error('paymob intention failed', String(providerError));
    return jsonResponse({ error: 'payment_unavailable' }, origin, 503);
  }
});

/** Where the customer's app lives, for the redirect back and the simulator. */
function appBaseUrl(request: Request): string {
  const configured = Deno.env.get('APP_BASE_URL')?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const origin = request.headers.get('Origin');
  return origin ? origin.replace(/\/$/, '') : 'https://akalt.app';
}

function functionsBaseUrl(): string {
  const configured = Deno.env.get('FUNCTIONS_BASE_URL')?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const url = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  return `${url.replace(/\/$/, '')}/functions/v1`;
}
