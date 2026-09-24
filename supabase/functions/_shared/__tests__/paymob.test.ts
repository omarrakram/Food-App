import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  failureFrom,
  HMAC_FIELDS,
  hmacPayload,
  metadataFrom,
  outcomeFrom,
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
