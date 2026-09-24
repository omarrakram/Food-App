/**
 * Paymob.
 *
 * WHY PAYMOB, AND WHAT IT ACTUALLY DOES — because the integration has to match
 * reality rather than the state machine we would have preferred.
 *
 *   ONE INTEGRATION, CARDS AND WALLETS. Egypt's grocery customers pay by card,
 *   by Vodafone Cash / Orange Money / Etisalat wallet, and at kiosks. Paymob
 *   covers all of them behind one Intention, which is the difference between
 *   one integration and four.
 *
 *   HOSTED CHECKOUT. The customer is sent to Paymob's own page. No card field
 *   ever exists in AKALT's bundle, which keeps us out of PCI scope entirely.
 *
 *   IT CAPTURES IMMEDIATELY. Paymob does offer an auth-then-capture flow, but
 *   it needs its own integration id and is CARD ONLY — it cannot hold a wallet
 *   payment. Since wallets are in scope for V1, the honest model is one-step
 *   capture: the order goes `authorising -> captured`, and we do not pretend to
 *   be holding funds we have already taken. Voids and refunds are real
 *   operations against a captured transaction, so nothing is lost by saying so.
 *
 *   SIGNED CALLBACKS. Every callback carries an HMAC-SHA512 over a fixed,
 *   ordered list of fields. That signature is the only thing in this
 *   integration that constitutes proof of payment.
 *
 * NO SECRET IN THIS FILE REACHES A CLIENT. It runs in an edge function; the
 * secret key, the API key and the HMAC secret are read from the environment
 * and never returned, logged or stored.
 */

export type PaymobConfig = {
  readonly baseUrl: string;
  readonly secretKey: string;
  readonly publicKey: string;
  readonly hmacSecret: string;
  readonly cardIntegrationId: number | null;
  readonly walletIntegrationId: number | null;
};

export class PaymobNotConfigured extends Error {
  constructor(missing: readonly string[]) {
    super(`Paymob is not configured: ${missing.join(', ')}`);
    this.name = 'PaymobNotConfigured';
  }
}

/**
 * Reads the credentials, or says exactly which one is missing.
 *
 * Returns null rather than throwing ONLY when nothing at all is set, so a
 * developer running the simulator locally is not forced to invent credentials.
 * A partially configured environment throws: half a key is a deploy that fails
 * at the first real payment rather than at boot.
 */
export function paymobConfig(): PaymobConfig | null {
  const get = (name: string) => Deno.env.get(name)?.trim() ?? '';

  const secretKey = get('PAYMOB_SECRET_KEY');
  const publicKey = get('PAYMOB_PUBLIC_KEY');
  const hmacSecret = get('PAYMOB_HMAC_SECRET');

  if (!secretKey && !publicKey && !hmacSecret) return null;

  const missing: string[] = [];
  if (!secretKey) missing.push('PAYMOB_SECRET_KEY');
  if (!publicKey) missing.push('PAYMOB_PUBLIC_KEY');
  if (!hmacSecret) missing.push('PAYMOB_HMAC_SECRET');
  if (missing.length > 0) throw new PaymobNotConfigured(missing);

  const integration = (name: string): number | null => {
    const raw = get(name);
    if (!raw) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  };

  return {
    baseUrl: get('PAYMOB_BASE_URL') || 'https://accept.paymob.com',
    secretKey,
    publicKey,
    hmacSecret,
    cardIntegrationId: integration('PAYMOB_CARD_INTEGRATION_ID'),
    walletIntegrationId: integration('PAYMOB_WALLET_INTEGRATION_ID'),
  };
}

export type IntentionInput = {
  /** Minor units. Ours, from the order — never anything a client sent. */
  readonly amountMinor: number;
  readonly currency: string;
  /** Our payment intent id. Comes back on the callback, and is how we match it. */
  readonly reference: string;
  readonly method: 'card' | 'wallet';
  readonly customer: {
    readonly firstName: string;
    readonly lastName: string;
    readonly phone: string;
    readonly email: string;
  };
  readonly items: readonly {
    readonly name: string;
    readonly amountMinor: number;
    readonly quantity: number;
  }[];
  readonly notificationUrl: string;
  readonly redirectionUrl: string;
};

export type Intention = {
  readonly intentionId: string;
  readonly orderId: string;
  readonly clientSecret: string;
};

/**
 * Creates the provider-side intention.
 *
 * `special_reference` is OUR payment intent id. Paymob echoes it on the
 * callback as `obj.order.merchant_order_id`, and matching on it is what lets a
 * signed callback find the attempt it belongs to without trusting anything
 * else in the body.
 */
export async function createIntention(
  config: PaymobConfig,
  input: IntentionInput,
): Promise<Intention> {
  const integrationId =
    input.method === 'wallet' ? config.walletIntegrationId : config.cardIntegrationId;
  if (integrationId === null) {
    throw new PaymobNotConfigured([
      input.method === 'wallet' ? 'PAYMOB_WALLET_INTEGRATION_ID' : 'PAYMOB_CARD_INTEGRATION_ID',
    ]);
  }

  const response = await fetch(`${config.baseUrl}/v1/intention/`, {
    method: 'POST',
    headers: {
      // The literal word `Token`, then the secret key. Not `Bearer`.
      Authorization: `Token ${config.secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: input.currency,
      payment_methods: [integrationId],
      special_reference: input.reference,
      notification_url: input.notificationUrl,
      redirection_url: input.redirectionUrl,
      items: input.items.map((item) => ({
        name: item.name,
        amount: item.amountMinor,
        quantity: item.quantity,
      })),
      billing_data: {
        first_name: input.customer.firstName,
        last_name: input.customer.lastName,
        phone_number: input.customer.phone,
        email: input.customer.email,
      },
    }),
  });

  if (!response.ok) {
    // The body may name the merchant account. It goes to the function log and
    // never to the client.
    const detail = await response.text().catch(() => '');
    throw new Error(`paymob intention failed: ${response.status} ${detail.slice(0, 500)}`);
  }

  const body = (await response.json()) as {
    id?: number | string;
    client_secret?: string;
    intention_order_id?: number | string;
  };

  if (!body.client_secret) throw new Error('paymob intention returned no client_secret');

  return {
    intentionId: String(body.id ?? ''),
    orderId: String(body.intention_order_id ?? ''),
    clientSecret: body.client_secret,
  };
}

/** Where the customer goes. The public key is public; the client secret is scoped to one intention. */
export function checkoutUrl(config: PaymobConfig, clientSecret: string): string {
  const url = new URL('/unifiedcheckout/', config.baseUrl);
  url.searchParams.set('publicKey', config.publicKey);
  url.searchParams.set('clientSecret', clientSecret);
  return url.toString();
}

/**
 * THE HMAC FIELD ORDER. Twenty fields, concatenated with no separator.
 *
 * Not alphabetical by accident and not ours to reorder — it is Paymob's, and a
 * single field out of place produces a signature that never matches, which
 * reads exactly like an attack. Written out rather than derived so that a
 * future change to it is a visible diff.
 */
export const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

function at(object: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, object);
}

/**
 * The string the signature is taken over.
 *
 * Booleans become `true`/`false`; a missing or null field becomes empty.
 * Getting either of those wrong fails every verification, so they are stated
 * here rather than left to `String()` to decide.
 */
export function hmacPayload(obj: Record<string, unknown>): string {
  return HMAC_FIELDS.map((field) => {
    const value = at(obj, field);
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value);
  }).join('');
}

/** Length-independent comparison. A timing oracle on a signature is a real one. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

export async function signHmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * THE ONLY THING THAT CONSTITUTES PROOF OF PAYMENT.
 *
 * Not the redirect the customer's browser followed, not a URL parameter, not a
 * success screen. If this returns false the callback is discarded, whatever it
 * claims.
 */
export async function verifyHmac(
  secret: string,
  obj: Record<string, unknown>,
  provided: string | null,
): Promise<boolean> {
  if (!provided) return false;
  const expected = await signHmac(secret, hmacPayload(obj));
  return constantTimeEquals(expected.toLowerCase(), provided.trim().toLowerCase());
}

export type PaymentOutcome = 'succeeded' | 'failed' | 'pending';

/**
 * What the transaction says happened.
 *
 * `pending` is a real answer and is NOT failure: a wallet push the customer has
 * not confirmed yet, or a kiosk reference nobody has paid at, are both still
 * live. Reading them as failure invites a second payment for the same basket.
 */
export function outcomeFrom(obj: Record<string, unknown>): PaymentOutcome {
  if (obj.success === true) return 'succeeded';
  if (obj.pending === true) return 'pending';
  return 'failed';
}

/** The provider's own words for a decline, for the attempt record. */
export function failureFrom(obj: Record<string, unknown>): {
  code: string | null;
  message: string | null;
} {
  const data = (obj.data ?? {}) as Record<string, unknown>;
  const code = data.txn_response_code ?? data.acq_response_code ?? null;
  const message = data.message ?? obj.error_occured ?? null;
  return {
    code: code === null ? null : String(code),
    message: message === null || typeof message === 'boolean' ? null : String(message),
  };
}

/**
 * Provider facts worth keeping, and nothing else.
 *
 * Explicitly an allow-list. The raw callback goes into `payment_events` for
 * evidence; this is what gets attached to the attempt, and copying the whole
 * body here is how a pan or a token ends up in a table somebody later exposes.
 */
export function metadataFrom(obj: Record<string, unknown>): Record<string, unknown> {
  const source = (obj.source_data ?? {}) as Record<string, unknown>;
  return {
    sourceType: source.type ?? null,
    sourceSubType: source.sub_type ?? null,
    // Already masked by Paymob (last four). Never the full number.
    maskedPan: source.pan ?? null,
    is3dSecure: obj.is_3d_secure ?? null,
    integrationId: obj.integration_id ?? null,
  };
}
