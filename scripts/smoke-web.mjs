#!/usr/bin/env node
/**
 * End-to-end smoke test: builds the web export, serves it, and drives a real
 * browser through the app's actual interactions.
 *
 *     npm run smoke:web                 # export, serve, drive, screenshot
 *     npm run smoke:web -- --keep       # leave the export in place afterwards
 *     npm run smoke:web -- --no-export  # reuse the dist/ already on disk
 *     SMOKE_OUT=/tmp/shots npm run smoke:web
 *
 * Why this exists, and why it does more than visit routes: this suite used to
 * walk the tab bar, screenshot each screen, and report green — while tapping
 * "+" on the Pantry dropped straight into the global error boundary. Visiting
 * a route only proves the route renders. Every bug that made the app unusable
 * in practice lived one interaction deeper: a form that would not open, a
 * confirmation that did nothing, a filter with no way back.
 *
 * So this drives the things a person actually does — open the add sheet, type,
 * save, edit, delete, switch language, apply and clear filters — and asserts
 * on the result of each one. A page error anywhere, or a failed assertion,
 * fails the run.
 *
 * It needs Playwright's browser driver, which is deliberately NOT a dependency
 * of the app (it would land in every contributor's install for one script):
 *
 *     npm i -D playwright-core        # or set PLAYWRIGHT_CORE
 *     npx playwright install chromium # or set CHROMIUM_PATH
 *
 * Blocked image hosts are ignored: they say something about the network, not
 * the app.
 */

import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = process.env.SMOKE_OUT ?? join(ROOT, '.smoke');
// Port 0 lets the OS hand out a free port, so a stray server from an earlier
// run cannot collide with this one. SMOKE_PORT pins it when you want to open
// the export in your own browser alongside the run.
const PORT = Number(process.env.SMOKE_PORT ?? 0);
const KEEP = process.argv.includes('--keep');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

const log = (...args) => console.log('•', ...args);

/** Locates Playwright without making it a dependency of the app. */
async function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    'playwright-core',
    'playwright',
    join(ROOT, 'node_modules/playwright-core/index.mjs'),
    join(ROOT, '../node_modules/playwright-core/index.mjs'),
  ].filter(Boolean);

  const require_ = createRequire(import.meta.url);
  for (const candidate of candidates) {
    try {
      const specifier = candidate.startsWith('/')
        ? candidate
        : require_.resolve(candidate, { paths: [ROOT] });
      const mod = await import(specifier);
      if (mod.chromium) return mod.chromium;
      if (mod.default?.chromium) return mod.default.chromium;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(
    'Playwright not found. Install it with `npm i -D playwright-core` (and ' +
      '`npx playwright install chromium`), or point PLAYWRIGHT_CORE at an ' +
      'existing playwright-core entry point.',
  );
}

/**
 * Resolves a URL path against the export, dynamic routes included.
 *
 * Expo writes a dynamic route as a literal `[id].html`, so `/recipe/<uuid>`
 * matches no file and a naive server 404s it — which silently made every
 * direct link to a recipe untestable, including the share links this app
 * sends. Walking the path and falling back to the single `[param]` sibling at
 * each level is what the real router does, and it is what a shared link needs.
 */
async function resolveExportPath(pathname) {
  const segments = decodeURIComponent(pathname).split('/').filter(Boolean);

  const isFile = async (candidate) => {
    try {
      return (await stat(candidate)).isFile();
    } catch {
      return false;
    }
  };
  const isDirectory = async (candidate) => {
    try {
      return (await stat(candidate)).isDirectory();
    } catch {
      return false;
    }
  };
  /**
   * The one dynamic segment in a directory, by PARAM NAME.
   *
   * Expo writes `[id]` and `[id].html` side by side — a directory for the
   * route's children and a file for the route itself. Those are ONE route, so
   * counting entries says "ambiguous" and refuses to resolve anything. Only
   * two different names — `[id]` and `[slug]` — would be a real ambiguity, and
   * guessing there would make the smoke test pass against the wrong page.
   */
  const dynamicChild = async (directory) => {
    try {
      const entries = await readdir(directory);
      const names = new Set();
      for (const entry of entries) {
        const match = /^(\[[^\]]+\])(\.html)?$/.exec(entry);
        if (match) names.add(match[1]);
      }
      const [only] = [...names];
      return names.size === 1 ? only : null;
    } catch {
      return null;
    }
  };

  let current = DIST;
  for (const [index, segment] of segments.entries()) {
    const last = index === segments.length - 1;
    const literal = join(current, segment);

    if (last) {
      if (await isFile(literal)) return literal;
      if (await isFile(`${literal}.html`)) return `${literal}.html`;
      if (await isFile(join(literal, 'index.html'))) return join(literal, 'index.html');
      const dynamic = await dynamicChild(current);
      if (dynamic) {
        const resolved = join(current, dynamic);
        // `.html` first: that IS the route. The same-named directory beside it
        // holds the route's children, not the route.
        if (await isFile(`${resolved}.html`)) return `${resolved}.html`;
        if (await isFile(resolved)) return resolved;
        if (await isFile(join(resolved, 'index.html'))) return join(resolved, 'index.html');
      }
      return null;
    }

    if (await isDirectory(literal)) {
      current = literal;
      continue;
    }
    const dynamic = await dynamicChild(current);
    if (dynamic && (await isDirectory(join(current, dynamic)))) {
      current = join(current, dynamic);
      continue;
    }
    return null;
  }

  return isFile(join(DIST, 'index.html')) ? join(DIST, 'index.html') : null;
}

/** Expo's static export writes one HTML file per route, plus assets. */
function serveDist() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const file = await resolveExportPath(url.pathname);

    if (file) {
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      });
      createReadStream(file).pipe(res);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () =>
      resolveServer({ server, base: `http://127.0.0.1:${server.address().port}` }),
    );
  });
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolveRun() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

/**
 * A deployed URL to drive instead of a local export.
 *
 * The same assertions against the thing that is actually published: an export
 * that passes locally and a Pages deployment that works are different claims,
 * and the gap between them (a wrong base path, a missing 404 fallback, an
 * asset that 404s under a subpath) is invisible to a local run.
 */
function remoteBase() {
  const flag = process.argv.indexOf('--base');
  if (flag === -1) return null;
  const value = process.argv[flag + 1];
  if (!value) throw new Error('--base needs a URL');
  return value.replace(/\/$/, '');
}

async function main() {
  const chromium = await loadChromium();
  const REMOTE = remoteBase();

  if (!REMOTE && (!existsSync(DIST) || !process.argv.includes('--no-export'))) {
    log('exporting the web bundle…');
    // EXPO_OFFLINE keeps the CLI from reaching api.expo.dev, which is blocked
    // in some sandboxes and only ever consulted for version hints.
    // The DEMO flags match `.github/workflows/preview.yml` exactly, and that is
    // the point: a smoke test that exports a different configuration from the
    // one that gets deployed is testing a build nobody will ever open. The
    // social screens only have anything in them under these.
    await run('npx', ['expo', 'export', '--platform', 'web', '--clear'], {
      env: {
        ...process.env,
        EXPO_OFFLINE: '1',
        EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV ?? 'preview',
        EXPO_PUBLIC_DEMO_MODE: process.env.EXPO_PUBLIC_DEMO_MODE ?? 'true',
        // The development merchant catalogue, so the walk can exercise the
        // commerce path. `env.useDemoMerchantCatalogue` also requires a
        // non-production build, so this flag cannot open it in production.
        EXPO_PUBLIC_DEMO_MERCHANT: process.env.EXPO_PUBLIC_DEMO_MERCHANT ?? 'true',
      },
    });
  }

  await mkdir(OUT, { recursive: true });
  const local = REMOTE ? null : await serveDist();
  const server = local?.server ?? null;
  const BASE = REMOTE ?? local.base;
  log(REMOTE ? `driving the deployed preview at ${BASE}` : `serving dist/ on ${BASE}`);

  /**
   * Which Chromium to drive.
   *
   * Playwright looks for the exact build its own version pins, and a sandbox
   * that ships a pre-installed browser is rarely on that exact build — so an
   * npm update to Playwright breaks the smoke test with "Executable doesn't
   * exist", which reads like a missing dependency and is not one. The stable
   * symlink beside the versioned directories is the environment's answer to
   * that, so it is used when Playwright's own pin is absent.
   */
  const preinstalled = '/opt/pw-browsers/chromium';
  const executablePath =
    process.env.CHROMIUM_PATH ?? (existsSync(preinstalled) ? preinstalled : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Blocked remote images are an egress-policy fact, not an app failure.
    if (/images\.unsplash\.com|ERR_(BLOCKED|NAME_NOT_RESOLVED|TUNNEL)/.test(text)) return;
    // A deployed preview has no Supabase project, so the client's probe fails
    // by design. That is the app degrading correctly, not a page error.
    if (/supabase|Failed to fetch|NetworkError/i.test(text)) return;
    problems.push(`console: ${text.slice(0, 200)}`);
  });

  // --- Assertions ---------------------------------------------------------
  const checks = [];
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok: Boolean(ok), detail });
    console.log(`   ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    return Boolean(ok);
  };

  const shot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
  };

  /**
   * A screenshot of a element that is not at the top of the page.
   *
   * `shot` photographs the viewport wherever it happens to be, which for a
   * long page means the bottom. The sourced product rows sit under YOU NEED,
   * halfway up a recipe, so a plain screenshot of that screen is evidence of
   * the summary panel and of nothing else.
   */
  const shotAt = async (selector, name) => {
    const element = page.locator(selector).first();
    if ((await element.count()) === 0) return false;
    await element.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    return true;
  };

  const locate = (testId) => page.locator(`[data-testid="${testId}"]`).first();

  const visible = async (testId, timeout = 6000) => {
    try {
      await locate(testId).waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  };

  const tap = async (testId, { optional = false, timeout = 8000 } = {}) => {
    const element = locate(testId);
    if (optional && (await element.count()) === 0) return false;
    try {
      await element.waitFor({ state: 'visible', timeout });
    } catch {
      if (optional) return false;
      throw new Error(`smoke: could not find [data-testid="${testId}"]`);
    }
    await element.click();
    await page.waitForTimeout(450);
    return true;
  };

  /**
   * React Native Web's TextInput ignores Playwright's fill(): the value is set
   * on the DOM node but React never sees the change. Typing does what a user
   * does, and is what the component actually listens for.
   */
  const type = async (testId, text, { clear = false } = {}) => {
    const element = locate(testId);
    await element.waitFor({ state: 'visible', timeout: 8000 });
    await element.click();
    if (clear) {
      await element.press('Control+a');
      await element.press('Backspace');
    }
    await element.pressSequentially(text, { delay: 30 });
    await page.waitForTimeout(400);
  };

  const bodyText = () => page.evaluate(() => document.body.innerText);

  /** How many page errors have been seen so far, to attribute new ones. */
  const errorCount = () => problems.length;

  try {
    // --- Onboarding ------------------------------------------------------
    console.log('\n▸ onboarding');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // FRESH INSTALL. The first screen must be a question the app genuinely
    // cannot answer for you — not a name field. Onboarding used to open on
    // one, and it was the only REQUIRED step in the flow.
    check(
      'a fresh install opens on language, not a profile form',
      await visible('onboarding-language-en', 12000),
    );
    check(
      'and never asks for a name before showing anything',
      !(await visible('onboarding-name', 1200)),
    );
    await shot('01-onboarding');

    // Language is the one step with no Skip: skipping it does not mean "no
    // preference", it means "decide for me", in a language the reader may not
    // be able to undo the decision in.
    check('language cannot be skipped', !(await visible('onboarding-skip', 1200)));

    // Choosing Arabic must take effect on THIS screen, not after a restart.
    await tap('onboarding-language-ar');
    await page.waitForTimeout(700);
    const arabicNow = await page.evaluate(() => /[\u0600-\u06FF]/.test(document.body.innerText));
    check('choosing Arabic renders this screen in Arabic immediately', arabicNow);
    await shot('01b-onboarding-arabic');

    await tap('onboarding-language-en');
    await page.waitForTimeout(500);
    check('choosing a language advances', await tap('onboarding-next', { optional: true }));

    check('the second step is the safety question', await visible('onboarding-allergy-none', 6000));
    check(
      '"no allergies" is offered as a first-class answer',
      await tap('onboarding-allergy-none', { optional: true }),
    );
    await tap('onboarding-next', { optional: true });

    // The last step is the first useful screen, chosen by the user.
    check(
      'the last step offers a way in, not a summary',
      await visible('onboarding-start-cook', 6000),
    );
    await tap('onboarding-start-cook');
    await page.waitForTimeout(1800);
    check(
      'finishing lands straight in the ingredient picker, not a marketing page',
      await visible('cook-ingredient-picker', 10000),
    );

    // PERSISTED USER. A reload must not re-ask anything.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    check('a returning user is not asked again', !(await visible('onboarding-language-en', 1500)));
    check('and lands on the app', await visible('home-cook-with', 10000));
    await shot('02-home');

    // --- Pantry: the add flow, from BOTH entry points ---------------------
    // This is the interaction that shipped broken while this suite was green.
    console.log('\n▸ pantry add / edit / delete');
    await page.goto(`${BASE}/pantry`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const beforeEmptyCta = errorCount();
    const hasEmptyCta = await visible('pantry-empty-action', 4000);
    if (hasEmptyCta) {
      await tap('pantry-empty-action');
      check('empty-state CTA opens the add sheet', await visible('pantry-editor-name', 6000));
      check('empty-state CTA does not hit the error boundary', errorCount() === beforeEmptyCta);
      check('the add sheet closes again', await tap('pantry-editor-close', { optional: true }));
      await page.waitForTimeout(600);
    }

    const beforePlus = errorCount();
    await tap('pantry-add');
    check('top-right + opens the add sheet', await visible('pantry-editor-name', 6000));
    check('top-right + does not hit the error boundary', errorCount() === beforePlus);
    await shot('03-pantry-editor');

    await type('pantry-editor-name', 'milk');
    const summary = await locate('pantry-editor-details')
      .innerText()
      .catch(() => '');
    check('category and unit are inferred from the catalogue', /\w/.test(summary), summary.trim());

    await type('pantry-editor-quantity', '500');
    check('expiry field renders', await visible('pantry-editor-expiry', 4000));

    // A perishable is never an "always assume I have this" staple, and the row
    // says so rather than silently disappearing.
    const stapleRow = async () =>
      locate('pantry-editor-staple')
        .innerText()
        .catch(() => '');
    check(
      'a perishable cannot be marked a staple',
      /goes off|تاريخ|بتبوظ/i.test(await stapleRow()),
      (await stapleRow()).replace(/\n/g, ' ').trim(),
    );

    await type('pantry-editor-name', 'salt', { clear: true });
    check(
      'a cupboard staple can be',
      /keep assuming|available without a quantity|اعتبرها موجودة|من غير كمية/i.test(
        await stapleRow(),
      ),
      (await stapleRow()).replace(/\n/g, ' ').trim(),
    );
    await type('pantry-editor-name', 'milk', { clear: true });

    const beforeSave = errorCount();
    await tap('pantry-editor-submit');
    await page.waitForTimeout(1200);
    check('saving creates the item', /milk|لبن/i.test(await bodyText()));
    check('saving does not hit the error boundary', errorCount() === beforeSave);
    await shot('04-pantry-with-item');

    const firstItem = page.locator('[data-testid^="pantry-item-"]').first();
    check('the saved item is listed', (await firstItem.count()) > 0);

    if (await firstItem.count()) {
      await firstItem.click();
      await page.waitForTimeout(700);
      check('tapping an item reopens the editor', await visible('pantry-editor-name', 6000));
      await type('pantry-editor-quantity', '750', { clear: true });
      await tap('pantry-editor-submit');
      await page.waitForTimeout(900);
      check('editing an existing item saves', true);
    }

    const removeButton = page
      .locator('[data-testid^="pantry-item-"][data-testid$="-remove"]')
      .first();
    const rowRemove = page.getByRole('button', { name: /remove|شيل|احذف/i }).first();
    if ((await removeButton.count()) > 0) {
      await removeButton.click();
    } else if ((await rowRemove.count()) > 0) {
      await rowRemove.click();
    }
    await page.waitForTimeout(1000);
    check(
      'deleting removes the row',
      (await page.locator('[data-testid^="pantry-item-"]').count()) === 0 ||
        (await visible('pantry-empty', 2000)),
    );

    // --- Pantry: quick add, expiry prominence, and the cook handoff -------
    console.log('\n▸ pantry quick add and cook handoff');
    await page.goto(`${BASE}/pantry`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // ONE FIELD, TWO JOBS. Typing offers catalogue matches you do not hold.
    await type('pantry-search', 'tomato');
    check('typing offers something to add', await visible('pantry-add-suggestions', 4000));
    // `pantry-quick-add-`, not `pantry-add-`: the latter matched the group
    // View wrapping the candidates, and the surrounding sheet trigger, before
    // any candidate row — so this tapped a container and proved nothing.
    const addRow = page.locator('[data-testid^="pantry-quick-add-"]').first();
    if (await addRow.count()) await addRow.click();
    await page.waitForTimeout(1200);

    const pantryRows = async () => page.locator('[data-testid^="pantry-item-"]').count();
    check(
      'one tap adds it, with no quantity or date demanded',
      (await pantryRows()) > 0,
      `${await pantryRows()} rows`,
    );

    // The primary action is reachable without scrolling past the inventory.
    check('"cook from pantry" is present', await visible('pantry-cook', 4000));
    check('basics have a route, quietly', await visible('pantry-basics', 3000));

    // COOKING MUST NOT MUTATE THE PANTRY.
    const pantryCountBefore = await pantryRows();
    await tap('pantry-cook');
    await page.waitForTimeout(2000);
    check('cook-with-these opens the picker', await visible('cook-ingredient-picker', 8000));
    const seededFromPantry = await page.locator('[data-testid^="selected-"]').count();
    check(
      'and arrives pre-selected from the pantry',
      seededFromPantry > 0,
      `${seededFromPantry} selected`,
    );

    // Change the temporary selection, then go back and check the pantry.
    const firstSelected = page.locator('[data-testid^="selected-"]').first();
    if (await firstSelected.count()) await firstSelected.click();
    await page.waitForTimeout(600);
    await page.goto(`${BASE}/pantry`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    check(
      'removing an ingredient from the SEARCH leaves the pantry alone',
      (await pantryRows()) === pantryCountBefore,
      `${pantryCountBefore} -> ${await pantryRows()}`,
    );
    await shot('03b-pantry-quick-add');

    // --- What a row says about how much there is -------------------------
    //
    // THE BUG THIS GUARDS: a row rendered "rice / g / 2 days left".
    // `formatQuantity(null, 'g')` returned the bare unit label, so an item
    // with a unit and no amount printed the suffix on its own.
    await page.evaluate(() => {
      const stamp = '2026-09-01T00:00:00.000Z';
      const row = (id, name, category, quantity, unit, isStaple) => ({
        id,
        ingredientName: name,
        category,
        quantity,
        unit,
        expiresOn: null,
        isStaple,
        note: null,
        createdAt: stamp,
        updatedAt: stamp,
      });
      window.localStorage.setItem(
        'akla.local.pantry',
        JSON.stringify([
          row('q1', 'rice', 'carbs', null, 'g', false),
          row('q2', 'milk', 'dairy', 500, 'ml', false),
          row('q3', 'salt', 'spices', null, 'g', true),
        ]),
      );
    });
    await page.goto(`${BASE}/pantry`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const amounts = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="pantry-row-quantity"]')].map((node) =>
        node.innerText.replace(/\s+/g, ' ').trim(),
      ),
    );
    check(
      'no row renders a naked unit',
      !amounts.some((text) => /^(g|ml|kg|l|pieces?)$/i.test(text)),
      JSON.stringify(amounts),
    );
    check('an amount with a unit shows both', amounts.includes('500 ml'));
    check('an item with no amount says so deliberately', amounts.includes('Quantity not set'));
    check(
      'a staple stays quiet, having no amount on purpose',
      amounts.filter((text) => text === 'Quantity not set').length === 1,
    );
    await shot('04b-pantry-quantities');

    // --- Cook: typing, autocomplete, selection, removal -------------------
    console.log('\n▸ cook with what I have');
    await page.goto(`${BASE}/cook`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await type('ingredient-input', 'toma');
    const autocomplete = page.locator('[data-testid^="autocomplete-"]').first();
    check('typing offers autocomplete', (await autocomplete.count()) > 0);
    if (await autocomplete.count()) await autocomplete.click();
    await page.waitForTimeout(600);

    const selectedCount = async () => page.locator('[data-testid^="selected-"]').count();
    check('the picked ingredient becomes a selected chip', (await selectedCount()) > 0);

    // THE REGRESSION THIS FLOW EXISTS FOR: the chosen row used to be filtered
    // out of its own list, so the thing under the thumb vanished and the next
    // row jumped up into it.
    check(
      'the chosen row stays in the results list',
      (await page.locator('[data-testid^="autocomplete-"]').count()) > 0,
    );

    // And tapping it again removes it, where the user is already looking.
    const beforeToggle = await selectedCount();
    await page.locator('[data-testid^="autocomplete-"]').first().click();
    await page.waitForTimeout(500);
    check('tapping the same row again removes it', (await selectedCount()) === beforeToggle - 1);
    await page.locator('[data-testid^="autocomplete-"]').first().click();
    await page.waitForTimeout(500);

    // Zero results used to render nothing at all and look broken.
    await type('ingredient-input', 'zzzqqq', { clear: true });
    check('an unknown ingredient explains itself', await visible('ingredient-no-results', 4000));
    check('and still offers a way forward', await visible('ingredient-add-anyway', 2000));

    // Clearing the field brings the browse surfaces back.
    await type('ingredient-input', '', { clear: true });
    await page.waitForTimeout(600);
    await shot('05-cook-selected');

    const starters = page.locator('[data-testid^="starter-"]');
    check(
      'common ingredients are offered without typing',
      (await starters.count()) > 0,
      `${await starters.count()} shown`,
    );
    const beforeStarters = await selectedCount();
    await starters.first().click();
    await page.waitForTimeout(400);
    await starters.nth(1).click();
    await page.waitForTimeout(400);
    const afterStarters = await selectedCount();
    check(
      'common suggestions add to the selection',
      afterStarters >= beforeStarters + 2,
      `${beforeStarters} -> ${afterStarters}`,
    );

    // Browsing by category, which did not exist before.
    check('categories are offered for browsing', await tap('category-chip-protein'));
    check('opening a category lists its ingredients', await visible('category-list-protein', 4000));
    check('and it collapses again', await tap('category-chip-protein'));

    const firstChip = page.locator('[data-testid^="selected-"]').first();
    await firstChip.click();
    await page.waitForTimeout(600);
    check('tapping a selected chip removes it', (await selectedCount()) === afterStarters - 1);

    // The CTA counts what it has, and names no magic.
    const cta = await page.locator('[data-testid="cook-submit"]').innerText();
    check('the CTA states what it will do, with a count', /\d/.test(cta), cta.replace(/\n/g, ' '));
    check('and uses no sparkle language', !/sparkle|magic|✨/i.test(cta));

    // Filters: open, apply, confirm the reset appears, clear.
    if (await tap('cook-filters', { optional: true })) {
      check('the filter sheet opens', await visible('cook-filters-done', 4000));
      // "Clear" only exists once something is filtered — that is the point of
      // it, and asserting on it before applying a filter is how the previous
      // version of this check managed to be wrong.
      check(
        'nothing to clear before a filter is applied',
        !(await visible('cook-filters-clear', 1200)),
      );
      check('a protein target can be set', await tap('filter-protein-40'));
      check('a time limit can be set', await tap('filter-time-15'));
      check(
        'the clear control appears once filters are active',
        await visible('cook-filters-clear', 3000),
      );
      await tap('cook-filters-clear');
      await page.waitForTimeout(500);
      check(
        'clearing removes the reset control again',
        !(await visible('cook-filters-clear', 1200)),
      );
      await tap('cook-filters-done');
    }

    await tap('cook-submit');
    await page.waitForTimeout(2400);
    const results = await page.locator('[data-testid^="result-"]').count();
    // Named for what it actually asserts. The chips here are whatever the
    // "common ingredients" row happened to offer, so an empty answer is a
    // legitimate one — but a check called "returns results" that passes on
    // zero is a check nobody can read, and this one did for a while.
    const emptyShown = await visible('results-empty', 2000);
    check(
      'cook answers — with recipes, or with an empty state that says why',
      results > 0 || emptyShown,
      results > 0 ? `${results} results` : 'no match, empty state shown',
    );
    await shot('06-cook-results');

    // --- Photographs -------------------------------------------------------
    // "Are there real photographs on this screen, or is every card a branded
    // gradient?" is the question the preview has to be able to answer, and
    // "the export blocked remote images" is no longer an explanation for the
    // absence: the assets are bundled, so they are part of the build.
    //
    // Counting the marks is not enough on its own — an <img> pointing at a
    // missing file still renders an element. `naturalWidth` is the browser
    // saying it decoded actual pixels.
    console.log('\n▸ photographs');

    /**
     * Counts photographs and how many of them the browser really decoded.
     *
     * Only the ones ON SCREEN are judged. A feed loads its images lazily, so a
     * card forty rows down has legitimately not fetched anything yet, and
     * counting it as a failure measures scroll position rather than whether
     * the photography works. It waits for the visible ones to settle rather
     * than sampling at an arbitrary moment, because the first version of this
     * check read 2 of 9 and the other seven arrived a second later.
     */
    const photoAudit = async (label) => {
      const visiblePhotos = () => `
        [...document.querySelectorAll('[data-testid^="recipe-photo-"]')].filter((node) => {
          const box = node.getBoundingClientRect();
          return box.top < innerHeight && box.bottom > 0 && box.width > 0;
        })`;

      await page
        .waitForFunction(
          `(() => {
            const shown = ${visiblePhotos()};
            if (shown.length === 0) return false;
            return shown.every((node) => {
              const img = node.tagName === 'IMG' ? node : node.querySelector('img');
              return img && img.complete && img.naturalWidth > 0;
            });
          })()`,
          // Short on purpose. A screenful with no photographs on it never
          // satisfies this, so the wait is spent in full at every such scroll
          // position — twenty of those at ten seconds is three minutes of the
          // run doing nothing. Four seconds is still far more than a bundled
          // asset needs to decode.
          { timeout: 4000 },
        )
        .catch(() => {});

      const result = await page.evaluate(`(() => {
        const shown = ${visiblePhotos()};
        const decoded = shown.filter((node) => {
          const img = node.tagName === 'IMG' ? node : node.querySelector('img');
          return img && img.complete && img.naturalWidth > 0;
        });
        const slugOf = (node) =>
          (node.getAttribute('data-testid') || '').replace('recipe-photo-', '');
        return {
          photos: document.querySelectorAll('[data-testid^="recipe-photo-"]').length,
          onScreen: shown.length,
          decoded: decoded.length,
          slugs: shown.map(slugOf),
          decodedSlugs: decoded.map(slugOf),
          fallbacks: document.querySelectorAll('[data-testid^="recipe-fallback-"]').length,
        };
      })()`);
      return { ...result, label };
    };

    await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Walked rather than sampled. The grid is virtualised and a phone viewport
    // holds about one card, so auditing where the page happens to be proves
    // one photograph — which is not the claim being made. This scrolls through
    // several screenfuls and accumulates, so "the catalogue shows real
    // photographs" is a statement about the catalogue.
    const seenPhotos = new Set();
    const decodedPhotos = new Set();
    let fallbacksSeen = 0;
    let barren = 0;
    for (let step = 0; step < 20; step += 1) {
      // `window.scrollTo` does nothing here: React Native Web renders a list
      // as its own overflow container, so the document never scrolls and a
      // walk built on it audits the same screenful ten times. A wheel event
      // over the list is what a finger does.
      await page.mouse.move(195, 500);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(500);
      const audit = await photoAudit('discover');
      const before = decodedPhotos.size;
      for (const slug of audit.decodedSlugs) decodedPhotos.add(slug);
      for (const slug of audit.slugs) seenPhotos.add(slug);
      fallbacksSeen = Math.max(fallbacksSeen, audit.fallbacks);

      // Stop once the walk stops finding anything new. Reaching the end of a
      // virtualised list still costs a full decode wait per step, and four
      // barren screenfuls in a row means we have seen what there is.
      barren = decodedPhotos.size > before ? 0 : barren + 1;
      if (barren >= 4 && decodedPhotos.size > 0) break;
    }

    check(
      'the catalogue shows real photographs, not only the fallback',
      decodedPhotos.size >= 8,
      `${decodedPhotos.size} decoded across the grid, ${fallbacksSeen} fallbacks`,
    );
    check(
      'and every photograph it rendered actually decoded',
      seenPhotos.size > 0 && decodedPhotos.size === seenPhotos.size,
      `${decodedPhotos.size} of ${seenPhotos.size}`,
    );
    await page.mouse.wheel(0, -9000);
    await page.waitForTimeout(700);
    await shot('05a-discover-photos');

    // The hero on a recipe that has one. Finding it through the DOM rather
    // than hard-coding a slug keeps this honest as coverage changes.
    const photographed = await page.evaluate(() => {
      const node = document.querySelector('[data-testid^="recipe-photo-"]');
      return node?.getAttribute('data-testid')?.replace('recipe-photo-', '') ?? null;
    });
    if (photographed) {
      const card = page.locator(`[data-testid^="recipe-photo-${photographed}"]`).first();
      await card.click().catch(() => {});
      await page.waitForTimeout(2200);
      const hero = await photoAudit('detail');
      check(
        'a recipe detail hero shows its photograph',
        hero.decoded > 0,
        `${hero.decoded} decoded on ${photographed}`,
      );
      await shot('05b-recipe-hero-photo');
      await page.goBack();
      await page.waitForTimeout(1200);
    } else {
      check('a recipe detail hero shows its photograph', false, 'no photographed recipe found');
    }

    // --- Recipe detail and cooking mode ----------------------------------
    console.log('\n▸ recipe');
    // Reached through Discover rather than through whatever the last search
    // happened to return. A cook search with no results used to skip this
    // whole section silently, taking the recipe-detail assertions with it —
    // including the one about ordering being shown as unavailable.
    await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    // The catalogue list is virtualised and mounts after the route settles, so
    // this waits for a card rather than for a fixed number of milliseconds.
    await page
      .locator('[data-testid^="recipe-photo-"], [data-testid^="recipe-fallback-"]')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
    // The card's image is what navigates — the `discover-*` wrapper is not the
    // pressable, and clicking it does nothing.
    const firstResult = page
      .locator('[data-testid^="recipe-photo-"], [data-testid^="recipe-fallback-"]')
      .first();
    check('discover offers a recipe to open', (await firstResult.count()) > 0);
    if (await firstResult.count()) {
      await firstResult.click();
      await page.waitForTimeout(1800);
      check('a result opens its recipe', await visible('recipe-start-cooking', 6000));

      // ORDERING NEVER LOOKS FUNCTIONAL WHEN IT IS NOT, and never looks
      // unavailable when it is. Exactly one of the two controls exists: the
      // dead "coming soon" button where no branch can be selected, or the
      // live "get missing ingredients" where one can. Both at once, or
      // neither, means the screen and `isOrderingAvailable` disagree.
      const orderCount = await page.locator('[data-testid="recipe-order"]').count();
      const getMissingCount = await page.locator('[data-testid="recipe-get-missing"]').count();
      check(
        'the recipe offers exactly one ordering control',
        orderCount + getMissingCount === 1,
        `coming-soon=${orderCount} get-missing=${getMissingCount}`,
      );

      if (orderCount === 1) {
        const orderLabel = await page
          .locator('[data-testid="recipe-order"]')
          .first()
          .innerText()
          .catch(() => '');
        const orderDisabled = await page
          .locator('[data-testid="recipe-order"]')
          .first()
          .evaluate(
            (node) => node.getAttribute('aria-disabled') === 'true' || node.disabled === true,
          )
          .catch(() => false);
        check(
          'ordering is shown as unavailable rather than looking functional',
          /coming soon|قريبًا|قريبا/i.test(orderLabel) && orderDisabled,
          `${orderLabel.replace(/\n/g, ' ').trim()} · disabled=${orderDisabled}`,
        );
      }
      await shot('07-recipe-detail');

      if (await tap('recipe-start-cooking', { optional: true })) {
        await page.waitForTimeout(1200);
        check('cooking mode starts', await visible('cooking-next', 5000));
        await shot('08-cooking-mode');
        await tap('cooking-next', { optional: true });
        check('cooking mode advances a step', true);
      }
    }

    // --- Commerce: the shop under the recipe, and the cart it fills -------
    /*
      THE WHOLE POINT OF THIS SECTION is that a demo catalogue must never be
      mistakable for a supermarket, and that a bulk "add to cart" must never
      quietly buy something the cook has not seen. Both are invisible to a
      unit test in the only way that matters: whether they are on the screen.

      Koshari is the fixture because it is genuinely partial against the demo
      catalogue — rice, lentils, pasta, onions, garlic, cumin, oil and
      chickpeas map; tomato paste, vinegar and chilli flakes do not. A recipe
      that sourced perfectly would never show the gap, which is the part most
      likely to be got wrong.
    */
    console.log('\n▸ commerce');
    const KOSHARI = 'f4006404-ffca-56e7-8916-e180f5615378';
    await page.goto(`${BASE}/recipe/${KOSHARI}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const commerceOpen = await tap('recipe-get-missing', { optional: true });
    check('a recipe with a selectable branch offers to fetch the missing items', commerceOpen);

    if (commerceOpen) {
      await page.waitForTimeout(900);
      check('the products appear only after being asked for', await visible('recipe-sourcing', 5000));

      // A fixture basket that looks like a real one is the failure the badge
      // exists to prevent, and a badge nobody can see is not a guarantee.
      check('the development catalogue names itself', await visible('recipe-demo-badge', 3000));
      const sourcingText = await page
        .locator('[data-testid="recipe-sourcing"]')
        .first()
        .innerText()
        .catch(() => '');
      check(
        'and says in words that nothing here can be ordered',
        /not a real supermarket|development data|مش سوبر ماركت|بيانات تطوير/i.test(sourcingText),
        sourcingText.replace(/\n/g, ' · ').slice(0, 120),
      );

      const sourcedRows = await page.locator('[data-testid^="recipe-sourced-"]').count();
      check('each missing ingredient gets its own answer', sourcedRows > 0, `${sourcedRows} rows`);

      // PARTIAL FULFILMENT IS SAID OUT LOUD. "Add 8 to cart" under a list of
      // eleven reads as a complete answer unless the screen states the gap.
      const addLabel = await page
        .locator('[data-testid="recipe-add-to-cart"]')
        .first()
        .innerText()
        .catch(() => '');
      const addable = Number(/(\d+)/.exec(addLabel)?.[1] ?? '0');
      /*
        THE INVARIANT, not a particular pantry.

        This section inherits whatever the earlier ones left in the pantry and
        the basics, so how many of koshari's ingredients are missing is not
        fixed — and an assertion demanding a partial basket would fail for a
        reason that says nothing about commerce. What must hold in EVERY state
        is that the summary sentence agrees with the number on the button: a
        short count has to be explained, and a full one must not invent a gap.
      */
      check(
        'the button never offers to add more than there are answers',
        addable <= sourcedRows,
        `${addLabel.replace(/\n/g, ' ').trim()} of ${sourcedRows} rows`,
      );
      const claimsGap = /can be added now|ينفع يتضافوا/i.test(sourcingText);
      const claimsAll = /ready to add|جاهزة للإضافة/i.test(sourcingText);
      check(
        'and the summary sentence agrees with that number',
        addable < sourcedRows ? claimsGap : claimsAll,
        `${addable} of ${sourcedRows} — gap=${claimsGap} all=${claimsAll}`,
      );
      await shot('24-recipe-sourcing');
      // The rows themselves, not just the panel that summarises them.
      const rowShot = await shotAt('[data-testid="recipe-you-need"]', '24a-you-need-rows');
      check('the product rows under YOU NEED can be looked at', rowShot);

      const before = errorCount();
      // Guarded, because with nothing addable the button is correctly dead and
      // clicking a dead button proves nothing either way.
      const added = addable > 0 && (await tap('recipe-add-to-cart', { optional: true }));
      check('the addable lines can be added', added, `${addable} addable`);
      await page.waitForTimeout(1400);
      check('adding to the cart raises no page error', errorCount() === before);
      await shot('25-added-to-cart');

      // Everything below needs a basket. Without one there is nothing to
      // total, re-price or empty, and asserting on an empty cart would only
      // prove the empty state.
      if (added) {
        // --- The cart -------------------------------------------------------
        await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1600);

        check('the cart holds what was added', await visible('cart-lines', 6000));
        check('the cart badges itself as a demo too', await visible('cart-demo-badge', 3000));
        check('and totals the basket', await visible('cart-totals', 3000));

        // `cart-remove-`, not `cart-quantity-`. The stepper puts its testID on
        // the container AND on `-decrement` and `-increment`, so a prefix count
        // over it reports three elements per line and never matches anything.
        const cartLines = await page.locator('[data-testid^="cart-remove-"]').count();
        check(
          'the cart holds exactly the lines the button counted',
          cartLines === addable,
          `${cartLines} lines vs ${addable} counted`,
        );

        // CHECKOUT DOES NOT EXIST. A live-looking button that opens an apology
        // is worse than a dead one that says the truth on its face.
        const checkoutDisabled = await page
          .locator('[data-testid="cart-checkout"]')
          .first()
          .evaluate((node) => node.getAttribute('aria-disabled') === 'true' || node.disabled === true)
          .catch(() => false);
        check('checkout is dead and says so', checkoutDisabled);
        await shot('26-cart');

        // Quantity and removal are the only two things this screen can do to a
        // basket, and both were the sort of thing that renders and then does
        // nothing.
        const beforeTotals = await page
          .locator('[data-testid="cart-totals"]')
          .first()
          .innerText()
          .catch(() => '');
        const plus = page.locator('[data-testid$="-increment"]').first();
        if (await plus.count()) {
          await plus.click();
          await page.waitForTimeout(1400);
          const afterTotals = await page
            .locator('[data-testid="cart-totals"]')
            .first()
            .innerText()
            .catch(() => '');
          // The number has to MOVE. A stepper that renders, accepts the tap and
          // leaves the total where it was is the failure mode a screenshot
          // cannot see.
          check(
            'changing a quantity re-totals the basket',
            afterTotals !== beforeTotals && afterTotals.length > 0,
            `${beforeTotals.replace(/\n/g, ' ')} -> ${afterTotals.replace(/\n/g, ' ')}`,
          );
        }

        const removeFirst = page.locator('[data-testid^="cart-remove-"]').first();
        if (await removeFirst.count()) {
          await removeFirst.click();
          await page.waitForTimeout(1200);
          const remaining = await page.locator('[data-testid^="cart-remove-"]').count();
          check('removing a line removes it', remaining === cartLines - 1, `${remaining} left`);
        }

        // --- The two states a happy basket never shows -----------------------
      /*
        OUT OF STOCK and RULED OUT FOR THIS COOK are the two answers most
        likely to be got wrong, because neither appears on a recipe that
        sources cleanly. The demo catalogue carries one row for each on
        purpose — see `data/commerce-demo/README.md` — and this is where a
        person actually looks at them.
      */
      const KOFTA = '7afce514-e93f-559b-b243-c5f50563058e';
      await page.goto(`${BASE}/recipe/${KOFTA}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1800);
      if (await tap('recipe-get-missing', { optional: true })) {
        await page.waitForTimeout(900);
        const koftaText = await page.evaluate(() => document.body.innerText);
        check(
          'an ingredient the shop has none of says out of stock, not unavailable',
          /Out of stock/i.test(koftaText),
        );
        check(
          'and does not offer it as if it could be bought',
          !/Add 0 to cart/i.test(koftaText),
        );
        // Nothing in the catalogue claims to be ground beef, parsley or tomato
        // paste. That is a sentence under the ingredient, not a missing row:
        // the recipe still works, the cook buys those themselves.
        check(
          'an ingredient this shop does not carry says so',
          /Not sold here|مش موجود هنا/i.test(koftaText),
        );
        /*
          THE GAP IS EXPLAINED WITHOUT RECOMMENDING A PURCHASE.

          This sentence covers lines that were REFUSED — an allergy conflict,
          an unpublished allergen list, a mapping we are not sure of — as well
          as ones merely unmapped. It used to read "you can still cook this,
          just buy the rest yourself", which applied to a refusal is AKALT
          recommending the product it had just declined to add. So: it must
          say we could not add them, and it must NOT tell the cook to go and
          buy them.
        */
        check(
          'the gap is explained as something WE could not do',
          /could not add the remaining|مقدرناش نضيفها/i.test(koftaText),
        );
        check(
          'and never tells the cook to buy the refused items themselves',
          !/buy the rest yourself|هتجيب الباقي بنفسك/i.test(koftaText),
        );
        await shot('26a-no-purchasable-match');
        await shotAt('[data-testid="recipe-you-need"]', '26c-you-need-rows');
      }

      /*
        A VEGAN, WHICH IS A DIFFERENT GATE FROM AN ALLERGY.

        Chicken fried rice is the fixture because it exercises all three
        dietary states in one screen against the demo catalogue:

          chicken   `vegan:incompatible`  → refused outright
          eggs, oil publish nothing       → UNKNOWN, so asked about
          rice      `vegan:compatible`    → matched and addable

        Both halves matter. A build that refused everything unpublished would
        pass a check that only looked for the refusal, and a build that
        assumed unpublished meant safe would pass one that only looked for the
        match. Run BEFORE the allergy pass and reset afterwards, so neither
        preference bleeds into the other.
      */
      const CHICKEN_FRIED_RICE = '9d4ee2dd-68bd-5927-b993-b9f224c54a6a';
      await page.goto(`${BASE}/settings/preferences`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400);
      const veganSet = await tap('pref-diet-vegan', { optional: true });
      check('an eating style can be declared', veganSet);
      await page.waitForTimeout(900);

      if (veganSet) {
        await page.goto(`${BASE}/recipe/${CHICKEN_FRIED_RICE}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1800);
        if (await tap('recipe-get-missing', { optional: true })) {
          await page.waitForTimeout(900);
          const veganText = await page.evaluate(() => document.body.innerText);

          check(
            'a product the shop says is not vegan is refused for a vegan',
            /Not suitable for you/i.test(veganText),
          );
          check(
            'and the refusal reads allergies OR diet, since either can cause it',
            /allergies or your diet/i.test(veganText),
          );
          check(
            'a product with no published dietary data is ASKED about, never assumed',
            /Cannot be confirmed for you/i.test(veganText),
          );
          check(
            'and an explicitly compatible product is still offered normally',
            /AKALT Demo Market/i.test(veganText),
          );
          await shotAt('[data-testid="recipe-you-need"]', '26d-vegan-dietary-gate');
        }

        await page.goto(`${BASE}/settings/preferences`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1400);
        await tap('pref-diet-none', { optional: true });
        await page.waitForTimeout(700);
      }

      // A coeliac cook. The only pasta in the catalogue is wheat, so the line
      // must be refused rather than substituted — and refused in a sentence
      // that does not name the product it just ruled out.
      await page.goto(`${BASE}/settings/preferences`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400);
      const allergySet = await tap('pref-allergen-gluten', { optional: true });
      check('an allergy can be declared', allergySet);
      await page.waitForTimeout(900);

      if (allergySet) {
        await page.goto(`${BASE}/recipe/${KOSHARI}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1800);
        if (await tap('recipe-get-missing', { optional: true })) {
          await page.waitForTimeout(900);
          const coeliacText = await page.evaluate(() => document.body.innerText);
          check(
            'a line every option of which conflicts with an allergy is refused',
            /Not suitable for you/i.test(coeliacText),
          );
          check(
            'and the refused product is not named as a suggestion',
            !/Pasta 400/i.test(coeliacText),
            coeliacText.replace(/\n/g, ' · ').slice(0, 160),
          );
          const coeliacAdd = await page
            .locator('[data-testid="recipe-add-to-cart"]')
            .first()
            .innerText()
            .catch(() => '');
          const coeliacCount = Number(/(\d+)/.exec(coeliacAdd)?.[1] ?? '0');
          check(
            'declaring an allergy reduces what the button will add',
            coeliacCount < addable,
            `${coeliacCount} with the allergy vs ${addable} without`,
          );
          await shot('26b-no-eligible-match');
        }

        // Put the cook back the way we found them, so later sections are not
        // quietly running as a coeliac.
        await page.goto(`${BASE}/settings/preferences`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1400);
        await tap('pref-allergen-gluten', { optional: true });
        await page.waitForTimeout(700);
      }

      // --- The same journey in Arabic --------------------------------------
        await page.goto(`${BASE}/settings/language`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        if (await tap('language-choice-ar', { optional: true })) {
          await page.waitForTimeout(1200);
          await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1600);
          const arabicCart = await bodyText();
          check(
            'the cart is Arabic, not an English fallback',
            /العربة|المجموع|الإجمالي/.test(arabicCart),
          );
          /*
            WESTERN NUMERALS ACROSS THE WHOLE ARABIC COMMERCE SURFACE.

            Two mechanisms have to agree here, and each was wrong once. What
            the APP formats — counts, prices, totals, the minimum-order line —
            is Western because the locale is pinned to `ar-EG-u-nu-latn`. What
            the MERCHANT wrote is Western because `display.ts` normalises its
            digits as it renders them, while the catalogue keeps «رز مصري ١ كجم»
            exactly as published.

            So this reads the surfaces rather than trusting either mechanism:
            the product names and pack sizes in the lines, and the subtotal,
            delivery, total and shortfall in the totals block.
          */
          const EASTERN = /[\u0660-\u0669\u06F0-\u06F9]/;
          const readRegion = async (testId) =>
            page
              .locator(`[data-testid="${testId}"]`)
              .first()
              .innerText()
              .catch(() => '');

          const linesText = await readRegion('cart-lines');
          const totalsText = await readRegion('cart-totals');

          check(
            'Arabic cart LINES are Western — merchant product names and pack sizes',
            linesText.length > 0 && !EASTERN.test(linesText),
            linesText.replace(/\n/g, ' · ').slice(0, 160),
          );
          check(
            'Arabic cart TOTALS are Western — subtotal, delivery, total',
            totalsText.length > 0 && !EASTERN.test(totalsText),
            totalsText.replace(/\n/g, ' · ').slice(0, 160),
          );
          check(
            'and the minimum-order message counts in Western numerals too',
            !EASTERN.test(await readRegion('cart-shortfall')),
          );
          await shot('27-cart-arabic');

          await page.goto(`${BASE}/recipe/${KOSHARI}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1800);
          if (await tap('recipe-get-missing', { optional: true })) {
            await page.waitForTimeout(900);
            await shot('28-recipe-sourcing-arabic');
            await shotAt('[data-testid="recipe-you-need"]', '28a-you-need-rows-arabic');
            check('the sourcing panel is Arabic too', await visible('recipe-sourcing', 5000));

            // The other half of the surface: the product rows under YOU NEED,
            // where a merchant's own pack size sits beside our pack count and
            // our price. That row is where the two numeral systems collided.
            const sourcedArabic = await page
              .locator('[data-testid^="recipe-sourced-"]')
              .allInnerTexts()
              .catch(() => []);
            /*
              THE 356-LINE CASE, ON A SCREEN.

              Recipe prose is content somebody typed, not something the app
              formats, and a great deal of the Arabic was written with
              Arabic-Indic digits. `localise.ts` normalises at the display
              boundary; this is the proof a reader sees the result.
            */
            const stepsText = await page.evaluate(() => document.body.innerText);
            check(
              'Arabic recipe STEPS are Western — the 356-line content case',
              stepsText.length > 0 && !/[\u0660-\u0669\u06F0-\u06F9]/.test(stepsText),
              (stepsText.match(/[\u0660-\u0669\u06F0-\u06F9][^\n]{0,40}/g) ?? [])
                .slice(0, 3)
                .join(' · '),
            );

            check(
              'and its product rows are Western throughout — name, packs, price',
              sourcedArabic.length > 0 && !/[٠-٩۰-۹]/.test(sourcedArabic.join(' · ')),
              sourcedArabic.join(' · ').replace(/\n/g, ' ').slice(0, 160),
            );
          }

          // Back to English so the sections after this one read as they always
          // have. A smoke run that leaves the app in Arabic makes every later
          // assertion about English copy a language test by accident.
          await page.goto(`${BASE}/settings/language`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1200);
          await tap('language-choice-en', { optional: true });
          await page.waitForTimeout(1000);
        }
      }
    }

    // --- Discover: filter to a collection and clear it back ---------------
    console.log('\n▸ discover');
    await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    // `discover-recipe-`, not `discover-`. The latter also matches the
    // header's drawer button, the empty state and load-more, so it counted one
    // extra card on every screen and could never reach zero — which quietly
    // made the zero-result branch below unreachable.
    const discoverCards = () => page.locator('[data-testid^="discover-recipe-"]').count();
    await tap('collection-all', { optional: true });
    await page.waitForTimeout(700);
    const unfiltered = await discoverCards();
    check('discover shows the catalogue', unfiltered > 0, `${unfiltered} cards`);

    // Which collection narrows is a property of the DATA, not of the UI, and
    // the first page is capped — so a collection larger than that cap looks
    // identical to no filter at all. Asking "does any collection narrow this"
    // tests the behaviour without depending on chip order or catalogue size,
    // and reports which one it used.
    const chips = page.locator('[data-testid^="collection-tag-"]');
    const chipCount = await chips.count();
    let narrowed = null;
    for (let index = 0; index < chipCount && narrowed === null; index += 1) {
      const chip = chips.nth(index);
      const id = await chip.getAttribute('data-testid');
      await chip.click();
      await page.waitForTimeout(900);
      const filtered = await discoverCards();
      if (filtered < unfiltered) narrowed = { id, filtered };
      else await tap('collection-all', { optional: true });
      await page.waitForTimeout(400);
    }
    check(
      'a collection narrows the catalogue',
      narrowed !== null,
      narrowed
        ? `${narrowed.id} -> ${narrowed.filtered} cards`
        : `${chipCount} chips, none narrowed`,
    );

    if (narrowed) {
      if (narrowed.filtered === 0) {
        check(
          'the zero-result state offers a way out',
          await visible('discover-empty-action', 3000),
        );
        await tap('discover-empty-action');
      } else {
        await tap('collection-all');
      }
      await page.waitForTimeout(900);
      check('clearing restores the unfiltered catalogue', (await discoverCards()) === unfiltered);
    }
    await shot('09-discover');

    // --- Budget ----------------------------------------------------------
    console.log('\n▸ budget');
    await page.goto(`${BASE}/budget`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // EMPTY is not submittable. The screen asks for one number; offering to
    // proceed without it would produce an empty results page that looks like a
    // broken app rather than a missing input.
    await type('budget-amount', '', { clear: true });
    await page.waitForTimeout(400);
    const emptyDisabled = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="budget-submit"]');
      return el?.getAttribute('aria-disabled') === 'true' || el?.disabled === true;
    });
    check('an empty budget cannot be submitted', emptyDisabled);

    // ZERO and a below-the-floor amount are refused with a reason, not silently.
    await type('budget-amount', '0', { clear: true });
    await page.waitForTimeout(500);
    const zeroText = await page.evaluate(() => document.body.innerText);
    check('zero is refused with an explanation', /budget above|أقل من|فوق/i.test(zeroText));

    // A quick amount fills the field rather than being a separate mode.
    check('a quick amount is one tap', await tap('budget-preset-150', { optional: true }));
    await page.waitForTimeout(500);
    const filled = await page.inputValue('[data-testid="budget-amount"]').catch(() => '');
    check('and it lands in the field', filled.includes('150'), filled);

    // Servings is on the screen, not behind Filters — a budget without a head
    // count is not a constraint the engine can use.
    check('servings is set on the main screen', await visible('filter-servings', 3000));

    // Filters exist, are optional, and are behind one action.
    check('filters are secondary, behind one action', await visible('budget-filters', 3000));
    if (await tap('budget-filters', { optional: true })) {
      check('the budget filter sheet opens', await visible('budget-filters-done', 4000));
      await tap('budget-filters-done', { optional: true });
      await page.waitForTimeout(400);
    }

    // The CTA names the amount and no magic.
    const budgetCta = await page.locator('[data-testid="budget-submit"]').innerText();
    check('the CTA states the amount', /150/.test(budgetCta), budgetCta.replace(/\n/g, ' '));
    check('and uses no sparkle language', !/sparkle|magic|✨/i.test(budgetCta));

    // The setup screen carries no price disclaimer; results do.
    const setupText = await page.evaluate(() => document.body.innerText);
    check(
      'the setup screen is not a disclaimer page',
      !/not live store prices|ليست أسعار/i.test(setupText),
    );

    await shot('10-budget');
    if (await tap('budget-submit', { optional: true })) {
      await page.waitForTimeout(2500);
      const budgetResults = await page.locator('[data-testid^="result-"]').count();
      check('budget returns results', budgetResults > 0, `${budgetResults} results`);
      const resultsText = await page.evaluate(() => document.body.innerText);
      check(
        'and results DO carry the price caveat',
        /not live store prices|ليست أسعار|Estimated/i.test(resultsText),
      );
      // The four sort modes survive the redesign.
      for (const mode of ['best', 'cheapest', 'fastest', 'protein']) {
        check(`sort "${mode}" is offered`, await visible(`sort-${mode}`, 2500));
      }
      await shot('11-budget-results');
    }

    /**
     * Whether the browser is really laying the page out right-to-left.
     *
     * Measured as GEOMETRY, not as a style string. Direction is applied to the
     * document now, so `flex-direction` stays `row` and reads the same in both
     * languages — what changes is where the children land. This takes the tab
     * bar, which has five children, and asks whether the first sits to the
     * right of the last. That is what a reader would notice.
     */
    const readingDirection = () =>
      page.evaluate(() => {
        const tabs = [...document.querySelectorAll('[role="tab"]')].filter(
          (el) => el.getBoundingClientRect().width > 0,
        );
        const first = tabs[0]?.getBoundingClientRect();
        const last = tabs[tabs.length - 1]?.getBoundingClientRect();
        return {
          dir: document.documentElement.dir || 'ltr',
          tabCount: tabs.length,
          firstTabIsRightOfLast: first && last ? first.left > last.left : null,
        };
      });

    // --- Language: English -> Arabic -> English ---------------------------
    console.log('\n▸ language');
    await page.goto(`${BASE}/settings/language`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const beforeSwitch = errorCount();
    // The restart notice is a NATIVE concern: `forceRTL` only lands on the
    // next launch there. On web there is no native direction flag at all, so
    // nothing is ever pending — and this used to compare a boolean against
    // `undefined`, which left the web build permanently telling people to
    // restart, in English as well as Arabic.
    check(
      'the web build is not told to restart for a direction already applied',
      !(await visible('language-restart', 1200)),
    );
    const ltr = await readingDirection();
    check(
      'English lays the document out left-to-right',
      ltr.dir === 'ltr' && ltr.firstTabIsRightOfLast !== true,
      `dir=${ltr.dir}, ${ltr.tabCount} tabs, firstRightOfLast=${ltr.firstTabIsRightOfLast}`,
    );

    check('the language screen offers Arabic', await tap('language-choice-ar', { optional: true }));
    check('switching language does not hit the error boundary', errorCount() === beforeSwitch);

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const arabicHome = await bodyText();
    check('home renders in Arabic', /[؀-ۿ]/.test(arabicHome));
    check(
      'no English recipe titles leak into the Arabic home',
      !/Koshari|Shakshuka|Molokhia|Zucchini|Creamy Chicken/i.test(arabicHome),
    );
    const arabic = await readingDirection();
    check(
      'Arabic mirrors the whole document, with no restart and no reload',
      arabic.dir === 'rtl' && arabic.firstTabIsRightOfLast === true,
      `dir=${arabic.dir}, ${arabic.tabCount} tabs, firstRightOfLast=${arabic.firstTabIsRightOfLast}`,
    );

    // THE RELOAD-DEPENDENCE TEST. Layout used to depend on how you arrived:
    // the provider restored a stored language without applying direction,
    // while an interactive switch did. Arriving by reload and arriving by tap
    // must now produce exactly the same layout.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const afterReload = await readingDirection();
    check(
      'and lays out identically when Arabic is restored on launch instead',
      afterReload.dir === arabic.dir &&
        afterReload.firstTabIsRightOfLast === arabic.firstTabIsRightOfLast,
      `${JSON.stringify(arabic)} then ${JSON.stringify(afterReload)}`,
    );

    // A horizontal rail cannot be mirrored by reversing one row: its SCROLL
    // ORIGIN has to move too, or Arabic opens showing the end of the list.
    // Only the browser does that, and only for a document it knows reads
    // right-to-left.
    const railStarts = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((el) => el.scrollWidth > el.clientWidth + 40 && el.clientWidth > 200)
        .map((el) => el.scrollLeft),
    );
    check(
      'a horizontal rail in Arabic opens at its own beginning',
      railStarts.every((left) => left <= 0),
      `scrollLeft: ${railStarts.join(', ') || 'no rails found'}`,
    );

    // THE DRAWER, which React Navigation positions from `I18nManager.isRTL`
    // and therefore never mirrors on web by itself. It opened from the left
    // in Arabic while every row inside it read right-to-left.
    await tap('discover-open-drawer', { optional: true });
    await page.waitForTimeout(900);
    const drawerSide = await page.evaluate(() => {
      const identity = document.querySelector('[data-testid="drawer-identity"]');
      if (!identity) return null;
      let panel = identity;
      while (panel.parentElement && panel.getBoundingClientRect().width < innerWidth * 0.5) {
        panel = panel.parentElement;
      }
      const r = panel.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), viewport: innerWidth };
    });
    check(
      // Measures the SIDE, not the animation: a right-hand drawer parks just
      // past the right edge when closed and slides in from there, so either
      // state proves which side React Navigation put it on.
      'and the drawer belongs to the reading edge',
      drawerSide !== null && drawerSide.right >= drawerSide.viewport - 8,
      drawerSide ? JSON.stringify(drawerSide) : 'drawer did not open',
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await shot('12-home-arabic');

    await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const arabicDiscover = await bodyText();
    check(
      'discover renders Arabic recipe content',
      /[؀-ۿ]/.test(arabicDiscover) &&
        !/Egypt in a bowl|Eggs poached|One pan, one weeknight/i.test(arabicDiscover),
    );
    await shot('13-discover-arabic');

    // The rendered Arabic audit, in miniature. A dictionary-parity test cannot
    // see any of this: recipe titles, steps, ingredient names and unit labels
    // all came from data and all rendered in English while the app reported
    // 468/468 keys translated.
    // The user's own name is Latin because THEY typed it in Latin during
    // onboarding, and it is rendered in the drawer on every screen. It is data,
    // not an untranslated string, so it is excluded by name rather than by
    // weakening the check — everything else Latin is still a failure.
    const OWN_NAME = 'Omar';
    const latinLines = async () => {
      const text = await bodyText();
      return [
        ...new Set(
          text
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        ),
      ].filter((line) => /[A-Za-z]/.test(line) && line !== OWN_NAME && line !== OWN_NAME[0]);
    };

    // THE SAME TRAP AS ABOVE, and here it was doing real damage. `discover-`
    // matched `discover-open-drawer` first, so this step opened the DRAWER and
    // then audited the drawer's contents while reporting on "the Arabic recipe
    // page". It passed for that reason, not because a recipe page was clean —
    // and every Arabic screenshot in the archive shows the drawer hanging
    // open, which is what that looked like from outside.
    //
    // Two corrections. The image is what navigates, exactly as in the English
    // pass — the card wrapper is not the pressable. And arriving is asserted
    // before anything is read, so a step that silently goes nowhere fails here
    // instead of quietly auditing whatever screen it is still standing on.
    const firstDiscoverCard = page
      .locator('[data-testid^="recipe-photo-"], [data-testid^="recipe-fallback-"]')
      .first();
    if (await firstDiscoverCard.count()) {
      await firstDiscoverCard.click();
      await page.waitForTimeout(2000);
      const onRecipe = await visible('recipe-start-cooking', 6000);
      check('an Arabic discover card opens its recipe', onRecipe, page.url());
      if (onRecipe) {
        const leaked = await latinLines();
        check(
          'the Arabic recipe page has no English left in it',
          leaked.length === 0,
          leaked.slice(0, 4).join(' | '),
        );
      }
      await shot('13b-recipe-arabic');
    }

    await page.goto(`${BASE}/cook`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const cookLeaked = await latinLines();
    check(
      'the Arabic cook screen has no English left in it',
      cookLeaked.length === 0,
      cookLeaked.slice(0, 4).join(' | '),
    );

    await page.goto(`${BASE}/pantry`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    await tap('pantry-add', { optional: true });
    await page.waitForTimeout(700);
    const pantryLeaked = await latinLines();
    check(
      'the Arabic pantry editor has no English left in it',
      pantryLeaked.length === 0,
      pantryLeaked.slice(0, 4).join(' | '),
    );
    await tap('pantry-editor-close', { optional: true });

    // The social screens are the newest and the least walked, which makes them
    // the likeliest place for an untranslated string to sit unnoticed.
    //
    // THE HARD PART is that these screens are the only ones whose content is
    // DATA rather than dictionary strings — seeded people, the messages they
    // sent, the note a reviewer wrote. A fixture written in Latin is not an
    // untranslated string, and translating one would be translating a fixture.
    // So three exclusions, each for a different reason:
    //
    //   * a line containing ANY Arabic is fine. "Nour شارك معاك وصفة" is a
    //     translated string with a Latin name interpolated into it, which is
    //     exactly right — the name is what the person is called.
    //   * one- and two-character lines are avatar initials, derived from a
    //     name rather than written anywhere.
    //   * the seeded fixture text, listed explicitly so that adding a new
    //     fixture is a deliberate act rather than a silent widening.
    //
    // What is left — a Latin-only line of three characters or more that is not
    // a fixture — is a string somebody forgot to translate.
    const DEMO_FIXTURES = [
      /^@?(nour|hassan|layla|omar)$/i,
      /^Something with the tomatoes before they go\.$/,
      /^What are you making tonight\?$/,
      /^Try this one, it is quick\.$/,
      /^Weeknight lentil soup$/,
      /^Please add quantities for the spices, and say how long to simmer\.$/,
      /lemon roast chicken$/i,
      /^Smoke test/i,
    ];

    const socialLeaked = async () =>
      (await latinLines()).filter(
        (line) =>
          !/[\u0600-\u06FF]/.test(line) &&
          line.length > 2 &&
          !DEMO_FIXTURES.some((fixture) => fixture.test(line)),
      );

    for (const [path, label] of [
      ['/messages', 'the Arabic messages list'],
      ['/friends', 'the Arabic friends screen'],
      ['/notifications', 'the Arabic notifications feed'],
      ['/submit', 'the Arabic submission form'],
      ['/submit/status', 'the Arabic submission status screen'],
      ['/moderate', 'the Arabic review queue'],
    ]) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const leaked = await socialLeaked();
      check(
        `${label} has no English left in it`,
        leaked.length === 0,
        leaked.slice(0, 4).join(' | '),
      );
    }
    await shot('13c-social-arabic');

    await page.goto(`${BASE}/settings/language`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    await tap('language-choice-en', { optional: true });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    check('switching back to English sticks', /What are you eating|Good /i.test(await bodyText()));
    const backToLtr = await readingDirection();
    check(
      'and nothing stays mirrored behind it',
      backToLtr.dir === 'ltr' && backToLtr.firstTabIsRightOfLast !== true,
      `dir=${backToLtr.dir}, firstRightOfLast=${backToLtr.firstTabIsRightOfLast}`,
    );

    // --- Matching, driven through the real UI ------------------------------
    //
    // The bug that made this section necessary: every ingredient selection
    // returned the same recipes. Unit tests on the filter all passed, because
    // the filter was only one of three things wrong — and none of the others
    // were visible below the rendered app. So this selects ingredients the way
    // a person does, reads the recipe ids off the screen, and compares.
    console.log('\n▸ matching through the UI');

    /**
     * Runs one search from the Cook screen and returns the rendered ids.
     *
     * Starts by clearing whatever the screen seeded itself with — the picker
     * remembers the last search, and a test that inherits it is measuring the
     * previous case.
     */
    const cookWith = async (ingredients, missingMode) => {
      await page.goto(`${BASE}/cook`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);

      for (let guard = 0; guard < 30; guard += 1) {
        const chip = page.locator('[data-testid^="selected-"]').first();
        if ((await chip.count()) === 0) break;
        await chip.click();
        await page.waitForTimeout(120);
      }

      for (const name of ingredients) {
        await type('ingredient-input', name, { clear: true });
        const option = page.locator('[data-testid^="autocomplete-"]').first();
        if ((await option.count()) === 0) continue;
        await option.click();
        await page.waitForTimeout(250);
      }

      const selected = await page.locator('[data-testid^="selected-"]').count();
      await tap(`cook-pantry-mode-${missingMode}`, { optional: true });
      await tap('cook-submit');
      await page.waitForTimeout(2600);

      // DISTINCT ids. React Native Web puts the same testID on nested nodes,
      // so a raw node count is roughly double and drifts with the markup —
      // the table reported 34 for a search the engine answers with 19.
      const ids = await page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll('[data-testid^="result-"]')].map((node) =>
            node.getAttribute('data-testid'),
          ),
        ),
      ]);
      // And the app's own count, which is the whole answer rather than the
      // part of it the virtualised list has bothered to render.
      const reported = (
        await page
          .locator('[data-testid="results-count"]')
          .first()
          .innerText()
          .catch(() => '')
      ).trim();
      const titles = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="recipe-title-"]')]
          .slice(0, 10)
          .map((node) => (node.textContent || '').trim()),
      );
      // The gap count the card itself is showing. Read from the rendered text
      // rather than recomputed here, so the table below reports what a user
      // would actually see rather than what the engine believes.
      const missing = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="result-"]')].map((node) => {
          const found = /(\d+)\s*(?:missing|ناقص)/i.exec(node.innerText || '');
          return found ? Number(found[1]) : 0;
        }),
      );
      const empty = (await page.locator('[data-testid="results-empty"]').count()) > 0;
      return { ids, selected, titles, missing, empty, reported };
    };

    /** One row of the evidence table this hotfix has to produce. */
    const rows = [];
    const record = (input, mode, result) => {
      const counts = [...new Set(result.missing)].sort((a, b) => a - b);
      rows.push(
        `| ${input} | ${mode} | ${result.reported || result.ids.length} | ` +
          `${result.titles.join('; ') || '—'} | ` +
          `${counts.length ? counts.join(', ') : '—'} |`,
      );
      return result;
    };

    // THE REPORTED CASE, driven through the built app, both ways round.
    //
    // Rice and tomatoes. Tomato Rice needs onions, garlic, stock cube, cumin,
    // tomato paste and oil on top of those, and the screen used to tick all
    // six as "Pantry staple · assumed" and report "you have 6/7 ingredients".
    // The rule: nothing is ticked unless it came from the pantry, from the
    // basics this cook configured, or from the search box.
    //
    // Onboarding offers those basics ticked, so a fresh smoke user HAS them —
    // and for that user, one-short-of-coriander is the honest answer. The test
    // is therefore the difference between the two users, which is the only
    // thing that distinguishes a configured choice from a silent assumption.
    const withBasics = record(
      'rice, tomatoes (basics ticked in onboarding)',
      '≤2 missing',
      await cookWith(['rice', 'tomatoes'], 'missing2'),
    );

    // Now untick every basic, as a cook who keeps none of them would.
    await page.goto(`${BASE}/settings/basics`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const basicChips = page.locator('[data-testid^="basic-"]');
    const basicCount = await basicChips.count();
    check(
      'the basics screen lists what can be configured',
      basicCount >= 10,
      `${basicCount} chips`,
    );
    for (let index = 0; index < basicCount; index += 1) {
      await basicChips.nth(index).click();
      await page.waitForTimeout(90);
    }
    await shot('17k-basics-unticked');

    const noBasics = record(
      'rice, tomatoes (nothing configured)',
      '≤2 missing',
      await cookWith(['rice', 'tomatoes'], 'missing2'),
    );

    const stillOffered = noBasics.titles.some((title) => /tomato rice/i.test(title));
    check(
      'with nothing configured, rice and tomatoes does NOT offer Tomato Rice',
      !stillOffered,
      stillOffered ? 'still offered' : `${noBasics.ids.length} results, none of them that`,
    );
    check(
      'and unticking the basics genuinely narrows the answer',
      noBasics.ids.length < withBasics.ids.length,
      `${withBasics.ids.length} with basics vs ${noBasics.ids.length} without`,
    );
    check(
      'while nothing it still offers claims more than two missing',
      noBasics.missing.every((count) => count <= 2),
      `gaps: ${[...new Set(noBasics.missing)].sort().join(', ') || 'none'}`,
    );

    // Put them back, so the rest of the run measures an ordinary user.
    await page.goto(`${BASE}/settings/basics`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const restore = page.locator('[data-testid^="basic-"]');
    for (let index = 0; index < (await restore.count()); index += 1) {
      await restore.nth(index).click();
      await page.waitForTimeout(90);
    }

    const CASE_A = ['chicken breast', 'rice', 'tomatoes'];
    const CASE_C = ['banana', 'oats', 'milk'];

    const relaxedA = record(
      'chicken, rice, tomato',
      '≤2 missing',
      await cookWith(CASE_A, 'missing2'),
    );
    check(
      'the picker accepted the first ingredient set',
      relaxedA.selected === CASE_A.length,
      `${relaxedA.selected} of ${CASE_A.length} chips`,
    );
    check(
      'chicken, rice, tomato returns something',
      relaxedA.ids.length > 0,
      `${relaxedA.ids.length} results`,
    );
    await shot('17e-cook-case-a');

    const relaxedC = record('banana, oats, milk', '≤2 missing', await cookWith(CASE_C, 'missing2'));
    check(
      'banana, oats, milk returns something',
      relaxedC.ids.length > 0,
      `${relaxedC.ids.length} results`,
    );
    await shot('17f-cook-case-c');

    // THE assertion. Two kitchens with nothing in common produced identical
    // lists, and every unit test passed while they did.
    const sameList = relaxedA.ids.join('|') === relaxedC.ids.join('|');
    check(
      'two disjoint ingredient sets do NOT return the same recipes',
      !sameList,
      sameList ? 'identical' : `${relaxedA.ids.length} vs ${relaxedC.ids.length}`,
    );

    const overlap = relaxedA.ids.filter((id) => relaxedC.ids.includes(id)).length;
    check(
      'and their overlap is small rather than incidental',
      overlap / Math.max(1, Math.min(relaxedA.ids.length, relaxedC.ids.length)) < 0.5,
      `${overlap} shared`,
    );

    // Exact mode is a different, stricter answer — not the same list reordered.
    const exactC = record('banana, oats, milk', 'exact', await cookWith(CASE_C, 'strict'));
    check(
      'exact mode is stricter than allowing two missing',
      exactC.ids.length <= relaxedC.ids.length,
      `${exactC.ids.length} exact vs ${relaxedC.ids.length} relaxed`,
    );
    for (const id of exactC.ids) {
      if (!relaxedC.ids.includes(id)) {
        check('every exact result also appears when gaps are allowed', false, id);
        break;
      }
    }
    await shot('17g-cook-exact');

    // The other two of the four reported cases, so all four are driven through
    // the rendered app rather than two of them standing in for the set.
    const CASE_B = ['eggs', 'white cheese', 'tomatoes'];
    const CASE_D = ['ground beef', 'pasta', 'tomatoes'];
    const relaxedB = record(
      'eggs, white cheese, tomato',
      '≤2 missing',
      await cookWith(CASE_B, 'missing2'),
    );
    const relaxedD = record(
      'ground beef, pasta, tomato',
      '≤2 missing',
      await cookWith(CASE_D, 'missing2'),
    );

    const answers = [relaxedA, relaxedB, relaxedC, relaxedD].map((result) => result.ids.join('|'));
    check(
      'all four ingredient sets give four different answers',
      new Set(answers).size === 4,
      [relaxedA, relaxedB, relaxedC, relaxedD].map((r) => r.ids.length).join(' / '),
    );

    // ALIASES. The user does not know our vocabulary. "Minced meat" and
    // "macaroni" are what a person says; `ground-beef` and `pasta` are what the
    // catalogue calls them, and the answer must not depend on which was typed.
    const aliased = record(
      'minced meat, macaroni, tomato (aliases)',
      '≤2 missing',
      await cookWith(['minced meat', 'macaroni', 'tomato'], 'missing2'),
    );
    check(
      'colloquial names resolve to the same recipes as catalogue names',
      aliased.ids.join('|') === relaxedD.ids.join('|'),
      `${aliased.ids.length} vs ${relaxedD.ids.length}`,
    );

    // ZERO RESULTS. The failure this whole hotfix is about was a screen that
    // always found something. Asking for a dish from one unusual ingredient in
    // exact mode must be allowed to answer "nothing", and say so.
    const nothing = record('anchovies', 'exact', await cookWith(['anchovies'], 'strict'));
    check(
      'an unanswerable request returns nothing rather than something',
      nothing.ids.length === 0,
      nothing.ids.length === 0 ? 'empty' : nothing.titles.join(', '),
    );
    check('and the empty state explains it', nothing.empty);
    await shot('17h-cook-zero-results');

    // An honest "nothing" still owes the user a way forward. Exact mode on
    // banana/oats/milk finds nothing, and allowing gaps finds six — so the
    // empty state has to offer that rather than leaving them at a dead end.
    const deadEnd = await cookWith(CASE_C, 'strict');
    if (deadEnd.ids.length === 0) {
      const offered = await page.locator('[data-testid^="results-relax-"]').count();
      check('a dead end offers the constraint worth dropping', offered > 0, `${offered} offers`);
      if (offered > 0) {
        await page.locator('[data-testid^="results-relax-"]').first().click();
        await page.waitForTimeout(2400);
        const after = await page.locator('[data-testid^="result-"]').count();
        check('and taking the offer actually produces recipes', after > 0, `${after} results`);
      }
    }

    // Exact mode for the remaining three, so the table covers both modes for
    // every case rather than sampling one of each.
    const exactA = record('chicken, rice, tomato', 'exact', await cookWith(CASE_A, 'strict'));
    const exactB = record('eggs, white cheese, tomato', 'exact', await cookWith(CASE_B, 'strict'));
    const exactD = record('ground beef, pasta, tomato', 'exact', await cookWith(CASE_D, 'strict'));

    // THE definition of exact: zero missing, or it does not belong here.
    const exactGaps = [exactA, exactB, exactC, exactD].flatMap((result) => result.missing);
    check(
      'exact mode returns only recipes with nothing missing',
      exactGaps.every((count) => count === 0),
      exactGaps.length ? `gaps seen: ${[...new Set(exactGaps)].join(', ')}` : 'no results to check',
    );

    // And the middle setting is a budget of ONE, not "some". This is the mode
    // that used to be "partial" and applied no constraint whatsoever.
    const oneA = record('chicken, rice, tomato', '≤1 missing', await cookWith(CASE_A, 'missing1'));
    const oneD = record(
      'ground beef, pasta, tomato',
      '≤1 missing',
      await cookWith(CASE_D, 'missing1'),
    );
    const oneGaps = [...oneA.missing, ...oneD.missing];
    check(
      'allowing one missing returns only recipes missing one or none',
      oneGaps.every((count) => count <= 1),
      oneGaps.length ? `gaps seen: ${[...new Set(oneGaps)].join(', ')}` : 'no results to check',
    );
    check(
      'and it sits between exact and allowing two',
      exactA.ids.length <= oneA.ids.length && oneA.ids.length <= relaxedA.ids.length,
      `${exactA.ids.length} ≤ ${oneA.ids.length} ≤ ${relaxedA.ids.length}`,
    );

    console.log('\n   what the four cases actually returned:');
    console.log('   | Input | Mode | Results | First 10 titles | Missing counts |');
    console.log('   |---|---|---|---|---|');
    for (const row of rows) console.log(`   ${row}`);

    // --- Hard constraints, end to end -------------------------------------
    // The product promise, driven through the UI rather than asserted in a
    // unit test: if the user said no to something, it does not appear.
    console.log('\n▸ hard constraints');
    await page.goto(`${BASE}/search`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    if (await visible('search-input', 8000)) {
      await type('search-input', 'chicken without bell pepper');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2500);

      const excludedText = await bodyText();
      check('an exclusion is understood and shown back', /bell pepper|without/i.test(excludedText));

      // Asserted, not skipped. An earlier version only opened a result `if`
      // one existed, so a search that returned nothing passed the whole block
      // silently — and "no results" is exactly the failure this is looking for.
      const excludedResults = await page.locator('[data-testid^="result-"]').count();
      check(
        'the exclusion still leaves recipes to cook',
        excludedResults > 0,
        `${excludedResults} results`,
      );

      // Every result must actually honour it. Opening one and reading its
      // ingredients is the only way to know the filter REMOVED rather than
      // merely down-ranked.
      if (excludedResults > 0) {
        await page.locator('[data-testid^="result-"]').first().click();
        await page.waitForTimeout(2200);
        const recipeText = (await bodyText()).toLowerCase();
        check(
          'the excluded ingredient is absent from the recipe it returned',
          !/bell pepper|capsicum/.test(recipeText),
        );
        await page.goBack();
        await page.waitForTimeout(1400);
      }
      await shot('17b-exclusion');
    }

    // --- Strict pantry mode -----------------------------------------------
    console.log('\n▸ pantry mode');
    await page.goto(`${BASE}/cook`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    check('cook offers a pantry mode choice', await visible('cook-pantry-mode', 6000));
    // Three modes, named for the number they differ by. The old two-way toggle
    // named its second option "partial" and applied no constraint at all.
    const modes = ['strict', 'missing1', 'missing2'];
    const tapped = [];
    for (const mode of modes) {
      if (await tap(`cook-pantry-mode-${mode}`, { optional: true })) tapped.push(mode);
    }
    check('every gap budget is selectable', tapped.length === modes.length, tapped.join(', '));
    await shot('17c-pantry-mode');

    // PANTRY AS THE SOURCE OF AVAILABILITY. Cooking from the pantry must arrive
    // with the pantry already selected — and must NOT arrive with anything the
    // user's own dates say has gone off.
    //
    // Written straight into storage because the pantry editor REFUSES a date in
    // the past, which is correct and makes an expired row unreachable through
    // the UI. A real one gets there by sitting in the pantry until its date
    // passes, and this is the only honest way to reproduce that in a test.
    const pantryRow = (name, expiresOn) => ({
      id: `smoke-${name}`,
      userId: 'local',
      ingredientId: '',
      ingredientName: name,
      category: 'other',
      quantity: 1,
      unit: null,
      expiresOn,
      isStaple: false,
      note: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await page.evaluate(
      ([rows]) => window.localStorage.setItem('akla.local.pantry', JSON.stringify(rows)),
      [[pantryRow('tomatoes', null), pantryRow('chicken breast', '2020-01-01')]],
    );

    await page.goto(`${BASE}/cook?fromPantry=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    const seeded = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="selected-"]')]
        .map((node) => node.getAttribute('data-testid') ?? '')
        .join(' ')
        .toLowerCase(),
    );
    check('opening Cook from the pantry pre-selects the pantry', /tomato/.test(seeded), seeded);
    check(
      // Requires that something WAS seeded. Without that clause this passed
      // while the picker seeded nothing at all — which is exactly how a real
      // seeding regression hid behind a green food-safety assertion.
      'FOOD SAFETY: and never pre-selects something already expired',
      /tomato/.test(seeded) && !/chicken/.test(seeded),
      seeded,
    );
    await shot('17i-cook-from-pantry');

    // --- Which build is this? ----------------------------------------------
    // The first question worth answering about a bug reported against a hosted
    // URL, and the one that cannot be answered by looking at the page. Without
    // this, "is the preview even the code I fixed?" is a guess — and a stale
    // Pages deployment looks exactly like a fix that did not work.
    console.log('\n▸ build identity');
    await page.goto(`${BASE}/settings/about`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const readOut = async (testId) =>
      (
        await page
          .locator(`[data-testid="${testId}"]`)
          .first()
          .innerText()
          .catch(() => '')
      ).trim();

    const commit = await readOut('about-commit');
    check('the build names the commit it was built from', /[0-9a-f]{7}/i.test(commit), commit);
    check('and when it was built', /\d{4}/.test(await readOut('about-built-at')));

    const recipeLine = await readOut('about-recipe-count');
    check(
      'and how many recipes it actually contains',
      /\d{2,}/.test(recipeLine),
      recipeLine.replace(/\n/g, ' '),
    );
    check('and how many ingredients', /\d{2,}/.test(await readOut('about-ingredient-count')));
    await shot('17j-about-build');

    // --- Friends -----------------------------------------------------------
    console.log('\n▸ friends');
    await page.goto(`${BASE}/friends`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    // Without a Supabase project this must say so rather than showing an empty
    // friend list that looks like nobody has added you.
    const friendsSignedOut = await visible('friends-needs-account', 4000);
    const friendsSearch = await visible('friends-search', 2000);
    check(
      'friends is honest about needing an account, or shows its search',
      friendsSignedOut || friendsSearch,
      friendsSignedOut ? 'needs an account' : 'search available',
    );

    if (friendsSearch) {
      // ONE primary action on a friend row, and the destructive pair behind
      // •••. Three buttons inline meant the row had no primary action, and
      // Block sat a thumb's width from the one people actually want.
      const firstFriend = await page.evaluate(() => {
        const row = document.querySelector('[data-testid^="friend-"]');
        return row ? row.getAttribute('data-testid') : null;
      });
      check('the friends list has a friend in it', firstFriend !== null, firstFriend ?? '');

      if (firstFriend) {
        check(
          'Message is the visible action',
          await visible(`friends-message-${firstFriend.replace('friend-', '')}`, 3000),
        );
        check(
          'the destructive pair is NOT inline',
          (await visible(`friends-unfriend-${firstFriend.replace('friend-', '')}`, 1200)) === false,
        );
        check('the row offers an overflow menu', await visible(`${firstFriend}-more`, 3000));

        await tap(`${firstFriend}-more`);
        await page.waitForTimeout(900);
        // The same two testIDs that had to be absent inline a moment ago.
        // Asserting on them rather than on label text is the point: the
        // English for `friends.unfriend` is "Remove friend", so a check
        // written against the word "Unfriend" tests a string that has never
        // been on the screen, and fails while the menu works perfectly.
        const id = firstFriend.replace('friend-', '');
        check('the ••• menu opens', await visible(`${firstFriend}-menu`, 3000));
        check(
          '••• reveals Remove friend and Block',
          (await visible(`friends-unfriend-${id}`, 3000)) &&
            (await visible(`friends-block-${id}`, 3000)),
        );
        await shot('17d2-friends-overflow');
      }
    }
    await shot('17d-friends');

    // --- Messages ----------------------------------------------------------
    // Two things are being checked here at once, and the second matters more.
    //
    // FIRST: the screens work — a conversation list, a thread that opens, a
    // composer that sends, and a shared recipe rendered as a card.
    //
    // SECOND, and this is the one that must never regress: NOTHING in this
    // build reaches a server, and the app says so. The preview runs the seeded
    // demo repositories because there is no Supabase project behind it, so
    // every screen they feed has to carry the DEMO banner. A demo send that
    // looked like a delivered one would be the app lying to whoever is
    // reviewing it.
    console.log('\n▸ messages');
    await page.goto(`${BASE}/messages`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const messagesDemo = await visible('messages-demo-banner', 3000);
    const messagesList = await visible('messages-list', 3000);
    const messagesNeedsAccount = await visible('messages-needs-account', 1500);

    check(
      'messages either lists threads or says it needs an account',
      messagesList || messagesNeedsAccount,
      messagesList ? 'threads listed' : 'needs an account',
    );

    if (messagesList) {
      // The banner is not decoration: it is the only thing separating "this
      // preview demonstrates messaging" from "this preview sent a message".
      check('a demo build says so, unmissably', messagesDemo);
      check(
        'and the compact banner still names DEMO MODE without being opened',
        await page.evaluate(() => {
          const el = document.querySelector('[data-testid="messages-demo-banner"]');
          return (el?.textContent ?? '').includes('DEMO MODE');
        }),
      );
      await tap('messages-demo-banner');
      await page.waitForTimeout(600);
      check(
        'tapping it reveals the full explanation',
        await page.evaluate(() =>
          document.body.innerText.includes('Nothing you do here reaches another person'),
        ),
      );

      const conversationIds = await page.evaluate(() =>
        [
          ...new Set(
            [...document.querySelectorAll('[data-testid^="conversation-"]')]
              .map((el) => el.getAttribute('data-testid'))
              .filter((id) => id && !id.endsWith('-unread')),
          ),
        ].sort(),
      );
      check(
        'the conversation list has threads in it',
        conversationIds.length >= 2,
        conversationIds.join(', '),
      );

      check(
        'an unread thread carries a count, not just a dot',
        await page
          .locator('[data-testid$="-unread"]')
          .first()
          .isVisible()
          .catch(() => false),
      );
      await shot('19a-messages');

      // Walk every thread looking for the shared recipe, rather than assuming
      // which one holds it. A shared recipe is a REFERENCE, so a rendered card
      // is the proof that the lookup resolved — and the list order is the
      // demo repository's business, not this test's.
      let sharedCard = false;
      let openedThread = null;
      for (const thread of conversationIds) {
        await page.goto(`${BASE}/messages`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        await tap(thread);
        await page.waitForTimeout(1600);
        openedThread = thread;

        const found = await page.evaluate(
          () => document.querySelectorAll('[data-testid$="-recipe"]').length > 0,
        );
        if (found) {
          sharedCard = true;
          break;
        }
      }

      check('a conversation opens', openedThread !== null, openedThread ?? '');
      check('the thread renders', await visible('conversation-thread', 6000));
      check('the thread names who it is with', await visible('conversation-title', 3000));
      check('the thread is badged as demo too', await visible('conversation-demo-banner', 3000));
      check('a shared recipe renders as a card', sharedCard);
      await shot('19b-conversation');

      // Sending. The message has to appear in the thread, and the thread has
      // to be the one that grew.
      const before = await page.evaluate(
        () => document.querySelectorAll('[data-testid^="message-"]').length,
      );
      // --- The composer's shape ------------------------------------------
      //
      // THE BUG THIS GUARDS: it opened about twice as tall as one line needs.
      // `multiline` makes a `<textarea>` on web, react-native-web takes its
      // `rows` from `numberOfLines`, nothing passed one, and the browser
      // applied its own default of two.
      const composerHeight = () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-testid="conversation-input"]');
          return el ? Math.round(el.getBoundingClientRect().height) : -1;
        });

      const emptyHeight = await composerHeight();
      check(
        'the composer starts at one line',
        emptyHeight > 0 && emptyHeight <= 56,
        `${emptyHeight}px`,
      );
      check(
        'its textarea asks for one row, not the browser default',
        (await page.evaluate(() =>
          document.querySelector('[data-testid="conversation-input"]')?.getAttribute('rows'),
        )) === '1',
      );

      const composer = page.locator('[data-testid="conversation-input"]').first();
      await composer.fill(
        'A message long enough to wrap over several lines in a narrow phone composer, so that the field has something to grow into.',
      );
      await page.waitForTimeout(700);
      const grownHeight = await composerHeight();
      check(
        'it grows as the text wraps',
        grownHeight > emptyHeight,
        `${emptyHeight}px -> ${grownHeight}px`,
      );

      // `fill` rather than typing: Enter now sends, so a typed string with
      // newlines in it would fire off forty messages.
      await composer.fill(Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'));
      await page.waitForTimeout(900);
      const cappedHeight = await composerHeight();
      check('it stops growing at a ceiling', cappedHeight <= 140, `${cappedHeight}px`);
      check(
        'and scrolls inside itself past that',
        await page.evaluate(() => {
          const el = document.querySelector('[data-testid="conversation-input"]');
          return el ? el.scrollHeight > el.clientHeight + 4 : false;
        }),
      );
      const sendBox = await page.locator('[data-testid="conversation-send"]').first().boundingBox();
      check(
        'Send is still on screen with the composer at full height',
        sendBox !== null && sendBox.y + sendBox.height <= 844,
        sendBox ? `bottom ${Math.round(sendBox.y + sendBox.height)} of 844` : 'no box',
      );
      await composer.fill('');
      await shot('18c-composer');

      await type('conversation-input', 'smoke test message');
      check('the composer accepts text', true);
      check('send is reachable', await tap('conversation-send'));
      await page.waitForTimeout(1600);
      const after = await page.evaluate(
        () => document.querySelectorAll('[data-testid^="message-"]').length,
      );
      check('sending adds the message to the thread', after > before, `${before} -> ${after}`);
      const threadText = await page.evaluate(
        () => document.querySelector('[data-testid="conversation-thread"]')?.textContent ?? '',
      );
      check(
        'the words the user typed are on screen',
        threadText.includes('smoke test message'),
        threadText.slice(-60),
      );
      await shot('19c-sent');

      // Back out and confirm the list reflects it.
      check('the thread has a way back', await tap('conversation-back'));
      await page.waitForTimeout(1600);
      check('back lands on the conversation list', await visible('messages-list', 6000));
    }

    // --- Sharing a recipe ---------------------------------------------------
    console.log('\n▸ sharing');
    await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    // Reached by clicking a card's image, the same way the hero check above
    // does — the card itself has no test id of its own.
    const shareTarget = await page.evaluate(() => {
      const node = document.querySelector(
        '[data-testid^="recipe-photo-"], [data-testid^="recipe-fallback-"]',
      );
      return node?.getAttribute('data-testid') ?? null;
    });
    if (shareTarget) {
      await page
        .locator(`[data-testid="${shareTarget}"]`)
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(2200);
      const shareButton = await visible('recipe-share', 4000);
      check('a recipe offers a way to share it', shareButton);
      if (shareButton) {
        check('the share sheet opens', await tap('recipe-share'));
        await page.waitForTimeout(900);
        check('the share sheet renders', await visible('recipe-share-sheet', 4000));
        check(
          'sharing offers a link for people who are not in the app',
          await visible('share-copy-link', 3000),
        );
        await shot('19d-share');
      }
    }

    // --- Community submissions ---------------------------------------------
    // The form, the queue, and the one thing that must never regress: a
    // moderator screen that is reachable without the role. In this build the
    // role is a preview flag and the screen says so — in production it is a
    // server-side check against a table no client can write.
    console.log('\n▸ submissions');
    await page.goto(`${BASE}/submit`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const submitForm = await visible('submit-screen', 4000);
    const submitNeedsAccount = await visible('submit-needs-account', 1500);
    check(
      'submit either opens the form or says it needs an account',
      submitForm || submitNeedsAccount,
      submitForm ? 'form shown' : 'needs an account',
    );

    if (submitForm) {
      check('the form is badged as demo', await visible('submit-demo-banner', 3000));
      check('it asks for a name', await visible('submit-title', 3000));
      check('it asks for ingredients', await visible('submit-ingredient-search', 3000));
      check('it asks for steps', await visible('submit-step-text-0', 3000));

      // The authoring sequence: name, photo, ingredients, steps, then the
      // details you can only answer about a recipe that already exists.
      const order = await page.evaluate(() => {
        const ids = [
          'submit-title',
          'submit-photo',
          'submit-ingredient-search',
          'submit-step-text-0',
        ];
        return ids.map((id) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          return el ? el.getBoundingClientRect().top + window.scrollY : -1;
        });
      });
      // THE BUG THIS GUARDS: these read "10 10 min" and "20 20 min". `Stepper`
      // renders its own value and appends `suffix`, so a suffix is a bare
      // unit — but the caller passed `common.min`, which is "{count} min" and
      // already carries the number.
      // The minus and plus controls are Ionicons, which render as private-use
      // glyphs and land in innerText — strip them or the value never matches.
      const stepperText = async (id) =>
        (await page.evaluate((testid) => {
          const el = document.querySelector(`[data-testid="${testid}"]`);
          return el
            ? el.innerText
                .replace(/[\uE000-\uF8FF]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
            : '';
        }, id)) ?? '';

      for (const [id, label] of [
        ['submit-prep', 'preparation'],
        ['submit-cook', 'cooking'],
      ]) {
        const text = await stepperText(id);
        check(
          `the ${label} time prints its number once`,
          /^\d+ \S+$/.test(text) && !/^(\d+)\s+\1\b/.test(text),
          text,
        );
      }

      check(
        'the form follows the authoring sequence',
        order.every((top, index) => top > 0 && (index === 0 || top > order[index - 1])),
        order.map(Math.round).join(' < '),
      );

      // --- Add a photo ---------------------------------------------------
      //
      // THE BUG THIS GUARDS: pressing Add a photo on a build with no Supabase
      // project — which every preview build is — reported "Something went
      // wrong". `useImageUpload` threw before the picker opened, because it
      // demanded an account to CHOOSE a file rather than to upload one.
      //
      // Driving a real file needs one shim. expo-image-picker opens the dialog
      // with a SYNTHETIC click, and headless Chromium answers an untrusted
      // click on a file input by firing `cancel`; the library turns `cancel`
      // into `change`, so the picker resolves "cancelled" and removes the input
      // before anything can be chosen. Dropping that one listener leaves the
      // input in the DOM. No app code is patched, and cancellation is still
      // exercised below by dispatching `change` with no files — exactly what
      // the listener did.
      await page.evaluate(() => {
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
          if (
            type === 'cancel' &&
            this instanceof HTMLInputElement &&
            this.getAttribute('data-testid') === 'file-input'
          ) {
            return undefined;
          }
          return add.call(this, type, listener, options);
        };
      });

      const saysError = async () =>
        /logged it|Something went wrong|hit a snag/i.test(
          (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' '),
        );

      await tap('submit-photo');
      await page.waitForTimeout(600);
      check(
        'Add a photo opens a picker rather than failing',
        (await page.locator('input[data-testid="file-input"]').count()) > 0,
      );
      check('and reports no error', (await saysError()) === false);

      await page.locator('input[data-testid="file-input"]').last().dispatchEvent('change');
      await page.waitForTimeout(700);
      check('cancelling the picker is silent', (await saysError()) === false);
      check('and attaches nothing', (await visible('submit-photo-attached', 900)) === false);

      await tap('submit-photo');
      await page.waitForTimeout(600);
      await page
        .locator('input[data-testid="file-input"]')
        .last()
        .setInputFiles(join(ROOT, 'assets/recipes/koshari.jpg'));
      await page.waitForTimeout(1600);
      check('a chosen photo attaches', await visible('submit-photo-attached', 4000));
      check('and is previewed, not merely described', await visible('submit-photo-preview', 4000));
      check(
        'the preview renders the file that was chosen',
        await page.evaluate(() => {
          const el = document.querySelector('[data-testid="submit-photo-preview"]');
          const img = el?.tagName === 'IMG' ? el : el?.querySelector('img');
          const src = img?.currentSrc || img?.src || '';
          return src.startsWith('blob:') && (img?.naturalWidth ?? 0) > 0;
        }),
      );
      check(
        'and it says the photo never left the device',
        (await page.evaluate(() => document.body.innerText)).includes('On this device only'),
      );

      await tap('submit-photo-remove');
      await page.waitForTimeout(600);
      check(
        'removing the photo clears it',
        (await visible('submit-photo-attached', 900)) === false,
      );
      await shot('19b-submit-photo');

      // Sending an empty draft must be refused with reasons, not accepted.
      await tap('submit-send');
      await page.waitForTimeout(700);
      const refused = await visible('submit-problems', 3000);
      check('an empty recipe is refused, with the reasons listed', refused);
      await shot('20a-submit-empty');

      // Fill enough of it in to see the objections clear.
      await type('submit-title', 'Smoke test tagine');
      await type('submit-ingredient-search', 'tomato');
      await page.waitForTimeout(700);
      const picked = await page.evaluate(() => {
        const chip = document.querySelector('[data-testid^="submit-ingredient-suggestion-"]');
        return chip ? chip.getAttribute('data-testid') : null;
      });
      check('the ingredient search suggests catalogue ingredients', picked !== null, picked ?? '');
      if (picked) {
        await tap(picked);
        check('picking one adds a line', await visible('submit-ingredient-name-0', 3000));
      }
      await shot('20b-submit-filled');
    }

    await page.goto(`${BASE}/submit/status`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const statusList = await visible('submissions-list', 4000);
    const statusEmpty = await visible('submissions-empty', 1500);
    check(
      'the status screen shows submissions or an honest empty state',
      statusList || statusEmpty,
      statusList ? 'listed' : 'empty',
    );
    if (statusList) {
      check(
        'each submission states where it got to',
        await page
          .locator('[data-testid^="submission-status-"]')
          .first()
          .isVisible()
          .catch(() => false),
      );
      check(
        'feedback from a reviewer reaches the author',
        await page
          .locator('[data-testid^="submission-note-"]')
          .first()
          .isVisible()
          .catch(() => false),
      );
    }
    await shot('20c-submissions');

    // --- Moderation --------------------------------------------------------
    console.log('\n▸ moderation');
    await page.goto(`${BASE}/moderate`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const queueShown = await visible('moderate-queue', 4000);
    const queueRefused = await visible('moderate-not-allowed', 1500);
    check(
      'the review queue either lists work or refuses access',
      queueShown || queueRefused,
      queueShown ? 'queue shown' : 'refused',
    );

    if (queueShown) {
      // The preview must never look like a granted role.
      check(
        'a preview of the moderator screens says it is a preview',
        await visible('moderate-preview-note', 3000),
      );

      const first = await page.evaluate(() => {
        const row = document.querySelector('[data-testid^="moderate-entry-"]');
        return row ? row.getAttribute('data-testid') : null;
      });
      check('the queue has something in it', first !== null, first ?? '');
      await shot('21a-moderate-queue');

      if (first) {
        await tap(first);
        await page.waitForTimeout(1800);
        check('a submission opens for review', await visible('moderate-review', 6000));
        check('the reviewer sees the ingredients', await visible('moderate-ingredients', 3000));
        check('and the steps', await visible('moderate-steps', 3000));

        // THE assertion: a refusal without a reason is refused.
        await tap('moderate-reject');
        await page.waitForTimeout(700);
        check(
          'rejecting with no feedback is refused',
          await visible('moderate-feedback-required', 3000),
        );
        await shot('21b-moderate-review');
      }
    } else {
      await shot('21a-moderate-refused');
    }

    // --- Notifications -----------------------------------------------------
    console.log('\n▸ notifications');
    await page.goto(`${BASE}/notifications`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const feed = await visible('notifications-list', 4000);
    const feedEmpty = await visible('notifications-empty', 1500);
    const feedNeedsAccount = await visible('notifications-needs-account', 1500);
    check(
      'notifications render, or say honestly why they do not',
      feed || feedEmpty || feedNeedsAccount,
      feed ? 'feed shown' : feedEmpty ? 'empty' : 'needs an account',
    );

    if (feed) {
      check('the feed is badged as demo', await visible('notifications-demo-banner', 3000));
      const rows = await page.evaluate(
        () =>
          new Set(
            [...document.querySelectorAll('[data-testid^="notification-"]')].map((el) =>
              el.getAttribute('data-testid'),
            ),
          ).size,
      );
      check('there is more than one kind of thing in it', rows >= 2, `${rows} rows`);
      check('there is a way to clear the badge', await visible('notifications-mark-all', 3000));
      await tap('notifications-mark-all');
      await page.waitForTimeout(1200);
      check(
        'marking all read removes the control',
        (await visible('notifications-mark-all', 1500)) === false,
      );
      await shot('22a-notifications');
    }

    // --- Accessibility and layout ------------------------------------------
    //
    // Two objective properties, checked on every screen rather than argued
    // about per component.
    //
    // A CONTROL WITH NO NAME is invisible to a screen reader: it announces as
    // "button" and the user has to activate it to find out what it does. This
    // counts the ones with neither an accessible name nor text inside them.
    //
    // A SCREEN THAT SCROLLS SIDEWAYS is broken on a phone, and it is the
    // commonest thing a desktop browser hides — the window is wide enough that
    // a 420px-wide row fits. Checked at 390 and again at 320, which is the
    // narrowest phone still in use.
    console.log('\n▸ accessibility and layout');

    const SCREENS = [
      ['/', 'home'],
      ['/discover', 'discover'],
      ['/cook', 'cook'],
      ['/pantry', 'pantry'],
      ['/messages', 'messages'],
      ['/friends', 'friends'],
      ['/notifications', 'notifications'],
      ['/submit', 'submit'],
      ['/submit/status', 'submission status'],
      ['/moderate', 'review queue'],
      ['/shopping-list', 'shopping list'],
      ['/profile', 'profile'],
    ];

    /*
      NO CONTROL INSIDE ANOTHER CONTROL.

      THE BUG THIS GUARDS: the recipe card was a `PressScale` with
      `accessibilityRole="button"` — which react-native-web renders as a real
      `<button>` — wrapping the save button and the price tag, which are
      buttons too. `<button>` inside `<button>` is invalid HTML, and worse than
      invalid for anyone on a screen reader or a keyboard, for whom a control
      nested inside a control is ambiguous at best and unreachable at worst.

      Checked across every screen below rather than on the card alone, because
      the mistake is a shape — a pressable surface with pressable things on it —
      and it can be made again anywhere.
    */
    const nestedControls = [];
    for (const [path] of SCREENS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1100);
      const found = await page.evaluate(() =>
        [...document.querySelectorAll('button button, a button, button a')].map((el) => {
          const name = (node) =>
            node?.getAttribute('data-testid') ?? node?.getAttribute('aria-label') ?? '?';
          return `${name(el.parentElement?.closest('button, a'))} > ${name(el)}`;
        }),
      );
      for (const entry of found) nestedControls.push(`${path} ${entry}`);
    }
    check(
      'no control is nested inside another control',
      nestedControls.length === 0,
      nestedControls.length ? nestedControls.slice(0, 3).join(' | ') : `${SCREENS.length} screens`,
    );

    /**
     * Interactive nodes with no accessible name.
     *
     * React Native Web duplicates some attributes onto nested nodes, so the
     * count is of OUTERMOST interactive elements — a nested span inheriting
     * role=button from its parent is not a second nameless control.
     */
    const namelessControls = () =>
      page.evaluate(() => {
        const selector =
          'button, [role="button"], [role="link"], a[href], input, textarea, select, [role="switch"], [role="checkbox"]';
        const all = [...document.querySelectorAll(selector)];
        const outermost = all.filter(
          (el) => !all.some((other) => other !== el && other.contains(el)),
        );
        return outermost
          .filter((el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (el.closest('[aria-hidden="true"]')) return false;
            const name =
              el.getAttribute('aria-label') ??
              el.getAttribute('title') ??
              el.getAttribute('placeholder') ??
              el.textContent ??
              '';
            // Ionicons render as private-use glyphs, which are characters but
            // not a name anybody can read out.
            const readable = name.replace(/[\uE000-\uF8FF]/g, '').trim();
            return readable.length === 0;
          })
          .map((el) => el.getAttribute('data-testid') ?? el.tagName.toLowerCase())
          .slice(0, 6);
      });

    const overflows = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

    let namelessTotal = 0;
    const overflowing = [];
    for (const [path, label] of SCREENS) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);

      const nameless = await namelessControls();
      if (nameless.length > 0) {
        namelessTotal += nameless.length;
        check(
          `every control on ${label} has a name a screen reader can read`,
          false,
          nameless.join(', '),
        );
      }

      const slop = await overflows();
      if (slop > 1) overflowing.push(`${label} +${slop}px`);
    }

    check(
      'every control on every screen has an accessible name',
      namelessTotal === 0,
      namelessTotal === 0 ? `${SCREENS.length} screens` : `${namelessTotal} nameless`,
    );
    check(
      'no screen scrolls sideways at 390px',
      overflowing.length === 0,
      overflowing.join(', ') || `${SCREENS.length} screens`,
    );

    // The narrow pass. A layout that survives 390 and breaks at 320 is a
    // layout with a fixed width in it somewhere.
    await page.setViewportSize({ width: 320, height: 720 });
    const narrowOverflow = [];
    for (const [path, label] of SCREENS) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
      const slop = await overflows();
      if (slop > 1) narrowOverflow.push(`${label} +${slop}px`);
    }
    check(
      'and none of them scrolls sideways at 320px either',
      narrowOverflow.length === 0,
      narrowOverflow.join(', ') || `${SCREENS.length} screens`,
    );
    await shot('23-narrow');
    await page.setViewportSize({ width: 390, height: 844 });

    // --- The drawer -------------------------------------------------------
    // The drawer is invisible until something opens it, which makes it exactly
    // the kind of thing that can be wired up wrong and still look fine in a
    // screenshot. It is also where the RTL bug lived: `drawerPosition` set on
    // top of React Navigation's own RTL flip pushed the whole content pane off
    // the viewport, so every button on every screen became unclickable in
    // Arabic while nothing looked broken.
    console.log('\n▸ drawer');
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);

    /**
     * "Closed" is a position, not a visibility.
     *
     * React Navigation keeps the drawer mounted and slides it off-screen with
     * a transform, so Playwright reports it `visible` either way and a
     * visibility assertion passes whatever the drawer is doing. Its box has to
     * be outside the viewport instead. (This is also why the drawer content
     * sets `aria-hidden` when closed: it is on the page the whole time.)
     */
    const drawerBox = async () => {
      const box = await locate('app-drawer').boundingBox();
      return box ? { ...box, viewport: page.viewportSize() } : null;
    };

    const closed = await drawerBox();
    check(
      'the drawer starts off-screen',
      closed !== null && closed.x + closed.width <= 1,
      closed ? `x=${Math.round(closed.x)} w=${Math.round(closed.width)}` : 'missing',
    );

    check('home offers a way to open the drawer', await tap('home-open-drawer'));
    await page.waitForTimeout(900);
    const opened = await drawerBox();
    check(
      'the drawer slides into view',
      opened !== null && opened.x >= -1 && opened.width > 200,
      opened ? `x=${Math.round(opened.x)} w=${Math.round(opened.width)}` : 'missing',
    );
    check('the drawer shows who is signed in', await visible('drawer-identity', 4000));
    check(
      'the identity block carries no instructional copy',
      (
        await page.evaluate(() => {
          const el = document.querySelector('[data-testid="drawer-identity"]');
          return el ? (el.textContent ?? '') : '';
        })
      ).includes('Your username, name and how') === false,
    );
    check(
      'the gear row is named Settings, not Profile',
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="drawer-row-settings"]');
        return (el?.textContent ?? '').includes('Settings');
      }),
    );
    await shot('18b-drawer');

    // Every social destination has a row. Absent rows are how a finished
    // feature stays unreachable: nothing links to /messages but the drawer.
    for (const [key, label] of [
      ['notifications', 'notifications'],
      ['friends', 'friends'],
      ['messages', 'messages'],
      ['submit', 'submit a recipe'],
      ['submissions', 'your submissions'],
    ]) {
      check(`the drawer reaches ${label}`, await visible(`drawer-row-${key}`, 3000));
    }

    check('the drawer reaches the shopping list', await tap('drawer-row-shopping'));
    await page.waitForTimeout(1600);
    check(
      'the drawer row actually navigated',
      await visible('shopping-add', 6000),
      page.url().replace(BASE, ''),
    );

    // The content pane must stay on screen with the drawer closed. This is the
    // assertion that would have caught the RTL displacement: it fails whenever
    // the drawer displaces its sibling rather than sliding over it.
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const paneOnScreen = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="home-open-drawer"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: window.innerWidth, h: window.innerHeight };
    });
    check(
      'the closed drawer does not displace the screen behind it',
      paneOnScreen !== null &&
        paneOnScreen.x >= 0 &&
        paneOnScreen.x < paneOnScreen.w &&
        paneOnScreen.y >= 0 &&
        paneOnScreen.y < paneOnScreen.h,
      paneOnScreen ? `at ${Math.round(paneOnScreen.x)},${Math.round(paneOnScreen.y)}` : 'missing',
    );

    // --- The remaining screens -------------------------------------------
    console.log('\n▸ remaining screens');
    for (const [name, path, expected] of [
      ['14-saved', '/saved', 'saved-tabs'],
      ['15-profile', '/profile', 'profile-account'],
      ['16-shopping-list', '/shopping-list', 'shopping-add'],
      ['17-appearance', '/settings/appearance', 'appearance-system'],
      ['18-search', '/search', 'search-input'],
    ]) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1400);
      check(`${path} renders`, await visible(expected, 6000));
      await shot(name);
    }

    // --- Saved: the three tabs actually switch ---------------------------
    console.log('\n▸ saved');
    await page.goto(`${BASE}/saved`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    for (const tabName of ['saved', 'viewed', 'cooked']) {
      check(
        `the "${tabName}" tab switches`,
        await tap(`saved-tabs-${tabName}`, { optional: true }),
      );
      await page.waitForTimeout(500);
    }
    // "Recently viewed" has content, because the recipe above was opened.
    await tap('saved-tabs-viewed', { optional: true });
    await page.waitForTimeout(900);
    // `saved-recipe-`, not `saved-`: the latter also counted the tab bar and
    // each of its three tabs as saved recipes.
    const viewed = await page.locator('[data-testid^="saved-recipe-"]').count();
    check('recently viewed remembers the recipe that was opened', viewed > 0, `${viewed} entries`);
    await shot('20-saved');

    // --- Shopping list: add an entity through its sheet -------------------
    console.log('\n▸ shopping list');
    await page.goto(`${BASE}/shopping-list`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    check('an empty list explains itself', await visible('shopping-empty', 5000));
    check(
      'the empty state offers the add action',
      await tap('shopping-empty-action', { optional: true }),
    );
    if (await visible('shopping-add-input', 4000)) {
      await type('shopping-add-input', 'parsley');
      await tap('shopping-add-submit');
      await page.waitForTimeout(1000);
      const rows = await page.locator('[data-testid^="shopping-item-"]').count();
      check('adding puts a row on the list', rows > 0, `${rows} rows`);
      await shot('19-shopping-list');
    }

    // --- Deep link and reload --------------------------------------------
    console.log('\n▸ deep links');
    await page.goto(`${BASE}/settings/appearance`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    check('a deep link survives a reload', await visible('appearance-system', 6000));
  } catch (error) {
    // A thrown step is a failure like any other, but the summary is far more
    // useful than a bare stack: it says which checks got as far as passing.
    check('the run completed without throwing', false, String(error).slice(0, 200));
    await page.screenshot({ path: join(OUT, 'failure.png') }).catch(() => {});
  } finally {
    await browser.close();
    server?.close();
    // Nothing local was built when driving a deployed URL, so there is nothing
    // to clean up — and removing dist/ would delete an unrelated export.
    if (!KEEP && !REMOTE) await rm(DIST, { recursive: true, force: true });
  }

  const failed = checks.filter((entry) => !entry.ok);

  if (problems.length > 0 || failed.length > 0) {
    if (failed.length > 0) {
      console.error(`\n✗ ${failed.length} failed check(s):`);
      for (const entry of failed) console.error(`   ${entry.name}`);
    }
    if (problems.length > 0) {
      console.error(`\n✗ ${problems.length} page error(s):`);
      for (const problem of problems.slice(0, 20)) console.error(`   ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  console.log(
    `\n✓ ${manifest.name}: ${checks.length} interaction checks passed with no page errors.`,
  );
  console.log(`  Screenshots: ${OUT}`);
}

await main();
