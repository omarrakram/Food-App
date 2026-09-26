// Viewport screenshots of each chapter of the site.
// node scripts/site-shots.mjs <baseUrl> <outDir> [width] [height]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [base, out, w = '1440', h = '900'] = process.argv.slice(2);
const b = await pw.chromium.launch();
const page = await b.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${out}/site_0_hero.png` });
const shots = [
  ['.indep', 0, 'site_1_indep'],
  ['.scanner', 0, 'site_2_scanner'],
  ['.collection', 0.0, 'site_3a_collection'],
  ['.collection', 0.45, 'site_3b_collection'],
  ['.print', 0, 'site_4_print'],
  ['.detail', 0.05, 'site_5_detail'],
  ['.end', 0, 'site_6_end'],
];
for (const [sel, frac, name] of shots) {
  await page.evaluate(([s, f]) => {
    const el = document.querySelector(s);
    const top = el.getBoundingClientRect().top + scrollY;
    const span = Math.max(0, el.offsetHeight - innerHeight);
    window.scrollTo(0, top + span * f);
  }, [sel, frac]);
  await page.waitForTimeout(sel === '.scanner' ? 5200 : 3200);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', name);
}
await b.close();
