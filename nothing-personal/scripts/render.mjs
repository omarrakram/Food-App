// Frame-perfect export of the showcase: seeks the master timeline frame by
// frame in headless Chromium and encodes a 1080x1920 H.264 file.
//
//   npm run render                 → out/nothing-personal-showcase.mp4 (60 fps)
//   npm run render -- --fps 30     → 30 fps
//   CHROME=/path/to/chrome npm run render
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const fps = Number(arg('fps', 60));
const out = resolve(root, arg('out', 'out/nothing-personal-showcase.mp4'));
const from = Number(arg('from', 0));
const to = arg('to', null);
mkdirSync(dirname(out), { recursive: true });

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    return createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg').path;
  } catch {
    return 'ffmpeg';
  }
}

function browserOptions() {
  if (process.env.CHROME) return { executablePath: process.env.CHROME };
  if (existsSync('/opt/pw-browsers/chromium'))
    return { executablePath: '/opt/pw-browsers/chromium' };
  return { channel: 'chrome' };
}

const server = await createServer({
  root,
  logLevel: 'error',
  server: { port: 5199, strictPort: false },
});
await server.listen();
const url = server.resolvedUrls.local[0] + 'showcase?t=0';

const browser = await chromium.launch({
  ...browserOptions(),
  args: ['--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__np?.ready, null, { timeout: 30000 });
const duration = to ? Number(to) : await page.evaluate(() => window.__np.duration);

const ff = spawn(
  ffmpegPath(),
  [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-framerate',
    String(fps),
    '-c:v',
    'mjpeg',
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '14',
    '-pix_fmt',
    'yuv420p',
    '-vf',
    'scale=1080:1920:flags=lanczos',
    '-movflags',
    '+faststart',
    out,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);

const frames = Math.round((duration - from) * fps);
const t0 = Date.now();
for (let i = 0; i <= frames; i++) {
  const t = Math.min(duration, from + i / fps);
  await page.evaluate(
    (tt) =>
      new Promise((r) => {
        window.__np.seek(tt);
        requestAnimationFrame(() => requestAnimationFrame(() => r(null)));
      }),
    t,
  );
  const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % fps === 0) process.stdout.write(`\r${t.toFixed(1)}s / ${duration}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
await server.close();
console.log(`\n${out}  (${frames + 1} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
