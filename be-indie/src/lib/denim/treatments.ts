/**
 * Print-room treatments: the same plate as it would come off a risograph, a
 * halftone screen, a photocopier, or a negative strip. Precomputed once per
 * plate so the showcase only ever composites finished bitmaps.
 */
import { hash2, noise2 } from '../rng';
import type { RGB } from './types';

export const PAPER: RGB = [236, 231, 219];
export const INK: RGB = [17, 18, 26];
export const RISO_BLUE: RGB = [0, 88, 178];

function lum(d: Uint8ClampedArray, o: number) {
  return (0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 255;
}

function levels(v: number, lo: number, hi: number, gamma = 1) {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return Math.pow(t, gamma);
}

/** Auto-levels: find the 2nd and 98th percentile of luminance. */
function range(src: ImageData) {
  const hist = new Uint32Array(256);
  const d = src.data;
  for (let o = 0; o < d.length; o += 16) hist[Math.round(lum(d, o) * 255)]++;
  const total = d.length / 16;
  let acc = 0;
  let lo = 0;
  let hi = 255;
  for (let k = 0; k < 256; k++) {
    acc += hist[k];
    if (acc > total * 0.02) {
      lo = k;
      break;
    }
  }
  acc = 0;
  for (let k = 255; k >= 0; k--) {
    acc += hist[k];
    if (acc > total * 0.02) {
      hi = k;
      break;
    }
  }
  return [lo / 255, Math.max(lo + 10, hi) / 255] as const;
}

export function negative(src: ImageData): ImageData {
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const d = out.data;
  for (let o = 0; o < s.length; o += 4) {
    d[o] = 255 - s[o];
    d[o + 1] = 255 - s[o + 1];
    d[o + 2] = 255 - s[o + 2];
    d[o + 3] = 255;
  }
  return out;
}

/** Single-drum riso print: ink density from luminance, with drum grain. */
export function riso(src: ImageData, ink: RGB = RISO_BLUE, seed = 1): ImageData {
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const d = out.data;
  const [lo, hi] = range(src);
  const W = src.width;
  for (let o = 0, p = 0; o < s.length; o += 4, p++) {
    const x = p % W;
    const y = (p / W) | 0;
    let a = 1 - levels(lum(s, o), lo, hi, 0.85);
    const grain = (hash2(x, y, seed) - 0.5) * 0.22 + (noise2(x / 3, y / 3, seed) - 0.5) * 0.18;
    a = Math.min(1, Math.max(0, a * 1.08 + grain));
    // ink sits on paper multiplicatively
    d[o] = PAPER[0] * (1 - a + (a * ink[0]) / 255);
    d[o + 1] = PAPER[1] * (1 - a + (a * ink[1]) / 255);
    d[o + 2] = PAPER[2] * (1 - a + (a * ink[2]) / 255);
    d[o + 3] = 255;
  }
  return out;
}

/** Amplitude-modulated screen, 45°, sampled at cell centres. */
export function halftone(src: ImageData, cell = 9, ink: RGB = INK, paper: RGB = PAPER, gamma = 1): ImageData {
  const W = src.width;
  const H = src.height;
  const out = new ImageData(W, H);
  const s = src.data;
  const d = out.data;
  const [lo, hi] = range(src);
  const ang = Math.PI / 4;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rx = x * ca + y * sa;
      const ry = -x * sa + y * ca;
      const cx = (Math.floor(rx / cell) + 0.5) * cell;
      const cy = (Math.floor(ry / cell) + 0.5) * cell;
      // back to image space to sample tone at the cell centre
      const sx = Math.min(W - 1, Math.max(0, Math.round(cx * ca - cy * sa)));
      const sy = Math.min(H - 1, Math.max(0, Math.round(cx * sa + cy * ca)));
      const t = Math.pow(1 - levels(lum(s, (sy * W + sx) * 4), lo, hi, 0.9), gamma);
      const r = cell * 0.74 * Math.sqrt(t);
      const dist = Math.hypot(rx - cx, ry - cy);
      const cov = Math.min(1, Math.max(0, r - dist + 0.6));
      const o = (y * W + x) * 4;
      d[o] = paper[0] + (ink[0] - paper[0]) * cov;
      d[o + 1] = paper[1] + (ink[1] - paper[1]) * cov;
      d[o + 2] = paper[2] + (ink[2] - paper[2]) * cov;
      d[o + 3] = 255;
    }
  }
  return out;
}

/** Photocopier: crushed tones, toner grain, drum streaks. */
export function photocopy(src: ImageData, seed = 3): ImageData {
  const W = src.width;
  const out = new ImageData(W, src.height);
  const s = src.data;
  const d = out.data;
  const [lo, hi] = range(src);
  const streak = new Float32Array(W);
  for (let x = 0; x < W; x++) streak[x] = hash2(x >> 1, 0, seed) < 0.04 ? 0.18 : 0;
  for (let o = 0, p = 0; o < s.length; o += 4, p++) {
    const x = p % W;
    const y = (p / W) | 0;
    const l = levels(lum(s, o), lo, hi);
    const n = (hash2(x, y, seed) - 0.5) * 0.35 + (noise2(x / 2.2, y / 2.2, seed + 1) - 0.5) * 0.3;
    let v = l + n * 0.5 - streak[x];
    v = v < 0.42 ? 0 : v < 0.52 ? (v - 0.42) / 0.1 : 1;
    d[o] = INK[0] + (PAPER[0] - INK[0]) * v;
    d[o + 1] = INK[1] + (PAPER[1] - INK[1]) * v;
    d[o + 2] = INK[2] + (PAPER[2] - INK[2]) * v;
    d[o + 3] = 255;
  }
  return out;
}

/** Two-colour print: ink for shadows, paper for highlights. */
export function duotone(src: ImageData, dark: RGB, light: RGB): ImageData {
  const out = new ImageData(src.width, src.height);
  const s = src.data;
  const d = out.data;
  const [lo, hi] = range(src);
  for (let o = 0; o < s.length; o += 4) {
    const t = levels(lum(s, o), lo, hi, 1.1);
    d[o] = dark[0] + (light[0] - dark[0]) * t;
    d[o + 1] = dark[1] + (light[1] - dark[1]) * t;
    d[o + 2] = dark[2] + (light[2] - dark[2]) * t;
    d[o + 3] = 255;
  }
  return out;
}
