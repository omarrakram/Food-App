import Constants from 'expo-constants';

import type { CountryCode, CurrencyCode } from '@/types/domain';

/**
 * Client environment.
 *
 * SECURITY: only `EXPO_PUBLIC_*` variables are readable here, and every one of
 * them is embedded in the shipped JS bundle. Nothing secret may be read from
 * this module. Private keys (Anthropic, Supabase service role, grocery provider
 * credentials) live exclusively in Supabase Edge Function secrets — see
 * `supabase/functions/` and ARCHITECTURE.md § Secrets.
 *
 * `process.env.EXPO_PUBLIC_X` must be referenced statically (not via a computed
 * key) for Expo's bundler to inline it.
 */

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function boolFlag(value: string | undefined, fallback = false): boolean {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === 'true' || trimmed === '1') return true;
  if (trimmed === 'false' || trimmed === '0') return false;
  return fallback;
}

const supabaseUrl = optional(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = optional(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export type AppEnvironment = 'development' | 'preview' | 'production';

const rawAppEnv = optional(process.env.EXPO_PUBLIC_APP_ENV) ?? 'development';
const appEnv: AppEnvironment =
  rawAppEnv === 'production' || rawAppEnv === 'preview' ? rawAppEnv : 'development';

export const env = {
  appEnv,
  isProduction: appEnv === 'production',

  supabaseUrl,
  supabaseAnonKey,
  /**
   * False when Supabase credentials are absent. The app stays fully usable in
   * this state: it runs against local fixture data and disables sign-in. This
   * is what lets development continue before a Supabase project exists.
   */
  hasSupabase: Boolean(supabaseUrl && supabaseAnonKey),

  defaultCountry: (optional(process.env.EXPO_PUBLIC_DEFAULT_COUNTRY) ?? 'EG') as CountryCode,
  defaultCurrency: (optional(process.env.EXPO_PUBLIC_DEFAULT_CURRENCY) ?? 'EGP') as CurrencyCode,

  /**
   * Where recipe photography is served from, when it is not Supabase Storage.
   *
   * Lets the GitHub Pages preview point at a static asset host without a
   * Supabase project, and lets production move to a CDN without a migration.
   */
  recipeImageBaseUrl: optional(process.env.EXPO_PUBLIC_RECIPE_IMAGE_BASE_URL),

  /**
   * Renders the social screens against seeded demo data.
   *
   * Exists so the preview can SHOW friends, chat and moderation without
   * pretending a server answered. Every screen it touches is visibly badged,
   * and `isProduction` forces it off so it cannot ship by accident.
   */
  demoMode: boolFlag(process.env.EXPO_PUBLIC_DEMO_MODE, false) && appEnv !== 'production',

  enableGroceryOrdering: boolFlag(process.env.EXPO_PUBLIC_ENABLE_GROCERY_ORDERING, false),
  enableSocialAuth: boolFlag(process.env.EXPO_PUBLIC_ENABLE_SOCIAL_AUTH, false),

  googleIosClientId: optional(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  googleAndroidClientId: optional(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
  googleWebClientId: optional(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),

  appVersion: Constants.expoConfig?.version ?? '0.0.0',
} as const;

/**
 * Configuration problems worth surfacing to a developer at startup. Returned
 * rather than thrown — a missing Supabase project must degrade, not crash.
 */
export function describeConfigGaps(): string[] {
  const gaps: string[] = [];
  if (!supabaseUrl) gaps.push('EXPO_PUBLIC_SUPABASE_URL is not set');
  if (!supabaseAnonKey) gaps.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is not set');
  return gaps;
}
