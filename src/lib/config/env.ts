import Constants from 'expo-constants';

import type { CountryCode, CurrencyCode } from '@/types/domain';

/** What `app.config.js` stamps into `expo.extra` at build time. */
type BuildStamp = { build?: { commit?: string | null; builtAt?: string | null } };

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

/**
 * The publishable key, under its current name and its old one.
 *
 * Supabase's modern key is `sb_publishable_…`; the legacy one was a JWT called
 * `anon`. They are interchangeable to this app — the client never inspects the
 * key, it only passes it — so the rename is about the NAME being honest, not
 * about the value changing.
 *
 * The old variable is still read, and deliberately. Dropping it outright would
 * not produce an error: an environment still setting only
 * `EXPO_PUBLIC_SUPABASE_ANON_KEY` would read as "no backend configured" and
 * quietly fall into demo mode with a real project sitting behind it. A silent
 * downgrade is the worst of the available failures, so the fallback stays
 * until `describeConfigGaps()` has stopped reporting it anywhere that matters.
 *
 * Both are referenced statically, which Expo's bundler requires in order to
 * inline them.
 */
const supabasePublishableKeyNew = optional(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const supabaseLegacyAnonKey = optional(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const supabasePublishableKey = supabasePublishableKeyNew ?? supabaseLegacyAnonKey;

export type AppEnvironment = 'development' | 'preview' | 'production';

const rawAppEnv = optional(process.env.EXPO_PUBLIC_APP_ENV) ?? 'development';
const appEnv: AppEnvironment =
  rawAppEnv === 'production' || rawAppEnv === 'preview' ? rawAppEnv : 'development';

export const env = {
  appEnv,
  isProduction: appEnv === 'production',

  supabaseUrl,
  supabasePublishableKey,
  /**
   * False when Supabase credentials are absent. The app stays fully usable in
   * this state: it runs against local fixture data and disables sign-in. This
   * is what lets development continue before a Supabase project exists.
   */
  hasSupabase: Boolean(supabaseUrl && supabasePublishableKey),

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
   * Origin of the hosted web build, for links that have to survive leaving the app.
   *
   * A native build sharing `akla://recipe/x` has shared nothing with someone
   * who does not have the app. When this is set, an external share produces a
   * URL a browser can open; when it is not, the app scheme is the fallback.
   */
  webOrigin: optional(process.env.EXPO_PUBLIC_WEB_ORIGIN),

  /**
   * Renders the social screens against seeded demo data.
   *
   * Exists so the preview can SHOW friends, chat and moderation without
   * pretending a server answered. Every screen it touches is visibly badged.
   *
   * THREE conditions, all required: the flag is set, the environment is not
   * production, and there is no Supabase project. See the comment below on
   * the last one — it is what makes demo and real mutually exclusive.
   */
  demoMode:
    boolFlag(process.env.EXPO_PUBLIC_DEMO_MODE, false) &&
    appEnv !== 'production' &&
    // AND no backend. Demo mode exists BECAUSE there is nowhere to send
    // anything; the moment a Supabase project is configured there is, and a
    // build that seeded a fake friend list beside a real one would be the
    // exact confusion the banner is there to prevent. This is the rule that
    // makes "production and demo cannot coexist" true of the app rather than
    // only of the deploy script — a stale `EXPO_PUBLIC_DEMO_MODE=true` in
    // somebody's `.env.local` turns itself off when they add their keys.
    !Boolean(supabaseUrl && supabasePublishableKey),

  enableGroceryOrdering: boolFlag(process.env.EXPO_PUBLIC_ENABLE_GROCERY_ORDERING, false),
  enableSocialAuth: boolFlag(process.env.EXPO_PUBLIC_ENABLE_SOCIAL_AUTH, false),

  googleIosClientId: optional(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  googleAndroidClientId: optional(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
  googleWebClientId: optional(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),

  appVersion: Constants.expoConfig?.version ?? '0.0.0',

  /**
   * Which commit this bundle was built from, and when.
   *
   * Stamped by `app.config.js`. It exists so a bug reported against a hosted
   * URL can be pinned to a commit before anyone starts debugging — "the
   * preview still does X" and "the preview is three commits behind" look
   * identical from the outside, and one of them is not a bug.
   */
  buildCommit: (Constants.expoConfig?.extra as BuildStamp | undefined)?.build?.commit ?? null,
  builtAt: (Constants.expoConfig?.extra as BuildStamp | undefined)?.build?.builtAt ?? null,
} as const;

/**
 * Configuration problems worth surfacing to a developer at startup. Returned
 * rather than thrown — a missing Supabase project must degrade, not crash.
 */
export function describeConfigGaps(): string[] {
  const gaps: string[] = [];
  if (!supabaseUrl) gaps.push('EXPO_PUBLIC_SUPABASE_URL is not set');
  if (!supabasePublishableKey) {
    gaps.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set');
  } else if (!supabasePublishableKeyNew) {
    // Working, but on the old name. Said out loud so the fallback above can
    // eventually be removed on evidence rather than on hope.
    gaps.push(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY is deprecated — rename it to ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (the value does not change)',
    );
  }
  return gaps;
}
