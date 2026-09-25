import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  callbackKind,
  failureFrom,
  HMAC_FIELDS,
  hmacPayload,
  metadataFrom,
  outcomeFrom,
  type PaymobConfig,
  refundTransaction,
  sanitiseCallback,
  signHmac,
  verifyHmac,
} from '../paymob.ts';

/**
 * The signature is the only proof of payment this integration has.
 *
 * Everything else — the redirect, the success screen, the URL parameter — is
 * under the customer's control. So these tests are about the four ways the
 * verification could be wrong in a way nobody would notice until money went
 * missing: a field out of order, a boolean stringified as `1`, a null
 * stringified as `"null"`, and a comparison that accepts a near-miss.
 *
 * Run: npm run fn:test
 */

const SECRET = 'test-hmac-secret';

/** A transaction body shaped like Paymob's, with every HMAC field present. */
function transaction(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    amount_cents: 13000,
    created_at: '2026-09-26T10:00:00.000000',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: 987654,
    integration_id: 4242,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 555111, merchant_order_id: 'intent-1' },
    owner: 1234,
    pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    success: true,
    ...over,
  };
}

Deno.test('the HMAC covers exactly twenty fields, in Paymob order', () => {
  // Pinned because a single field out of place produces a signature that never
  // matches, which reads exactly like an attack rather than like a bug.
  assertEquals(HMAC_FIELDS.length, 20);
  assertEquals(HMAC_FIELDS[0], 'amount_cents');
  assertEquals(HMAC_FIELDS[13], 'order.id');
  assertEquals(HMAC_FIELDS[19], 'success');
});

Deno.test('booleans are true/false and nested paths are read', () => {
  const payload = hmacPayload(transaction());
  assertEquals(
    payload,
    '13000' +
      '2026-09-26T10:00:00.000000' +
      'EGP' +
      'false' + // error_occured
      'false' + // has_parent_transaction
      '987654' +
      '4242' +
      'true' + // is_3d_secure
      'false' + // is_auth
      'false' + // is_capture
      'false' + // is_refunded
      'true' + // is_standalone_payment
      'false' + // is_voided
      '555111' + // order.id
      '1234' +
      'false' + // pending
      '2346' + // source_data.pan
      'MasterCard' +
      'card' +
      'true', // success
  );
});

Deno.test('a missing or null field is empty, never the word null', () => {
  // A wallet payment has no pan. `String(null)` would put the four characters
  // "null" into the signature and break every wallet callback.
  const payload = hmacPayload(transaction({ source_data: { type: 'wallet' } }));
  assertEquals(payload.includes('null'), false);
  assertEquals(payload.includes('undefined'), false);
});

Deno.test('a correctly signed callback verifies', async () => {
  const body = transaction();
  const signature = await signHmac(SECRET, hmacPayload(body));
  assertEquals(await verifyHmac(SECRET, body, signature), true);
  // Providers differ on case; ours must not.
  assertEquals(await verifyHmac(SECRET, body, signature.toUpperCase()), true);
});

Deno.test('a body altered after signing does NOT verify', async () => {
  const body = transaction();
  const signature = await signHmac(SECRET, hmacPayload(body));

  // The attack this exists to stop: take a real declined callback and flip it.
  assertEquals(await verifyHmac(SECRET, { ...body, success: true, pending: false }, signature), true);
  assertEquals(await verifyHmac(SECRET, { ...body, amount_cents: 1 }, signature), false);
  assertEquals(await verifyHmac(SECRET, { ...body, success: false }, signature), false);
  assertEquals(
    await verifyHmac(SECRET, { ...body, order: { id: 999 } }, signature),
    false,
  );
});

Deno.test('a signature from another secret does not verify', async () => {
  const body = transaction();
  const signature = await signHmac('someone-elses-secret', hmacPayload(body));
  assertEquals(await verifyHmac(SECRET, body, signature), false);
});

Deno.test('no signature at all is a refusal, not a pass', async () => {
  const body = transaction();
  assertEquals(await verifyHmac(SECRET, body, null), false);
  assertEquals(await verifyHmac(SECRET, body, ''), false);
});

Deno.test('a truncated signature does not verify', async () => {
  const body = transaction();
  const signature = await signHmac(SECRET, hmacPayload(body));
  assertEquals(await verifyHmac(SECRET, body, signature.slice(0, -2)), false);
});

Deno.test('pending is its own answer, and is not failure', () => {
  assertEquals(outcomeFrom(transaction()), 'succeeded');
  assertEquals(outcomeFrom(transaction({ success: false, pending: true })), 'pending');
  assertEquals(outcomeFrom(transaction({ success: false, pending: false })), 'failed');
  // Reading an absent `success` as success is the failure mode worth pinning.
  assertEquals(outcomeFrom({}), 'failed');
});

Deno.test('a decline carries the provider own words', () => {
  const failure = failureFrom(
    transaction({
      success: false,
      data: { txn_response_code: '51', message: 'Insufficient funds' },
    }),
  );
  assertEquals(failure.code, '51');
  assertEquals(failure.message, 'Insufficient funds');
});

Deno.test('metadata is an allow-list, and never the whole body', () => {
  const metadata = metadataFrom(
    transaction({
      source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
      // Things a provider body can carry that must NOT be copied onto a row.
      token: 'tok_live_should_never_be_stored',
      profile_id: 99,
    }),
  );

  assertEquals(metadata.maskedPan, '2346');
  assertEquals(metadata.sourceType, 'card');
  assertEquals('token' in metadata, false);
  assertEquals('profile_id' in metadata, false);
  assertEquals(Object.keys(metadata).sort(), [
    'integrationId',
    'is3dSecure',
    'maskedPan',
    'sourceSubType',
    'sourceType',
  ]);
});

/**
 * WHAT WE KEEP OF A CALLBACK.
 *
 * The signed body echoes the billing block, the customer's email and phone,
 * and on some integrations a saved-card token. `payment_events` has no read
 * policy and no expiry, so anything stored there is stored for good — which
 * makes "what did we keep" a data-protection question rather than a logging
 * one.
 *
 * These are written as an ALLOW-LIST test: not "is the token gone" but "is the
 * output exactly the set of keys we named". A redaction test passes while a
 * provider quietly adds a field; this one does not.
 */

/** A body shaped like Paymob's, with everything it really sends. */
function fullCallback(): Record<string, unknown> {
  return {
    type: 'TRANSACTION',
    obj: {
      id: 987654,
      amount_cents: 13000,
      currency: 'EGP',
      success: true,
      pending: false,
      is_voided: false,
      is_refunded: false,
      is_capture: false,
      is_auth: false,
      is_3d_secure: true,
      error_occured: false,
      has_parent_transaction: false,
      integration_id: 4242,
      created_at: '2026-09-26T10:00:00.000000',
      profile_id: 555,
      owner: 1234,
      order: {
        id: 555111,
        merchant_order_id: 'intent-1',
        // Paymob echoes the whole billing block back on the order.
        shipping_data: {
          first_name: 'Nour',
          last_name: 'Hassan',
          email: 'nour@example.com',
          phone_number: '+201001234567',
          street: 'Road 9',
          building: '12',
          city: 'Cairo',
          country: 'EG',
        },
      },
      source_data: {
        pan: '2346',
        sub_type: 'MasterCard',
        type: 'card',
      },
      data: {
        txn_response_code: 'APPROVED',
        acq_response_code: '00',
        message: 'Approved',
        card_num: '5123456789012346',
      },
      // The two that must never be retained.
      token: 'tok_live_should_never_be_stored',
      payment_key_claims: { billing_data: { email: 'nour@example.com' } },
    },
  };
}

Deno.test('the stored event is exactly the allow-list, and nothing more', () => {
  const stored = sanitiseCallback(fullCallback());

  assertEquals(Object.keys(stored).sort(), [
    'acquirerResponseCode',
    'amountCents',
    'createdAt',
    'currency',
    'errorOccured',
    'hasParentTransaction',
    'integrationId',
    'is3dSecure',
    'isAuth',
    'isCapture',
    'isRefunded',
    'isVoided',
    'maskedPan',
    'merchantOrderId',
    'parentTransactionId',
    'pending',
    'providerOrderId',
    'responseCode',
    'responseMessage',
    'sourceSubType',
    'sourceType',
    'success',
    'transactionId',
    'type',
  ]);
});

Deno.test('nothing token-shaped or customer-shaped survives', () => {
  const stored = JSON.stringify(sanitiseCallback(fullCallback()));

  // The token and the full card number, which are the two that would matter.
  assertEquals(stored.includes('tok_live_should_never_be_stored'), false);
  assertEquals(stored.includes('5123456789012346'), false);

  // The customer's own details. We already hold the delivery address on the
  // order, where it belongs and where deleting an account removes it.
  assertEquals(stored.includes('nour@example.com'), false);
  assertEquals(stored.includes('+201001234567'), false);
  assertEquals(stored.includes('Nour'), false);
  assertEquals(stored.includes('Road 9'), false);
  assertEquals(stored.includes('payment_key_claims'), false);
  assertEquals(stored.includes('profile_id'), false);
});

Deno.test('but everything a disputed transition needs is still there', () => {
  const stored = sanitiseCallback(fullCallback());

  assertEquals(stored.transactionId, 987654);
  assertEquals(stored.providerOrderId, 555111);
  assertEquals(stored.merchantOrderId, 'intent-1');
  assertEquals(stored.integrationId, 4242);
  assertEquals(stored.amountCents, 13000);
  assertEquals(stored.currency, 'EGP');
  assertEquals(stored.success, true);
  assertEquals(stored.responseCode, 'APPROVED');
  assertEquals(stored.acquirerResponseCode, '00');
  assertEquals(stored.sourceType, 'card');
  // Masked already, by them. Enough to tell two cards apart in a dispute.
  assertEquals(stored.maskedPan, '2346');
  assertEquals(stored.createdAt, '2026-09-26T10:00:00.000000');
});

Deno.test('a field the provider did not send is null, not missing', () => {
  // So a stored event always has the same shape, whatever arrived.
  const stored = sanitiseCallback({ obj: { id: 1 } });
  assertEquals(stored.currency, null);
  assertEquals(stored.maskedPan, null);
  assertEquals(stored.transactionId, 1);
});

/**
 * RECONCILIATION reads the same transaction shape the webhook does.
 *
 * The point of these is that a reconciled payment is not a different kind of
 * payment: the same `outcomeFrom`, the same `sanitiseCallback`, the same
 * duplicate guard downstream. If a lookup ever started being interpreted
 * differently from a callback, an order could settle twice with two different
 * stories about it.
 */
Deno.test('a looked-up transaction is read exactly like a callback', () => {
  const looked = { ...(fullCallback().obj as Record<string, unknown>) };
  assertEquals(outcomeFrom(looked), 'succeeded');

  const stored = sanitiseCallback({ type: 'RECONCILIATION', obj: looked });
  assertEquals(stored.type, 'RECONCILIATION');
  assertEquals(stored.transactionId, 987654);
  assertEquals(stored.merchantOrderId, 'intent-1');
  // And the same things stay out of it.
  assertEquals(JSON.stringify(stored).includes('tok_live_should_never_be_stored'), false);
  assertEquals(JSON.stringify(stored).includes('nour@example.com'), false);
});

Deno.test('a transaction the provider still calls pending stays pending', () => {
  // The one answer reconciliation must NOT convert into a decision. An attempt
  // the provider is still holding might succeed, and writing it off would
  // invite a second payment for the same basket.
  const looked = { ...(fullCallback().obj as Record<string, unknown>), success: false, pending: true };
  assertEquals(outcomeFrom(looked), 'pending');
});

// --- Refunds ----------------------------------------------------------------

Deno.test('callbackKind reads a payment, a refund and a void apart', () => {
  assertEquals(callbackKind({ success: true }), 'transaction');
  assertEquals(
    callbackKind({ has_parent_transaction: true, is_refunded: true, success: true }),
    'refund',
  );
  assertEquals(
    callbackKind({ has_parent_transaction: true, is_voided: true, success: true }),
    'void',
  );
});

Deno.test('a refunded PARENT transaction is not a refund event', () => {
  // The original transaction re-notifying with is_refunded set. Reading this as
  // a refund would apply the reversal a second time; its id is the payment's
  // own id, so as a transaction it is caught by the duplicate guard instead.
  assertEquals(
    callbackKind({ has_parent_transaction: false, is_refunded: true, success: true }),
    'transaction',
  );
});

Deno.test('a child transaction that is neither refunded nor voided is a transaction', () => {
  assertEquals(callbackKind({ has_parent_transaction: true, success: true }), 'transaction');
});

function refundConfig(): PaymobConfig {
  return {
    baseUrl: 'https://accept.paymob.test',
    secretKey: 'sk_test',
    publicKey: 'pk_test',
    hmacSecret: 'hmac',
    cardIntegrationId: 1,
    walletIntegrationId: 2,
  };
}

/** Swaps global fetch for one call, and puts it back afterwards. */
async function withFetch(
  handler: (request: Request) => Response | Promise<Response>,
  run: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input as string, init)))) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test('refundTransaction sends the verified Paymob contract', async () => {
  let seen: { url: string; auth: string | null; body: unknown } | null = null;

  await withFetch(
    async (request) => {
      seen = {
        url: request.url,
        auth: request.headers.get('Authorization'),
        body: await request.json(),
      };
      return new Response(JSON.stringify({ id: 991, success: true }), { status: 200 });
    },
    async () => {
      const result = await refundTransaction(refundConfig(), '4455', 2500);
      assertEquals(result.outcome, 'succeeded');
      assertEquals(result.reference, '991');
    },
  );

  assertEquals(seen!.url, 'https://accept.paymob.test/api/acceptance/void_refund/refund');
  // The literal word `Token`, not `Bearer`. Getting this wrong is a 401 that
  // reads like a bad key.
  assertEquals(seen!.auth, 'Token sk_test');
  assertEquals(seen!.body, { transaction_id: 4455, amount_cents: 2500 });
});

Deno.test('a partial refund sends the partial amount, not the whole transaction', async () => {
  let body: unknown = null;
  await withFetch(
    async (request) => {
      body = await request.json();
      return new Response(JSON.stringify({ id: 1, success: true }), { status: 200 });
    },
    async () => {
      await refundTransaction(refundConfig(), '10', 750);
    },
  );
  assertEquals(body, { transaction_id: 10, amount_cents: 750 });
});

Deno.test('a refusal is a failure, and retryable', async () => {
  await withFetch(
    () =>
      new Response(JSON.stringify({ id: 12, success: false, data: { message: 'no balance' } }), {
        status: 200,
      }),
    async () => {
      const result = await refundTransaction(refundConfig(), '10', 100);
      assertEquals(result.outcome, 'failed');
      assertEquals(result.message, 'no balance');
    },
  );
});

Deno.test('a 4xx is a definite no', async () => {
  await withFetch(
    () => new Response('bad request', { status: 400 }),
    async () => {
      const result = await refundTransaction(refundConfig(), '10', 100);
      assertEquals(result.outcome, 'failed');
      assertEquals(result.code, 'http_400');
    },
  );
});

Deno.test('a 5xx is AMBIGUOUS, because the refund may still have happened', async () => {
  await withFetch(
    () => new Response('boom', { status: 502 }),
    async () => {
      const result = await refundTransaction(refundConfig(), '10', 100);
      assertEquals(result.outcome, 'ambiguous');
    },
  );
});

Deno.test('a torn connection is ambiguous, never a failure', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error('connection reset'))) as typeof fetch;
  try {
    const result = await refundTransaction(refundConfig(), '10', 100);
    assertEquals(result.outcome, 'ambiguous');
    assertEquals(result.code, 'network_error');
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test('a 200 that does not say whether it worked is ambiguous', async () => {
  await withFetch(
    () => new Response(JSON.stringify({ id: 5 }), { status: 200 }),
    async () => {
      const result = await refundTransaction(refundConfig(), '10', 100);
      assertEquals(result.outcome, 'ambiguous');
      assertEquals(result.code, 'no_success_flag');
    },
  );
});

Deno.test('unreadable JSON is ambiguous rather than a guess', async () => {
  await withFetch(
    () => new Response('<html>gateway</html>', { status: 200 }),
    async () => {
      const result = await refundTransaction(refundConfig(), '10', 100);
      assertEquals(result.outcome, 'ambiguous');
      assertEquals(result.code, 'unreadable_response');
    },
  );
});

Deno.test('nothing is sent without a usable transaction id or amount', async () => {
  let called = 0;
  await withFetch(
    () => {
      called += 1;
      return new Response('{}', { status: 200 });
    },
    async () => {
      const noId = await refundTransaction(refundConfig(), '', 100);
      assertEquals(noId.outcome, 'failed');
      assertEquals(noId.code, 'no_transaction_id');

      const noAmount = await refundTransaction(refundConfig(), '10', 0);
      assertEquals(noAmount.outcome, 'failed');
      assertEquals(noAmount.code, 'bad_amount');
    },
  );
  // AND IT IS A FAILURE, NOT AN AMBIGUITY: nothing left the process, so
  // nothing can have moved, so retrying is safe.
  assertEquals(called, 0);
});

Deno.test('sanitiseCallback keeps the parent transaction and no billing block', () => {
  const kept = sanitiseCallback({
    type: 'TRANSACTION',
    obj: {
      id: 9,
      parent_transaction: 4,
      has_parent_transaction: true,
      is_refunded: true,
      amount_cents: 500,
      order: { id: 3, merchant_order_id: 'intent-1' },
      billing_data: { email: 'someone@example.com', phone_number: '+20100' },
      source_data: { pan: '1234', type: 'card', sub_type: 'Visa' },
    },
  });

  assertEquals(kept.parentTransactionId, 4);
  assertEquals(kept.isRefunded, true);
  assertEquals('billing_data' in kept, false);
  assertEquals(JSON.stringify(kept).includes('someone@example.com'), false);
});
