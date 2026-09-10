import { createHash } from 'node:crypto';

/**
 * Deterministic UUID generation for build-time data.
 *
 * A recipe or ingredient must carry the SAME id whether it was read from the
 * bundled TypeScript fixtures (offline, or before a Supabase project exists)
 * or from Postgres, where primary keys are uuids. Deriving both from this one
 * namespace means a recipe a guest saved offline still resolves after they
 * sign in, with no slug-to-uuid mapping table anywhere.
 */

/** Fixed namespace for Akla generated ids. NEVER change this value. */
export const AKLA_NAMESPACE = '6f9c2b3e-1d47-4a8e-9c05-3f2b7a1d8e64';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 4122 §4.3 name-based UUID, SHA-1 (version 5). */
export function uuidv5(name, namespace = AKLA_NAMESPACE) {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(namespaceBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
