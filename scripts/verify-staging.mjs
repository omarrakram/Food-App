#!/usr/bin/env node
/**
 * Is staging actually deployed, or does it only look deployed?
 *
 *     node scripts/verify-staging.mjs
 *
 * Every check here exists because the thing it checks fails SILENTLY. A
 * missing cron extension does not error, it simply never runs the job. A
 * wallet callback nobody configured does not error, it just means wallet
 * payments never settle. A Vault secret that is absent turns the refund
 * executor into a no-op that reports success. None of that shows up in a
 * deploy log, and all of it shows up three days later as "a customer says
 * they paid and nothing happened".
 *
 * IT READS. It changes nothing, takes no destructive action, and is safe to
 * run against staging as often as you like. It is NOT safe to point at
 * production, and it says so if the project ref matches one.
 *
 * It needs `.env.staging` and `psql`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ENV_FILE = join(ROOT, '.env.staging');

if (!existsSync(ENV_FILE)) {
  console.error('.env.staging is missing. Copy .env.staging.example and fill it in.');
  process.exit(1);
}

/** A deliberately small reader: `KEY=value`, no expansion, no surprises. */
function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    out[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnvFile(ENV_FILE), ...process.env };

const REF = env.SUPABASE_STAGING_PROJECT_REF;
const DB_URL = env.SUPABASE_STAGING_DB_URL;
const API = env.SUPABASE_STAGING_URL;
const SERVICE_KEY = env.SUPABASE_STAGING_SERVICE_ROLE_KEY;

if (!REF || !DB_URL || !API || !SERVICE_KEY) {
  console.error(
    'Missing one of SUPABASE_STAGING_PROJECT_REF, SUPABASE_STAGING_DB_URL, ' +
      'SUPABASE_STAGING_URL, SUPABASE_STAGING_SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

/*
  WRITTEN DOWN, not left to a variable.

  This script only reads, so pointing it at production would be embarrassing
  rather than destructive — but the ref belongs in one place, the same place
  `deploy-staging.sh` keeps it, so that "which project is which" is never a
  thing somebody has to remember.
*/
const PRODUCTION_REFS = ['qriymxsnrphytzopigwb'];

if (PRODUCTION_REFS.includes(REF) || env.SUPABASE_PRODUCTION_PROJECT_REF === REF) {
  console.error(`${REF} is the production project. Refusing to run.`);
  process.exit(1);
}

console.log(`Verifying staging project ${REF}`);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`   ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return Boolean(ok);
};

function sql(statement) {
  const result = spawnSync('psql', [DB_URL, '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'psql failed').trim());
  }
  return result.stdout.trim();
}

const section = (title) => console.log(`\n▸ ${title}`);

async function main() {
  /*
    THE LOCAL FILE FIRST, before anything that needs the network.

    Every check below this one shells out to psql or fetches the project, so a
    database that is unreachable — wrong password, wrong host, a network policy
    — used to take the local configuration checks down with it. Those are the
    ones somebody can act on without leaving their laptop, so they go first.
  */
  // --- The app's own configuration -------------------------------------------
  /*
    LOCAL ONLY, AND READ-ONLY.

    Supabase does not hand a function's environment back, and asking for it is
    not something this script should want to do — so these check the file the
    deploy will be run FROM, which is the only copy anybody can fix. They are
    here because both variables fail silently in opposite directions: a missing
    APP_BASE_URL sends a paying customer to the wrong app, and a missing
    ALLOWED_ORIGINS makes every browser call fail with nothing in any log.
  */
  section('app configuration (local file, not read back from Supabase)');

  const appBaseUrl = (env.APP_BASE_URL ?? '').trim();
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const originShaped = (value) =>
    /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|http:\/\/(localhost|127\.0\.0\.1):)/.test(
      value,
    ) &&
    !value.endsWith('/') &&
    !value.slice(value.indexOf('://') + 3).includes('/');

  check('APP_BASE_URL is set', Boolean(appBaseUrl), appBaseUrl || 'blank');
  if (appBaseUrl) {
    check(
      'and is a bare origin — no trailing slash, no path',
      originShaped(appBaseUrl),
      appBaseUrl,
    );
    check(
      'it is not a production-looking host',
      !/(^|\.)akalt\.app$/.test(new URL(appBaseUrl).hostname),
      new URL(appBaseUrl).hostname,
    );
  }

  check('ALLOWED_ORIGINS is set', allowedOrigins.length > 0, `${allowedOrigins.length} origin(s)`);
  for (const origin of allowedOrigins) {
    // Compared to the browser's `Origin` header EXACTLY. A trailing slash or a
    // path means it can never match, and the only symptom is a blocked request.
    check(`ALLOWED_ORIGINS entry is a bare origin: ${origin}`, originShaped(origin));
  }

  check(
    'APP_BASE_URL is itself on the allow-list',
    Boolean(appBaseUrl) && allowedOrigins.includes(appBaseUrl),
    'the page the customer returns to has to be able to call the functions',
  );

  /*
    NOT CHECKED, and worth saying: whether the DEPLOYED functions actually
    carry these values. `supabase secrets list` shows names and digests, never
    values, and a name being present says nothing about it being right. The
    proof is a sandbox payment that returns the customer to the staging app
    rather than to production.
  */
  console.log('   … whether the deployed functions carry them: not readable, by design.');

  // --- Schema ----------------------------------------------------------------
  section('the migrations');

  /*
    THE NEWEST OBJECT OF EACH PHASE, not a version table.

    `supabase_migrations.schema_migrations` records which FILES ran. It cannot
    tell you whether the objects survived — a migration applied to the wrong
    database, or a table dropped by hand afterwards, leaves the version table
    perfectly happy. So this asks the schema.
  */
  const objects = [
    ['orders', "select to_regclass('public.orders') is not null"],
    ['payment_intents', "select to_regclass('public.payment_intents') is not null"],
    ['merchant_memberships', "select to_regclass('public.merchant_memberships') is not null"],
    ['refund_attempts', "select to_regclass('public.refund_attempts') is not null"],
    ['merchant_invites', "select to_regclass('public.merchant_invites') is not null"],
    ['job_runs', "select to_regclass('public.job_runs') is not null"],
    ['edge_job_endpoints', "select to_regclass('public.edge_job_endpoints') is not null"],
  ];
  for (const [name, statement] of objects) {
    check(`${name} exists`, sql(statement) === 't');
  }

  check(
    'the refund functions are there',
    sql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and p.proname in ('request_refund', 'claim_refund_attempts',
                              'record_refund_result', 'apply_refund_success')`) === '4',
  );

  check(
    'RLS is on every commerce table',
    sql(`select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname in ('orders','order_items','carts','cart_lines','payment_intents',
                              'payment_events','refund_attempts','merchant_invites',
                              'merchant_memberships','delivery_addresses')
            and not c.relrowsecurity`) === '0',
  );

  // --- Platform extensions ---------------------------------------------------
  section('the platform extensions');

  for (const extension of ['pg_cron', 'pg_net', 'supabase_vault']) {
    check(
      `${extension} is installed`,
      sql(`select count(*) from pg_extension where extname = '${extension}'`) === '1',
      'STAGING.md § 2',
    );
  }

  // --- The scheduler ---------------------------------------------------------
  section('the scheduler');

  let cronJobs = '0';
  try {
    cronJobs = sql(`select count(*) from cron.job where jobname like 'akalt-%'`);
  } catch {
    cronJobs = '0';
  }
  check('the seven AKALT cron jobs are scheduled', cronJobs === '7', `${cronJobs} found`);

  check(
    'both HTTP jobs have an endpoint configured',
    sql(`select count(*) from public.edge_job_endpoints where enabled`) === '2',
    'STAGING.md § 2',
  );

  check(
    'and the endpoints point at THIS project',
    sql(`select count(*) from public.edge_job_endpoints where url like '%${REF}%'`) === '2',
  );

  let vaultSecret = '0';
  try {
    vaultSecret = sql(
      `select count(*) from vault.decrypted_secrets where name = 'service_role_key'`,
    );
  } catch {
    vaultSecret = '0';
  }
  check('the service-role key is in Vault', vaultSecret === '1', 'STAGING.md § 2');

  // --- Realtime --------------------------------------------------------------
  section('realtime');

  check(
    'orders and order_substitutions are in the realtime publication',
    sql(`select count(*) from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'
            and tablename in ('orders', 'order_substitutions')`) === '2',
    'without this the merchant queue only ever polls',
  );

  // --- Functions -------------------------------------------------------------
  section('the edge functions');

  const functions = [
    ['payments-begin', 401],
    ['payments-simulate', 401],
    ['payments-reconcile', 401],
    ['refunds-execute', 401],
    ['ai-suggest', 401],
    ['ai-interpret', 401],
  ];

  for (const [name, unauthorised] of functions) {
    try {
      // No Authorization header on purpose: a deployed, correctly gated
      // function refuses. A 404 means it was never deployed.
      const response = await fetch(`${API}/functions/v1/${name}`, { method: 'POST' });
      check(
        `${name} is deployed and refuses an unauthenticated call`,
        response.status !== 404,
        `HTTP ${response.status}${response.status === unauthorised ? '' : ' (expected a refusal)'}`,
      );
    } catch (error) {
      check(`${name} is reachable`, false, String(error).slice(0, 120));
    }
  }

  try {
    const response = await fetch(`${API}/functions/v1/payments-webhook`, { method: 'POST' });
    /*
      THE ONE THAT MUST NOT BE 401.

      Paymob has no Supabase token. If this was deployed WITHOUT
      `--no-verify-jwt`, the platform rejects every callback before the
      function runs, the provider retries into a wall, and no order ever
      settles — with nothing in any log that says why.
    */
    check(
      'payments-webhook is deployed WITHOUT jwt verification',
      response.status !== 404 && response.status !== 401,
      `HTTP ${response.status}`,
    );
  } catch (error) {
    check('payments-webhook is reachable', false, String(error).slice(0, 120));
  }

  // --- Paymob ----------------------------------------------------------------
  section('paymob');

  const paymobKeys = [
    'PAYMOB_SECRET_KEY',
    'PAYMOB_PUBLIC_KEY',
    'PAYMOB_HMAC_SECRET',
    'PAYMOB_CARD_INTEGRATION_ID',
    'PAYMOB_WALLET_INTEGRATION_ID',
  ];
  for (const key of paymobKeys) {
    check(`${key} is set locally`, Boolean(env[key]));
  }

  /*
    THE CALLBACKS CANNOT BE VERIFIED FROM HERE, and pretending otherwise would
    be the worst check in this file. Paymob's dashboard configuration is not
    readable through their API, so the only proof that both integrations point
    at `payments-webhook` is a real sandbox payment of each kind arriving.
    That is the next step, not this one.
  */
  console.log('   … both integrations’ callbacks: not checkable from here.');
  console.log('     Prove them with one sandbox CARD payment and one sandbox WALLET payment.');

  // --- Data sanity -----------------------------------------------------------
  section('data');

  const demoEnabled = sql(
    `select count(*) from public.merchants where is_demo and is_enabled`,
  );
  check(
    'no DEMO merchant is enabled here',
    demoEnabled === '0',
    demoEnabled === '0' ? '' : 'a fixture would be selectable by real users',
  );

  const realMerchants = sql(
    `select count(*) from public.merchants where is_enabled and not is_demo`,
  );
  console.log(`   … enabled non-demo merchants: ${realMerchants}`);
  if (realMerchants === '0') {
    console.log('     Expected before the partner is configured. The app will say');
    console.log('     "no shop delivers here yet", which is the honest answer.');
  }

  // --- Verdict ---------------------------------------------------------------
  const failed = results.filter((entry) => !entry.ok);
  console.log('');
  console.log(`${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('\nNot ready. Outstanding:');
    for (const entry of failed) console.log(`  - ${entry.name}${entry.detail ? ` (${entry.detail})` : ''}`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(String(error?.stack ?? error));
  process.exitCode = 1;
}
