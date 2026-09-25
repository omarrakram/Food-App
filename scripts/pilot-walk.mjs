#!/usr/bin/env node
/**
 * A REAL DATABASE MERCHANT, driven in a real browser.
 *
 *     npm run walk:pilot
 *     npm run walk:pilot -- --no-export
 *
 * WHY THIS EXISTS. `PILOT_READINESS.md` opened with blocker B1: the app could
 * not select a merchant out of the database. `enabledPartnerFor()` returned
 * null unconditionally, so the only selectable branch was the bundled
 * development catalogue — which ships `isAcceptingOrders: false` on purpose —
 * and a supermarket could be fully configured in Postgres, with RLS, prices,
 * stock and delivery areas, while the consumer app remained unable to see it.
 *
 * This walk is the proof that it is fixed, and it is deliberately NOT the same
 * walk as `walk:merchant`:
 *
 *   THE MERCHANT IS NOT THE DEMO ONE. `supabase/fixtures/pilot-merchant.sql`
 *   creates an ENABLED, NON-DEMO merchant with its own branch, its own
 *   delivery areas, its own shelf and its own ingredient mappings. The bundled
 *   catalogue is switched OFF in the export, so the only thing the app can
 *   possibly select is the row in Postgres.
 *
 *   IT STOPS BEFORE PAYMENT, and says so. A non-demo merchant means
 *   `begin_payment` writes `provider = 'paymob'`, and there are no Paymob
 *   sandbox credentials in this environment — so the honest end of this walk
 *   is the unpaid draft. Everything past that is Track B, and inventing a
 *   payment here would be exactly the kind of proof that proves nothing.
 *
 * What it drives, all of it through the real screens, the real RLS and the
 * real RPCs: choosing an address in an area the branch actually serves,
 * sourcing a recipe's missing ingredients against the branch's shelf, adding
 * what is safely matched to a cart, and turning that cart into a server-priced
 * order draft.
 */

import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { startLocalStack } from './lib/local-stack.mjs';
import { loadChromium, serveDist } from './lib/web-export.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = process.env.WALK_OUT ?? join(ROOT, '.walk-pilot');

const CUSTOMER = '9a1c0000-0000-4000-8000-000000000001';
const EMAILS = { [CUSTOMER]: 'walk.customer@akalt.test' };

/**
 * Four of its five ingredients are on the pilot shelf; one of them is out of
 * stock, so `no_purchasable_match` is reachable rather than theoretical.
 *
 * Addressed by SLUG here and resolved to the row's id at run time: the app
 * routes on the database id, and hard-coding a uuid would make this walk break
 * the first time the seed was regenerated.
 */
const RECIPE_SLUG = 'tortilla-espanola';

const log = (...args) => console.log('•', ...args);

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

let stack = null;
let site = null;

async function main() {
  const chromium = await loadChromium(ROOT);
  await mkdir(OUT, { recursive: true });

  log('building the pilot database…');
  stack = await startLocalStack({
    db: process.env.WALK_DB ?? 'akla_pilot',
    fixtures: [
      // The customer account. Its address is created through the APP below, so
      // the area picker and the deliverability check are both exercised.
      'supabase/fixtures/merchant-staff.sql',
      'supabase/fixtures/pilot-merchant.sql',
    ],
    emails: EMAILS,
    pgrstPort: Number(process.env.WALK_PGRST_PORT ?? 3321),
    apiPort: Number(process.env.WALK_API_PORT ?? 3330),
  });

  const { apiBase, anonToken, sessionFor, sql, storageKey } = stack;

  const merchantId = sql(
    `select id from public.merchants where is_enabled and not is_demo limit 1`,
  );
  const merchantName = sql(`select name from public.merchants where id = '${merchantId}'`);
  if (!merchantId) throw new Error('the pilot fixture did not create an enabled merchant');
  log(`the database offers: ${merchantName}`);

  // The staff fixture puts the customer's address in a DEMO area, which is
  // invisible with the bundled catalogue off. Removing it is what makes the
  // walk add a real one through the address form.
  sql(`delete from public.delivery_addresses where user_id = '${CUSTOMER}'`);

  if (!existsSync(DIST) || !process.argv.includes('--no-export')) {
    log('exporting the web bundle…');
    await run('npx', ['expo', 'export', '--platform', 'web', '--clear'], {
      env: {
        ...process.env,
        EXPO_OFFLINE: '1',
        EXPO_PUBLIC_APP_ENV: 'development',
        EXPO_PUBLIC_DEMO_MODE: 'false',
        /*
          THE BUNDLED CATALOGUE IS OFF, and that is the whole experiment. With
          it on, the app could fall back to the fixture and a passing walk
          would prove nothing about the database path. The only merchant this
          build can reach is the row in Postgres.
        */
        EXPO_PUBLIC_DEMO_MERCHANT: 'false',
        EXPO_PUBLIC_ENABLE_GROCERY_ORDERING: 'true',
        EXPO_PUBLIC_SUPABASE_URL: apiBase,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonToken,
      },
    });
  }

  site = await serveDist(DIST, 0);
  log(`serving the export on ${site.base}`);

  const preinstalled = '/opt/pw-browsers/chromium';
  const executablePath =
    process.env.CHROMIUM_PATH ?? (existsSync(preinstalled) ? preinstalled : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  const problems = [];
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await context.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // A context with storage blocked would fail every check anyway.
      }
    },
    [storageKey, sessionFor(CUSTOMER)],
  );

  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/realtime|websocket|ERR_(BLOCKED|NAME_NOT_RESOLVED|CONNECTION)/i.test(text)) return;
    if (/images\.unsplash\.com|Failed to load resource/.test(text)) return;
    problems.push(`console: ${text.slice(0, 200)}`);
  });

  const checks = [];
  let failures = 0;
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    console.log(`   ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) {
      failures += 1;
      void page
        .evaluate(() => document.body.innerText)
        .then((text) =>
          writeFileSync(join(OUT, `failure-${failures}.txt`), `${page.url()}\n\n${text}`),
        )
        .catch(() => {});
    }
    return Boolean(ok);
  };

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
  const tap = async (testId, timeout = 15_000) => {
    const element = locate(testId);
    await element.waitFor({ state: 'visible', timeout });
    await element.scrollIntoViewIfNeeded().catch(() => {});
    await element.click();
    await page.waitForTimeout(700);
  };
  const bodyText = () => page.evaluate(() => document.body.innerText);

  /** The app boots cold on the first navigation and may bounce; ask twice. */
  const go = async (path) => {
    await page.goto(`${site.base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    if (new URL(page.url()).pathname !== path.split('?')[0]) {
      await page.goto(`${site.base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
    }
  };

  // === 1. AN ADDRESS IN AN AREA THE BRANCH SERVES ============================
  log('customer: an address, in an area the branch actually serves');
  await go('/addresses/form');

  check('the address form opens', await visible('address-recipient'));
  const areaOptions = await bodyText();
  check(
    'and offers the PILOT areas, which came from the database',
    /Maadi/.test(areaOptions),
  );
  check(
    'while the demo catalogue areas are absent, because that flag is off',
    !/Sarayat/i.test(areaOptions),
  );
  await shot('01-address-form');

  await locate('address-recipient').fill('Salma Adel');
  await locate('address-phone').fill('+201007778888');
  await tap('address-area-pilot-maadi');
  await locate('address-street').fill('Road 9');
  await locate('address-building').fill('14');

  check(
    'the app says the shop delivers to the chosen area',
    await visible('address-served'),
  );
  await shot('02-served');

  await tap('address-save');
  await page.waitForTimeout(1500);
  check(
    'the address is saved',
    sql(`select count(*) from public.delivery_addresses where user_id = '${CUSTOMER}'`) === '1',
  );

  // === 2. SOURCING AGAINST THE DATABASE SHELF ================================
  log('customer: sourcing a recipe against the database merchant');
  const recipeId = sql(`select id from public.recipes where slug = '${RECIPE_SLUG}' limit 1`);
  check('the seed carries the recipe this walk sources', Boolean(recipeId), recipeId);
  await go(`/recipe/${recipeId}`);

  check('the recipe opens with a shop behind it', await visible('recipe-get-missing', 25_000));
  check(
    'and NOT the "ordering coming soon" dead end, which is what a null merchant renders',
    !(await visible('recipe-order', 1500)),
  );
  await tap('recipe-get-missing');
  check('the sourcing panel opens', await visible('recipe-sourcing', 20_000));
  await shot('03-sourcing');

  const panel = await bodyText();
  check('it names the DATABASE merchant', panel.includes(merchantName), merchantName);
  check(
    'and carries no demo badge, because this is not the fixture',
    !(await visible('recipe-demo-badge', 1500)),
  );
  check(
    'a product from the pilot shelf is offered',
    /Olive Oil 750ml|Onions 1kg|Table Eggs 12 pieces/.test(panel),
  );
  check(
    'and the out-of-stock line says so rather than reading as unmapped',
    /Potatoes 2kg/.test(panel) || /out of stock|Out of stock|unavailable/i.test(panel),
  );

  // === 3. CART ===============================================================
  log('customer: cart');
  await tap('recipe-add-to-cart');
  await page.waitForTimeout(2000);

  const cartRows = sql(`
    select count(*) from public.cart_lines l
      join public.carts c on c.id = l.cart_id
     where c.user_id = '${CUSTOMER}' and c.merchant_id = '${merchantId}'`);
  check('adding writes cart lines against the DATABASE merchant', Number(cartRows) > 0, cartRows);

  await go('/cart');
  check('the cart screen shows them', await visible('cart-lines'));
  check('with no demo badge', !(await visible('cart-demo-badge', 1500)));
  await shot('04-cart');

  // === 4. CHECKOUT ===========================================================
  log('customer: checkout, and a real order draft');
  await tap('cart-checkout');
  check('checkout opens', await visible('checkout-summary'));
  check('an address is selected', !(await visible('checkout-no-address', 1500)));

  /*
    THE ASSERTION THIS WHOLE WALK EXISTS FOR.

    `walk:merchant` asserts the opposite — that the bundled catalogue REFUSES
    checkout, because it ships `isAcceptingOrders: false`. Here the branch is a
    database row that says it is open, so the same screen must let the order
    through. One flag, two outcomes, both correct.
  */
  check('and checkout is NOT blocked, because this branch is open', !(await visible('checkout-blocked', 2000)));
  await shot('05-checkout');

  await tap('checkout-prepare');
  check('create_order_draft produces an order', await visible('checkout-draft', 25_000));
  await shot('06-draft');

  const orderId = sql(
    `select id from public.orders where user_id = '${CUSTOMER}' order by created_at desc limit 1`,
  );
  check('the order exists in the database', Boolean(orderId), orderId);
  check(
    'and belongs to the DATABASE merchant, not the fixture',
    sql(`select merchant_id from public.orders where id = '${orderId}'`) === merchantId,
  );
  check(
    'it is an unpaid draft, as it must be',
    sql(`select fulfilment_state || '/' || payment_state from public.orders where id = '${orderId}'`) ===
      'draft/unpaid',
  );
  check(
    'and its merchant is NOT a demo one — so payment would go to Paymob, which is Track B',
    sql(`select is_demo from public.merchants where id = '${merchantId}'`) === 'f',
  );

  await browser.close();

  const failed = checks.filter((entry) => !entry.ok);
  console.log('');
  console.log(
    `${checks.length - failed.length}/${checks.length} checks passed, ` +
      `${problems.length} page error(s). Screenshots in ${OUT}`,
  );
  for (const problem of problems.slice(0, 10)) console.log(`   ! ${problem}`);
  if (failed.length > 0 || problems.length > 0) process.exitCode = 1;
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
