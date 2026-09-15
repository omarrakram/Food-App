import { Platform } from 'react-native';

/**
 * The link a confirmation or reset email comes back on.
 *
 * ON WEB Supabase handles this itself: `detectSessionInUrl` is true, the
 * client reads the code out of the URL and exchanges it before anything
 * renders. ON NATIVE there is no URL bar to read, so the app has to do it —
 * and until now nothing did. The reset screen's own docblock said "Supabase
 * has already exchanged the token by the time this renders", which was true of
 * exactly one of the two platforms.
 *
 * Nobody noticed because it cannot be noticed without a backend: with no
 * project configured, no email is ever sent. It would have surfaced as the
 * first thing to fail after activation — sign up, tap the link, land on a
 * screen that says "set a new password" and cannot, because there is no
 * session to set it on.
 *
 * These are pure functions so the parsing can be tested without a browser, a
 * device, or a Supabase project.
 */

/** Where an incoming auth link should take the user. */
export type AuthLinkKind = 'confirm' | 'recover';

export type AuthLink = {
  kind: AuthLinkKind;
  /** The PKCE code to exchange for a session. Null when the link carries none. */
  code: string | null;
  /** Supabase's own error, when it declined before we got here. */
  error: string | null;
};

/** Paths the app asks Supabase to send people back to. */
export const AUTH_REDIRECT_PATHS = {
  confirm: 'auth/callback',
  recover: 'auth/reset',
} as const;

/**
 * Reads an incoming deep link, or returns null when it is not one of ours.
 *
 * Deliberately tolerant about SHAPE and strict about INTENT. Supabase has used
 * a query string and a fragment at different times and across flows, and both
 * forms reach here identically on native; what must not be tolerant is which
 * links count — a link to `/recipe/x` must not be mistaken for a login.
 */
export function parseAuthLink(url: string): AuthLink | null {
  if (!url) return null;

  let parsed: URL;
  try {
    // A custom scheme (`akla://…`) is a valid URL; `exp://…/--/…` is too.
    parsed = new URL(url);
  } catch {
    return null;
  }

  // The path can arrive as `akla://auth/callback` (host = "auth") or as
  // `exp://127.0.0.1:8081/--/auth/callback` (all of it in the pathname).
  const whole = `${parsed.host}${parsed.pathname}`;

  const kind: AuthLinkKind | null = whole.includes(AUTH_REDIRECT_PATHS.recover)
    ? 'recover'
    : whole.includes(AUTH_REDIRECT_PATHS.confirm)
      ? 'confirm'
      : null;
  if (!kind) return null;

  // The fragment is not parsed by `URL.searchParams`, and Supabase's implicit
  // flow puts everything there. Read both and let the query win.
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const pick = (key: string) => parsed.searchParams.get(key) ?? fragment.get(key);

  return {
    kind,
    code: pick('code'),
    error: pick('error_description') ?? pick('error'),
  };
}

/** Where the app navigates once a link has been handled. */
export function destinationFor(kind: AuthLinkKind): string {
  return kind === 'recover' ? '/(auth)/reset-password' : '/';
}

/**
 * Whether this platform needs the app to do the exchange.
 *
 * False on web, where the Supabase client already did it. Doing it twice is
 * not harmless: the code is single-use, so the second attempt fails and would
 * surface as an error on a sign-in that actually worked.
 */
export function needsManualExchange(): boolean {
  return Platform.OS !== 'web';
}
