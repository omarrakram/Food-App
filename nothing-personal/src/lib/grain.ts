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
