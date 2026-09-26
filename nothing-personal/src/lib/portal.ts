// Tee silhouette used as the portal between the separation and the product.
// Points are in the stand-in renderer's garment space (1000 x 1100),
// clockwise from the bottom of the front neckline.

const TEE: [number, number][] = [
  [500, 155],
  [550, 145],
  [590, 110],
  [608, 62],
  [700, 85],
  [770, 100],
  [834, 120],
  [880, 180],
  [925, 265],
  [970, 352],
  [916, 396],
  [862, 440],
  [828, 414],
  [792, 396],
  [794, 560],
  [792, 800],
  [796, 1042],
  [650, 1048],
  [500, 1052],
  [350, 1048],
  [204, 1042],
  [208, 800],
  [206, 560],
  [208, 396],
  [172, 414],
  [138, 440],
  [84, 396],
  [30, 352],
  [75, 265],
  [120, 180],
  [166, 120],
  [230, 100],
  [300, 85],
  [392, 62],
  [410, 110],
  [450, 145],
];

export const TEE_BOX = { x: 30, y: 62, w: 940, h: 990, chestX: 500, chestY: 560 };

function resample(pts: [number, number][], n: number): [number, number][] {
  const closed = [...pts, pts[0]];
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < closed.length - 1; i++) {
    const d = Math.hypot(closed[i + 1][0] - closed[i][0], closed[i + 1][1] - closed[i][1]);
    seg.push(d);
    total += d;
  }
  const out: [number, number][] = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (acc + seg[i] < target) {
      acc += seg[i];
      i++;
    }
    const t = (target - acc) / seg[i];
    out.push([
      closed[i][0] + (closed[i + 1][0] - closed[i][0]) * t,
      closed[i][1] + (closed[i + 1][1] - closed[i][1]) * t,
    ]);
  }
  return out;
}

const N = 144;
const teeN = resample(TEE, N);

/** Rectangle expressed with the same point count, starting top-centre, clockwise. */
function rectPts(x: number, y: number, w: number, h: number) {
  return resample(
    [
      [x + w / 2, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
      [x, y],
    ],
    N,
  );
}

export interface PortalGeom {
  rect: { x: number; y: number; w: number; h: number };
  /** tee placement: stage px per garment unit, and where the chest lands */
  scale: number;
  cx: number;
  cy: number;
}

/**
 * mx/my: 0 = rectangle, 1 = tee, per axis (the vertical settles first so the
 * tee appears to unfold out of the strip). grow: extra scale about the chest.
 */
export function portalPolygon(g: PortalGeom, mx: number, my: number, grow: number) {
  const r = rectPts(g.rect.x, g.rect.y, g.rect.w, g.rect.h);
  const s = g.scale * grow;
  let out = 'polygon(';
  for (let k = 0; k < N; k++) {
    const tx = g.cx + (teeN[k][0] - TEE_BOX.chestX) * s;
    const ty = g.cy + (teeN[k][1] - TEE_BOX.chestY) * s;
    const x = r[k][0] + (tx - r[k][0]) * mx;
    const y = r[k][1] + (ty - r[k][1]) * my;
    out += `${x.toFixed(2)}px ${y.toFixed(2)}px${k < N - 1 ? ',' : ')'}`;
  }
  return out;
}
