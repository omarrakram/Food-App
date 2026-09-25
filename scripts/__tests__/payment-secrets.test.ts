import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * NO PROVIDER SECRET REACHES A CLIENT.
 *
 * The rule is one sentence and it has three edges, each of which has been a
 * real incident somewhere:
 *
 *   1. The secret must not be IN the app source, because the app source is the
 *      bundle and the bundle is a text file anybody can read.
 *   2. It must not be reachable THROUGH the app either — no `EXPO_PUBLIC_`
 *      variable may carry it, because Expo inlines every one of those.
 *   3. And nothing server-side may hand it back, because a function that
 *      echoes its own configuration is the same leak with extra steps.
 *
 * `.github/workflows/preview.yml` greps the built bundle for key-shaped
 * strings, which catches a leak that has already happened. This catches the
 * import that would cause one, in the diff that introduces it.
 */

const ROOT = join(__dirname, '..', '..');

/**
 * Comments removed, for the same reason `check-db-types.ts` removes them: a
 * docblock saying "the HMAC secret never reaches the database" is a promise,
 * not a leak, and a check that fails on the sentence describing the rule is a
 * check people delete.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Anything under here ships to a device or a browser. */
const CLIENT_DIRS = ['src', 'app.config.js'];

/**
 * Names that only ever belong in an edge function's environment.
 *
 * Deliberately the NAMES rather than value patterns: a test that hunts for
 * things shaped like keys is a test that misses a key shaped differently, and
 * one that finds a string in a comment and fails the build for prose.
 */
const SERVER_ONLY = [
  'PAYMOB_SECRET_KEY',
  'PAYMOB_API_KEY',
  'PAYMOB_HMAC_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
];

function filesUnder(relative: string, extensions: readonly string[]): string[] {
  const absolute = join(ROOT, relative);
  const out: string[] = [];

  let entry;
  try {
    entry = statSync(absolute);
  } catch {
    return out;
  }

  if (!entry.isDirectory()) {
    if (extensions.some((extension) => absolute.endsWith(extension))) out.push(absolute);
    return out;
  }

  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (extensions.some((extension) => path.endsWith(extension))) out.push(path);
    }
  };

  walk(absolute);
  return out;
}

describe('provider secrets', () => {
  const clientFiles = CLIENT_DIRS.flatMap((dir) =>
    filesUnder(dir, ['.ts', '.tsx', '.js', '.jsx']),
  ).filter((path) => !path.includes('__tests__'));

  it('scans a client surface that actually exists', () => {
    // A test that silently walked nothing would pass forever.
    expect(clientFiles.length).toBeGreaterThan(100);
  });

  it.each(SERVER_ONLY)('never names %s in client code', (name) => {
    const offenders = clientFiles.filter((path) => code(readFileSync(path, 'utf8')).includes(name));
    expect(offenders.map((path) => path.slice(ROOT.length + 1))).toEqual([]);
  });

  it('exposes no EXPO_PUBLIC variable that could hold a provider credential', () => {
    // EXPO_PUBLIC_* is inlined into the bundle by definition, so the only safe
    // provider value there is the PUBLISHABLE key — which is public, and is
    // safe solely because RLS is on every table.
    const offenders: string[] = [];
    for (const path of clientFiles) {
      const source = code(readFileSync(path, 'utf8'));
      for (const match of source.matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) {
        const variable = match[0];
        if (/SECRET|PRIVATE|SERVICE_ROLE|HMAC|API_KEY/.test(variable)) {
          offenders.push(`${path.slice(ROOT.length + 1)}: ${variable}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the Paymob API surface entirely inside edge functions', () => {
    /*
      The client is allowed to know the WORD `paymob` — it is a value of
      `payment_provider`, it is written on the order, and a screen has to be
      able to say which provider settled a payment. What it must never know is
      the provider's API: no host, no endpoint, no integration id, no HMAC.
      The client asks `payments-begin` for a checkout URL and is told one.
    */
    const apiSurface =
      /accept\.paymob|paymobsolutions|unifiedcheckout|void_refund|\/v1\/intention|integration_id|hmac/i;

    const offenders = clientFiles.filter((path) => apiSurface.test(code(readFileSync(path, 'utf8'))));
    expect(offenders.map((path) => path.slice(ROOT.length + 1))).toEqual([]);
  });

  it('proves that check would fire — the edge functions DO carry the API surface', () => {
    // Non-vacuity. Without this, narrowing the pattern above to something that
    // matches nothing anywhere would look like a pass.
    const shared = readFileSync(join(ROOT, 'supabase/functions/_shared/paymob.ts'), 'utf8');
    expect(shared).toMatch(/void_refund/);
    expect(shared).toMatch(/unifiedcheckout/);
  });

  it('never returns a configured secret from a function response', () => {
    const functions = filesUnder('supabase/functions', ['.ts']).filter(
      (path) => !path.includes('__tests__'),
    );
    expect(functions.length).toBeGreaterThan(5);

    const offenders: string[] = [];
    for (const path of functions) {
      const source = code(readFileSync(path, 'utf8'));
      // A secret inside a JSON.stringify or a Response body. Crude on purpose:
      // the fix for a false positive is to stop putting the word next to the
      // response, which is a fine thing to be forced into.
      for (const match of source.matchAll(/(?:JSON\.stringify|new Response)\(([\s\S]{0,400}?)\)/g)) {
        if (/secretKey|hmacSecret|serviceKey|SERVICE_ROLE|apiKey/i.test(match[1] ?? '')) {
          offenders.push(path.slice(ROOT.length + 1));
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
