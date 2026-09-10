import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/lib/config/env';

import type { Database } from './database.types';
import { secureSessionStorage } from './secure-storage';

/**
 * Supabase client.
 *
 * Returns null when the project is not configured. That is a supported state,
 * not an error: the app runs fully on local data with sign-in disabled, which
 * is what lets development continue before a Supabase project exists. Every
 * caller must handle null rather than assuming a client.
 *
 * SECURITY: only the anon (publishable) key is ever used here. It is safe in
 * the client solely because RLS is enabled on every table — see
 * supabase/migrations/20260910120700_row_level_security.sql. The service-role
 * key must never appear in this bundle.
 */

let client: SupabaseClient<Database> | null = null;
let appStateSubscribed = false;

function create(): SupabaseClient<Database> | null {
  if (!env.hasSupabase || !env.supabaseUrl || !env.supabaseAnonKey) return null;

  const instance = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar to parse a callback out of; deep links are
      // handled explicitly by the auth provider instead.
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-application-name': 'akla' },
    },
    // Realtime is not used; disabling the default heartbeat saves a socket and
    // battery on mobile.
    realtime: { params: { eventsPerSecond: 1 } },
  });

  if (!appStateSubscribed && Platform.OS !== 'web') {
    appStateSubscribed = true;
    // Supabase's token refresh timer does not fire reliably while the app is
    // backgrounded; pausing and resuming it on foreground transitions is the
    // documented React Native pattern.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void instance.auth.startAutoRefresh();
      else void instance.auth.stopAutoRefresh();
    });
  }

  return instance;
}

export function getSupabase(): SupabaseClient<Database> | null {
  if (client === null) client = create();
  return client;
}

/** Throws when Supabase is required but unconfigured. Use only in code paths
 *  that are unreachable without a session (all of which imply a client). */
export function requireSupabase(): SupabaseClient<Database> {
  const instance = getSupabase();
  if (!instance) {
    throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and _ANON_KEY.');
  }
  return instance;
}

export type { Database };
