#!/usr/bin/env node
/**
 * End-to-end smoke test: builds the web export, serves it, and walks a real
 * browser through the whole app.
 *
 *     npm run smoke:web                 # export, serve, drive, screenshot
 *     npm run smoke:web -- --keep       # leave the export in place afterwards
 *     SMOKE_OUT=/tmp/shots npm run smoke:web
 *
 * Why this exists: the Jest suite renders components, never the app. Both of
 * the bugs that made the app unusable in practice — every disabled control
 * drawn at full opacity, and finishing onboarding looping back to step one —
 * were invisible to unit tests and obvious the moment something clicked
 * through the product. See PROJECT_STATUS.md § End-to-end verification.
 *
 * It needs Playwright's browser driver, which is deliberately NOT a dependency
 * of the app (it would land in every contributor's install for one script):
 *
 *     npm i -D playwright-core        # or set PLAYWRIGHT_CORE
 *     npx playwright install chromium # or set CHROMIUM_PATH
 *
 * Exit code is non-zero if any step fails or the page logs an error, so this
 * can gate a release. Blocked image hosts are ignored: they say something
 * about the network, not the app.
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
      return (await import(specifier)).chromium;
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
    let path = join(DIST, decodeURIComponent(url.pathname));

    // `/budget` and `/budget.html` are the same page; `/` is index.html.
    for (const attempt of [path, `${path}.html`, join(path, 'index.html')]) {
      try {
        if ((await stat(attempt)).isFile()) {
          res.writeHead(200, { 'content-type': MIME[extname(attempt)] ?? 'application/octet-stream' });
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

  const shot = async (name) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    log(`captured ${name}`);
  };

  const tap = async (testId, { optional = false } = {}) => {
    const element = page.locator(`[data-testid="${testId}"]`).first();
    if (optional && (await element.count()) === 0) return false;
    await element.waitFor({ state: 'visible', timeout: 8000 });
    await element.click();
    await page.waitForTimeout(500);
    return true;
  };

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // --- Onboarding ------------------------------------------------------
    // React Native Web's TextInput ignores Playwright's fill(): the value is
    // set on the DOM node but React never sees the change. Typing does what a
    // user does, and is what the component actually listens for.
    const name = page.locator('[data-testid="onboarding-name"]').first();
    await name.waitFor({ state: 'visible', timeout: 10000 });
    await name.click();
    await name.pressSequentially('Omar', { delay: 40 });
    await shot('01-onboarding');

    // Step one needs a name; the rest are skippable. Walk to the end.
    for (let step = 0; step < 11; step += 1) {
      if (!(await tap('onboarding-next', { optional: true }))) break;
    }

    // --- Home ------------------------------------------------------------
    await page.waitForTimeout(1500);
    await shot('02-home');

    // --- Cook with what I have -------------------------------------------
    await tap('home-cook-with');
    for (const slug of ['eggs', 'tomato', 'white cheese', 'baladi bread']) {
      await tap(`starter-${slug}`, { optional: true });
    }
    await shot('03-cook-ingredients');

    await tap('cook-submit');
    await page.waitForTimeout(2200);
    await shot('04-results');

    // --- Recipe detail and cooking mode ----------------------------------
    const firstResult = page.locator('[data-testid^="result-"]').first();
    if (await firstResult.count()) {
      await firstResult.click();
      await page.waitForTimeout(1800);
      await shot('05-recipe-detail');

      await page.mouse.wheel(0, 1400);
      await shot('06-recipe-ingredients');

      if (await tap('recipe-start-cooking', { optional: true })) {
        await page.waitForTimeout(1200);
        await shot('07-cooking-mode');
      }
    }

    // --- Budget ----------------------------------------------------------
    await page.goto(`${BASE}/budget`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await tap('budget-preset-150', { optional: true });
    await shot('08-budget');
    if (await tap('budget-submit', { optional: true })) {
      await page.waitForTimeout(2200);
      await shot('09-budget-results');
    }

    // --- The remaining tabs ----------------------------------------------
    for (const [name_, path] of [
      ['10-pantry', '/pantry'],
      ['11-discover', '/discover'],
      ['12-saved', '/saved'],
      ['13-profile', '/profile'],
      ['14-shopping-list', '/shopping-list'],
    ]) {
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await shot(name_);
    }
  } finally {
    await browser.close();
    server.close();
    if (!KEEP) await rm(DIST, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    console.error(`\n✗ ${problems.length} page error(s):`);
    for (const problem of problems.slice(0, 20)) console.error(`   ${problem}`);
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  console.log(`\n✓ ${manifest.name}: full flow walked with no page errors.`);
  console.log(`  Screenshots: ${OUT}`);
}

await main();
