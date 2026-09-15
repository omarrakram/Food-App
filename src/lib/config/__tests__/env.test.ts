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

type Env = typeof import('@/lib/config/env').env;

function loadEnv(vars: Record<string, string | undefined>): Env {
  jest.resetModules();
  const previous = { ...process.env };
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return (jest.requireActual('@/lib/config/env') as typeof import('@/lib/config/env')).env;
  } finally {
    process.env = previous;
  }
}

const KEYS = {
  EXPO_PUBLIC_SUPABASE_URL: undefined,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
  EXPO_PUBLIC_DEMO_MODE: undefined,
  EXPO_PUBLIC_APP_ENV: undefined,
};

const WITH_SUPABASE = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
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
      EXPO_PUBLIC_SUPABASE_URL: WITH_SUPABASE.EXPO_PUBLIC_SUPABASE_URL,
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
        for (const supabase of [WITH_SUPABASE, {}]) {
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
