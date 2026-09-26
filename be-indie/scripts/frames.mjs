// Capture specific showcase frames at 1080×1920 for review.
// node scripts/frames.mjs <baseUrl> <outDir> t1 t2 ...
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [base, outDir, ...times] = process.argv.slice(2);
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
const t0 = Date.now();
await page.goto(`${base}/showcase?capture`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
console.log('plates ready in', Date.now() - t0, 'ms');
for (const t of times) {
  await page.evaluate((x) => window.__seek(x), +t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const f = `${outDir}/f_${String(t).replace('.', '_')}.png`;
  await page.screenshot({ path: f });
  console.log('saved', f);
}
await browser.close();
