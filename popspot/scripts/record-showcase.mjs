/**
 * Render /showcase to a 1080×1920, 60 fps MP4 — frame-exact, no screen recorder.
 *
 * The timeline is deterministic, so each frame is produced by seeking to
 * n/60 s and taking a screenshot; ffmpeg stitches the PNGs. Output never
 * depends on machine speed.
 *
 *   npm run dev                      # in another terminal (or `npm run preview`)
 *   npm run record                   # → out/popspot-collector-film.mp4
 *
 * Env: BASE_URL (default http://127.0.0.1:5173), FPS (60), FFMPEG (ffmpeg on PATH),
 *      CHROMIUM (path to a Chromium/Chrome binary if Playwright's is not installed),
 *      FRAMES_ONLY=1 to stop after writing PNGs.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const FPS = Number(process.env.FPS ?? 60);
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const root = resolve(import.meta.dirname, '..');
const frames = resolve(root, '.frames');
const outDir = resolve(root, 'out');

rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(`${BASE}/showcase?autoplay=0`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__showcase?.ready, null, { timeout: 30000 });
const duration = await page.evaluate(() => window.__showcase.duration);
const total = Math.round(duration * FPS) + 1;

for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.__showcase.seek(t), i / FPS);
  // two animation frames so styles and images are painted before capture
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: resolve(frames, `f${String(i).padStart(5, '0')}.png`) });
  if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${total}`);
}
await browser.close();
console.log(`\n${total} frames → ${frames}`);

if (!process.env.FRAMES_ONLY) {
  const out = resolve(outDir, 'popspot-collector-film.mp4');
  const r = spawnSync(
    FFMPEG,
    ['-y', '-framerate', String(FPS), '-i', resolve(frames, 'f%05d.png'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) {
    console.error('ffmpeg failed — frames are kept in .frames/ (set FFMPEG=/path/to/ffmpeg).');
    process.exit(1);
  }
  console.log(`→ ${out}`);
}
