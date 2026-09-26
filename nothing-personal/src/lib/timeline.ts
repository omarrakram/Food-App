import gsap from 'gsap';
import type { Layout } from './layout';
import { portalPolygon, TEE_BOX, type PortalGeom } from './portal';
import { STRIP_COUNT } from '../Scenes';

export const DURATION = 16;

/**
 * Beat map (seconds). Every cut lands on one of these so audio can be synced
 * in the edit without guessing.
 */
export const BEATS = {
  stamp: 0.3,
  snap: 0.47,
  pull: 1.86,
  words: 2.0,
  nothing: 3.72,
  cat01: 4.5,
  cat109: 5.45,
  catRaw: 6.45,
  add: 7.08,
  cut: 7.5,
  cuts: 7.9,
  separate: 8.1,
  collapse: 9.3,
  redplate: 9.86,
  morph: 10.16,
  portal: 10.66,
  print: 11.5,
  strip: 13.45,
  credit: 13.86,
  end: 16,
};

interface Ctx {
  root: HTMLElement;
  L: Layout;
  cursorLive: boolean;
}

export function buildTimeline({ root, L, cursorLive }: Ctx) {
  const $ = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
  const $$ = (prefix: string) =>
    Array.from(root.querySelectorAll<HTMLElement>(`[data-k^="${prefix}"]`));
  const { W, H } = L;
  const cw = W / 100;
  const ch = H / 100;
  const B = BEATS;

  // reset everything a previous build may have touched
  const all = root.querySelectorAll('[data-k]');
  gsap.killTweensOf(all);
  gsap.set(all, { clearProps: 'transform,opacity,visibility,clipPath,color,backgroundColor' });

  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  const show = (el: Element | Element[], t: number) => tl.set(el, { visibility: 'visible' }, t);
  const hide = (el: Element | Element[], t: number) => tl.set(el, { visibility: 'hidden' }, t);
  const hidden = (...els: (Element | Element[])[]) =>
    gsap.set(els.flat(), { visibility: 'hidden' });

  const [s1, s2, s3, s4, s5, s6] = ['s1', 's2', 's3', 's4', 's5', 's6'].map($);
  const nav = $('nav');
  const chrome = [nav, $('tc'), $('tc-r')];
  const cursor = $('cursor');
  const ring = $('cursor-ring');

  gsap.set(s1, { visibility: 'visible' });
  hidden([s2, s3, s4, s5, s6], chrome, cursor, $('bag-1'), $('s3-add-1'));
  gsap.set([...chrome, cursor], { color: 'var(--ink)' });
  gsap.set($('bag-dot'), { opacity: 0 });
  gsap.set(cursor, { x: 70 * cw, y: 50 * ch });
  const inkChrome = (t: number) => tl.set([...chrome, cursor], { color: 'var(--ink)' }, t);
  const paperChrome = (t: number) => tl.set([...chrome, cursor], { color: 'var(--paper)' }, t);
  const click = (t: number) => {
    tl.set(ring, { opacity: 1, scale: 0.6 }, t);
    tl.to(ring, { scale: 2.4, opacity: 0, duration: 0.35, ease: 'expo.out' }, t);
  };

  // ================================================================ S1 HOOK
  const cover = $('s1-cover');
  const plateK = $('s1-k');
  const plateR = $('s1-r');
  const photo = $('s1-ph');
  const wipe = $('s1-wipe');
  const metaLines = Array.from($('s1-meta').children);
  const origin = `${L.word.cx} ${L.word.cy}`;
  hidden([plateK, plateR, photo], metaLines);
  // the photograph lives in a band that travels along the word, in reading
  // direction, and settles on its middle
  if (L.portrait) gsap.set(wipe, { attr: { x: 0, width: W, y: H, height: H * 0.4 } });
  else gsap.set(wipe, { attr: { x: -W * 0.42, width: W * 0.42, y: 0, height: H } });

  hide(cover, B.stamp);
  show([plateK, plateR, ...chrome], B.stamp);
  // plates land out of register, drift one frame, then snap
  tl.set(plateK, { x: 1.7 * cw, y: -0.9 * ch }, B.stamp);
  tl.set(plateR, { x: -0.5 * cw, y: 0.25 * ch }, B.stamp);
  tl.fromTo(
    plateR,
    { scale: 1.045, svgOrigin: origin },
    { scale: 1, svgOrigin: origin, duration: 0.14, ease: 'expo.out' },
    B.stamp,
  );
  tl.fromTo(
    plateK,
    { scale: 1.06, svgOrigin: origin },
    { scale: 1.01, svgOrigin: origin, duration: 0.14, ease: 'expo.out' },
    B.stamp,
  );
  tl.set(plateK, { x: 0.9 * cw, y: -0.45 * ch }, B.stamp + 0.09);
  tl.set(plateR, { x: 0.15 * cw, y: 0 }, B.stamp + 0.09);
  tl.set(plateK, { x: 0, y: 0, scale: 1 }, B.snap);
  tl.set(plateR, { x: 0, y: 0 }, B.snap);

  show(photo, B.snap);
  tl.to(
    wipe,
    { attr: L.portrait ? { y: H * 0.3 } : { x: W * 0.3 }, duration: 0.78, ease: 'expo.out' },
    B.snap + 0.04,
  );
  tl.fromTo(photo, { y: 4 * ch }, { y: -4 * ch, duration: 1.45, ease: 'sine.inOut' }, B.snap);
  metaLines.forEach((line, i) => show(line, 0.8 + i * 0.07));
  tl.fromTo(
    s1.querySelector('svg'),
    { scale: 1 },
    { scale: 1.025, transformOrigin: '58% 50%', duration: 1.4, ease: 'sine.inOut' },
    B.snap,
  );

  // the sheet is pulled away; S2 was underneath
  show(s2, B.pull - 0.02);
  tl.to(
    s1,
    {
      y: -H * 1.05,
      rotation: -1.6,
      transformOrigin: '0% 100%',
      duration: 0.44,
      ease: 'expo.inOut',
    },
    B.pull,
  );
  hide(s1, B.pull + 0.46);
  paperChrome(B.pull + 0.2);

  // ================================================================ S2 MANIFESTO
  const clip = $('s2-clip');
  const clipImg = $('s2-img');
  const w1 = $('s2-w1');
  const w2 = $('s2-w2');
  const un = $('s2-un');
  const n1 = $('s2-n1');
  const n2 = $('s2-n2');
  hidden(un, n1, n2);

  // a print travels up through the words: behind UNBOTHERED, under BY TRENDS.
  const inner = $('s2-inner');
  const w2i = $('s2-w2i');
  const clipFrom = 80 * ch;
  const clipTo = -104 * ch;
  tl.fromTo(
    clip,
    { y: clipFrom },
    { y: clipTo, duration: 1.95, ease: 'power1.inOut' },
    B.words - 0.05,
  );
  tl.fromTo(
    inner,
    { y: -clipFrom },
    { y: -clipTo, duration: 1.95, ease: 'power1.inOut' },
    B.words - 0.05,
  );
  tl.fromTo(clipImg, { yPercent: -14 }, { yPercent: 0, duration: 1.95 }, B.words - 0.05);
  // the type is placed, not animated: slid in, left alone, slid out
  tl.fromTo(w1, { x: 60 * cw }, { x: 0, duration: 0.5, ease: 'expo.out' }, B.words);
  tl.fromTo([w2, w2i], { x: -60 * cw }, { x: 0, duration: 0.5, ease: 'expo.out' }, B.words + 0.12);
  const exit1 = B.nothing - 0.56;
  const exit2 = B.nothing - 0.5;
  tl.to(w1, { x: -1.6 * cw, duration: exit1 - (B.words + 0.5) }, B.words + 0.5);
  tl.to([w2, w2i], { x: 1.6 * cw, duration: exit2 - (B.words + 0.62) }, B.words + 0.62);
  show(un, 2.62);
  tl.to(w1, { x: -110 * cw, duration: 0.34, ease: 'expo.in' }, exit1);
  tl.to([w2, w2i], { x: 110 * cw, duration: 0.34, ease: 'expo.in' }, exit2);
  hide(un, B.nothing - 0.3);
  // silence, then two words
  show(n1, B.nothing);
  show(n2, B.nothing + 0.32);

  // ================================================================ S3 CATALOGUE
  show(s3, B.cat01);
  hide(s2, B.cat01);
  inkChrome(B.cat01);
  const partA = $('s3a');
  const partB = $('s3b');
  const partC = $('s3c');
  const tee = $('s3-tee');
  const aLabel = $('s3a-label');
  const aName = $('s3a-name');
  hidden(partB, partC, aLabel, aName);

  // the garment threads itself through the 0
  tl.fromTo(tee, { x: 74 * cw }, { x: 0, duration: 0.66, ease: 'expo.out' }, B.cat01);
  show(aLabel, B.cat01 + 0.28);
  show(aName, B.cat01 + 0.34);

  // 1 / 0 / 9 slice up through the frame; photographs swap inside the digits
  show(partB, B.cat109);
  const d109 = $$('s3-109-');
  const bLabel = $('s3b-label');
  const bName = $('s3b-name');
  hidden(d109.slice(1), bLabel, bName);
  tl.fromTo(partB, { y: 100 * ch }, { y: 0, duration: 0.52, ease: 'expo.out' }, B.cat109);
  tl.to(partA, { y: -48 * ch, duration: 0.52, ease: 'expo.out' }, B.cat109);
  hide(partA, B.cat109 + 0.52);
  show(d109[1], B.cat109 + 0.34);
  hide(d109[0], B.cat109 + 0.34);
  show(d109[2], B.cat109 + 0.62);
  hide(d109[1], B.cat109 + 0.62);
  show(bLabel, B.cat109 + 0.22);
  show(bName, B.cat109 + 0.28);

  // RAW — a stamp, not an animation
  show(partC, B.catRaw);
  hide(partB, B.catRaw);
  const raw = $('s3-raw');
  const infoLines = Array.from($('s3-info').children);
  hidden(raw, infoLines);
  tl.fromTo(
    $('s3-jorts'),
    { y: 2.5 * ch, scale: 1.03 },
    { y: 0, scale: 1, duration: 0.9, ease: 'expo.out' },
    B.catRaw,
  );
  show(raw, B.catRaw + 0.2);
  tl.fromTo(
    raw,
    { scale: 1.28, rotation: -10 },
    { scale: 1, rotation: -7, duration: 0.08, ease: 'power4.out' },
    B.catRaw + 0.2,
  );
  infoLines.forEach((l, i) => show(l, B.catRaw + 0.32 + i * 0.045));

  // ================================================================ S4 SEPARATION
  show(s4, B.cut);
  hide(s3, B.cut);
  paperChrome(B.cut);
  const strips = Array.from({ length: STRIP_COUNT }, (_, i) => $(`s4-strip-${i}`));
  const imgs = Array.from({ length: STRIP_COUNT }, (_, i) => $(`s4-img-${i}`));
  const ghosts = Array.from({ length: STRIP_COUNT }, (_, i) => $(`s4-ghost-${i}`));
  const scan = $('s4-scan');
  const mid = Math.floor(STRIP_COUNT / 2);
  gsap.set(ghosts, { opacity: 0 });
  gsap.set(strips, { clipPath: 'inset(0% 0% 0% 0%)' });
  hidden(scan);

  // stillness, then a slow settle
  tl.fromTo(strips, { scale: 1.04 }, { scale: 1, duration: 0.6, ease: 'expo.out' }, B.cut);
  // hairline cuts open between the planes
  strips.forEach((s, i) => {
    tl.to(
      s,
      { clipPath: 'inset(0% 1.5% 0% 1.5%)', duration: 0.22, ease: 'expo.out' },
      B.cuts + Math.abs(i - mid) * 0.03,
    );
  });
  // planes narrow into slats; alternate slats travel in opposite directions;
  // the garment plane holds still
  const drift = [-9, 6, -4, 0, 5, -7, 10];
  const slide = [1.4, -1.1, 0.7, 0, -0.8, 1.2, -1.5];
  strips.forEach((s, i) => {
    const d = B.separate + Math.abs(i - mid) * 0.05;
    tl.to(
      s,
      {
        clipPath: i === mid ? 'inset(0% 1.5% 0% 1.5%)' : 'inset(0% 31% 0% 31%)',
        duration: 1.05,
        ease: 'expo.inOut',
      },
      d,
    );
    if (i === mid) return;
    tl.to(s, { y: drift[i] * ch, duration: 1.1, ease: 'expo.inOut' }, d);
    tl.to(imgs[i], { x: slide[i] * cw, duration: 1.1, ease: 'expo.inOut' }, d);
    // keep breathing while the scan travels
    tl.to(
      s,
      { y: drift[i] * 1.22 * ch, duration: B.collapse - d - 1.1 + 0.2, ease: 'none' },
      d + 1.1,
    );
  });
  // the photograph recedes so the type can come forward
  const dims = Array.from({ length: STRIP_COUNT }, (_, i) => $(`s4-dim-${i}`));
  tl.to(
    dims.filter((_, i) => i !== mid),
    { opacity: 0.18, duration: 0.9, ease: 'power2.inOut' },
    B.separate + 0.1,
  );
  // the red plate slips out of register
  ghosts.forEach((g, i) => {
    const dx = (i % 2 ? -1 : 1) * 1.1 * cw + slide[i] * cw;
    tl.to(
      g,
      { opacity: 0.8, x: dx, y: (i % 2 ? 0.5 : -0.5) * ch, duration: 0.55, ease: 'power2.out' },
      B.separate + 0.25,
    );
  });
  // a scan crosses to the garment
  show(scan, B.separate + 0.08);
  tl.fromTo(
    scan,
    { x: 0 },
    { x: 50 * cw, duration: 1.12, ease: 'power2.inOut' },
    B.separate + 0.08,
  );

  // collapse toward the product
  strips.forEach((s, i) => {
    if (i === mid) return;
    const order = Math.abs(i - mid);
    tl.to(
      s,
      {
        x: (mid - i) * (100 / STRIP_COUNT) * cw,
        y: 0,
        clipPath: 'inset(0% 50% 0% 50%)',
        duration: 0.42,
        ease: 'expo.in',
      },
      B.collapse + (3 - order) * 0.05,
    );
    hide(s, B.collapse + 0.6);
  });
  tl.to(
    ghosts.filter((_, i) => i !== mid),
    { opacity: 0, duration: 0.2 },
    B.collapse,
  );
  hide(scan, B.collapse + 0.05);
  // the surviving plane prints in red
  tl.to(ghosts[mid], { opacity: 1, x: 0, y: 0, duration: 0.01 }, B.redplate);
  tl.set(imgs[mid], { opacity: 0 }, B.redplate);
  tl.set(strips[mid], { backgroundColor: 'var(--paper)' }, B.redplate);

  // ================================================================ PORTAL
  const prod = $('s5-prod');
  const photoImg = $('s5-photo');
  const bandEl = $('s5-band');
  const sr = s4.getBoundingClientRect();
  const pr = prod.getBoundingClientRect();
  // garment bounds inside the product image (stand-in render geometry)
  const gScale = (pr.width / 1200) * 1.14;
  const geom: PortalGeom = {
    rect: {
      x: (mid * 100 * cw) / STRIP_COUNT + (1.5 * cw) / STRIP_COUNT,
      y: 0,
      w: ((100 * cw) / STRIP_COUNT) * 0.97,
      h: H,
    },
    scale: gScale * 1.03,
    cx: pr.left - sr.left + pr.width / 2,
    cy: pr.top - sr.top + pr.height / 2 + (TEE_BOX.chestY - 556) * gScale,
  };
  const pState = { mx: 0, my: 0, g: 1 };
  const applyPortal = () => {
    s5.style.clipPath = portalPolygon(geom, pState.mx, pState.my, pState.g);
  };
  gsap.set(bandEl, { clipPath: 'inset(0% 0% 0% 0%)' });
  show(s5, B.morph);
  tl.set(s5, { clipPath: portalPolygon(geom, 0, 0, 1) }, B.morph);
  hide(strips[mid], B.morph + 0.02);
  tl.to(pState, { my: 1, duration: 0.3, ease: 'power3.inOut', onUpdate: applyPortal }, B.morph);
  tl.to(
    pState,
    { mx: 1, duration: 0.42, ease: 'expo.inOut', onUpdate: applyPortal },
    B.morph + 0.08,
  );
  tl.to(pState, { g: 18, duration: 0.74, ease: 'power4.in', onUpdate: applyPortal }, B.portal);
  tl.set(s5, { clipPath: 'none' }, B.print - 0.08);
  hide(s4, B.print - 0.08);
  inkChrome(B.portal + 0.45);

  // ================================================================ S5 DETAIL
  const s5Info = $('s5-info');
  const s5num = $('s5-num');
  tl.fromTo(prod, { y: 1.4 * ch }, { y: 0, duration: 2.4, ease: 'sine.out' }, B.portal);
  tl.fromTo(s5num, { x: 5 * cw }, { x: 0, duration: 2.8, ease: 'sine.out' }, B.portal);
  // the black plate prints over the red, out of register, then snaps
  tl.set(photoImg, { x: 1.5 * cw, y: -0.7 * ch }, B.print);
  tl.set(bandEl, { clipPath: 'inset(0% 0% 0% 100%)' }, B.print);
  tl.set(photoImg, { x: 0.5 * cw, y: -0.2 * ch }, B.print + 0.07);
  tl.set(photoImg, { x: 0, y: 0 }, B.print + 0.13);

  // ================================================================ CURSOR
  const cx = (v: number) => v * cw;
  const cy = (v: number) => v * ch;
  // click targets are measured, so copy edits never desync the choreography
  const stageRect = root.getBoundingClientRect();
  const target = (el: HTMLElement, fx = 0.3, fy = 0.55) => {
    const r = el.getBoundingClientRect();
    return { x: r.left - stageRect.left + r.width * fx, y: r.top - stageRect.top + r.height * fy };
  };
  const addAt = target($('s3-add'));
  const sizeAt = target($('s5-size-M'), 0.5, 0.6);
  if (!cursorLive) {
    show(cursor, B.cat01 + 0.12);
    tl.fromTo(
      cursor,
      { x: cx(92), y: cy(68) },
      { x: cx(60), y: cy(47), duration: 0.8, ease: 'power3.out' },
      B.cat01 + 0.12,
    );
    // the garment answers the pointer by a few pixels
    tl.to(tee, { x: -0.9 * cw, y: -0.5 * ch, duration: 0.8, ease: 'power3.out' }, B.cat01 + 0.66);
    tl.to(cursor, { x: cx(70), y: cy(58), duration: 0.9, ease: 'power2.inOut' }, B.cat109);
    tl.to(cursor, { x: addAt.x, y: addAt.y, duration: 0.5, ease: 'power3.inOut' }, B.add - 0.52);
    click(B.add);
    tl.set($('s3-add-0'), { visibility: 'hidden' }, B.add + 0.02);
    tl.set($('s3-add-1'), { visibility: 'visible' }, B.add + 0.02);
    tl.set($('bag-0'), { visibility: 'hidden' }, B.add + 0.1);
    tl.set($('bag-1'), { visibility: 'visible' }, B.add + 0.1);
    tl.set($('bag-dot'), { opacity: 1 }, B.add + 0.1);
    tl.to(cursor, { x: cx(30), y: cy(70), duration: 0.35, ease: 'power2.out' }, B.add + 0.08);
    hide(cursor, B.cut);

    // S5: the pointer crosses the garment; a band of red plate follows it
    show(cursor, B.print + 0.35);
    tl.fromTo(
      cursor,
      { x: cx(98), y: cy(40) },
      { x: cx(8), y: cy(44), duration: 1.3, ease: 'sine.inOut' },
      B.print + 0.35,
    );
    tl.to(
      cursor,
      { x: sizeAt.x, y: sizeAt.y, duration: 0.42, ease: 'power3.inOut' },
      B.print + 1.4,
    );
    click(B.print + 1.84);
    tl.set($('s5-size-M'), { color: 'var(--red)' }, B.print + 1.86);
    hide(cursor, B.strip);
  }

  const bandW = 0.11;
  const updateBand = () => {
    const t = tl.time();
    if (t < B.print + (cursorLive ? 0.15 : 0.35) || t > B.strip) return;
    const x = gsap.getProperty(cursor, 'x') as number;
    const y = gsap.getProperty(cursor, 'y') as number;
    const r = prod.getBoundingClientRect();
    const ry = (y - (r.top - sr.top)) / r.height;
    const rel = ry < 0.04 || ry > 0.96 ? 2 : (x - (r.left - sr.left)) / r.width;
    const l = Math.min(100, Math.max(0, (rel - bandW / 2) * 100));
    const rr = Math.min(100, Math.max(0, (1 - rel - bandW / 2) * 100));
    bandEl.style.clipPath = `inset(0% ${rr}% 0% ${l}%)`;
  };

  // ================================================================ STRIP AWAY
  tl.set(s5Info, { visibility: 'hidden' }, B.strip);
  tl.to(s5num, { x: 60 * cw, duration: 0.3, ease: 'expo.in' }, B.strip + 0.02);
  tl.to(prod, { y: -95 * ch, duration: 0.36, ease: 'expo.in' }, B.strip + 0.06);
  hide(chrome, B.strip + 0.12);

  // ================================================================ S6 CREDIT
  show(s6, B.credit);
  hide(s5, B.credit);
  const brand = $('s6-brand');
  const concept = $('s6-concept');
  const by = $('s6-by');
  const author = $('s6-author');
  const authorR = $('s6-author-r');
  const disc = $('s6-disc');
  hidden(brand, concept, by, author, authorR, disc);
  show(brand, B.credit + 0.14);
  // the brand steps back, the name is stamped like the first frame
  tl.to(brand, { y: -7.8 * ch, scale: 0.6, duration: 0.42, ease: 'expo.inOut' }, B.credit + 0.72);
  show(concept, B.credit + 1.02);
  show(by, B.credit + 1.14);
  const stamp = B.credit + 1.2;
  show([author, authorR], stamp);
  tl.set(authorR, { x: -1.4 * cw, y: 0.7 * ch }, stamp);
  tl.set(author, { x: 1.1 * cw, y: -0.5 * ch }, stamp);
  tl.fromTo(
    [author, authorR],
    { scale: 1.05 },
    { scale: 1, duration: 0.14, ease: 'expo.out', transformOrigin: '0% 50%' },
    stamp,
  );
  tl.set(authorR, { x: -0.6 * cw, y: 0.25 * ch }, stamp + 0.08);
  tl.set(author, { x: 0.3 * cw, y: -0.1 * ch }, stamp + 0.08);
  // it never fully registers: a sliver of red stays
  tl.set(authorR, { x: -0.35 * cw, y: 0.12 * ch }, stamp + 0.16);
  tl.set(author, { x: 0, y: 0 }, stamp + 0.16);
  show(disc, B.credit + 1.55);
  tl.set({}, {}, B.end);

  // ================================================================ per-frame
  const tcEl = $('tc');
  const xy = $('cursor-xy');
  const scanT = $('s4-scan-t');
  const grain = root.querySelector<HTMLElement>('.grain');
  let lastFrame = -1;
  tl.eventCallback('onUpdate', () => {
    const t = tl.time();
    const f = Math.floor(t * 24);
    if (f !== lastFrame) {
      lastFrame = f;
      tcEl.textContent = `TC 00:${String(Math.floor(t)).padStart(2, '0')}:${String(f % 24).padStart(2, '0')}`;
      if (grain) {
        const h = Math.imul(f + 1, 2654435761) >>> 0;
        grain.style.transform = `translate(${(h % 256) - 128}px, ${((h >>> 8) % 256) - 128}px)`;
      }
    }
    if (!cursorLive) writeXY();
    scanT.textContent = `SCAN ${((gsap.getProperty(scan, 'x') as number) / W).toFixed(3)}`;
    updateBand();
  });

  function writeXY() {
    const x = gsap.getProperty(cursor, 'x') as number;
    const y = gsap.getProperty(cursor, 'y') as number;
    const [rw, rh] = L.portrait ? [1080, 1920] : [W, H];
    xy.textContent = `X ${String(Math.round((x / W) * rw)).padStart(4, '0')} Y ${String(Math.round((y / H) * rh)).padStart(4, '0')}`;
  }

  /** live pointer (site mode): coordinates + the red plate band */
  const pointer = () => {
    writeXY();
    updateBand();
  };

  return { tl, pointer };
}
