// Screenshot helper for the QC loop.
// node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [fullPage]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [url, out, w = '1440', h = '900', wait = '0', full = '0'] = process.argv.slice(2);
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 }).catch(() => console.log('ready timeout'));
if (+wait) await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: full === '1' });
await browser.close();
console.log('saved', out);
