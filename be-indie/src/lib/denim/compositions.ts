/**
 * Framings of a wash study. Generic denim construction only (a waistband, a
 * felled seam, a hem): a way of looking at the material, not a redraw of any
 * specific BE-INDIE garment.
 */
import { WASH, type WashId } from '../../brand/data';
import type { DenimJob, Feature, Pt } from './types';

export type Framing = 'waistband' | 'seam' | 'hem' | 'fray' | 'macro' | 'flat' | 'pocket';

const curve = (a: Pt, c: Pt, b: Pt, n = 24): Pt[] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n;
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]];
  });

export function study(
  wash: WashId,
  framing: Framing,
  W: number,
  H: number,
  seed = 7,
  opts: { pitch?: number; ss?: number; mirror?: boolean; top?: number } = {},
): DenimJob {
  const w = WASH[wash];
  const m = opts.mirror ? (x: number) => W - x : (x: number) => x;
  const P = (x: number, y: number): Pt => [m(x * W), y * H];
  const f: Feature[] = [];
  const u = Math.min(W, H) / 1080; // unit scale for construction sizes
  let pitch = opts.pitch ?? 3.4 * u;
  let dof: DenimJob['dof'];
  let drape = 0.9;

  switch (framing) {
    case 'waistband': {
      const top = opts.top ?? 0.1;
      const bot = top + 0.13 * (W / H) * 1.1;
      f.push({ kind: 'edge', pts: [P(-0.05, top), P(1.05, top + 0.004)], side: -1, depth: 26 * u });
      f.push({ kind: 'seam', pts: [P(-0.05, top + 0.018), P(1.05, top + 0.021)], ridge: 0, stitch: 15 * u });
      f.push({ kind: 'edge', pts: [P(-0.05, bot), P(1.05, bot + 0.006)], side: 1, depth: 30 * u });
      f.push({ kind: 'seam', pts: [P(-0.05, bot - 0.014), P(1.05, bot - 0.009)], ridge: 0, stitch: 15 * u });
      // fly: J-stitch dropping from the button
      const bx = 0.64;
      f.push({
        kind: 'seam',
        pts: [P(bx - 0.13, bot + 0.01), ...curve(P(bx - 0.13, top + 0.52), P(bx - 0.12, top + 0.64), P(bx - 0.02, top + 0.66))],
        ridge: 0,
        stitch: 15 * u,
      });
      f.push({ kind: 'fold', pts: [P(bx, bot + 0.02), P(bx + 0.005, 0.95)], width: 60 * u, depth: 0.7 });
      f.push({ kind: 'seam', pts: [P(bx + 0.02, bot + 0.02), P(bx + 0.025, 1.05)], ridge: 22 * u, side: 1, stitch: 15 * u });
      // front pocket opening
      const pk = curve(P(-0.02, bot + 0.005), P(0.18, bot + 0.02), P(0.26, top + 0.36));
      f.push({ kind: 'edge', pts: pk, side: 1, depth: 34 * u });
      f.push({ kind: 'seam', pts: curve(P(-0.02, bot + 0.03), P(0.16, bot + 0.045), P(0.23, top + 0.37)), ridge: 0, stitch: 15 * u });
      f.push({ kind: 'bartack', x: m(0.25 * W), y: (top + 0.36) * H, angle: 1.2, len: 28 * u });
      f.push({ kind: 'button', x: m(bx * W), y: ((top + bot) / 2) * H, r: 46 * u });
      f.push({ kind: 'whiskers', x: m((bx - 0.05) * W), y: Math.min(0.9, top + 0.68) * H, count: 6, length: 420 * u, angle: opts.mirror ? -0.35 : Math.PI + 0.35, spread: 0.9, strength: 0.9 });
      f.push({ kind: 'wear', x: m(0.2 * W), y: (top + 0.62) * H, rx: 380 * u, ry: 520 * u, strength: 0.28 });
      f.push({ kind: 'wear', x: m(bx * W), y: ((top + bot) / 2) * H, rx: 140 * u, ry: 60 * u, strength: 0.35 });
      break;
    }
    case 'seam': {
      f.push({ kind: 'fold', pts: [P(0.2, -0.05), P(0.26, 1.05)], width: 140 * u, depth: 0.5 });
      f.push({ kind: 'seam', pts: [P(0.6, -0.05), P(0.56, 1.05)], double: true, gap: 22 * u, ridge: 46 * u, side: 1, stitch: 17 * u });
      f.push({ kind: 'edge', pts: [P(0.62, -0.05), P(0.58, 1.05)], side: 1, depth: 18 * u });
      f.push({ kind: 'rivet', x: m(0.34 * W), y: 0.16 * H, r: 20 * u });
      f.push({ kind: 'wear', x: m(0.4 * W), y: 0.55 * H, rx: 300 * u, ry: 700 * u, strength: 0.22 });
      f.push({ kind: 'whiskers', x: m(0.56 * W), y: 0.38 * H, count: 4, length: 360 * u, angle: opts.mirror ? -0.2 : Math.PI + 0.2, spread: 0.6, strength: 0.7 });
      break;
    }
    case 'pocket': {
      // back-pocket corner and a felled yoke
      const pk: Pt[] = [P(0.18, -0.05), P(0.24, 0.62), P(0.5, 0.74), P(0.78, 0.62), P(0.84, -0.05)];
      f.push({ kind: 'edge', pts: pk, side: -1, depth: 30 * u });
      f.push({ kind: 'seam', pts: offsetIn(pk, 18 * u), ridge: 0, stitch: 15 * u });
      f.push({ kind: 'seam', pts: offsetIn(pk, 40 * u), ridge: 0, stitch: 15 * u });
      f.push({ kind: 'bartack', x: m(0.2 * W), y: 0.04 * H, angle: 1.5, len: 30 * u });
      f.push({ kind: 'bartack', x: m(0.82 * W), y: 0.04 * H, angle: 1.5, len: 30 * u });
      f.push({ kind: 'wear', x: m(0.5 * W), y: 0.4 * H, rx: 320 * u, ry: 380 * u, strength: 0.3 });
      f.push({ kind: 'fold', pts: [P(-0.05, 0.86), P(1.05, 0.82)], width: 110 * u, depth: 0.6 });
      break;
    }
    case 'hem': {
      f.push({ kind: 'fold', pts: [P(0.28, -0.05), P(0.24, 0.8)], width: 180 * u, depth: 0.9 });
      f.push({ kind: 'fold', pts: [P(0.7, -0.05), P(0.74, 0.8)], width: 150 * u, depth: 0.7 });
      f.push({ kind: 'seam', pts: [P(-0.05, 0.815), P(1.05, 0.8)], ridge: 0, stitch: 16 * u });
      f.push({ kind: 'edge', pts: [P(-0.05, 0.86), P(1.05, 0.845)], side: -1, depth: 30 * u });
      f.push({ kind: 'wear', x: m(0.5 * W), y: 0.86 * H, rx: 900 * u, ry: 60 * u, strength: 0.4 });
      break;
    }
    case 'fray': {
      f.push({ kind: 'fold', pts: [P(0.35, -0.05), P(0.3, 0.7)], width: 160 * u, depth: 0.6 });
      f.push({ kind: 'seam', pts: [P(0.72, -0.05), P(0.7, 0.66)], double: true, gap: 20 * u, ridge: 40 * u, stitch: 16 * u });
      f.push({ kind: 'wear', x: m(0.5 * W), y: 0.66 * H, rx: 900 * u, ry: 120 * u, strength: 0.35 });
      f.push({ kind: 'fray', y: 0.68 * H, length: 0.22 * H, bg: [236, 231, 219] });
      break;
    }
    case 'macro': {
      pitch = opts.pitch ?? 8 * u;
      drape = 1.4;
      dof = { focus: 0.52, band: 0.3, blur: 7 * u };
      f.push({ kind: 'seam', pts: [P(-0.1, 0.8), P(1.1, 0.36)], double: true, gap: 64 * u, ridge: 90 * u, side: 1, stitch: 52 * u });
      break;
    }
    case 'flat':
    default:
      f.push({ kind: 'wear', x: m(0.35 * W), y: 0.4 * H, rx: 500 * u, ry: 600 * u, strength: 0.18 });
      break;
  }

  return {
    key: `${wash}-${framing}-${W}x${H}-${seed}${opts.mirror ? '-m' : ''}-${pitch.toFixed(2)}`,
    width: W,
    height: H,
    pitch,
    ss: opts.ss ?? (pitch < 4 ? 2 : 1),
    seed,
    wash: w,
    features: f,
    drape,
    drapeScale: 380 * u,
    light: { angle: -2.25, strength: 0.34 },
    dof,
    vignette: 0.3,
  };
}

function offsetIn(pts: Pt[], d: number): Pt[] {
  // pocket outline is drawn clockwise; push the stitch toward the inside
  return pts.map(([x, y], k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [x + (dy / l) * d, y - (dx / l) * d] as Pt;
  });
}
