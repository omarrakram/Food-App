// Renders the procedural stand-in imagery into public/np/standin/.
// Only needed if you want to regenerate them: node scripts/render-standins.mjs [name...]
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/np/standin');
mkdirSync(out, { recursive: true });

const paper = { color: '#e4dfd5', shadow: { dx: 9, dy: 16, blur: 12, opacity: 0.42 } };
const jobs = {
  product_boxy: { garment: 'tee', W: 1200, H: 1320, view: { cx: 500, cy: 556, s: 1.14, r: 0 } },
  product_linen: { garment: 'shirt', W: 1200, H: 1320, view: { cx: 500, cy: 556, s: 1.14, r: 0 } },
  product_jorts: { garment: 'jorts', W: 1200, H: 1200, view: { cx: 500, cy: 500, s: 1.14, r: 0 } },
  campaign_flatlay: {
    garment: 'tee', type: 'jpg', W: 1080, H: 1920,
    view: { cx: 520, cy: 610, s: 1.32, r: -0.07 }, background: paper,
  },
  campaign_jorts: {
    garment: 'jorts', type: 'jpg', W: 1080, H: 1920,
    view: { cx: 500, cy: 520, s: 1.3, r: 0.05 }, background: paper,
  },
  campaign_linen: {
    garment: 'shirt', type: 'jpg', W: 1080, H: 1920,
    view: { cx: 480, cy: 600, s: 1.36, r: 0.06 }, background: paper,
  },
};

const only = process.argv.slice(2);
const scale = Number(process.env.SCALE || 1);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
});
const page = await browser.newPage();
await page.goto('file://' + resolve(root, 'tools/standins/index.html'));
for (const [name, job] of Object.entries(jobs)) {
  if (only.length && !only.includes(name)) continue;
  const j = { ...job, W: Math.round(job.W * scale), H: Math.round(job.H * scale), view: { ...job.view, s: job.view.s * scale } };
  const t = Date.now();
  const url = await page.evaluate((jj) => window.runJob(jj), j);
  const ext = job.type === 'jpg' ? 'jpg' : 'png';
  writeFileSync(resolve(out, `${name}.${ext}`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${name}.${ext}  ${Date.now() - t}ms`);
}
await browser.close();
