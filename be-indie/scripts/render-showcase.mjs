// Deterministic frame-by-frame render of /showcase to MP4 (1080×1920).
//
//   npm run dev                      # in another terminal
//   npm run render -- --fps 60 --out showcase.mp4
//
// Needs ffmpeg with libx264: on PATH, via FFMPEG=/path/to/ffmpeg, or the
// optional `@ffmpeg-installer/ffmpeg` package.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const base = arg('url', 'http://127.0.0.1:5173');
const fps = Number(arg('fps', 60));
const out = arg('out', 'showcase.mp4');
const hold = Number(arg('hold', 0.6));
const from = Number(arg('from', 0));
const to = arg('to');

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {}
  try {
    return require('@ffmpeg-installer/ffmpeg').path;
  } catch {}
  throw new Error('ffmpeg not found: install it, or set FFMPEG=/path/to/ffmpeg');
}
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const ffmpeg = findFfmpeg();
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`${base}/showcase?capture`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 180000 });
const duration = await page.evaluate(() => window.__duration);
const end = to ? Number(to) : duration + hold;
const frames = Math.round((end - from) * fps);

const enc = spawn(ffmpeg, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-movflags', '+faststart', '-r', String(fps), out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  const t = Math.min(duration, from + f / fps);
  await page.evaluate((x) => window.__seek(x), t);
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
  if (f % fps === 0) process.stdout.write(`\r${(f / fps).toFixed(0)}s / ${(frames / fps).toFixed(1)}s  `);
}
enc.stdin.end();
await new Promise((r) => enc.on('close', r));
await browser.close();
console.log(`\n${out}: ${frames} frames @ ${fps}fps in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
