// Contact sheet of review frames: node scripts/contact.mjs out.png img1 img2 ...
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [out, ...imgs] = process.argv.slice(2);
const w = 360, h = 640;
const html = `<body style="margin:0;background:#222;display:flex;gap:6px;padding:6px;font:12px monospace;color:#ccc">${imgs
  .map((p) => `<div><img src="data:image/png;base64,${readFileSync(p).toString('base64')}" width=${w} height=${h} style="display:block"/><div>${p.split('/').pop()}</div></div>`)
  .join('')}</body>`;
const b = await pw.chromium.launch();
const pg = await b.newPage({ viewport: { width: imgs.length * (w + 6) + 6, height: h + 30 } });
await pg.setContent(html);
await pg.screenshot({ path: out });
await b.close();
