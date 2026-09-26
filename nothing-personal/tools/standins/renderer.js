// Procedural garment renderer used to generate stand-in imagery when the
// official Nothing Personal assets cannot be downloaded. Runs in Chromium
// (see scripts/render-standins.mjs). Height-field + lit fabric, no WebGL.

(() => {
  // ---------- noise ----------
  function mulberry(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeNoise(seed) {
    const rnd = mulberry(seed);
    const perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const grad = (h, x, y) => {
      const g = h & 7;
      const u = g < 4 ? x : y;
      const v = g < 4 ? y : x;
      return (g & 1 ? -u : u) + (g & 2 ? -2 * v : 2 * v);
    };
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    function n2(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = fade(x);
      const v = fade(y);
      const a = perm[X] + Y;
      const b = perm[X + 1] + Y;
      const l1 = grad(perm[a], x, y) + u * (grad(perm[b], x - 1, y) - grad(perm[a], x, y));
      const l2 =
        grad(perm[a + 1], x, y - 1) + u * (grad(perm[b + 1], x - 1, y - 1) - grad(perm[a + 1], x, y - 1));
      return (l1 + v * (l2 - l1)) * 0.35;
    }
    function fbm(x, y, oct = 5) {
      let s = 0;
      let a = 0.5;
      let f = 1;
      for (let i = 0; i < oct; i++) {
        s += a * n2(x * f, y * f);
        f *= 2.03;
        a *= 0.5;
      }
      return s;
    }
    return { n2, fbm, rnd };
  }

  const srgbToLin = (c) => Math.pow(c / 255, 2.2);
  const linToSrgb = (c) => Math.round(255 * Math.pow(Math.min(Math.max(c, 0), 1), 1 / 2.2));
  const hex = (h) => [1, 3, 5].map((i) => srgbToLin(parseInt(h.slice(i, i + 2), 16)));

  // view: { cx, cy, s, r } — garment point (cx,cy) maps to the canvas centre,
  // scaled by s and rotated by r radians.
  function layer(W, H, view, draw, blur = 0, off = [0, 0]) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + off[0], H / 2 + off[1]);
    ctx.rotate(view.r || 0);
    ctx.scale(view.s, view.s);
    ctx.translate(-view.cx, -view.cy);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    if (draw) draw(ctx);
    ctx.restore();
    if (!blur) return ctx.getImageData(0, 0, W, H).data;
    const c2 = document.createElement('canvas');
    c2.width = W;
    c2.height = H;
    const ctx2 = c2.getContext('2d');
    ctx2.fillStyle = '#000';
    ctx2.fillRect(0, 0, W, H);
    ctx2.filter = `blur(${blur}px)`;
    ctx2.drawImage(c, 0, 0);
    return ctx2.getImageData(0, 0, W, H).data;
  }
  const chan = (data, W, H) => {
    const out = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = data[i * 4] / 255;
    return out;
  };

  function boxBlur(src, W, H, r) {
    const tmp = new Float32Array(W * H);
    const out = new Float32Array(W * H);
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < H; y++) {
      let acc = 0;
      const row = y * W;
      for (let x = -r; x <= r; x++) acc += src[row + Math.min(Math.max(x, 0), W - 1)];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = acc * inv;
        acc += src[row + Math.min(x + r + 1, W - 1)] - src[row + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(Math.max(y, 0), H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = acc * inv;
        acc += tmp[Math.min(y + r + 1, H - 1) * W + x] - tmp[Math.max(y - r, 0) * W + x];
      }
    }
    return out;
  }

  function toG(view, W, H) {
    const c = Math.cos(-(view.r || 0));
    const sn = Math.sin(-(view.r || 0));
    return (x, y) => {
      const px = (x - W / 2) / view.s;
      const py = (y - H / 2) / view.s;
      return [view.cx + c * px - sn * py, view.cy + sn * px + c * py];
    };
  }

  function segDist(px, py, f) {
    const dx = f.x2 - f.x1;
    const dy = f.y2 - f.y1;
    const L2 = dx * dx + dy * dy;
    let t = ((px - f.x1) * dx + (py - f.y1) * dy) / L2;
    const tc = Math.min(Math.max(t, 0), 1);
    const cx = f.x1 + dx * tc;
    const cy = f.y1 + dy * tc;
    return [Math.hypot(px - cx, py - cy), t];
  }

  /**
   * opts: {
   *  W,H, view:{x,y,s}, seed,
   *  silhouette(ctx), interior(ctx), raised(ctx), seams(ctx), bumps(ctx), stitches(ctx),
   *  folds:[{x1,y1,x2,y2,w,a}], material:{...}, background:{...}|null, light:[x,y,z]
   * }
   */
  function render(o) {
    const { W, H, view } = o;
    const N = makeNoise(o.seed || 7);
    const m = o.material;
    const s = view.s;
    const G = toG(view, W, H);

    const maskRaw = chan(layer(W, H, view, o.silhouette), W, H);
    const b1 = chan(layer(W, H, view, o.silhouette, 5 * s), W, H);
    const b2 = chan(layer(W, H, view, o.silhouette, 16 * s), W, H);
    const b3 = chan(layer(W, H, view, o.silhouette, 48 * s), W, H);
    const interior = o.interior ? chan(layer(W, H, view, o.interior, 3 * s), W, H) : null;
    const raised = o.raised ? chan(layer(W, H, view, o.raised, 2.2 * s), W, H) : null;
    const raisedSharp = o.raised ? chan(layer(W, H, view, o.raised), W, H) : null;
    const seams = o.seams ? chan(layer(W, H, view, o.seams, 1.2 * s), W, H) : null;
    const bumps = o.bumps ? chan(layer(W, H, view, o.bumps, 2.5 * s), W, H) : null;
    const bumpsSharp = o.bumps ? chan(layer(W, H, view, o.bumps), W, H) : null;
    const stitches = o.stitches ? chan(layer(W, H, view, o.stitches, 0.35 * s), W, H) : null;
    const fray = o.fray ? chan(layer(W, H, view, o.fray, 0.4 * s), W, H) : null;

    // height field
    const Hf = new Float32Array(W * H);
    const folds = o.folds || [];
    const P = (m.puff ?? 10) * s;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (b3[i] < 0.02 && maskRaw[i] < 0.01) continue;
        const [gx, gy] = G(x, y);
        let h = Math.min(1, b1[i] * 0.5 + b2[i] * 0.32 + b3[i] * 0.18);
        h = h * h * (3 - 2 * h) * P;
        for (let k = 0; k < folds.length; k++) {
          const f = folds[k];
          const [d, t] = segDist(gx, gy, f);
          if (d > f.w * 3) continue;
          const tc = Math.min(Math.max(t, 0), 1);
          const endFade = Math.pow(Math.sin(Math.PI * tc), 0.6);
          h += f.a * s * Math.exp(-(d * d) / (f.w * f.w)) * endFade;
        }
        h += N.fbm(gx * 0.0045, gy * 0.0045, 4) * (m.lowNoise ?? 14) * s;
        if (m.wrinkle) {
          const wx = gx + N.n2(gx * 0.003 + 7, gy * 0.003) * 120;
          const wy = gy + N.n2(gx * 0.003, gy * 0.003 + 3) * 120;
          const [fx, fy] = m.wrinkleFreq || [0.006, 0.012];
          let r1 = 1 - Math.abs(N.n2(wx * fx, wy * fy) * 2.2);
          let r2 = 1 - Math.abs(N.n2(wx * fx * 2.3 + 17, wy * fy * 2.3) * 2.2);
          r1 = Math.max(0, r1);
          r2 = Math.max(0, r2);
          const mask = Math.min(1, b2[i] * 1.3);
          const loc = Math.min(1, Math.max(0, N.n2(gx * 0.0025 + 31, gy * 0.0025 - 9) * 2.4 + 0.45));
          h += (Math.pow(r1, m.wrinklePow ?? 8) + Math.pow(r2, 10) * 0.35) * m.wrinkle * s * mask * loc;
        }
        h += N.fbm(gx * 0.02 + 11, gy * 0.02 - 3, 3) * (m.midNoise ?? 3) * s;
        if (raised) h += raised[i] * (m.raise ?? 4) * s;
        if (seams) h -= seams[i] * (m.seamDepth ?? 2.2) * s;
        if (bumps) h += bumps[i] * (m.bumpHeight ?? 5) * s;
        Hf[i] = h;
      }
    }
    const Hb = boxBlur(Hf, W, H, Math.round(14 * s));

    const out = new ImageData(W, H);
    const d = out.data;
    const L = o.light || [-0.42, -0.58, 0.7];
    const Ll = Math.hypot(...L);
    const lx = L[0] / Ll;
    const ly = L[1] / Ll;
    const lz = L[2] / Ll;
    const albedo = hex(m.color);
    const sheenCol = hex(m.sheenColor || '#9a9790');
    const stitchCol = hex(m.stitchColor || '#c8894a');
    const altCol = m.altColor ? hex(m.altColor) : albedo;
    const wrap = m.wrap ?? 0.35;

    // background
    const bg = o.background;
    let shadow = null;
    if (bg) {
      shadow = chan(
        layer(W, H, view, o.silhouette, bg.shadow.blur * s, [bg.shadow.dx * s, bg.shadow.dy * s]),
        W,
        H,
      );
    }
    const paper = bg ? hex(bg.color) : null;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const j = i * 4;
        const [gx, gy] = G(x, y);
        // edge wobble: resample mask with small offset
        let a = maskRaw[i];
        let fr = 0;
        if (fray) {
          fr = fray[i];
          a = Math.max(a, fr * 0.95);
        }

        let br = 0;
        let bgc = 0;
        let bb = 0;
        if (bg) {
          const v =
            1 -
            (m.vignette ?? 0.22) *
              Math.pow(Math.hypot((x / W - 0.5) * 1.1, (y / H - 0.45) * 0.9), 2) *
              2.2;
          const fib = 1 + N.fbm(gx * 0.01, gy * 0.01, 3) * 0.05 + N.n2(gx * 0.9, gy * 0.35) * 0.012;
          const sh = 1 - shadow[i] * bg.shadow.opacity;
          br = paper[0] * v * fib * sh;
          bgc = paper[1] * v * fib * sh;
          bb = paper[2] * v * fib * sh;
        }

        if (a <= 0.001) {
          if (bg) {
            d[j] = linToSrgb(br);
            d[j + 1] = linToSrgb(bgc);
            d[j + 2] = linToSrgb(bb);
            d[j + 3] = 255;
          }
          continue;
        }
        const xl = Math.max(x - 1, 0);
        const xr = Math.min(x + 1, W - 1);
        const yu = Math.max(y - 1, 0);
        const yd = Math.min(y + 1, H - 1);
        let nx = -(Hf[y * W + xr] - Hf[y * W + xl]) * 0.5;
        let ny = -(Hf[yd * W + x] - Hf[yu * W + x]) * 0.5;

        // micro texture as normal perturbation + albedo variation
        let alb = 1;
        let tint = 0;
        let weft = 0;
        const tex = m.texture;
        if (tex === 'jersey') {
          const k = N.n2(gx * 1.9, gy * 1.1);
          nx += k * 0.12;
          ny += N.n2(gx * 1.1 + 40, gy * 1.9) * 0.12;
          alb *= 1 + N.fbm(gx * 0.03, gy * 0.03, 3) * 0.1;
        } else if (tex === 'linen') {
          const th = N.n2(gx * 0.08, gy * 2.4) * 0.5 + N.n2(gx * 0.25, gy * 5.2) * 0.25;
          const tv = N.n2(gx * 2.4, gy * 0.08) * 0.5 + N.n2(gx * 5.2, gy * 0.25) * 0.25;
          const slub = Math.max(0, N.n2(gx * 0.04, gy * 1.3) - 0.12) * 1.6;
          ny += th * 0.35;
          nx += tv * 0.35;
          alb *= 1 + th * 0.16 + tv * 0.12 + slub * 0.18;
          alb *= 1 + N.fbm(gx * 0.006, gy * 0.006, 3) * 0.12;
        } else if (tex === 'denim') {
          const tw = Math.sin((gx + gy * 0.55) * 1.35 + N.n2(gx * 0.05, gy * 0.05) * 3);
          nx += tw * 0.08;
          ny += tw * 0.05;
          const speck = N.n2(gx * 1.7, gy * 0.6);
          weft = Math.max(0, speck - 0.05) * 1.4 + Math.max(0, tw) * 0.12;
          const fade = N.fbm(gx * 0.004 + 5, gy * 0.006, 4);
          tint = Math.min(1, Math.max(0, fade * 0.9 + 0.08));
          alb *= 1 + N.n2(gx * 0.12, gy * 3.5) * 0.16;
        }

        const nzr = 1;
        const nl = Math.hypot(nx, ny, nzr);
        nx /= nl;
        ny /= nl;
        const nz = nzr / nl;
        const ndl = nx * lx + ny * ly + nz * lz;
        const diff = Math.min(Math.max((ndl + wrap) / (1 + wrap), 0), 1);
        const cav = Math.min(Math.max((Hb[i] - Hf[i]) * (m.cavity ?? 0.09) / s, 0), 1);
        const edge = Math.min(1, b1[i] * 1.4);
        let shade = (m.ambient ?? 0.32) * (1 - cav * 0.7) + diff * (m.key ?? 0.8) * (1 - cav * 0.35);
        shade *= 0.7 + 0.3 * edge;
        if (m.falloff) {
          const lpx = (m.lightPos?.[0] ?? 0.2) * W;
          const lpy = (m.lightPos?.[1] ?? 0.1) * H;
          const dd = Math.hypot(x - lpx, y - lpy) / Math.hypot(W, H);
          shade *= 1 + m.falloff * (0.45 - dd);
        }
        const sheen =
          Math.pow(Math.max(0, 1 - nz), m.sheenPow ?? 1.3) *
          (m.sheen ?? 0.3) *
          (0.55 + 0.45 * Math.max(0, nx * lx + ny * ly) / Math.max(1e-4, Math.hypot(nx, ny)));

        let r = albedo[0];
        let g = albedo[1];
        let b = albedo[2];
        if (tex === 'denim') {
          // abrasion lightens ridges; tint mixes toward faded blue; weft specks
          const ridge = Math.min(1, Math.max(0, (Hf[i] - Hb[i]) * 0.22 / s));
          const t2 = Math.min(1, tint * 0.4 + ridge * 1.1);
          r += (altCol[0] - r) * t2;
          g += (altCol[1] - g) * t2;
          b += (altCol[2] - b) * t2;
          const w = Math.min(1, weft * (0.45 + ridge));
          r += (0.62 - r) * w * 0.45;
          g += (0.64 - g) * w * 0.45;
          b += (0.66 - b) * w * 0.45;
        }
        r *= alb;
        g *= alb;
        b *= alb;

        let cr = r * shade + sheenCol[0] * sheen;
        let cg = g * shade + sheenCol[1] * sheen;
        let cb = b * shade + sheenCol[2] * sheen;

        if (interior) {
          const it = interior[i] * (m.interiorDark ?? 0.6);
          cr *= 1 - it;
          cg *= 1 - it;
          cb *= 1 - it;
        }
        if (raisedSharp && m.raisedTexture === 'rib') {
          const rib = Math.sin(Math.atan2(gy - (m.ribCenter?.[1] ?? 0), gx - (m.ribCenter?.[0] ?? 0)) * (m.ribCount ?? 260));
          const k = raisedSharp[i] * (0.9 + 0.1 * rib);
          const mix = raisedSharp[i];
          cr = cr * (1 - mix) + cr * k * mix;
          cg = cg * (1 - mix) + cg * k * mix;
          cb = cb * (1 - mix) + cb * k * mix;
        }
        if (bumpsSharp && bumpsSharp[i] > 0.01) {
          const bc = hex(m.bumpColor || '#d9d4c8');
          const rx = 2 * ndl * nx - lx;
          const ry = 2 * ndl * ny - ly;
          const rz = 2 * ndl * nz - lz;
          const spec = Math.pow(Math.max(0, rz), 18) * 0.9;
          const bs = bumpsSharp[i];
          const lit = 0.25 + diff * 0.9;
          cr = cr * (1 - bs) + (bc[0] * lit + spec) * bs;
          cg = cg * (1 - bs) + (bc[1] * lit + spec) * bs;
          cb = cb * (1 - bs) + (bc[2] * lit + spec) * bs;
          void rx;
          void ry;
        }
        if (stitches && stitches[i] > 0.01) {
          const st = stitches[i];
          const lit = 0.35 + diff * 0.8;
          cr = cr * (1 - st) + stitchCol[0] * lit * st;
          cg = cg * (1 - st) + stitchCol[1] * lit * st;
          cb = cb * (1 - st) + stitchCol[2] * lit * st;
        }
        if (fr > 0.01 && maskRaw[i] < 0.5) {
          const fc = hex(m.frayColor || '#b9b8b2');
          const lit = 0.45 + diff * 0.6;
          cr = fc[0] * lit;
          cg = fc[1] * lit;
          cb = fc[2] * lit;
        }
        // sensor noise
        const sn = 1 + (N.rnd() - 0.5) * 0.035;
        cr *= sn;
        cg *= sn;
        cb *= sn;

        if (bg) {
          cr = br * (1 - a) + cr * a;
          cg = bgc * (1 - a) + cg * a;
          cb = bb * (1 - a) + cb * a;
          d[j + 3] = 255;
        } else {
          d[j + 3] = Math.round(a * 255);
        }
        d[j] = linToSrgb(cr);
        d[j + 1] = linToSrgb(cg);
        d[j + 2] = linToSrgb(cb);
      }
    }
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
  }

  window.NPRender = { render, makeNoise };
})();
