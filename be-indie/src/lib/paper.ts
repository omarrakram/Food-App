/** Paper stock and film grain, generated once on the main thread. */
import { fbm, hash2, mulberry32 } from './rng';

let paperUrl: Promise<string> | null = null;
let grainUrl: Promise<string> | null = null;

function toUrl(c: HTMLCanvasElement, type = 'image/png', q?: number) {
  return new Promise<string>((res) => c.toBlob((b) => res(URL.createObjectURL(b!)), type, q));
}

/** Uncoated stock: warm off-white, cloudy formation, a few fibres. */
export function paperTexture(W = 1080, H = 1920) {
  if (paperUrl) return paperUrl;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const cloud = (fbm(x / 90, y / 90, 5, 3) - 0.5) * 10;
      const n = (hash2(x, y, 9) - 0.5) * 9;
      const v = cloud + n;
      d[o] = 236 + v;
      d[o + 1] = 231 + v;
      d[o + 2] = 219 + v * 0.9;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const r = mulberry32(12);
  ctx.lineCap = 'round';
  for (let k = 0; k < 900; k++) {
    const x = r() * W;
    const y = r() * H;
    const l = 4 + r() * 16;
    const a = r() * Math.PI * 2;
    ctx.strokeStyle = r() < 0.5 ? `rgba(120,110,90,${0.08 + r() * 0.12})` : `rgba(255,255,250,${0.2 + r() * 0.3})`;
    ctx.lineWidth = 0.6 + r() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.8) * l * 0.5, y + Math.sin(a + 0.8) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  paperUrl = toUrl(c, 'image/jpeg', 0.92);
  return paperUrl;
}

/** Neutral grain tile, centred on mid-grey for overlay blending. */
export function grainTexture(S = 256) {
  if (grainUrl) return grainUrl;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let p = 0; p < S * S; p++) {
    const v = 128 + (hash2(p % S, (p / S) | 0, 77) - 0.5) * 120;
    img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = v;
    img.data[p * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainUrl = toUrl(c);
  return grainUrl;
}
