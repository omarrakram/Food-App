/**
 * Procedural denim.
 *
 * A 3/1 right-hand twill, woven yarn by yarn: indigo warp over three picks,
 * under one, stepping one end per pick. Wear is modelled the way denim
 * actually fades — ring-dyed yarn loses indigo at its high points first,
 * showing the undyed core — so a wash map drives colour per yarn rather than
 * being painted over the top.
 *
 * This is a material study. It is never presented as BE-INDIE photography.
 */
import { clamp01, fbm, hash2, mulberry32, noise2, smoothstep } from '../rng';
import type { DenimJob, Feature, Pt, RGB } from './types';

type C2D = OffscreenCanvasRenderingContext2D;

const MAP = 4; // wash map is 1/4 of output resolution

export function renderDenim(job: DenimJob): OffscreenCanvas {
  const ss = job.ss ?? 1;
  const OW = job.width;
  const OH = job.height;
  const W = Math.round(OW * ss);
  const H = Math.round(OH * ss);
  const rand = mulberry32(job.seed);
  const wash = job.wash;
  const features = job.features ?? [];

  /* ── 1. wash map ─────────────────────────────────────────────── */
  const mW = Math.ceil(OW / MAP) + 2;
  const mH = Math.ceil(OH / MAP) + 2;
  const mapCanvas = new OffscreenCanvas(mW, mH);
  const mctx = mapCanvas.getContext('2d', { willReadFrequently: true }) as C2D;
  const mimg = mctx.createImageData(mW, mH);
  const drapeH = new Float32Array(mW * mH);
  const ms = wash.mottleScale;
  const ds = job.drapeScale ?? 420;
  for (let my = 0; my < mH; my++) {
    for (let mx = 0; mx < mW; mx++) {
      const X = mx * MAP;
      const Y = my * MAP;
      // denim fades in warp-direction streaks, not blobs
      const streak = fbm(X / (ms * 0.3), Y / (ms * 2.4), job.seed + 3, 4);
      const broad = fbm(X / (ms * 1.8), Y / (ms * 1.8), job.seed + 4, 3);
      let f = wash.fade + (streak - 0.5) * 1.5 * wash.mottle + (broad - 0.5) * 1.3 * wash.mottle;
      if (wash.cloud) {
        const c = fbm(X / (ms * 3.2), Y / (ms * 3.2), job.seed + 7, 4);
        f += (smoothstep(0.32, 0.72, c) - 0.45) * wash.cloud;
      }
      let g = 0;
      if (wash.sponge) {
        const n = fbm(X / wash.sponge.scale, Y / wash.sponge.scale, job.seed + 13, 5);
        const blot = smoothstep(0.56, 0.64, n);
        // a sponge leaves a stippled print, not a clean blot
        const stip = noise2(X / 5.5, Y / 5.5, job.seed + 17);
        g = blot * (0.45 + 0.55 * smoothstep(0.25, 0.75, stip)) * wash.sponge.density;
      }
      const i = (my * mW + mx) * 4;
      mimg.data[i] = clamp01(f) * 255;
      mimg.data[i + 1] = clamp01(g) * 255;
      mimg.data[i + 2] = 128;
      mimg.data[i + 3] = 255;
      drapeH[my * mW + mx] = fbm(X / ds, Y / ds, job.seed + 31, 3);
    }
  }
  mctx.putImageData(mimg, 0, 0);
  mctx.save();
  mctx.scale(1 / MAP, 1 / MAP);
  for (const ft of features) drawMapFeature(mctx, ft, rand);
  mctx.restore();
  const mdata = mctx.getImageData(0, 0, mW, mH).data;

  const fadeM = new Float32Array(mW * mH);
  const greyM = new Float32Array(mW * mH);
  const lightM = new Float32Array(mW * mH);
  const la = job.light?.angle ?? -2.3;
  const ls = job.light?.strength ?? 0.28;
  const Lx = Math.cos(la);
  const Ly = Math.sin(la);
  const drape = job.drape ?? 0.8;
  const vig = job.vignette ?? 0.22;
  for (let my = 0; my < mH; my++) {
    for (let mx = 0; mx < mW; mx++) {
      const k = my * mW + mx;
      fadeM[k] = mdata[k * 4] / 255;
      greyM[k] = mdata[k * 4 + 1] / 255;
      const hl = drapeH[my * mW + Math.max(0, mx - 1)];
      const hr = drapeH[my * mW + Math.min(mW - 1, mx + 1)];
      const hu = drapeH[Math.max(0, my - 1) * mW + mx];
      const hd = drapeH[Math.min(mH - 1, my + 1) * mW + mx];
      const slope = ((hr - hl) * -Lx + (hd - hu) * -Ly) * 14;
      const nx = (mx * MAP) / OW - 0.5;
      const ny = (my * MAP) / OH - 0.5;
      const dir = 1 + (nx * Lx + ny * Ly) * -ls * 1.6;
      const v = 1 - vig * (nx * nx + ny * ny) * 2.2;
      const l = (mdata[k * 4 + 2] / 128) * (1 + slope * drape) * dir * v;
      lightM[k] = l < 0.5 ? 0.5 : l > 1.45 ? 1.45 : l;
    }
  }

  /* ── 2. weave ────────────────────────────────────────────────── */
  const pw = job.pitch * ss;
  const ph = job.pitch * ss * 1.45;
  const iOf = new Int32Array(W);
  const uOf = new Float32Array(W);
  {
    let i = 0;
    let start = 0;
    let w = pw * (0.9 + 0.2 * rand());
    for (let x = 0; x < W; x++) {
      while (x >= start + w) {
        start += w;
        i++;
        w = pw * (0.88 + 0.24 * rand());
      }
      iOf[x] = i;
      uOf[x] = (x + 0.5 - start) / w;
    }
  }
  const jOf = new Int32Array(H);
  const vOf = new Float32Array(H);
  {
    let j = 0;
    let start = 0;
    let h = ph * (0.9 + 0.2 * rand());
    for (let y = 0; y < H; y++) {
      while (y >= start + h) {
        start += h;
        j++;
        h = ph * (0.9 + 0.2 * rand());
      }
      jOf[y] = j;
      vOf[y] = (y + 0.5 - start) / h;
    }
  }
  const nWarp = iOf[W - 1] + 2;
  const tone = new Float32Array(nWarp);
  const fOff = new Float32Array(nWarp);
  for (let i = 0; i < nWarp; i++) {
    tone[i] = 0.9 + 0.2 * rand();
    fOff[i] = (rand() - 0.5) * 0.16;
  }
  const slubStep = ph * 1.6;
  const nS = Math.ceil(H / slubStep) + 2;
  const slub = new Float32Array(nWarp * nS);
  for (let i = 0; i < nWarp; i++) {
    for (let k = 0; k < nS; k++) slub[i * nS + k] = noise2(i * 3.71, k * 0.42, job.seed + 5);
  }
  // yarn wander: no warp end runs perfectly straight
  const wob = new Float32Array(nWarp * nS);
  for (let i = 0; i < nWarp; i++) {
    for (let k = 0; k < nS; k++) wob[i * nS + k] = noise2(i * 5.31, k * 0.37, job.seed + 9) - 0.5;
  }
  const nWeft = jOf[H - 1] + 2;
  const weftTone = new Float32Array(nWeft);
  for (let j = 0; j < nWeft; j++) weftTone[j] = 0.92 + 0.14 * rand();

  // fray / hem
  const fray = features.find((f): f is Extract<Feature, { kind: 'fray' }> => f.kind === 'fray');
  const hang = new Float32Array(nWarp);
  const hangPhase = new Float32Array(nWarp);
  if (fray) {
    for (let i = 0; i < nWarp; i++) {
      const r = rand();
      hang[i] = rand() < 0.6 ? fray.length * ss * (0.2 + 0.8 * Math.pow(r, 0.8)) : fray.length * ss * 0.1 * r;
      hangPhase[i] = rand() * 6.28;
    }
  }

  const [wr, wg, wb] = wash.warp;
  const [fr, fg, fb] = wash.warpFaded;
  const [cr, cg, cb] = wash.core;
  const [er, eg, eb] = wash.weft;
  const sp = wash.sponge?.colour ?? [140, 144, 150];
  const PI = Math.PI;
  // fibre striations only resolve when the yarn is big enough to see them
  const fq = Math.max(1.5, pw / 3.2);
  const big = pw > 6;
  const fibre = big ? 0.12 : 0.05;
  const profK = big ? 0.45 : 0.5;
  const twistK = (ph * 3) / pw * 0.35;
  const weftSink = big ? 0.16 : 0.08;
  const wobAmt = big ? 0.42 : 0.14;
  const weftHide = big ? 1 : 0.3;

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as C2D;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const inv = 1 / (MAP * ss);

  for (let y = 0; y < H; y++) {
    const j = jOf[y];
    const v = vOf[y];
    const fy = y * inv;
    const my0 = fy | 0;
    const ty = fy - my0;
    const kS = y / slubStep;
    const kS0 = kS | 0;
    const tS = kS - kS0;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const i = iOf[x];
      const u = uOf[x];

      // bilinear map sample
      const fx = x * inv;
      const mx0 = fx | 0;
      const tx = fx - mx0;
      const a = my0 * mW + mx0;
      const b = a + mW;
      const w00 = (1 - tx) * (1 - ty);
      const w10 = tx * (1 - ty);
      const w01 = (1 - tx) * ty;
      const w11 = tx * ty;
      const fade = fadeM[a] * w00 + fadeM[a + 1] * w10 + fadeM[b] * w01 + fadeM[b + 1] * w11;
      const grey = greyM[a] * w00 + greyM[a + 1] * w10 + greyM[b] * w01 + greyM[b + 1] * w11;
      const light = lightM[a] * w00 + lightM[a + 1] * w10 + lightM[b] * w01 + lightM[b + 1] * w11;

      let over = ((i + j) & 3) !== 0;
      let bgPix = false;
      let loose = 0; // 0 = woven, >0 = hanging thread

      if (fray) {
        const ox = x / ss;
        const edge = (fray.y + (noise2(ox / 38, 0.5, job.seed + 41) - 0.5) * 22) * ss;
        const dy = y - edge;
        if (dy > -16 * ss && dy <= 0) {
          // weft pulled out near the cut: warp ends only, with gaps
          if (hash2(j, 9, job.seed) < smoothstep(-16 * ss, 0, dy) * 0.9) over = true;
        } else if (dy > 0) {
          if (dy < hang[i]) {
            loose = dy / hang[i];
            over = true;
          } else bgPix = true;
        }
      }

      let R: number;
      let G: number;
      let B: number;
      let h: number;
      if (bgPix) {
        d[o] = fray!.bg[0];
        d[o + 1] = fray!.bg[1];
        d[o + 2] = fray!.bg[2];
        d[o + 3] = 255;
        continue;
      }
      const sl = slub[i * nS + kS0] * (1 - tS) + slub[i * nS + kS0 + 1] * tS;
      if (over) {
        const p = ((i + j) & 3) - 1;
        const s = loose > 0 ? 0.5 : (Math.max(p, 0) + v) / 3;
        // the float pinches where it dives under a pick
        const taper = loose > 0 ? 1 : Math.pow(Math.sin(PI * s), big ? 0.18 : 0.3);
        const wid = big
          ? (0.94 + 0.14 * sl) * (loose > 0 ? 0.5 - loose * 0.2 : 0.9 + 0.1 * taper)
          : (0.84 + 0.24 * sl) * (loose > 0 ? 0.5 - loose * 0.2 : 0.72 + 0.28 * taper);
        let uu = u + (wob[i * nS + kS0] * (1 - tS) + wob[i * nS + kS0 + 1] * tS) * wobAmt;
        if (loose > 0) uu += Math.sin(y / (9 * ss) + hangPhase[i]) * 0.35 * loose;
        uu = (uu - 0.5) / wid + 0.5;
        if (uu <= 0 || uu >= 1) {
          if (loose > 0) {
            d[o] = fray!.bg[0];
            d[o + 1] = fray!.bg[1];
            d[o + 2] = fray!.bg[2];
            d[o + 3] = 255;
            continue;
          }
          h = 0;
        } else {
          const prof = Math.pow(Math.sin(PI * uu), profK);
          h = prof * (0.3 + 0.7 * taper);
        }
        const twist = Math.sin((uu + s * twistK) * PI * fq + fOff[i] * 40);
        let lf = fade + fOff[i] + (sl - 0.5) * 0.24 + loose * 0.8;
        lf = lf * (0.5 + 0.8 * h);
        const t1 = smoothstep(0, 0.8, lf);
        R = wr + (fr - wr) * t1;
        G = wg + (fg - wg) * t1;
        B = wb + (fb - wb) * t1;
        const t2 = smoothstep(0.6, 1.05, lf) * 0.85;
        R += (cr - R) * t2;
        G += (cg - G) * t2;
        B += (cb - B) * t2;
        if (grey > 0.001) {
          const gg = grey * (0.55 + 0.45 * h);
          R += (sp[0] - R) * gg;
          G += (sp[1] - G) * gg;
          B += (sp[2] - B) * gg;
        }
        const tn = tone[i];
        const floor = big ? 0.42 : 0.26;
        const shade = loose > 0 ? (0.7 + 0.35 * h) * tn : (floor + (1.08 - floor) * h + fibre * twist * h) * tn;
        R *= shade;
        G *= shade;
        B *= shade;
      } else {
        const prof = Math.pow(Math.sin(PI * v), big ? 0.45 : 0.5);
        const endsU = Math.pow(Math.sin(PI * u), big ? 0.35 : 0.4);
        h = prof * (0.35 + 0.65 * endsU) * 0.9;
        const tw = Math.sin((v + u * 0.5) * PI * fq * 0.8 + j);
        const wt = weftTone[j] * (1 + fade * 0.12) * (big ? 0.78 + 0.34 * hash2(i, j, job.seed + 3) : 1);
        R = er * wt;
        G = eg * wt;
        B = eb * wt;
        // weft picks up a blue cast from the surrounding warp
        R += (fr - R) * 0.14;
        G += (fg - G) * 0.14;
        B += (fb - B) * 0.14;
        // the pick sits below the floats: shadowed, and partly hidden by
        // the neighbouring warp yarns bulging over it
        const hide = smoothstep(0.2, 0.44, Math.abs(u - 0.5)) * weftHide * 0.8;
        const wf = big ? 0.42 : 0.3;
        const shade = (wf + (1.02 - wf) * h + fibre * 0.8 * tw * h) * (1 - weftSink) * (1 - hide * 0.6);
        R *= shade;
        G *= shade;
        B *= shade;
      }
      const grain = 1 + (hash2(x, y, job.seed) - 0.5) * 0.09;
      const lg = light * grain;
      d[o] = R * lg;
      d[o + 1] = G * lg;
      d[o + 2] = B * lg;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (big) {
    // a lens never resolves yarn as crisply as a rasteriser does
    const soft = new OffscreenCanvas(W, H);
    const sc = soft.getContext('2d') as C2D;
    sc.filter = `blur(${Math.min(1.4, pw / 6) * ss}px)`;
    sc.drawImage(canvas, 0, 0);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(soft, 0, 0);
    ctx.globalAlpha = 1;
  }

  /* ── 3. construction details ─────────────────────────────────── */
  ctx.save();
  ctx.scale(ss, ss);
  if (job.pitch >= 12) drawHairs(ctx, OW, OH, wash.core, rand);
  for (const ft of features) drawFeature(ctx, ft, wash.thread, rand, ss);
  ctx.restore();

  /* ── 4. depth of field ───────────────────────────────────────── */
  if (job.dof) {
    const { focus, band, blur } = job.dof;
    const tmp = new OffscreenCanvas(W, H);
    const t = tmp.getContext('2d') as C2D;
    t.filter = `blur(${blur * ss}px)`;
    t.drawImage(canvas, 0, 0);
    t.filter = 'none';
    t.globalCompositeOperation = 'destination-in';
    const g = t.createLinearGradient(0, 0, 0, H);
    const f0 = clamp01(focus - band / 2);
    const f1 = clamp01(focus + band / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(Math.max(0, f0 - 0.18), 'rgba(0,0,0,0.85)');
    g.addColorStop(f0, 'rgba(0,0,0,0)');
    g.addColorStop(f1, 'rgba(0,0,0,0)');
    g.addColorStop(Math.min(1, f1 + 0.18), 'rgba(0,0,0,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    t.fillStyle = g;
    t.fillRect(0, 0, W, H);
    ctx.drawImage(tmp, 0, 0);
  }

  if (ss === 1) return canvas;
  const out = new OffscreenCanvas(OW, OH);
  const octx = out.getContext('2d') as C2D;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(canvas, 0, 0, OW, OH);
  return out;
}

/* ── map features: wear (R), height/light (B) ─────────────────── */

function strokePath(c: C2D, pts: Pt[], off = 0) {
  c.beginPath();
  const p = off ? offsetPath(pts, off) : pts;
  p.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
}

export function offsetPath(pts: Pt[], off: number): Pt[] {
  return pts.map(([x, y], k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [x - (dy / l) * off, y + (dx / l) * off] as Pt;
  });
}

/** Resample a polyline at a fixed spacing: returns points + tangents. */
export function walk(pts: Pt[], step: number) {
  const out: { x: number; y: number; a: number }[] = [];
  let carry = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k];
    const [x1, y1] = pts[k + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    let s = carry;
    while (s <= len) {
      const t = s / len;
      out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a });
      s += step;
    }
    carry = s - len;
  }
  return out;
}

function drawMapFeature(c: C2D, ft: Feature, rand: () => number) {
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  switch (ft.kind) {
    case 'whiskers': {
      c.globalCompositeOperation = 'lighter';
      c.filter = 'blur(1.2px)';
      const st = ft.strength ?? 1;
      for (let k = 0; k < ft.count; k++) {
        const t = ft.count === 1 ? 0.5 : k / (ft.count - 1);
        const ang = ft.angle + (t - 0.5) * ft.spread + (rand() - 0.5) * 0.12;
        const len = ft.length * (0.55 + 0.45 * rand());
        const sx = ft.x + (rand() - 0.5) * 30;
        const sy = ft.y + (t - 0.5) * 90;
        const bend = (rand() - 0.5) * 0.5;
        const segs = 8;
        for (let s = 0; s < segs; s++) {
          const u0 = s / segs;
          const u1 = (s + 1) / segs;
          const p = (u: number): Pt => [
            sx + Math.cos(ang + bend * u) * len * u,
            sy + Math.sin(ang + bend * u) * len * u,
          ];
          const [x0, y0] = p(u0);
          const [x1, y1] = p(u1);
          const taper = Math.sin(Math.PI * (u0 + 0.5 / segs));
          c.strokeStyle = `rgb(${Math.round(110 * st * taper)},0,0)`;
          c.lineWidth = 4 + 7 * taper;
          c.beginPath();
          c.moveTo(x0, y0);
          c.lineTo(x1, y1);
          c.stroke();
        }
      }
      break;
    }
    case 'wear': {
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(ft.x, ft.y, 0, ft.x, ft.y, 1);
      g.addColorStop(0, `rgb(${Math.round(255 * ft.strength)},0,0)`);
      g.addColorStop(1, 'rgb(0,0,0)');
      c.translate(ft.x, ft.y);
      c.scale(ft.rx, ft.ry);
      c.translate(-ft.x, -ft.y);
      c.fillStyle = g;
      c.beginPath();
      c.arc(ft.x, ft.y, 1, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'seam': {
      const ridge = ft.ridge ?? 26;
      const side = ft.side ?? 1;
      if (ridge > 0) {
        // raised seam allowance
        c.globalCompositeOperation = 'lighter';
        c.filter = `blur(${ridge * 0.35}px)`;
        c.strokeStyle = 'rgb(46,0,34)';
        c.lineWidth = ridge;
        strokePath(c, ft.pts);
        // roping: diagonal wear marks along the ridge
        c.filter = 'blur(3px)';
        const marks = walk(ft.pts, ridge * 1.25);
        for (const m of marks) {
          const cos = Math.cos(m.a);
          const sin = Math.sin(m.a);
          const len = ridge * (0.5 + 0.4 * rand());
          c.strokeStyle = `rgb(${Math.round(60 + 70 * rand())},0,0)`;
          c.lineWidth = ridge * 0.28;
          c.beginPath();
          c.moveTo(m.x - cos * len * 0.4 + sin * ridge * 0.4, m.y - sin * len * 0.4 - cos * ridge * 0.4);
          c.lineTo(m.x + cos * len * 0.4 - sin * ridge * 0.4, m.y + sin * len * 0.4 + cos * ridge * 0.4);
          c.stroke();
        }
        // the overlap casts a thin shadow on one side
        c.globalCompositeOperation = 'multiply';
        c.filter = 'blur(3px)';
        c.strokeStyle = 'rgb(255,255,70)';
        c.lineWidth = 7;
        strokePath(c, ft.pts, side * ridge * 0.55);
      }
      break;
    }
    case 'edge': {
      const side = ft.side ?? 1;
      const depth = ft.depth ?? 22;
      c.globalCompositeOperation = 'lighter';
      c.filter = 'blur(4px)';
      c.strokeStyle = 'rgb(120,0,40)';
      c.lineWidth = 14;
      strokePath(c, ft.pts);
      c.globalCompositeOperation = 'multiply';
      c.filter = `blur(${depth * 0.5}px)`;
      c.strokeStyle = 'rgb(255,255,40)';
      c.lineWidth = depth;
      strokePath(c, ft.pts, side * depth * 0.7);
      break;
    }
    case 'fold': {
      c.filter = `blur(${ft.width * 0.35}px)`;
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgb(${Math.round(70 * ft.depth)},0,${Math.round(60 * ft.depth)})`;
      c.lineWidth = ft.width * 0.5;
      strokePath(c, ft.pts, -ft.width * 0.25);
      c.globalCompositeOperation = 'multiply';
      c.strokeStyle = `rgb(255,255,${Math.round(255 - 150 * ft.depth)})`;
      c.lineWidth = ft.width * 0.6;
      strokePath(c, ft.pts, ft.width * 0.35);
      break;
    }
    case 'button':
    case 'rivet': {
      c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(ft.x, ft.y, ft.r * 0.9, ft.x, ft.y, ft.r * 2.4);
      g.addColorStop(0, 'rgb(140,0,0)');
      g.addColorStop(1, 'rgb(0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(ft.x, ft.y, ft.r * 2.4, 0, Math.PI * 2);
      c.fill();
      break;
    }
    default:
      break;
  }
  c.restore();
}

/* ── sharp features on the woven canvas ──────────────────────── */

/** Stray surface fibres — only visible at macro scale. */
function drawHairs(c: C2D, W: number, H: number, core: RGB, rand: () => number) {
  c.save();
  c.lineCap = 'round';
  const n = Math.round((W * H) / 2600);
  for (let k = 0; k < n; k++) {
    const x = rand() * W;
    const y = rand() * H;
    const l = 8 + rand() * 38;
    const a = rand() * Math.PI * 2;
    c.strokeStyle = rgb(core, 0.9 + rand() * 0.2, 0.08 + rand() * 0.22);
    c.lineWidth = 0.5 + rand() * 0.7;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + Math.cos(a + 1) * l * 0.6, y + Math.sin(a + 1) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
    c.stroke();
  }
  c.restore();
}

function rgb([r, g, b]: RGB, k = 1, a = 1) {
  return `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;
}

function drawStitchLine(c: C2D, pts: Pt[], thread: RGB, len: number, rand: () => number) {
  const gap = len * 0.28;
  const marks = walk(pts, len + gap);
  const w = Math.max(2.2, len * 0.3);
  for (const m of marks) {
    const jx = (rand() - 0.5) * 0.8;
    const jy = (rand() - 0.5) * 0.8;
    const ja = (rand() - 0.5) * 0.06;
    c.save();
    c.translate(m.x + jx, m.y + jy);
    c.rotate(m.a + ja);
    // needle holes
    c.fillStyle = 'rgba(0,0,8,0.55)';
    c.beginPath();
    c.ellipse(-gap * 0.5, 0, w * 0.32, w * 0.28, 0, 0, Math.PI * 2);
    c.fill();
    // cast shadow
    c.shadowColor = 'rgba(0,0,10,0.65)';
    c.shadowBlur = w * 0.9;
    c.shadowOffsetX = w * 0.25;
    c.shadowOffsetY = w * 0.45;
    const g = c.createLinearGradient(0, -w / 2, 0, w / 2);
    g.addColorStop(0, rgb(thread, 0.62));
    g.addColorStop(0.38, rgb(thread, 1.08));
    g.addColorStop(0.62, rgb(thread, 0.98));
    g.addColorStop(1, rgb(thread, 0.5));
    c.fillStyle = g;
    const l = len * (0.92 + rand() * 0.1);
    c.beginPath();
    c.roundRect(0, -w / 2, l, w, w / 2);
    c.fill();
    c.shadowColor = 'transparent';
    // twist of the plied thread
    c.strokeStyle = rgb(thread, 0.72, 0.55);
    c.lineWidth = Math.max(0.6, w * 0.12);
    for (let s = w * 0.6; s < l - w * 0.3; s += w * 0.55) {
      c.beginPath();
      c.moveTo(s, -w * 0.42);
      c.lineTo(s + w * 0.35, w * 0.42);
      c.stroke();
    }
    c.fillStyle = rgb([255, 255, 255], 1, 0.18);
    c.beginPath();
    c.roundRect(w * 0.3, -w * 0.28, l - w * 0.6, w * 0.16, w * 0.08);
    c.fill();
    c.restore();
  }
}

function drawMetal(c: C2D, x: number, y: number, r: number, kind: 'button' | 'rivet') {
  c.save();
  // shadow onto the cloth
  c.fillStyle = 'rgba(0,0,10,0.55)';
  c.filter = `blur(${r * 0.28}px)`;
  c.beginPath();
  c.arc(x + r * 0.18, y + r * 0.28, r * 1.02, 0, Math.PI * 2);
  c.fill();
  c.filter = 'none';
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.05, x, y, r);
  g.addColorStop(0, '#f4f5f6');
  g.addColorStop(0.35, '#bfc4ca');
  g.addColorStop(0.75, '#6f757c');
  g.addColorStop(1, '#3a3e44');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  // turned rings
  const rings = kind === 'button' ? 7 : 3;
  for (let k = 1; k <= rings; k++) {
    const rr = r * (0.22 + (0.72 * k) / rings);
    c.strokeStyle = k % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(20,24,30,0.22)';
    c.lineWidth = Math.max(0.6, r * 0.018);
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.stroke();
  }
  if (kind === 'button') {
    // rim
    c.strokeStyle = 'rgba(20,24,30,0.55)';
    c.lineWidth = r * 0.07;
    c.beginPath();
    c.arc(x, y, r * 0.8, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = r * 0.035;
    c.beginPath();
    c.arc(x, y, r * 0.86, Math.PI * 1.05, Math.PI * 1.6);
    c.stroke();
    // dome
    const dg = c.createRadialGradient(x - r * 0.2, y - r * 0.25, 0, x, y, r * 0.55);
    dg.addColorStop(0, 'rgba(255,255,255,0.75)');
    dg.addColorStop(0.5, 'rgba(210,214,220,0.15)');
    dg.addColorStop(1, 'rgba(40,44,50,0.25)');
    c.fillStyle = dg;
    c.beginPath();
    c.arc(x, y, r * 0.55, 0, Math.PI * 2);
    c.fill();
  }
  // specular
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = r * 0.06;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(x, y, r * 0.93, Math.PI * 1.15, Math.PI * 1.42);
  c.stroke();
  c.restore();
}

function drawFeature(c: C2D, ft: Feature, thread: RGB, rand: () => number, ss: number) {
  switch (ft.kind) {
    case 'seam': {
      const len = ft.stitch ?? 16;
      const th = ft.thread ?? thread;
      const gap = ft.gap ?? 20;
      if (ft.double) {
        drawStitchLine(c, offsetPath(ft.pts, -gap / 2), th, len, rand);
        drawStitchLine(c, offsetPath(ft.pts, gap / 2), th, len, rand);
      } else drawStitchLine(c, ft.pts, th, len, rand);
      break;
    }
    case 'edge': {
      const side = ft.side ?? 1;
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.globalCompositeOperation = 'multiply';
      c.strokeStyle = 'rgba(0,0,20,0.8)';
      c.filter = `blur(${1.5 * ss}px)`;
      c.lineWidth = 4;
      strokePath(c, ft.pts, side * 3);
      c.filter = 'none';
      c.globalCompositeOperation = 'screen';
      c.strokeStyle = 'rgba(150,170,205,0.35)';
      c.lineWidth = 2;
      strokePath(c, ft.pts, -side * 1.5);
      c.restore();
      break;
    }
    case 'button':
    case 'rivet':
      drawMetal(c, ft.x, ft.y, ft.r, ft.kind);
      break;
    case 'bartack': {
      const th = ft.thread ?? thread;
      c.save();
      c.translate(ft.x, ft.y);
      c.rotate(ft.angle);
      c.shadowColor = 'rgba(0,0,10,0.6)';
      c.shadowBlur = 4;
      c.shadowOffsetY = 2;
      for (let k = 0; k < ft.len; k += 2.1) {
        c.strokeStyle = rgb(th, 0.8 + rand() * 0.35);
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(k - ft.len / 2, -5 + rand());
        c.lineTo(k - ft.len / 2 + 1.2, 5 - rand());
        c.stroke();
      }
      c.restore();
      break;
    }
    case 'fray': {
      // a few loose white picks tangled at the cut
      c.save();
      c.lineCap = 'round';
      for (let k = 0; k < 70; k++) {
        const x0 = rand() * c.canvas.width / ss;
        const y0 = ft.y + (rand() - 0.2) * ft.length * 0.6;
        const l = 20 + rand() * 90;
        c.strokeStyle = `rgba(232,228,214,${0.25 + rand() * 0.5})`;
        c.lineWidth = 0.8 + rand() * 1.4;
        c.beginPath();
        c.moveTo(x0, y0);
        c.bezierCurveTo(
          x0 + (rand() - 0.5) * l,
          y0 + rand() * l * 0.6,
          x0 + (rand() - 0.5) * l,
          y0 + rand() * l,
          x0 + (rand() - 0.5) * l * 0.6,
          y0 + l * (0.4 + rand() * 0.6),
        );
        c.stroke();
      }
      c.restore();
      break;
    }
    default:
      break;
  }
}
