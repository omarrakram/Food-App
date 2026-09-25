#!/usr/bin/env node
/**
 * The merchant dashboard, driven in a real browser against a real database.
 *
 *     npm run walk:merchant
 *     npm run walk:merchant -- --no-export     # reuse dist/ as it is
 *     WALK_OUT=/tmp/shots npm run walk:merchant
 *
 * WHY THIS EXISTS. Every merchant guarantee in Commerce-6 and Commerce-7 is
 * proved in SQL or in a unit test, and neither proves the thing a supermarket
 * will actually use. A dashboard can call the wrong RPC, pass the wrong
 * argument, filter the queue client-side, or render a button the state machine
 * would refuse — and every one of those passes `npm run verify`. `smoke:web`
 * does not close the gap either: it drives the app in demo mode with no
 * backend, so it can only ever assert that a merchant WITHOUT access is turned
 * away.
 *
 * WHAT IS REAL HERE, because that is the whole point:
 *
 *   A REAL POSTGRES with every migration applied, the demo catalogue as rows,
 *   and the staff fixture. Not a mock, not a fixture object in a test.
 *
 *   REAL ROW LEVEL SECURITY, through a real PostgREST. Each request carries a
 *   signed JWT and Postgres switches to `authenticated` with that `sub`, which
 *   is exactly what Supabase does. Nothing in this walk can see a row its
 *   policy would not return.
 *
 *   THE REAL RPCS. `create_order_draft`, `begin_payment`,
 *   `record_payment_event`, `advance_fulfilment`, `report_item_unavailable`,
 *   `decide_substitution`, `queue_due_refunds` — all of them, called by the
 *   app's own repositories, through the app's own screens.
 *
 *   TWO REAL EDGE FUNCTIONS. `payments-begin` and `payments-simulate` run under
 *   Deno on their own ports, exactly as deployed.
 *
 * WHAT IS STOOD IN FOR, stated plainly rather than hidden:
 *
 *   GOTRUE. There is no auth server, so the walk mints the session JWT itself
 *   and the proxy verifies it with the same secret PostgREST does. Signing in
 *   is not what this walk is testing, and a fake sign-in that produced a token
 *   nothing verified would have been the dishonest version.
 *
 *   THE PROVIDER. The merchant is the DEMO merchant, so `begin_payment` writes
 *   `provider = 'demo'` and the simulator settles it — which is the same path
 *   `record_payment_event` takes for a signed Paymob callback, minus the
 *   signature. No real money and no real supermarket is involved in any of
 *   this, and the fixture refuses to run against a database that has one.
 *
 * It needs: a running Postgres (see scripts/db-local.sh), `postgrest` on PATH
 * or POSTGREST_BIN, `deno` on PATH or DENO_BIN, and Playwright's Chromium.
 * Any of them missing is a clear message and a non-zero exit, never a pass.
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { startLocalStack } from './lib/local-stack.mjs';
import { loadChromium, serveDist } from './lib/web-export.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = process.env.WALK_OUT ?? join(ROOT, '.walk');

const CUSTOMER = '9a1c0000-0000-4000-8000-000000000001';
const MANAGER = '9a1c0000-0000-4000-8000-000000000002';
const PICKER = '9a1c0000-0000-4000-8000-000000000003';
const EMAILS = {
  [CUSTOMER]: 'walk.customer@akalt.test',
  [MANAGER]: 'walk.manager@akalt.test',
  [PICKER]: 'walk.picker@akalt.test',
};

const log = (...args) => console.log('•', ...args);

let stack = null;
let site = null;

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

// --- The walk ----------------------------------------------------------------

async function main() {
  const chromium = await loadChromium(ROOT);
  await mkdir(OUT, { recursive: true });

  // --- 1. The stack ----------------------------------------------------------
  log('building the walk database…');
  stack = await startLocalStack({
    db: process.env.WALK_DB ?? 'akla_walk',
    fixtures: ['supabase/fixtures/merchant-staff.sql'],
    functions: ['payments-begin', 'payments-simulate'],
    emails: EMAILS,
    pgrstPort: Number(process.env.WALK_PGRST_PORT ?? 3301),
    apiPort: Number(process.env.WALK_API_PORT ?? 3310),
    firstFunctionPort: Number(process.env.WALK_BEGIN_PORT ?? 3311),
  });

  const { apiBase, anonToken, sessionFor, sql, storageKey, tokenFor } = stack;
  const API_BASE = apiBase;
  const ANON_TOKEN = anonToken;
  const STORAGE_KEY = storageKey;
  log('postgrest and the edge functions are up');

  // --- 2. A basket to work -----------------------------------------------------
  const merchantId = sql(`select id from public.merchants where is_demo limit 1`);
  const branchId = sql(
    `select id from public.merchant_locations where merchant_id = '${merchantId}' limit 1`,
  );
  if (!merchantId || !branchId) throw new Error('the demo catalogue is not in the database');

  /*
    A BASKET, written as rows.

    Seeded rather than assembled through the recipe screens: what this walk is
    about starts at the cart, and driving twelve taps of ingredient sourcing to
    get there would make a merchant-dashboard failure look like a sourcing one.
    (`walk:pilot` is the one that drives sourcing, against a real database
    merchant.) These are the same rows the app itself writes — `/cart` reads
    them through the same repository, and the checkout that follows is real.
  */
  sql(`
    insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
    values ('9a1c0000-0000-4000-8000-0000000000c1', '${CUSTOMER}', '${merchantId}', '${branchId}', 'EGP')
    on conflict do nothing;
    insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
    select '9a1c0000-0000-4000-8000-0000000000c1', p.id, 1, p.price_minor
      from public.merchant_products p
     where p.merchant_location_id = '${branchId}'
       and p.is_active and p.price_minor is not null
     order by p.price_minor desc
     limit 3
    on conflict do nothing;
  `);

  // --- 3. The bundle, pointed at it ------------------------------------------
  if (!existsSync(DIST) || !process.argv.includes('--no-export')) {
    log('exporting the web bundle…');
    await run('npx', ['expo', 'export', '--platform', 'web', '--clear'], {
      env: {
        ...process.env,
        EXPO_OFFLINE: '1',
        EXPO_PUBLIC_APP_ENV: 'development',
        // NOT demo mode. `demoMode` turns itself off when a Supabase project is
        // configured, and configuring one is the entire point of this walk.
        EXPO_PUBLIC_DEMO_MODE: 'false',
        /*
          THE BUNDLED CATALOGUE IS ON, and the walk asserts that it REFUSES
          checkout rather than completing it.

          `selectMerchant` is static in V1: there is no code path that reads a
          merchant out of the database, and `data/commerce-demo/merchant.json`
          ships with `isAcceptingOrders: false` so that no build can order from
          the fixture. Both are deliberate. Together they mean the customer's
          cart → checkout → pay journey cannot be completed in a browser by
          anybody, which is a finding for the pilot audit rather than something
          to switch off here — see docs/PILOT_READINESS.md.

          So the walk drives what a browser can drive, asserts the refusal it
          should hit, and then creates the paid order through the REAL RPCs and
          the REAL payment functions over HTTP as the customer. The merchant
          half — which is what this walk exists for — is entirely in the
          browser.
        */
        EXPO_PUBLIC_DEMO_MERCHANT: 'true',
        EXPO_PUBLIC_ENABLE_GROCERY_ORDERING: 'true',
        EXPO_PUBLIC_SUPABASE_URL: API_BASE,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_TOKEN,
      },
    });
  }

  site = await serveDist(DIST, 0);
  log(`serving the export on ${site.base}`);

  // --- 4. The browser --------------------------------------------------------
  const preinstalled = '/opt/pw-browsers/chromium';
  const executablePath =
    process.env.CHROMIUM_PATH ?? (existsSync(preinstalled) ? preinstalled : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  const problems = [];
  /*
    A CONTEXT PER IDENTITY, and the session seeded before any app code runs.

    Setting localStorage after navigating races the app's own auth bootstrap:
    supabase-js clears the key when it finds no session, and that clear can
    land AFTER the write — which reads as "signed in as nobody" and is
    maddening to diagnose. `addInitScript` runs before the page's first script
    on every navigation, so the session is simply there when the app looks.
    A fresh context per person also means no cache or storage crosses between
    the customer, the manager and the picker, which is what we want to prove
    about them anyway.
  */
  let context = null;
  let page = null;

  const watch = (target) => {
    target.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    target.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      // The realtime socket has nothing to connect to here; the queue falls
      // back to polling, which is documented behaviour and not a failure.
      if (/realtime|websocket|ERR_(BLOCKED|NAME_NOT_RESOLVED|CONNECTION)/i.test(text)) return;
      if (/images\.unsplash\.com|Failed to load resource/.test(text)) return;
      problems.push(`console: ${text.slice(0, 200)}`);
    });
  };

  const checks = [];
  let failures = 0;
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    console.log(`   ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) {
      failures += 1;
      // The page as it actually was, at the moment it disagreed.
      void page
        .evaluate(() => document.body.innerText)
        .then((text) =>
          writeFileSync(join(OUT, `failure-${failures}.txt`), `${page.url()}\n\n${text}`),
        )
        .catch(() => {});
    }
    return Boolean(ok);
  };
  /*
    A picture AND the text.

    A screenshot of a screen that rendered the wrong thing looks like a
    screenshot of a screen. The text beside it is what makes a failed run
    diagnosable without re-running the whole stack.
  */
  const shot = async (name) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
    const text = await page.evaluate(() => document.body.innerText).catch(() => '');
    writeFileSync(join(OUT, `${name}.txt`), `${page.url()}\n\n${text}`);
  };
  const locate = (testId) => page.locator(`[data-testid="${testId}"]`).first();
  const visible = async (testId, timeout = 12_000) => {
    try {
      await locate(testId).waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  };
  const tap = async (testId, timeout = 12_000) => {
    const element = locate(testId);
    await element.waitFor({ state: 'visible', timeout });
    await element.scrollIntoViewIfNeeded().catch(() => {});
    await element.click();
    await page.waitForTimeout(700);
  };
  const bodyText = () => page.evaluate(() => document.body.innerText);

  /** Signs in as somebody, by putting a verifiable session where the app looks. */
  const signInAs = async (userId, where) => {
    if (context) await context.close();
    context = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await context.addInitScript(
      ([key, value]) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          // A context with storage blocked would fail every check anyway.
        }
      },
      [STORAGE_KEY, sessionFor(userId)],
    );
    page = await context.newPage();
    watch(page);

    const trail = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) trail.push(frame.url());
    });

    /*
      TWICE, ON PURPOSE.

      The first navigation boots the app cold: it reads the session, fetches
      preferences, and may bounce through the onboarding gate on its way to
      deciding that this account has already been onboarded. A deep link that
      arrives during that decision loses to it. The second navigation happens
      against a warm app that has stopped redirecting, which is what a person
      opening a bookmarked URL experiences a moment later.
    */
    await page.goto(`${site.base}${where}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    if (new URL(page.url()).pathname !== where.split('?')[0]) {
      await page.goto(`${site.base}${where}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
    }

    writeFileSync(
      join(OUT, `nav-${userId.slice(-2)}-${where.replace(/\W+/g, '_')}.txt`),
      [`asked for ${where}`, `landed on ${page.url()}`, '', ...trail].join('\n'),
    );
  };

  // === THE CUSTOMER PLACES AN ORDER =========================================
  log('customer: cart → checkout → draft → payment');
  await signInAs(CUSTOMER, '/cart');

  /*
    THE SESSION IS THE FIRST THING TO PROVE.

    Everything below is meaningless if the app is browsing as a guest — it
    would read the LOCAL repositories, show an empty cart, and every later
    failure would point at the wrong thing. So this asserts the app is signed
    in before asserting anything about what it shows, and writes what it found
    in storage when it is not.
  */
  const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  const drawer = await bodyText();
  if (!check('the app is signed in as the customer', Boolean(stored) && !/Sign in/i.test(drawer))) {
    writeFileSync(
      join(OUT, 'session-debug.txt'),
      [
        `storage key: ${STORAGE_KEY}`,
        `stored: ${String(stored).slice(0, 400)}`,
        `url: ${page.url()}`,
      ].join('\n'),
    );
  }

  check('the cart loads the basket out of Postgres', await visible('cart-lines'));
  check('and is badged as the development catalogue', await visible('cart-demo-badge'));
  await shot('01-cart');

  await tap('cart-checkout');
  check('checkout opens', await visible('checkout-summary'));
  check(
    'with the delivery address the fixture created',
    !(await visible('checkout-no-address', 1500)),
  );

  /*
    THE DEMO CATALOGUE CANNOT BE ORDERED FROM, IN A BROWSER.

    Asserted rather than worked around. `merchant.json` ships
    `isAcceptingOrders: false`, `commerce-demo-isolation.test.ts` holds it
    there, and this is that guarantee observed from the outside: a real person,
    in a real browser, with a real signed-in account, cannot turn the
    development catalogue into an order.
  */
  check('and REFUSES to place an order from it', await visible('checkout-blocked'));
  await shot('02-checkout-refused');

  /*
    So the order is created the way a pilot's first order will have to be until
    `selectMerchant` can read a merchant out of the database: through the real
    RPC, over the real PostgREST, with the CUSTOMER'S OWN JWT — so RLS,
    `create_order_draft`'s own checks and the payment functions are all still
    in the loop. Nothing here is a fixture; the rows below are the rows the app
    would have written.
  */
  log('customer: the order itself, through the real RPCs');
  const asCustomer = async (path, body) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_TOKEN,
        Authorization: `Bearer ${tokenFor('authenticated', CUSTOMER)}`,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${path} -> ${response.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };

  const revision = Number(
    sql(`select revision from public.carts where user_id = '${CUSTOMER}' limit 1`),
  );
  const orderId = await asCustomer('/rest/v1/rpc/create_order_draft', {
    p_cart_revision: revision,
    p_address_id: '9a1c0000-0000-4000-8000-00000000000a',
    p_idempotency_key: `walk-${Date.now()}`,
    p_customer_note: 'Please ring the bell twice.',
  });
  check('create_order_draft produces a real order', typeof orderId === 'string', String(orderId));
  check(
    'and it is NOT yet visible to the merchant',
    sql(`select fulfilment_state from public.orders where id = '${orderId}'`) === 'draft',
  );

  const begun = await asCustomer('/functions/v1/payments-begin', {
    orderId,
    method: 'card',
    idempotencyKey: `walk-pay-${Date.now()}`,
  });
  const intentId = begun?.intentId ?? null;
  check('payments-begin creates a payment intent', Boolean(intentId), String(intentId));
  check(
    'against the demo provider, never a real one',
    sql(`select provider from public.payment_intents where id = '${intentId}'`) === 'demo',
  );

  // The simulator is the demo provider's stand-in for a signed callback, and it
  // reaches `record_payment_event` — the same function, the same duplicate
  // guard, the same state rules a Paymob callback would.
  await asCustomer('/functions/v1/payments-simulate', { intentId, outcome: 'succeeded' });
  check(
    'the payment is captured',
    sql(`select payment_state from public.orders where id = '${orderId}'`) === 'captured',
  );
  check(
    'and ONLY NOW is the order placed for the merchant',
    sql(`select fulfilment_state from public.orders where id = '${orderId}'`) === 'placed',
  );

  await signInAs(CUSTOMER, `/orders/${orderId}`);
  check('the customer can see the paid order in the app', await visible('order-status'));
  await shot('03-customer-order');

  // === THE MERCHANT WORKS IT =================================================
  log('merchant: queue → accept → picking → item issue');
  await signInAs(MANAGER, '/merchant');

  check('the merchant dashboard opens for staff', !(await visible('merchant-no-access', 2500)));
  check('and the paid order is in the NEW queue', await visible(`merchant-order-${orderId}`));
  await shot('05-merchant-queue');

  await tap(`merchant-order-${orderId}`);
  check('the order detail opens', await visible('merchant-items'));
  const merchantView = await bodyText();
  check(
    'the merchant sees where to deliver, from the snapshot',
    merchantView.includes('Road 9'),
  );
  check(
    'and NOT the customer email address',
    !merchantView.includes('walk.customer@akalt.test'),
  );
  await shot('06-merchant-order');

  await tap('merchant-action-accepted');
  check(
    'ACCEPT moves the order through advance_fulfilment',
    sql(`select fulfilment_state from public.orders where id = '${orderId}'`) === 'accepted',
  );

  await tap('merchant-action-picking');
  check(
    'START PICKING moves it again',
    sql(`select fulfilment_state from public.orders where id = '${orderId}'`) === 'picking',
  );
  await shot('07-picking');

  // The dearest line goes missing, and the shop offers a cheaper one.
  const itemId = sql(`
    select id from public.order_items
     where order_id = '${orderId}'
     order by unit_price_minor desc
     limit 1`);
  await tap(`merchant-unavailable-${itemId}`);
  check('the replacement picker offers options', await visible('merchant-remove-item'));
  await shot('08-replacements');

  const replacement = await page
    .locator('[data-testid^="merchant-replacement-"]')
    .first()
    .getAttribute('data-testid')
    .catch(() => null);
  if (replacement) {
    await tap(replacement);
  } else {
    await tap('merchant-remove-item');
  }

  const substitutionId = sql(
    `select id from public.order_substitutions where order_id = '${orderId}' limit 1`,
  );
  check('report_item_unavailable created a substitution', Boolean(substitutionId));
  check(
    'and it is waiting on the CUSTOMER, not on the shop',
    sql(`select decision from public.order_substitutions where id = '${substitutionId}'`) ===
      'pending_customer',
  );
  check('the dashboard says so', await visible('merchant-waiting'));
  await shot('09-waiting');

  // THE GUARANTEE THIS WALK EXISTS FOR: the button is not there, and the
  // database would refuse it even if it were.
  check(
    'READY is not offered while a customer is still being asked',
    !(await visible('merchant-action-ready', 1500)),
  );

  // === THE CUSTOMER ANSWERS ==================================================
  log('customer: sees the substitution and decides');
  await signInAs(CUSTOMER, `/orders/${orderId}`);

  check('the customer can see their own order', await visible('order-status'));
  check('and is asked about the missing item', await visible(`order-decision-${substitutionId}`));
  await shot('10-customer-decision');

  await tap(`order-accept-${substitutionId}`);
  check(
    'decide_substitution records the answer',
    sql(`select decision from public.order_substitutions where id = '${substitutionId}'`) !==
      'pending_customer',
  );

  // === THE MERCHANT FINISHES =================================================
  log('merchant: ready → out for delivery → delivered');
  await signInAs(MANAGER, `/merchant/${orderId}`);

  check('READY is offered once nobody is waiting', await visible('merchant-action-ready'));
  await tap('merchant-action-ready');
  check(
    'and the order is ready',
    sql(`select fulfilment_state from public.orders where id = '${orderId}'`) === 'ready',
  );

  await locate('merchant-rider').fill('Hany Saleh');
  await locate('merchant-rider-phone').fill('+201002223333');
  await tap('merchant-action-dispatched');
  check(
    'OUT FOR DELIVERY records the shop’s own rider',
    sql(`select rider_name from public.orders where id = '${orderId}'`) === 'Hany Saleh',
  );
  await shot('11-dispatched');

  await tap('merchant-action-delivered');
  check(
    'DELIVERED is the end of the fulfilment chain',
    sql(`select fulfilment_state from public.orders where id = '${orderId}'`) === 'delivered',
  );
  await shot('12-delivered');

  // === THE MONEY =============================================================
  log('refund: the cheaper substitute owes the difference');
  const owed = Number(
    sql(`select refund_required_minor from public.refund_position_of('${orderId}')`),
  );
  check('the ledger owes the customer the difference', owed > 0, `${owed} minor units`);

  await signInAs(CUSTOMER, `/orders/${orderId}`);
  check('the customer is told a refund is due', await visible('order-refund-due'));
  await shot('13-refund-due');

  // The scheduler raises it and the executor settles it — the same two
  // functions cron calls, run here by hand because there is no cron.
  sql(`select public.queue_due_refunds(10)`);
  const refundId = sql(`select id from public.refund_attempts where order_id = '${orderId}'`);
  check('queue_due_refunds raised an attempt', Boolean(refundId));
  sql(`select public.claim_refund_attempts(10)`);
  sql(`select public.record_refund_result('${refundId}', 'succeeded', 'walk-refund-1')`);
  check(
    'and the money is recorded as gone back',
    Number(sql(`select refunded_minor from public.orders where id = '${orderId}'`)) === owed,
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('the customer sees it completed', await visible('order-refund-completed'));
  await shot('14-refunded');

  // === STAFF =================================================================
  log('staff: the manager invites a picker, who accepts');
  await signInAs(MANAGER, '/merchant/staff');

  check('the manager can open the staff screen', await visible('merchant-team-email'));
  await locate('merchant-team-email').fill(EMAILS[PICKER]);
  await tap('merchant-team-send');
  check('an invitation is created', await visible('merchant-team-token'));
  await shot('15-invite');

  const token = sql(`
    select token from public.merchant_invites
     where email = '${EMAILS[PICKER]}' and accepted_at is null and revoked_at is null
     limit 1`);
  check('with a token addressed to that email', Boolean(token));

  await signInAs(PICKER, '/merchant');
  check('the invited person is offered it, not turned away', await visible('merchant-invite-'
    .concat(sql(`select id from public.merchant_invites where email = '${EMAILS[PICKER]}' limit 1`))));
  await shot('16-invitation');

  await tap(`merchant-accept-invite-${sql(
    `select id from public.merchant_invites where email = '${EMAILS[PICKER]}' limit 1`,
  )}`);
  await page.waitForTimeout(1500);
  check(
    'accepting makes them staff',
    sql(`select count(*) from public.merchant_memberships where user_id = '${PICKER}'`) === '1',
  );

  await page.goto(`${site.base}/merchant`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('and the queue opens for them', !(await visible('merchant-no-access', 2500)));
  await shot('17-picker-in');

  // A picker is not a manager, and the server is what says so.
  await page.goto(`${site.base}/merchant/staff`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('but the staff screen is not theirs', await visible('merchant-team-no-access'));
  await shot('18-picker-denied');

  // === A STRANGER ============================================================
  log('a stranger sees nothing');
  await signInAs(PICKER, `/orders/${orderId}`);
  check(
    'somebody else’s order is not readable, even with the id',
    await visible('order-missing'),
  );
  await shot('19-stranger');

  await browser.close();

  // --- Report ----------------------------------------------------------------
  const failed = checks.filter((entry) => !entry.ok);
  console.log('');
  console.log(
    `${checks.length - failed.length}/${checks.length} checks passed, ` +
      `${problems.length} page error(s). Screenshots in ${OUT}`,
  );
  if (problems.length > 0) {
    for (const problem of problems.slice(0, 10)) console.log(`   ! ${problem}`);
  }
  if (failed.length > 0 || problems.length > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  stack?.stop();
  site?.server?.close();
}
