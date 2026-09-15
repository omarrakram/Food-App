/**
 * Demo mode and a real backend must never coexist.
 *
 * Demo mode exists BECAUSE there is nowhere to send anything. The moment a
 * Supabase project is configured there is, and a build that seeded a fake
 * friend list beside a real one would be exactly the confusion the DEMO
 * banner is there to prevent — worse than either state alone, because the
 * banner would be telling the truth about half the screen.
 *
 * Three conditions gate it, and each is tested here on its own: the flag, the
 * environment, and the absence of credentials. Loaded fresh per case because
 * `env` reads `process.env` at import time — they are build-time constants in
 * the real app, inlined by the bundler.
 */

type Module = typeof import('@/lib/config/env');
type Env = Module['env'];

function loadModule(vars: Record<string, string | undefined>): Module {
  jest.resetModules();
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return jest.requireActual('@/lib/config/env') as Module;
  } finally {
    process.env = previous;
  }
}

function loadEnv(vars: Record<string, string | undefined>): Env {
  return loadModule(vars).env;
}

const KEYS = {
  EXPO_PUBLIC_SUPABASE_URL: undefined,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
  EXPO_PUBLIC_DEMO_MODE: undefined,
  EXPO_PUBLIC_APP_ENV: undefined,
};

const URL = 'https://example.supabase.co';

/** A configured backend, under the current variable name. */
const WITH_SUPABASE = {
  EXPO_PUBLIC_SUPABASE_URL: URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
};

/** The same backend, configured the way it was before the rename. */
const WITH_SUPABASE_LEGACY = {
  EXPO_PUBLIC_SUPABASE_URL: URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon-jwt',
};

describe('demoMode', () => {
  it('is on for a preview with the flag and no backend', () => {
    const env = loadEnv({ ...KEYS, EXPO_PUBLIC_DEMO_MODE: 'true', EXPO_PUBLIC_APP_ENV: 'preview' });
    expect(env.demoMode).toBe(true);
    expect(env.hasSupabase).toBe(false);
  });

  it('is off without the flag', () => {
    expect(loadEnv({ ...KEYS, EXPO_PUBLIC_APP_ENV: 'preview' }).demoMode).toBe(false);
  });

  it('is off in production however loudly the flag is set', () => {
    const env = loadEnv({
      ...KEYS,
      EXPO_PUBLIC_DEMO_MODE: 'true',
      EXPO_PUBLIC_APP_ENV: 'production',
    });
    expect(env.demoMode).toBe(false);
  });

  it('THE ONE THAT MATTERS: turns itself off as soon as a backend exists', () => {
    // A stale `EXPO_PUBLIC_DEMO_MODE=true` in somebody's .env.local must not
    // survive them adding their Supabase keys.
    const env = loadEnv({
      ...KEYS,
      ...WITH_SUPABASE,
      EXPO_PUBLIC_DEMO_MODE: 'true',
      EXPO_PUBLIC_APP_ENV: 'preview',
    });
    expect(env.hasSupabase).toBe(true);
    expect(env.demoMode).toBe(false);
  });

  it('needs BOTH credentials before it counts as a backend', () => {
    // Half a configuration is not a backend, and the app should stay in the
    // state where it says so rather than half-failing against it.
    const urlOnly = loadEnv({
      ...KEYS,
      EXPO_PUBLIC_SUPABASE_URL: URL,
      EXPO_PUBLIC_DEMO_MODE: 'true',
      EXPO_PUBLIC_APP_ENV: 'preview',
    });
    expect(urlOnly.hasSupabase).toBe(false);
    expect(urlOnly.demoMode).toBe(true);
  });

  it('never both', () => {
    // The invariant, stated once over every combination that can occur.
    for (const flag of ['true', 'false', undefined]) {
      for (const appEnv of ['development', 'preview', 'production', undefined]) {
        for (const supabase of [WITH_SUPABASE, WITH_SUPABASE_LEGACY, {}]) {
          const env = loadEnv({
            ...KEYS,
            ...supabase,
            EXPO_PUBLIC_DEMO_MODE: flag,
            EXPO_PUBLIC_APP_ENV: appEnv,
          });
          expect(env.demoMode && env.hasSupabase).toBe(false);
        }
      }
    }
  });
});

describe('the publishable key', () => {
  it('is read from EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', () => {
    const env = loadEnv({ ...KEYS, ...WITH_SUPABASE });
    expect(env.supabasePublishableKey).toBe('sb_publishable_example');
    expect(env.hasSupabase).toBe(true);
  });

  it('still resolves from the old name, so nobody silently loses their backend', () => {
    // Dropping the fallback would not raise an error — it would read as "no
    // project configured" and quietly fall into demo mode with a real one
    // behind it. That is the failure this fallback exists to prevent.
    const env = loadEnv({ ...KEYS, ...WITH_SUPABASE_LEGACY });
    expect(env.supabasePublishableKey).toBe('legacy-anon-jwt');
    expect(env.hasSupabase).toBe(true);
  });

  it('prefers the current name when both are set', () => {
    const env = loadEnv({ ...KEYS, ...WITH_SUPABASE, ...WITH_SUPABASE_LEGACY });
    expect(env.supabasePublishableKey).toBe('sb_publishable_example');
  });

  it('says nothing when the current name is used', () => {
    const gaps = loadModule({ ...KEYS, ...WITH_SUPABASE }).describeConfigGaps();
    expect(gaps).toEqual([]);
  });

  it('calls the old name deprecated rather than accepting it in silence', () => {
    const gaps = loadModule({ ...KEYS, ...WITH_SUPABASE_LEGACY }).describeConfigGaps();
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY is deprecated');
    expect(gaps[0]).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });

  it('reports the current name as missing when neither is set', () => {
    const gaps = loadModule({ ...KEYS }).describeConfigGaps();
    expect(gaps).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set');
    expect(gaps).toContain('EXPO_PUBLIC_SUPABASE_URL is not set');
    expect(gaps.some((gap) => gap.includes('deprecated'))).toBe(false);
  });
});
