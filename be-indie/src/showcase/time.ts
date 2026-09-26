/** Pure functions of time. The showcase is `frame = f(t)`, nothing else. */
import { hash2 } from '../lib/rng';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export const ease = {
  linear: (p: number) => p,
  outExpo: (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inExpo: (p: number) => (p <= 0 ? 0 : Math.pow(2, 10 * p - 10)),
  outCubic: (p: number) => 1 - Math.pow(1 - p, 3),
  inCubic: (p: number) => p * p * p,
  inOutCubic: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outQuart: (p: number) => 1 - Math.pow(1 - p, 4),
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  outSine: (p: number) => Math.sin((p * Math.PI) / 2),
};

/** A snap: 0 → 1 over `d` seconds with a hard exponential landing. */
export const snap = (t: number, a: number, d = 0.14) => ease.outExpo(seg(t, a, a + d));

/** Characters typed so far. */
export const typed = (s: string, t: number, a: number, cps = 48) =>
  t < a ? '' : s.slice(0, Math.min(s.length, Math.floor((t - a) * cps) + 1));

/** Hand-made jitter: stepped at 12 fps like a physical print run. */
export const jitter = (t: number, seed: number, amp: number, fps = 12) =>
  (hash2(Math.floor(t * fps), seed, 7) - 0.5) * 2 * amp;

export const shown = (t: number, a: number, b = Infinity) => t >= a && t < b;
