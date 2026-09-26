import realFiles from 'virtual:np-real';

// Every image the experience uses, resolved once before anything is shown.
// Official imagery (downloaded by `npm run assets` into public/np/real/) wins;
// the procedural stand-ins in public/np/standin/ fill any gap so a recording
// never contains a broken image.

export type SlotKey =
  | 'hook'
  | 'manifesto'
  | 'p01'
  | 'p109'
  | 'p109a'
  | 'p109b'
  | 'p98'
  | 'separation'
  | 'logo';

interface Slot {
  real: string | null;
  standin: string | null;
  /** object-position used for cover crops */
  pos: string;
  /** build a red "ink plate" version (dark = red) */
  ink?: boolean;
}

export const SLOTS: Record<SlotKey, Slot> = {
  hook: { real: '01_campaign_hero.jpg', standin: 'campaign_jorts.jpg', pos: '50% 38%' },
  manifesto: { real: '05_white_tank.png', standin: 'campaign_linen.jpg', pos: '50% 30%' },
  p01: { real: '04_black_boxy.png', standin: 'product_boxy.png', pos: '50% 50%', ink: true },
  p109: { real: '07_male_white_tee.png', standin: 'product_linen.png', pos: '50% 40%' },
  p109a: { real: '10_product_extra_187.png', standin: 'campaign_jorts.jpg', pos: '50% 35%' },
  p109b: { real: '02_campaign_portrait.jpg', standin: 'campaign_flatlay.jpg', pos: '50% 30%' },
  p98: { real: '06_denim_white_tank.png', standin: 'product_jorts.png', pos: '50% 45%' },
  separation: {
    real: '02_campaign_portrait.jpg',
    standin: 'campaign_flatlay.jpg',
    pos: '50% 32%',
    ink: true,
  },
  logo: { real: '03_official_logo.png', standin: null, pos: '50% 50%' },
};

export interface Asset {
  src: string;
  real: boolean;
  w: number;
  h: number;
  pos: string;
  ink?: string;
}
export type Assets = Record<SlotKey, Asset | null>;

const base = import.meta.env.BASE_URL + 'np/';
const present = new Set(realFiles);

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

/**
 * Red plate: luminance → ink coverage → a 45° halftone screen, keeping the
 * source alpha. Shadows print as near-solid ink, paper-light areas as nothing.
 */
function inkPlate(img: HTMLImageElement, color: [number, number, number]): Promise<string> {
  const max = 1400;
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k);
  const h = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const p = d.data;
  // auto-levels on the opaque pixels, so a black garment still separates
  // into highlights and shadows
  const lum = (i: number) => (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
  const sample: number[] = [];
  for (let i = 0; i < p.length; i += 4 * 17) if (p[i + 3] > 128) sample.push(lum(i));
  sample.sort((a, b) => a - b);
  const lo = sample[Math.floor(sample.length * 0.03)] ?? 0;
  const hi = Math.max(lo + 0.05, sample[Math.floor(sample.length * 0.97)] ?? 1);
  const cell = Math.max(5, Math.round(w / 190));
  const aa = 0.9 / cell;
  const r2 = Math.SQRT1_2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = Math.min(1, Math.max(0, (lum(i) - lo) / (hi - lo)));
      const cov = Math.pow(1 - l, 0.85) * 0.96;
      const u = ((x + y) * r2) / cell;
      const v = ((x - y) * r2) / cell;
      const fu = u - Math.floor(u) - 0.5;
      const fv = v - Math.floor(v) - 0.5;
      const dist = Math.sqrt(fu * fu + fv * fv);
      const rad = Math.sqrt(cov / Math.PI);
      const a = cov <= 0 ? 0 : Math.min(1, Math.max(0, (rad - dist) / aa + 0.5));
      p[i] = color[0];
      p[i + 1] = color[1];
      p[i + 2] = color[2];
      p[i + 3] = Math.round(a * p[i + 3]);
    }
  }
  ctx.putImageData(d, 0, 0);
  return new Promise((resolve) => c.toBlob((b) => resolve(URL.createObjectURL(b!)), 'image/png'));
}

export async function loadAssets(): Promise<Assets> {
  const out = {} as Assets;
  await Promise.all(
    (Object.keys(SLOTS) as SlotKey[]).map(async (key) => {
      const slot = SLOTS[key];
      const tries: [string, boolean][] = [];
      if (slot.real && present.has(slot.real)) tries.push([base + 'real/' + slot.real, true]);
      if (slot.standin) tries.push([base + 'standin/' + slot.standin, false]);
      for (const [src, real] of tries) {
        try {
          const img = await load(src);
          const a: Asset = { src, real, w: img.naturalWidth, h: img.naturalHeight, pos: slot.pos };
          if (slot.ink) a.ink = await inkPlate(img, [222, 42, 27]);
          out[key] = a;
          return;
        } catch {
          /* fall through to the next candidate */
        }
      }
      out[key] = null;
    }),
  );
  return out;
}
