/** Deterministic randomness. Every texture is seeded, so every frame of the
 *  showcase is reproducible. */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash → [0, 1). */
export function hash2(x: number, y: number, seed: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise, 2D. */
export function noise2(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

export function fbm(x: number, y: number, seed: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * f, y * f, seed + o * 97);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
