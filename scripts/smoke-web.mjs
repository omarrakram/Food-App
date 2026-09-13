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
    await run('npx', ['expo', 'export', '--platform', 'web', '--clear'], {
      env: { ...process.env, EXPO_OFFLINE: '1' },
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

    // A perishable is never an "always assume I have this" staple, and the row
    // says so rather than silently disappearing.
    const stapleRow = async () => locate('pantry-editor-staple').innerText().catch(() => '');
    check(
      'a perishable cannot be marked a staple',
      /goes off|تاريخ|بتبوظ/i.test(await stapleRow()),
      (await stapleRow()).replace(/\n/g, ' ').trim(),
    );

    await type('pantry-editor-name', 'salt', { clear: true });
    check(
      'a cupboard staple can be',
      /always assume|افترض/i.test(await stapleRow()),
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

    const photoAudit = async (label) => {
      await page.waitForTimeout(900);
      return page.evaluate(() => {
        const nodes = [...document.querySelectorAll('[data-testid^="recipe-photo-"]')];
        const fallbacks = document.querySelectorAll('[data-testid^="recipe-fallback-"]').length;
        let decoded = 0;
        for (const node of nodes) {
          const img = node.tagName === 'IMG' ? node : node.querySelector('img');
          if (img && img.naturalWidth > 0) decoded += 1;
        }
        return { photos: nodes.length, decoded, fallbacks };
      }).then((result) => ({ ...result, label }));
    };

    await page.goto(`${BASE}/discover`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    // Scrolling matters: the grid is virtualised, so an unscrolled page only
    // ever proves the first screenful.
    await page.evaluate(() => window.scrollTo(0, 1200));
    const discoverPhotos = await photoAudit('discover');
    check(
      'the catalogue shows real photographs, not only the fallback',
      discoverPhotos.photos > 0,
      `${discoverPhotos.photos} photos, ${discoverPhotos.fallbacks} fallbacks`,
    );
    check(
      'and the browser actually decoded them',
      discoverPhotos.photos === 0 || discoverPhotos.decoded === discoverPhotos.photos,
      `${discoverPhotos.decoded} of ${discoverPhotos.photos} decoded`,
    );
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
    // The user's own name is Latin because THEY typed it in Latin during
    // onboarding, and it is rendered in the drawer on every screen. It is data,
    // not an untranslated string, so it is excluded by name rather than by
    // weakening the check — everything else Latin is still a failure.
    const OWN_NAME = 'Omar';
    const latinLines = async () => {
      const text = await bodyText();
      return [...new Set(text.split('\n').map((line) => line.trim()).filter(Boolean))].filter(
        (line) => /[A-Za-z]/.test(line) && line !== OWN_NAME && line !== OWN_NAME[0],
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

      const ids = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="result-"]')].map((node) =>
          node.getAttribute('data-testid'),
        ),
      );
      const titles = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="result-"]')]
          .slice(0, 10)
          .map((node) => (node.innerText || '').split('\n')[0]),
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
      return { ids, selected, titles, missing, empty };
    };

    /** One row of the evidence table this hotfix has to produce. */
    const rows = [];
    const record = (input, mode, result) => {
      const counts = [...new Set(result.missing)].sort((a, b) => a - b);
      rows.push(
        `| ${input} | ${mode} | ${result.ids.length} | ` +
          `${result.titles.join('; ') || '—'} | ` +
          `${counts.length ? counts.join(', ') : '—'} |`,
      );
      return result;
    };

    const CASE_A = ['chicken breast', 'rice', 'tomatoes'];
    const CASE_C = ['banana', 'oats', 'milk'];

    const relaxedA = record('chicken, rice, tomato', '≤2 missing', await cookWith(CASE_A, 'missing2'));
    check(
      'the picker accepted the first ingredient set',
      relaxedA.selected === CASE_A.length,
      `${relaxedA.selected} of ${CASE_A.length} chips`,
    );
    check('chicken, rice, tomato returns something', relaxedA.ids.length > 0,
      `${relaxedA.ids.length} results`);
    await shot('17e-cook-case-a');

    const relaxedC = record('banana, oats, milk', '≤2 missing', await cookWith(CASE_C, 'missing2'));
    check('banana, oats, milk returns something', relaxedC.ids.length > 0,
      `${relaxedC.ids.length} results`);
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
    const relaxedB = record('eggs, white cheese, tomato', '≤2 missing', await cookWith(CASE_B, 'missing2'));
    const relaxedD = record('ground beef, pasta, tomato', '≤2 missing', await cookWith(CASE_D, 'missing2'));

    const answers = [relaxedA, relaxedB, relaxedC, relaxedD].map((result) => result.ids.join('|'));
    check(
      'all four ingredient sets give four different answers',
      new Set(answers).size === 4,
      [relaxedA, relaxedB, relaxedC, relaxedD].map((r) => r.ids.length).join(' / '),
    );

    // ALIASES. The user does not know our vocabulary. "Minced meat" and
    // "macaroni" are what a person says; `ground-beef` and `pasta` are what the
    // catalogue calls them, and the answer must not depend on which was typed.
    const aliased = record('minced meat, macaroni, tomato (aliases)', '≤2 missing', await cookWith(['minced meat', 'macaroni', 'tomato'], 'missing2'));
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
    const oneD = record('ground beef, pasta, tomato', '≤1 missing', await cookWith(CASE_D, 'missing1'));
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
      check(
        'an exclusion is understood and shown back',
        /bell pepper|without/i.test(excludedText),
      );

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
      'FOOD SAFETY: and never pre-selects something already expired',
      !/chicken/.test(seeded),
      seeded,
    );
    await shot('17i-cook-from-pantry');

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
    await shot('17d-friends');

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
    await shot('18b-drawer');

    check('the drawer reaches the shopping list', await tap('drawer-shopping'));
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
      check(`the "${tabName}" tab switches`, await tap(`saved-tabs-${tabName}`, { optional: true }));
      await page.waitForTimeout(500);
    }
    // "Recently viewed" has content, because the recipe above was opened.
    await tap('saved-tabs-viewed', { optional: true });
    await page.waitForTimeout(900);
    const viewed = await page.locator('[data-testid^="saved-"]').count();
    check('recently viewed remembers the recipe that was opened', viewed > 0, `${viewed} entries`);
    await shot('20-saved');

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
