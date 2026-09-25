import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  failureFrom,
  HMAC_FIELDS,
  hmacPayload,
  metadataFrom,
  outcomeFrom,
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
