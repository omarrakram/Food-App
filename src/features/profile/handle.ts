import type { TranslationKey } from '@/i18n/locales/en';

/**
 * Handles.
 *
 * The rules here are the same rules the database enforces, restated in
 * TypeScript. That duplication is deliberate and it has a direction: the
 * database is the authority, and this exists only so a user finds out what is
 * wrong while they are still typing rather than after a round trip. Anything
 * this rejects the database also rejects; the reverse is not guaranteed, and a
 * server rejection is never overridden here.
 */

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

/** Mirrors `profiles_username_format`. */
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._]{2,29}$/;

export type HandleProblem = Extract<TranslationKey, `profile.handle.${string}`>;

/**
 * The uniqueness key, mirroring the generated column.
 *
 * Case folds because `Omar` and `omar` are the same name to anyone reading
 * them. Dots and underscores are STRIPPED because they are not: `omar.hassan`,
 * `omar_hassan` and `omarhassan` are three accounts that let one person be
 * mistaken for another in a friend request, and the person being impersonated
 * has no way to notice.
 */
export function handleKey(handle: string): string {
  return handle.trim().toLowerCase().replace(/[._]/g, '');
}

/** True when two handles would collide, whatever their punctuation. */
export function handlesCollide(a: string, b: string): boolean {
  return handleKey(a) === handleKey(b);
}

/**
 * Turns what someone typed into something that could be a handle.
 *
 * Applied as they type, so the field cannot reach a state the server will
 * reject for a reason as unhelpful as a capital letter. It does NOT strip
 * separators — those are the user's to choose and are preserved in what is
 * displayed.
 */
export function normaliseHandleInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, HANDLE_MAX_LENGTH);
}

export function validateHandle(handle: string): HandleProblem | null {
  const trimmed = handle.trim();
  if (trimmed.length === 0) return 'profile.handle.required';
  if (trimmed.length < HANDLE_MIN_LENGTH) return 'profile.handle.tooShort';
  if (trimmed.length > HANDLE_MAX_LENGTH) return 'profile.handle.tooLong';
  if (!HANDLE_PATTERN.test(trimmed)) return 'profile.handle.invalidCharacters';
  // A handle made only of separators folds to nothing, which would collide
  // with every other such handle and read as blank everywhere it is shown.
  if (handleKey(trimmed).length < HANDLE_MIN_LENGTH) return 'profile.handle.tooShort';
  return null;
}

export const BIO_MAX_LENGTH = 300;
export const DISPLAY_NAME_MAX_LENGTH = 80;

export function validateBio(bio: string): HandleProblem | null {
  return bio.length > BIO_MAX_LENGTH ? 'profile.handle.bioTooLong' : null;
}
