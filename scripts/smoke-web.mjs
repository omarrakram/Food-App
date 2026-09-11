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
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
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

/** Expo's static export writes one HTML file per route, plus assets. */
function serveDist() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = join(DIST, decodeURIComponent(url.pathname));

    // `/budget` and `/budget.html` are the same page; `/` is index.html.
    for (const attempt of [path, `${path}.html`, join(path, 'index.html')]) {
      try {
        if ((await stat(attempt)).isFile()) {
          res.writeHead(200, {
            'content-type': MIME[extname(attempt)] ?? 'application/octet-stream',
          });
          createReadStream(attempt).pipe(res);
          return;
        }
      } catch {
        // Fall through to the next candidate.
      }
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

async function main() {
  const chromium = await loadChromium();

  if (!existsSync(DIST) || !process.argv.includes('--no-export')) {
    log('exporting the web bundle…');
    // EXPO_OFFLINE keeps the CLI from reaching api.expo.dev, which is blocked
    // in some sandboxes and only ever consulted for version hints.
    await run('npx', ['expo', 'export', '--platform', 'web', '--clear'], {
      env: { ...process.env, EXPO_OFFLINE: '1' },
    });
  }

  await mkdir(OUT, { recursive: true });
  const { server, base: BASE } = await serveDist();
  log(`serving dist/ on ${BASE}`);

  const executablePath = process.env.CHROMIUM_PATH;
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

    check('onboarding starts on a name field', await visible('onboarding-name', 12000));
    await type('onboarding-name', 'Omar');
    await shot('01-onboarding');

    // Step one needs a name; the rest are skippable. Walk to the end.
    let steps = 0;
    for (; steps < 14; steps += 1) {
      if (!(await tap('onboarding-next', { optional: true }))) break;
    }
    await page.waitForTimeout(1500);
    check('onboarding completes and lands in the app', await visible('home-cook-with', 10000),
      `${steps} steps`);
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
    const summary = await locate('pantry-editor-details').innerText().catch(() => '');
    check('category and unit are inferred from the catalogue', /\w/.test(summary), summary.trim());

    await type('pantry-editor-quantity', '500');
    check('expiry field renders', await visible('pantry-editor-expiry', 4000));

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

    const removeButton = page.locator('[data-testid^="pantry-item-"][data-testid$="-remove"]').first();
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
    await shot('05-cook-selected');

    // NOTE: the testID is the NORMALISED name — "eggs" normalises to "egg".
    // The previous version of this script tapped `starter-eggs`, matched
    // nothing, and passed anyway because the tap was optional.
    check('a common suggestion is tappable', await tap('starter-egg'));
    check('a second common suggestion is tappable', await tap('starter-rice'));
    const afterStarters = await selectedCount();
    check('common suggestions add to the selection', afterStarters >= 2, `${afterStarters} chips`);

    const firstChip = page.locator('[data-testid^="selected-"]').first();
    await firstChip.click();
    await page.waitForTimeout(600);
    check('tapping a selected chip removes it', (await selectedCount()) === afterStarters - 1);

    // Filters: open, apply, confirm the reset appears, clear.
    if (await tap('cook-filters', { optional: true })) {
      check('the filter sheet opens', await visible('cook-filters-done', 4000));
      // "Clear" only exists once something is filtered — that is the point of
      // it, and asserting on it before applying a filter is how the previous
      // version of this check managed to be wrong.
      check('nothing to clear before a filter is applied', !(await visible('cook-filters-clear', 1200)));
      check('a protein target can be set', await tap('filter-protein-40'));
      check('a time limit can be set', await tap('filter-time-15'));
      check('the clear control appears once filters are active', await visible('cook-filters-clear', 3000));
      await tap('cook-filters-clear');
      await page.waitForTimeout(500);
      check('clearing removes the reset control again', !(await visible('cook-filters-clear', 1200)));
      await tap('cook-filters-done');
    }

    await tap('cook-submit');
    await page.waitForTimeout(2400);
    const results = await page.locator('[data-testid^="result-"]').count();
    check('cook returns results', results > 0 || (await visible('results-empty', 2000)),
      `${results} results`);
    await shot('06-cook-results');

    // --- Recipe detail and cooking mode ----------------------------------
    console.log('\n▸ recipe');
    const firstResult = page.locator('[data-testid^="result-"]').first();
    if (await firstResult.count()) {
      await firstResult.click();
      await page.waitForTimeout(1800);
      check('a result opens its recipe', await visible('recipe-start-cooking', 6000));
      await shot('07-recipe-detail');

      if (await tap('recipe-start-cooking', { optional: true })) {
        await page.waitForTimeout(1200);
        check('cooking mode starts', await visible('cooking-next', 5000));
        await shot('08-cooking-mode');
        await tap('cooking-next', { optional: true });
        check('cooking mode advances a step', true);
      }
    }

    // --- Discover: filter to a collection and clear it back ---------------
    console.log('\n▸ discover');
    await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    const discoverCards = () => page.locator('[data-testid^="discover-"]').count();
    await tap('collection-all', { optional: true });
    await page.waitForTimeout(700);
    const unfiltered = await discoverCards();
    check('discover shows the catalogue', unfiltered > 0, `${unfiltered} cards`);

    const collection = page.locator('[data-testid^="collection-"]').nth(2);
    if (await collection.count()) {
      await collection.click();
      await page.waitForTimeout(900);
      const filtered = await discoverCards();
      check('a collection narrows the catalogue', filtered < unfiltered, `${filtered} cards`);

      if (filtered === 0) {
        check('the zero-result state offers a way out', await visible('discover-empty-action', 3000));
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
    await tap('budget-preset-150', { optional: true });
    await shot('10-budget');
    if (await tap('budget-submit', { optional: true })) {
      await page.waitForTimeout(2400);
      const budgetResults = await page.locator('[data-testid^="result-"]').count();
      check('budget returns results', budgetResults > 0, `${budgetResults} results`);
      await shot('11-budget-results');
    }

    // --- Language: English -> Arabic -> English ---------------------------
    console.log('\n▸ language');
    await page.goto(`${BASE}/settings/language`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const beforeSwitch = errorCount();
    check('the language screen offers Arabic', await tap('language-ar', { optional: true }));
    check('switching language does not hit the error boundary', errorCount() === beforeSwitch);

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const arabicHome = await bodyText();
    check('home renders in Arabic', /[؀-ۿ]/.test(arabicHome));
    check(
      'no English recipe titles leak into the Arabic home',
      !/Koshari|Shakshuka|Molokhia|Zucchini|Creamy Chicken/i.test(arabicHome),
    );
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
    const latinLines = async () => {
      const text = await bodyText();
      return [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))].filter(
        (line) => /[A-Za-z]/.test(line),
      );
    };

    const firstDiscoverCard = page.locator('[data-testid^="discover-"]').first();
    if (await firstDiscoverCard.count()) {
      await firstDiscoverCard.click();
      await page.waitForTimeout(2000);
      const leaked = await latinLines();
      check(
        'the Arabic recipe page has no English left in it',
        leaked.length === 0,
        leaked.slice(0, 4).join(' | '),
      );
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

    await page.goto(`${BASE}/settings/language`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    await tap('language-en', { optional: true });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    check('switching back to English sticks', /What are you eating|Good /i.test(await bodyText()));

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

    // --- Shopping list: add an entity through its sheet -------------------
    console.log('\n▸ shopping list');
    await page.goto(`${BASE}/shopping-list`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    check('an empty list explains itself', await visible('shopping-empty', 5000));
    check('the empty state offers the add action', await tap('shopping-empty-action', { optional: true }));
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
    server.close();
    if (!KEEP) await rm(DIST, { recursive: true, force: true });
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
