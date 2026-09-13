import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getSupabase } from '@/lib/supabase/client';
import { env } from '@/lib/config/env';
import { logError, logInfo } from '@/lib/logger';
import { clearAppStorage } from '@/lib/storage';

import { AuthFailure } from './errors';
import { chooseGuest, clearGuestChoice, readGuestChoice } from './guest-mode';

/**
 * Authentication.
 *
 * The whole app works signed out, so this provider's job is to report a
 * session when one exists and to keep the rest of the app from having to know
 * about Supabase. When Supabase is unconfigured, `isEnabled` is false and every
 * method rejects with a clear error instead of throwing somewhere deeper.
 */

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

/**
 * Why there is no session.
 *
 * `never` and `signed_out` both mean "use local data", but they are different
 * to the user: one has never been asked, the other has just been told. And
 * `expired` is neither — the account still exists and their data is on the
 * server, so silently behaving like a guest would be a lie.
 */
export type SignedOutReason = 'never' | 'guest' | 'signed_out' | 'expired';

export type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** False when no Supabase project is configured; sign-in UI hides itself. */
  isEnabled: boolean;
  /** Why there is no session. Meaningless while signed in. */
  signedOutReason: SignedOutReason;
  /** True once the user has explicitly declined an account. */
  isGuest: boolean;
  /** Records the explicit "Continue as guest" choice. */
  continueAsGuest: () => Promise<void>;
  /** Forgets the guest choice, e.g. when the user decides to sign up. */
  leaveGuestMode: () => Promise<void>;
  /** Dismisses the "your session expired" state without signing in. */
  acknowledgeExpiry: () => void;
  signUp: (input: { email: string; password: string; displayName: string }) => Promise<{
    needsEmailConfirmation: boolean;
  }>;
  signIn: (input: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Deep link the confirmation and reset emails return to. */
function redirectTo(path: string): string {
  return Linking.createURL(path);
}

function unavailable(): never {
  throw new AuthFailure(new Error('Supabase is not configured'));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabase();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'signed_out');
  const [signedOutReason, setSignedOutReason] = useState<SignedOutReason>('never');

  /**
   * Set while WE are signing the user out, so the `SIGNED_OUT` event that
   * follows is not mistaken for an expiry. Supabase emits the same event
   * whether the user pressed a button or a refresh token was rejected, and
   * telling those apart is the difference between "See you soon" and "Please
   * sign in again".
   */
  const deliberateSignOut = useRef(false);

  // The stored guest choice, restored before the gate runs so a relaunch does
  // not bounce a guest back to the welcome screen.
  useEffect(() => {
    let cancelled = false;
    void readGuestChoice().then((choice) => {
      if (cancelled || !choice) return;
      setSignedOutReason((current) => (current === 'never' ? 'guest' : current));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setStatus(data.session ? 'signed_in' : 'signed_out');
      })
      .catch((error: unknown) => {
        // A corrupt stored session must not wedge the app on a splash screen.
        logError('auth_get_session_failed', error);
        if (!cancelled) setStatus('signed_out');
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession((previous) => {
        if (!nextSession && previous) {
          // A session existed and no longer does. If we did not ask for that,
          // the refresh token was rejected — expired, revoked, or the password
          // was changed elsewhere. Either way the user needs telling.
          setSignedOutReason(deliberateSignOut.current ? 'signed_out' : 'expired');
          if (!deliberateSignOut.current) logInfo('auth_session_expired', { event });
          deliberateSignOut.current = false;
        }
        return nextSession;
      });
      setStatus(nextSession ? 'signed_in' : 'signed_out');
      logInfo('auth_state_change', { event });

      // Cached rows belong to the previous identity. Dropping the whole cache
      // is the only safe reaction to an identity change.
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        void queryClient.invalidateQueries();
      }
      // Signing in ends the guest period; the migration runs separately.
      if (event === 'SIGNED_IN') void clearGuestChoice();
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [supabase, queryClient]);

  const signUp = useCallback<AuthContextValue['signUp']>(
    async ({ email, password, displayName }) => {
      if (!supabase) unavailable();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { display_name: displayName.trim().slice(0, 80) },
          emailRedirectTo: redirectTo('/auth/callback'),
        },
      });
      if (error) throw new AuthFailure(error);

      // Supabase returns a user with no session when email confirmation is on.
      return { needsEmailConfirmation: data.session === null };
    },
    [supabase],
  );

  const signIn = useCallback<AuthContextValue['signIn']>(
    async ({ email, password }) => {
      if (!supabase) unavailable();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw new AuthFailure(error);
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    deliberateSignOut.current = true;
    setSignedOutReason('signed_out');
    const { error } = await supabase.auth.signOut();
    if (error) logError('auth_sign_out_failed', error);
    // Local caches are per-identity; clearing them on sign-out is what stops
    // the next user of the device seeing the previous one's pantry.
    await clearAppStorage();
    queryClient.clear();
  }, [supabase, queryClient]);

  const sendPasswordReset = useCallback(
    async (email: string) => {
      if (!supabase) unavailable();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: redirectTo('/auth/reset'),
      });
      // Deliberately swallowed unless it is a rate limit: reporting "no such
      // account" would turn this into an email-enumeration oracle. The UI says
      // "if that email has an account, a link is on its way" either way.
      if (error && error.status === 429) throw new AuthFailure(error);
      if (error) logError('auth_reset_email_failed', error);
    },
    [supabase],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      if (!supabase) unavailable();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new AuthFailure(error);
    },
    [supabase],
  );

  const resendConfirmation = useCallback(
    async (email: string) => {
      if (!supabase) unavailable();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: redirectTo('/auth/callback') },
      });
      if (error && error.status === 429) throw new AuthFailure(error);
      if (error) logError('auth_resend_failed', error);
    },
    [supabase],
  );

  const continueAsGuest = useCallback(async () => {
    await chooseGuest();
    setSignedOutReason('guest');
  }, []);

  const leaveGuestMode = useCallback(async () => {
    await clearGuestChoice();
    setSignedOutReason('never');
  }, []);

  const acknowledgeExpiry = useCallback(() => {
    setSignedOutReason((current) => (current === 'expired' ? 'signed_out' : current));
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!supabase) unavailable();
    // The database function derives the user from auth.uid(), so this cannot
    // be pointed at another account no matter what the client sends.
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw new AuthFailure(error);

    deliberateSignOut.current = true;
    setSignedOutReason('signed_out');
    // The account is gone, so its migration marker is meaningless — and
    // keeping it would stop a re-registration from migrating anything.
    await clearGuestChoice();
    await supabase.auth.signOut();
    await clearAppStorage();
    queryClient.clear();
  }, [supabase, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isEnabled: Boolean(supabase),
      signedOutReason,
      isGuest: signedOutReason === 'guest',
      continueAsGuest,
      leaveGuestMode,
      acknowledgeExpiry,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      resendConfirmation,
      deleteAccount,
    }),
    [
      status,
      session,
      supabase,
      signedOutReason,
      continueAsGuest,
      leaveGuestMode,
      acknowledgeExpiry,
      signUp,
      signIn,
      signOut,
      sendPasswordReset,
      updatePassword,
      resendConfirmation,
      deleteAccount,
    ],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = use(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}

/** Whether social sign-in buttons should render at all. */
export function socialAuthAvailability() {
  return {
    google: env.enableSocialAuth && Boolean(env.googleIosClientId || env.googleAndroidClientId),
    apple: env.enableSocialAuth,
  };
}
