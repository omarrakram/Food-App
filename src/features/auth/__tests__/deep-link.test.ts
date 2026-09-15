import {
  AUTH_REDIRECT_PATHS,
  destinationFor,
  parseAuthLink,
} from '@/features/auth/deep-link';

/**
 * Email links coming back into the app.
 *
 * THE GAP THIS CLOSES: on web, Supabase parses the callback URL itself. On
 * native there is no URL bar and nothing did — so tapping a confirmation link
 * opened the app and produced no session. It could not be noticed without a
 * backend, because with no project configured no email is ever sent; it would
 * have been the first thing to fail after activation.
 *
 * The parser is tolerant about SHAPE and strict about INTENT. Supabase has put
 * its parameters in a query string and in a fragment at different times, and
 * the same link arrives differently under Expo Go and a standalone build — all
 * of which must work. What must NOT be tolerant is which links count: a deep
 * link to a recipe must never be read as a login.
 */

describe('parseAuthLink', () => {
  it('reads a confirmation link from a custom scheme', () => {
    expect(parseAuthLink('akla://auth/callback?code=abc123')).toEqual({
      kind: 'confirm',
      code: 'abc123',
      error: null,
    });
  });

  it('reads a recovery link', () => {
    expect(parseAuthLink('akla://auth/reset?code=xyz')).toEqual({
      kind: 'recover',
      code: 'xyz',
      error: null,
    });
  });

  it('reads the Expo Go shape, where the path is in the pathname', () => {
    // `exp://127.0.0.1:8081/--/auth/callback` — the host is the dev server,
    // not "auth", so a host-only check would miss every link in development.
    const link = parseAuthLink('exp://127.0.0.1:8081/--/auth/callback?code=dev');
    expect(link).toEqual({ kind: 'confirm', code: 'dev', error: null });
  });

  it('reads a fragment as well as a query string', () => {
    // The implicit flow puts everything after the '#', where
    // `URL.searchParams` cannot see it.
    const link = parseAuthLink('akla://auth/reset#code=fragmented');
    expect(link?.code).toBe('fragmented');
  });

  it('surfaces an error Supabase sent instead of a code', () => {
    const link = parseAuthLink('akla://auth/callback?error=access_denied');
    expect(link).toEqual({ kind: 'confirm', code: null, error: 'access_denied' });
  });

  it('prefers the human-readable error when both are present', () => {
    const link = parseAuthLink(
      'akla://auth/callback?error=otp_expired&error_description=Email+link+has+expired',
    );
    expect(link?.error).toBe('Email link has expired');
  });

  it('IGNORES a link that is not an auth callback', () => {
    // The assertion that matters: a shared recipe opening the app must never
    // be mistaken for a login attempt.
    expect(parseAuthLink('akla://recipe/f4006404-ffca-56e7-8916-e180f5615378')).toBeNull();
    expect(parseAuthLink('akla://messages/demo-c1')).toBeNull();
    expect(parseAuthLink('https://omarrakram.github.io/Food-App/recipe/x')).toBeNull();
  });

  it('survives rubbish rather than throwing', () => {
    // This runs on every cold start, on whatever URL launched the app.
    expect(parseAuthLink('')).toBeNull();
    expect(parseAuthLink('not a url at all')).toBeNull();
    expect(parseAuthLink('://')).toBeNull();
  });

  it('accepts a link with no code — the caller decides what to do', () => {
    expect(parseAuthLink('akla://auth/callback')).toEqual({
      kind: 'confirm',
      code: null,
      error: null,
    });
  });
});

describe('the redirect paths', () => {
  it('are what the parser recognises', () => {
    // These two constants are the whole contract between the email Supabase
    // sends and the code that reads it back. They are asserted together so a
    // change to one cannot quietly orphan the other.
    expect(parseAuthLink(`akla://${AUTH_REDIRECT_PATHS.confirm}?code=1`)?.kind).toBe('confirm');
    expect(parseAuthLink(`akla://${AUTH_REDIRECT_PATHS.recover}?code=1`)?.kind).toBe('recover');
  });
});

describe('destinationFor', () => {
  it('sends a recovery to the screen that sets a new password', () => {
    expect(destinationFor('recover')).toBe('/(auth)/reset-password');
  });

  it('sends a confirmation home — there is nothing left to do', () => {
    expect(destinationFor('confirm')).toBe('/');
  });
});
