/**
 * The two staging values that are URLs, and the rule that relates them.
 *
 * They look like the same kind of thing and they are not, which is the whole
 * reason this file exists rather than a regex in each caller:
 *
 *   APP_BASE_URL    is WHERE THE APP IS SERVED FROM. It is a base URL, and it
 *                   MAY carry a path — a GitHub Pages project site lives at
 *                   `https://<user>.github.io/<repo>`, and the deployed AKALT
 *                   preview is exactly that. `payments-begin` appends
 *                   `/payment/<orderId>` to it.
 *
 *   ALLOWED_ORIGINS is a list of BROWSER ORIGIN HEADER VALUES. An `Origin`
 *                   header is `scheme://host[:port]` and never anything else —
 *                   no path, no trailing slash — because that is what the
 *                   browser sends and `_shared/http.ts` compares it with
 *                   `includes()`, i.e. exact string equality.
 *
 * So for the Pages preview the correct configuration is:
 *
 *     APP_BASE_URL=https://omarrakram.github.io/Food-App
 *     ALLOWED_ORIGINS=https://omarrakram.github.io
 *
 * and the relation to enforce is not "these two are equal" but "the ORIGIN OF
 * APP_BASE_URL is on the allow-list" — because the page the customer is
 * redirected back to is the page that then calls the functions, and the
 * browser will send that origin.
 *
 * Every judgement here is made by the WHATWG URL parser rather than by string
 * surgery. `new URL(x).origin` is the same serialisation the browser uses for
 * the header, so comparing an entry to its own `.origin` is the definition of
 * "this is a bare origin", not an approximation of it.
 *
 * Used by `scripts/deploy-staging.sh` (as a CLI, below), by
 * `scripts/verify-staging.mjs`, and by the drift guard in
 * `scripts/__tests__/staging-config-drift.test.ts`. It reads nothing, writes
 * nothing and touches no network.
 */

/**
 * Hosts allowed to be plain `http:`.
 *
 * The same three `_shared/http.ts` recognises. Anywhere else, a staging URL
 * that is not https is a mistake — the app is a payment flow and a browser
 * will refuse half of it on an insecure origin anyway.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const isLocal = (url) => LOCAL_HOSTS.has(url.hostname);

/** https, or http on one of the three local hosts. */
function schemeProblem(url, label) {
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && isLocal(url)) return null;
  return `${label} must be https (http is accepted only for localhost, 127.0.0.1 and [::1]): got '${url.href}'`;
}

/**
 * APP_BASE_URL — a base URL. A PATH IS ALLOWED AND IS NOT AN ERROR.
 *
 * Refused: anything the URL parser cannot read, a non-https scheme off
 * localhost, credentials, and a query or fragment — because `payments-begin`
 * appends `/payment/<orderId>` by concatenation, and appending a path to
 * something ending in `?next=1` produces a URL that goes nowhere while looking
 * plausible in a log.
 *
 * Normalised: one trailing slash is removed, so the appended route reads the
 * same whether or not somebody typed it. (`payments-begin` strips it too; this
 * only means the value on the server and the value in the file agree.)
 */
export function parseAppBaseUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { problems: ['APP_BASE_URL is blank.'] };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { problems: [`APP_BASE_URL is not a URL: '${raw}'`] };
  }

  const problems = [];
  const scheme = schemeProblem(url, 'APP_BASE_URL');
  if (scheme) problems.push(scheme);
  if (url.username || url.password) {
    problems.push(`APP_BASE_URL must not carry credentials: '${raw}'`);
  }
  if (url.search || url.hash) {
    problems.push(
      `APP_BASE_URL must not carry a query or fragment — '/payment/<orderId>' is appended to it: '${raw}'`,
    );
  }
  if (problems.length > 0) return { problems };

  const normalised = raw.replace(/\/+$/, '');
  return {
    problems: [],
    normalised,
    origin: url.origin,
    // What `payments-begin` will actually send Paymob, so a caller can print
    // it and a human can recognise it or not.
    redirectExample: `${normalised}/payment/<orderId>`,
  };
}

/** `a, b ,c` → `['a', 'b', 'c']`, the way `_shared/http.ts` splits it. */
export function splitOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * ALLOWED_ORIGINS — every entry a bare origin.
 *
 * The test is `entry === new URL(entry).origin`. That is not a heuristic: it
 * is the browser's own serialisation, so anything that fails it is something
 * no `Origin` header can ever equal, and the only symptom in production would
 * be a blocked request with nothing in any log.
 */
export function parseAllowedOrigins(value) {
  const entries = splitOrigins(value);
  if (entries.length === 0) return { problems: ['ALLOWED_ORIGINS is blank.'], entries: [] };

  const problems = [];
  for (const entry of entries) {
    let url;
    try {
      url = new URL(entry);
    } catch {
      problems.push(`ALLOWED_ORIGINS entry is not a URL: '${entry}'`);
      continue;
    }

    const scheme = schemeProblem(url, `ALLOWED_ORIGINS entry '${entry}'`);
    if (scheme) {
      problems.push(scheme);
      continue;
    }

    if (entry !== url.origin) {
      problems.push(
        `ALLOWED_ORIGINS entry must be a bare origin — no path, no trailing slash, ` +
          `nothing a browser would not send in an 'Origin' header. ` +
          `Got '${entry}'; the origin of it is '${url.origin}'.`,
      );
    }
  }

  return { problems, entries };
}

/**
 * The pair, and the one relation between them.
 *
 * Returns `{ problems, appBaseUrl, allowedOrigins }`, with the normalised
 * values when there are no problems.
 */
export function validateAppConfig({ appBaseUrl, allowedOrigins }) {
  const base = parseAppBaseUrl(appBaseUrl);
  const list = parseAllowedOrigins(allowedOrigins);
  const problems = [...base.problems, ...list.problems];

  // THE RELATION. Not equality — the origin of the base URL.
  if (base.problems.length === 0 && list.problems.length === 0) {
    if (!list.entries.includes(base.origin)) {
      problems.push(
        `The origin of APP_BASE_URL ('${base.origin}') is not in ALLOWED_ORIGINS ` +
          `(${list.entries.join(', ')}). The page the customer returns to would load ` +
          `and then be unable to call the functions.\n` +
          `  APP_BASE_URL may carry a path; the allow-list entry must not:\n` +
          `    APP_BASE_URL=${base.normalised}\n` +
          `    ALLOWED_ORIGINS=${base.origin}`,
      );
    }
  }

  return {
    problems,
    appBaseUrl: base.normalised,
    appOrigin: base.origin,
    redirectExample: base.redirectExample,
    allowedOrigins: list.entries,
  };
}

/** Hosts that mean "this is the production app", wherever this is checked. */
const PRODUCTION_HOST = /(^|\.)akalt\.app$/;

export function looksLikeProduction(appBaseUrl) {
  try {
    return PRODUCTION_HOST.test(new URL(appBaseUrl).hostname);
  } catch {
    return false;
  }
}

/*
  THE CLI, for `deploy-staging.sh`.

      node scripts/lib/staging-config.mjs check "<APP_BASE_URL>" "<ALLOWED_ORIGINS>"

  Exit 0: two lines on stdout — the normalised APP_BASE_URL, then the
  normalised ALLOWED_ORIGINS — which the shell then deploys, so that what
  reaches Supabase is what was validated rather than what was typed.
  Exit 1: the problems, one per line, for the shell to print as its error.

  Everything goes to stdout so the caller can capture it with one `$(...)`;
  the exit code is what distinguishes the two.
*/
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [, , command, appBaseUrl, allowedOrigins] = process.argv;

  if (command !== 'check') {
    console.log(`usage: ${process.argv[1]} check <APP_BASE_URL> <ALLOWED_ORIGINS>`);
    process.exit(2);
  }

  const result = validateAppConfig({ appBaseUrl, allowedOrigins });
  if (result.problems.length > 0) {
    console.log(result.problems.join('\n'));
    process.exit(1);
  }

  console.log(result.appBaseUrl);
  console.log(result.allowedOrigins.join(','));
}
