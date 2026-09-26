// A single seeded noise tile; the timeline moves it once per 1/24 s so the
// grain is identical on every replay and in the frame-by-frame render.
let cached: string | null = null;

export function grainTexture() {
  if (cached) return cached;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let s = 1337;
  for (let i = 0; i < size * size; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = 128 + ((s >>> 24) - 128) * 0.9;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cached = c.toDataURL('image/png');
  return cached;
}

let inkCached: string | null = null;

/** Alpha texture for stamped ink: mostly solid, with speckled voids. */
export function inkTexture() {
  if (inkCached) return inkCached;
  const size = 320;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  let s = 90210;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < size * size; i++) {
    const r = rnd();
    // ~7% voids, some partial
    const a = r < 0.05 ? 0 : r < 0.09 ? 110 : 255;
    img.data[i * 4 + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  // soften into ink-like clumps
  const c2 = document.createElement('canvas');
  c2.width = size;
  c2.height = size;
  const ctx2 = c2.getContext('2d')!;
  ctx2.filter = 'blur(0.7px)';
  ctx2.drawImage(c, 0, 0);
  inkCached = c2.toDataURL('image/png');
  return inkCached;
}
