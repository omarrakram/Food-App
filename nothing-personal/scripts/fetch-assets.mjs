// Downloads the official Nothing Personal imagery listed in assets_manifest.json
// into public/np/real/. Runs before `npm run dev`; if a file cannot be fetched
// the site falls back to the procedural stand-ins in public/np/standin/.
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/np/real');
const force = process.argv.includes('--force');
const { assets } = JSON.parse(readFileSync(resolve(root, 'scripts/assets_manifest.json'), 'utf8'));
mkdirSync(out, { recursive: true });

const missing = assets.filter((a) => {
  const f = resolve(out, a.filename);
  return force || !existsSync(f) || statSync(f).size < 1024;
});
if (!missing.length) process.exit(0);

let ok = 0;
await Promise.all(
  missing.map(async (a) => {
    try {
      const res = await fetch(a.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(resolve(out, a.filename), Buffer.from(await res.arrayBuffer()));
      ok++;
    } catch (e) {
      console.warn(`[assets] ${a.filename}: ${e.cause?.code || e.message}`);
    }
  }),
);
console.log(
  `[assets] ${ok}/${missing.length} downloaded` +
    (ok < missing.length ? ' — missing files fall back to stand-ins' : ''),
);
