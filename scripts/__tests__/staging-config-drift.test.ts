import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE STAGING ENVIRONMENT IS DESCRIBED IN FOUR PLACES, AND THEY DRIFT.
 *
 * `.env.staging.example` says what to fill in. `deploy-staging.sh` says what
 * must not be blank and what gets sent to `supabase secrets set`. The edge
 * functions say what they actually read. Nothing connected the three, and the
 * result was two live bugs at once:
 *
 *   1. the example file carried a `PAYMOB_REDIRECTION_URL` that NO CODE HAS
 *      EVER READ, so filling it in configured nothing, and
 *   2. `payments-begin` read an `APP_BASE_URL` that the deploy script NEVER
 *      SET, so a staging deploy shipped a function that silently fell back to
 *      a hard-coded production URL.
 *
 * Both are the same shape of mistake — a name in one file and not the other —
 * and neither fails at deploy time, or at start-up, or in any log. They fail
 * the first time a customer pays.
 *
 * So this compares the four lists. It is deliberately a TEXT comparison of the
 * repository rather than anything that runs a deploy: it must pass with no
 * credentials, no network and no `.env.staging` present.
 *
 * WHEN THIS FAILS, the fix is usually one line in whichever file forgot the
 * name — not an addition to the lists below. Each list is an exception with a
 * reason, and a name added to one without a reason is this test being
 * disabled slowly.
 */

const ROOT = join(__dirname, '..', '..');

const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8');

/**
 * Comments removed before any membership test.
 *
 * Without this, the tombstone in `.env.staging.example` explaining why
 * `PAYMOB_REDIRECTION_URL` was removed would itself count as a use of it, and
 * the test would pass on prose. Same reasoning as `payment-secrets.test.ts`:
 * what matters is the code, and a sentence about a variable is not a use of
 * one.
 */
function shellCode(source: string): string {
  // A `#` that starts a line or follows whitespace. `${x#pattern}` and the
  // like are preceded by a brace or a letter, so they survive.
  return source.replace(/(^|\s)#[^\n]*/gm, '$1');
}

function jsCode(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// --- What each file says ------------------------------------------------------

const EXAMPLE = read('.env.staging.example');
const DEPLOY = read('scripts/deploy-staging.sh');
const DEPLOY_CODE = shellCode(DEPLOY);
const VERIFY_CODE = jsCode(read('scripts/verify-staging.mjs'));
const CONFIG_LIB_CODE = jsCode(read('scripts/lib/staging-config.mjs'));

/** `NAME=` at the start of a line. A mention inside a comment is not one. */
function declaredInExample(): string[] {
  return [...EXAMPLE.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]!);
}

/** The `REQUIRED=( ... )` array, comments stripped. */
function requiredByDeploy(): string[] {
  const block = /REQUIRED=\(([\s\S]*?)\)/.exec(DEPLOY_CODE);
  if (!block) throw new Error('deploy-staging.sh no longer has a REQUIRED=( ... ) array');
  return [...block[1]!.matchAll(/\b([A-Z][A-Z0-9_]*)\b/g)].map((match) => match[1]!);
}

/** `NAME=value` pairs on the `supabase secrets set` line. */
function setBySecretsCall(): { name: string; value: string }[] {
  const block = /supabase secrets set([\s\S]*?)--project-ref/.exec(DEPLOY_CODE);
  if (!block) throw new Error('deploy-staging.sh no longer calls `supabase secrets set`');
  return [...block[1]!.matchAll(/([A-Z][A-Z0-9_]*)=("[^"]*"|\S+)/g)].map((match) => ({
    name: match[1]!,
    value: match[2]!,
  }));
}

/** Every `Deno.env.get('NAME')` reachable in a deployed function. */
function readByFunctions(): string[] {
  const out = new Set<string>();

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        walk(path);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      const source = jsCode(readFileSync(path, 'utf8'));
      for (const match of source.matchAll(/Deno\.env\.get\(\s*'([A-Z][A-Z0-9_]*)'\s*\)/g)) {
        out.add(match[1]!);
      }
    }
  };

  walk(join(ROOT, 'supabase', 'functions'));
  return [...out].sort();
}

// --- The exceptions, each with a reason --------------------------------------

/**
 * Supplied by the platform. Setting these is not possible and not wanted:
 * Supabase injects them into every function, and `supabase secrets set`
 * rejects the `SUPABASE_` prefix outright.
 */
const PLATFORM_PROVIDED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

/**
 * Read with a working fallback, so absence is a decision rather than a bug.
 * Each is checked below to actually have one.
 */
const OPTIONAL_WITH_FALLBACK = [
  'DENO_DEPLOYMENT_ID', // set by Deno Deploy; its absence is the signal itself
  'ENVIRONMENT', // falls back to DENO_DEPLOYMENT_ID
  'FUNCTIONS_BASE_URL', // falls back to `${SUPABASE_URL}/functions/v1`
  'ANTHROPIC_MODEL', // falls back to a pinned model id
  'ANTHROPIC_EFFORT', // falls back to a default effort
];

/**
 * Declared in `.env.staging.example` but consumed by something that is not our
 * code, so no grep can find the use.
 */
const CONSUMED_BY_TOOLING: Record<string, string> = {
  SUPABASE_ACCESS_TOKEN: 'read from the environment by the Supabase CLI itself',
};

/** Client-side build configuration; Expo inlines these into the web bundle. */
const isExpoPublic = (name: string) => name.startsWith('EXPO_PUBLIC_');

function usedInClientSource(name: string): boolean {
  const sources = [read('app.config.js')];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        walk(path);
        continue;
      }
      if (/\.tsx?$/.test(entry)) sources.push(readFileSync(path, 'utf8'));
    }
  };
  walk(join(ROOT, 'src'));

  return sources.some((source) => jsCode(source).includes(name));
}

// --- The checks ---------------------------------------------------------------

describe('staging configuration does not drift', () => {
  it('every variable the deploy script requires is offered by .env.staging.example', () => {
    const declared = new Set(declaredInExample());
    const missing = requiredByDeploy().filter((name) => !declared.has(name));

    expect(missing).toEqual([]);
  });

  it('every variable the deploy script sends to Supabase is one it required, or has a default', () => {
    const required = new Set(requiredByDeploy());

    const unguarded = setBySecretsCall()
      // A literal (`ALLOW_PAYMENT_SIMULATOR="false"`) needs nothing from the
      // environment, and `${X:-default}` says in the expansion what happens
      // when X is absent. Everything else is a bare `${X}`, which expands to
      // an empty string and deploys a function configured with nothing.
      .filter(({ value }) => /^"\$\{[A-Z][A-Z0-9_]*\}"$/.test(value))
      .map(({ name }) => name)
      .filter((name) => !required.has(name));

    expect(unguarded).toEqual([]);
  });

  it('every variable an edge function reads is deployed, platform-provided, or optional', () => {
    const deployed = new Set(setBySecretsCall().map(({ name }) => name));
    const accounted = new Set([...deployed, ...PLATFORM_PROVIDED, ...OPTIONAL_WITH_FALLBACK]);

    // THE ONE THAT WOULD HAVE CAUGHT THE APP_BASE_URL BUG: a function reads it,
    // nothing deploys it, and nobody decided it was optional.
    const unset = readByFunctions().filter((name) => !accounted.has(name));

    expect(unset).toEqual([]);
  });

  it('the exception lists have no dead entries', () => {
    /*
      AN ALLOW-LIST ROTS QUIETLY. A name excused here for a function that no
      longer reads it is a hole waiting for something else with the same name,
      and nothing else in the repository would ever mention it again.

      Deliberately NOT a check that each fallback exists: whether
      `ANTHROPIC_EFFORT` degrades gracefully is a reading of four lines of
      `anthropic.ts`, and a regex pretending to decide it would fail on a
      rewrite that was perfectly correct. That judgement belongs in review.
      This only insists the exceptions still correspond to something real.
    */
    const read = new Set(readByFunctions());
    const dead = [...PLATFORM_PROVIDED, ...OPTIONAL_WITH_FALLBACK].filter(
      (name) => !read.has(name),
    );

    expect(dead).toEqual([]);
  });

  it('every variable .env.staging.example asks for is actually consumed somewhere', () => {
    const functionReads = new Set(readByFunctions());

    const orphans = declaredInExample().filter((name) => {
      if (name in CONSUMED_BY_TOOLING) return false;
      if (functionReads.has(name)) return false;
      if (DEPLOY_CODE.includes(name)) return false;
      if (VERIFY_CODE.includes(name) || CONFIG_LIB_CODE.includes(name)) return false;
      if (isExpoPublic(name) && usedInClientSource(name)) return false;
      return true;
    });

    // THE ONE THAT WOULD HAVE CAUGHT PAYMOB_REDIRECTION_URL: a name somebody
    // is asked to fill in that nothing anywhere reads.
    expect(orphans).toEqual([]);
  });

  it('APP_BASE_URL and ALLOWED_ORIGINS are still wired end to end', () => {
    // Named explicitly because they are the pair this whole guard came from,
    // and because a generic check over the sets would pass if BOTH ends
    // disappeared together.
    for (const name of ['APP_BASE_URL', 'ALLOWED_ORIGINS']) {
      expect(declaredInExample()).toContain(name);
      expect(requiredByDeploy()).toContain(name);
      expect(setBySecretsCall().map((entry) => entry.name)).toContain(name);
      expect(readByFunctions()).toContain(name);
    }
  });
});
