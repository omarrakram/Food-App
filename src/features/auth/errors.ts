import type { AuthError } from '@supabase/supabase-js';

import type { TranslationKey } from '@/i18n/locales/en';
import { AppError } from '@/lib/errors';

/**
 * Maps Supabase auth failures onto translation keys.
 *
 * Deliberately coarse: we do not tell an attacker whether an email exists.
 * "Invalid login credentials" and "user not found" both surface as
 * `auth.error.invalidCredentials`, and password reset always reports success.
 */
export type AuthErrorKey = Extract<TranslationKey, `auth.error.${string}`>;

export function authErrorKey(error: unknown): AuthErrorKey {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as AuthError).message).toLowerCase()
      : '';

  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as AuthError).status)
      : undefined;

  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return 'auth.error.rateLimited';
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'auth.error.emailTaken';
  }
  if (message.includes('email not confirmed') || message.includes('not confirmed')) {
    return 'auth.error.emailNotConfirmed';
  }
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'auth.error.invalidCredentials';
  }
  if (message.includes('password') && message.includes('least')) {
    return 'auth.error.passwordTooShort';
  }
  if (message.includes('jwt') || message.includes('session') || status === 401) {
    return 'auth.error.sessionExpired';
  }
  return 'auth.error.invalidCredentials';
}

/** Wraps an auth failure so screens render a sentence, never a raw message. */
export class AuthFailure extends AppError {
  readonly authKey: AuthErrorKey;

  constructor(cause: unknown) {
    super('unauthorized', { cause });
    this.name = 'AuthFailure';
    this.authKey = authErrorKey(cause);
  }
}

// --- Client-side validation ------------------------------------------------

/** Deliberately permissive: the server is the authority on deliverability. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): AuthErrorKey | null {
  return EMAIL_PATTERN.test(email.trim()) ? null : 'auth.error.invalidEmail';
}

export function validatePassword(password: string): AuthErrorKey | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'auth.error.passwordTooShort';
  // A letter and a digit is a floor, not a policy. Length does the real work,
  // and anything stricter mostly produces `Password1!`.
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'auth.error.passwordWeak';
  return null;
}

export function validateName(name: string): AuthErrorKey | null {
  return name.trim().length > 0 ? null : 'auth.error.nameRequired';
}
