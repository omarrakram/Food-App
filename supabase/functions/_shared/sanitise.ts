/**
 * Server-side sanitisation of user-supplied text.
 *
 * The client sanitises too, but this copy is the one that counts: the client
 * is under the user's control and the edge function is not. Everything that
 * reaches a prompt passes through here first.
 *
 * Kept in step with `src/features/ingredients/normalise.ts`.
 */

/** Control characters, zero-width joiners and bidi overrides. */
const CONTROL_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\ufeff]/g;

/** Delimiters and role markers a prompt-injection attempt relies on. */
const DELIMITERS = /[<>{}[\]`|\\]/g;
const ROLE_MARKERS = /\b(system|assistant|human|user)\s*:/gi;

export function sanitiseText(raw: unknown, maxLength: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(CONTROL_CHARS, ' ')
    .replace(DELIMITERS, ' ')
    .replace(ROLE_MARKERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Sanitises a list, dropping empties and capping its length. */
export function sanitiseList(raw: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: string[] = [];
  for (const entry of raw) {
    const value = sanitiseText(entry, maxLength);
    if (value) cleaned.push(value);
    if (cleaned.length >= maxItems) break;
  }
  return cleaned;
}

/** Narrows an unknown value to a member of a known set. */
export function sanitiseEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : null;
}

/** Narrows an unknown array to members of a known set, deduplicated. */
export function sanitiseEnumList<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T[] {
  if (!Array.isArray(raw)) return [];
  const found = new Set<T>();
  for (const entry of raw) {
    const value = sanitiseEnum(entry, allowed);
    if (value) found.add(value);
  }
  return [...found];
}

/** Clamps an unknown value to an integer in range, or null. */
export function sanitiseInt(raw: unknown, min: number, max: number): number | null {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitiseBool(raw: unknown, fallback = false): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}
