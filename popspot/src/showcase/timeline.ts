import { gsap } from '../lib/gsap';
import {
  DROPS,
  FLIGHT,
  GRID_COLS,
  GRID_ROWS,
  RIM,
  SHOTS,
  VAULT_ITEMS,
  WALL_COPIES,
  WALL_HERO,
  WALL_MID,
  WALL_ROWS,
  WALL_SLOT,
} from './scenes';

/** Total length of the collector-film, in seconds. */
export const DURATION = 15.8;

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/';

/** Deterministic text scramble: the output depends only on tween progress. */
function scramble(tl: gsap.core.Timeline, el: Element, text: string, at: number, dur: number) {
  const o = { t: 0 };
  tl.fromTo(
    o,
    { t: 0 },
    {
      t: 1,
      duration: dur,
      ease: 'none',
      onUpdate: () => {
        const n = Math.floor(o.t * text.length);
        let out = text.slice(0, n);
        for (let i = n; i < text.length; i++) out += text[i] === ' ' ? ' ' : GLYPHS[(i * 7 + Math.floor(o.t * 24)) % GLYPHS.length];
        el.textContent = out;
      },
    },
    at,
  );
}

/**
 * The whole film as one paused GSAP timeline. Nothing is random and nothing
 * depends on wall-clock time, so seeking to t always renders the same frame.
 */
export function buildTimeline(stage: HTMLElement) {
  const q = gsap.utils.selector(stage);
  const one = (s: string) => q(s)[0] as HTMLElement;
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power3.out' } });

  const show = (sel: string, at: number) => tl.set(sel, { visibility: 'visible' }, at);
  const hide = (sel: string, at: number) => tl.set(sel, { visibility: 'hidden' }, at);
  const flash = (at: number, peak = 0.85, color = '#fff') => {
    tl.set('.sc-flash', { background: color }, at);
    tl.fromTo('.sc-flash', { opacity: peak }, { opacity: 0, duration: 0.28, ease: 'power2.out', immediateRender: false }, at);
  };
  const shake = (sel: string, at: number, amp = 16) =>
    tl.fromTo(sel, { x: amp }, { x: 0, duration: 0.32, ease: 'elastic.out(1.4, 0.25)', immediateRender: false }, at);

  gsap.set(stage.querySelectorAll('.sc'), { visibility: 'hidden' });
  // Bottom-centre anchors for every product that GSAP moves (never mix CSS \`translate\` with GSAP transforms).
  gsap.set(q('.sc1__obj, .sc3__obj, .sc4__hero, .sc5__obj, .sc6__obj, .sc7__obj, .sc8__obj'), { xPercent: -50, yPercent: -100 });
  gsap.set(q('.sc6__bang'), { xPercent: -50, yPercent: -50 });
  // Frame 0 must already show the real product.
  gsap.set(q('.sc1'), { visibility: 'visible' });

  // ── S1 · 0.00–0.90 · OBJECT DETECTED ─────────────────────
  show('.sc1', 0);
  tl.fromTo('.sc1__ring', { scale: 1.3, rotation: -40, opacity: 0.55 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.3 }, 0)
    .fromTo('.sc1__ring i', { rotation: 0 }, { rotation: 120, duration: 0.9, ease: 'none' }, 0)
    .fromTo('.sc1__obj', { scale: 0.9 }, { scale: 1, duration: 0.3 }, 0)
    .fromTo('.sc1__vf', { scale: 1.2, opacity: 0.6 }, { scale: 1, opacity: 1, duration: 0.25, stagger: 0.02 }, 0)
    .fromTo('.sc1__id, .sc1__hud', { opacity: 0.4 }, { opacity: 1, duration: 0.15 }, 0);
  scramble(tl, one('.sc1__detect'), 'OBJECT DETECTED.', 0, 0.32);
  tl.set('.sc1__beam', { opacity: 1 }, 0.22)
    .fromTo('.sc1__beam', { top: 700 }, { top: 1100, duration: 0.36, ease: 'none' }, 0.22)
    .set('.sc1__beam', { opacity: 0 }, 0.58)
    .fromTo('.sc1__xray', { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.36, ease: 'none' }, 0.22)
    .to('.sc1__xray', { clipPath: 'inset(100% 0% 0% 0%)', duration: 0.1, ease: 'power2.in' }, 0.58)
    // LOCK
    .to('.sc1__ring', { scale: 0.8, duration: 0.07, ease: 'power4.in' }, 0.58)
    .fromTo('.sc1__lock', { opacity: 0, y: 24, scale: 1.3 }, { opacity: 1, y: 0, scale: 1, duration: 0.12, ease: 'back.out(3)' }, 0.6)
    // SCALE PLAY: the camera rushes the object
    .to('.sc1__obj', { scale: 2.4, y: 300, duration: 0.24, ease: 'expo.in' }, 0.66)
    .to('.sc1__ring', { scale: 4, opacity: 0, duration: 0.22, ease: 'power2.in' }, 0.66)
    .to('.sc1__detect, .sc1__id, .sc1__lock, .sc1__vf, .sc1__hud', { opacity: 0, duration: 0.08 }, 0.7);
  flash(0.88, 1, '#fff');
  hide('.sc1', 0.9);

  // ── S2 · 0.90–3.00 · POP SPOT slam → WHAT ARE YOU HUNTING? → shelf ──
  show('.sc2', 0.9);
  const bug = one('.sc-bug');
  const bugW = bug.offsetWidth;
  const bugH = bug.offsetHeight;
  const corner = 0.26;
  tl.set('.sc-bug', { visibility: 'visible', xPercent: -50, yPercent: -50 }, 0.9)
    .fromTo('.sc-bug', { x: 0, y: 0, scale: 3.4, rotation: -22, opacity: 0 }, { scale: 1, rotation: -6, opacity: 1, duration: 0.2, ease: 'back.out(2.2)' }, 0.9);
  shake('.sc2', 1.08, 22);
  tl.to(
    '.sc-bug',
    {
      x: 72 + (bugW * corner) / 2 - 540,
      y: 150 + (bugH * corner) / 2 - 900,
      scale: corner,
      rotation: -4,
      duration: 0.3,
      ease: 'power4.inOut',
    },
    1.22,
  ).fromTo('.sc-hud', { opacity: 0 }, { opacity: 0.85, duration: 0.2 }, 1.4);

  const parts = q('.sc2__p');
  gsap.set(parts, { xPercent: -50, yPercent: -100 });
  // product 0 sits behind the slam, big, then everything multiplies 1 → 3 → 8 → 16
  tl.fromTo(parts[0]!, { x: 0, y: 330, z: 560, rotation: -4, opacity: 0 }, { opacity: 1, duration: 0.08 }, 0.92);
  const groups: [number, number, number][] = [
    [0, 1, 1.24],
    [1, 3, 1.5],
    [3, 8, 1.78],
    [8, 16, 2.04],
  ];
  groups.forEach(([a, b, at]) => {
    for (let i = a; i < b; i++) {
      const [fx, fy, fz, fr] = FLIGHT[i]!;
      const el = parts[i]!;
      if (i === 0) {
        tl.to(el, { x: fx, y: fy + 100, z: fz, rotation: fr, duration: 0.45, ease: 'expo.out' }, at);
      } else {
        tl.fromTo(
          el,
          { x: fx * 0.08, y: fy * 0.08 + 100, z: -2800, rotation: 0, opacity: 0 },
          { x: fx, y: fy + 100, z: fz, rotation: fr, opacity: 1, duration: 0.45, ease: 'expo.out', immediateRender: false },
          at + (i - a) * 0.025,
        );
      }
    }
  });
  gsap.set(parts.slice(1), { opacity: 0 });
  q('.sc2__words span').forEach((w, i) => {
    tl.fromTo(w, { scale: 1.7, opacity: 0, transformOrigin: '0% 60%' }, { scale: 1, opacity: 1, duration: 0.14, ease: 'back.out(2.4)' }, 1.24 + i * 0.1);
  });
  // SNAP into a perfect shelf
  tl.to('.sc2__words', { scale: 0.5, y: -40, duration: 0.3, ease: 'power4.inOut' }, 2.36)
    .fromTo('.sc2__planks i', { scaleX: 0 }, { scaleX: 1, duration: 0.24, stagger: 0.05, ease: 'power3.out' }, 2.4);
  parts.forEach((el, i) => {
    const col = GRID_COLS[i % 4]!;
    const row = GRID_ROWS[Math.floor(i / 4)]!;
    tl.to(el, { x: col - 540, y: row - 960, z: 0, rotation: 0, duration: 0.3, ease: 'back.out(1.5)' }, 2.4 + (i % 4) * 0.015 + Math.floor(i / 4) * 0.03);
  });
  tl.fromTo('.sc2__count', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: 'back.out(2)' }, 2.62);
  hide('.sc2', 3.0);

  // ── S3 · 3.00–5.30 · THE FANDOM PORTAL ───────────────────
  show('.sc3', 2.9);
  tl.fromTo('.sc3__frame', { opacity: 0 }, { opacity: 1, duration: 0.01 }, 3.0);
  const units = q('.sc3__u');
  const SHOT = 0.46;
  SHOTS.forEach((s, i) => {
    const T = 3.0 + i * SHOT;
    const u = units[i]!;
    const uq = gsap.utils.selector(u);
    tl.fromTo('.sc3__iris', { scale: 0 }, { scale: 1, duration: 0.1, ease: 'power3.in', immediateRender: false }, T - 0.1)
      .set('.sc3__iris', { scale: 0 }, T + 0.02)
      .set(u, { visibility: 'visible' }, T);
    if (i > 0) tl.set(units[i - 1]!, { visibility: 'hidden' }, T);
    tl.fromTo(uq('.sc3__word span'), { yPercent: 70, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.16, stagger: 0.04, ease: 'power4.out' }, T)
      .fromTo(uq('.sc3__num'), { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3 }, T)
      .fromTo(
        uq('.sc3__obj'),
        { y: 380, scale: 0.72, rotation: (k: number) => (k % 2 ? 12 : -12) },
        { y: 0, scale: 1, rotation: 0, duration: 0.2, stagger: 0.025, ease: 'back.out(1.7)' },
        T,
      )
      .to(uq('.sc3__obj'), { scale: 1.05, duration: SHOT - 0.25, ease: 'none' }, T + 0.25);
    void s;
  });
  hide('.sc3', 5.3);
  tl.set(units, { visibility: 'hidden' }, 5.3);

  // ── S4 · 5.30–7.50 · THE WALL → SPOT LOCK ────────────────
  show('.sc4', 5.3);
  const heroIdx = WALL_ROWS[WALL_MID]!.indexOf(WALL_HERO) + WALL_ROWS[WALL_MID]!.length; // middle copy
  const endMid = 540 - (heroIdx * WALL_SLOT + WALL_SLOT / 2);
  q('.sc4__track').forEach((t, r) => {
    const dir = r % 2 ? -1 : 1; // odd rows travel right
    const end = r === WALL_MID ? endMid : endMid + (((r * 97) % 200) - 100);
    const start = end + dir * 1750;
    tl.fromTo(t, { x: start }, { x: end, duration: 1.1, ease: 'power4.out' }, 5.3);
  });
  void WALL_COPIES;
  tl.fromTo('.sc4__ring', { scale: 1.3 }, { scale: 1, duration: 0.5 }, 5.3)
    // LOCK
    .fromTo('.sc4__ring', { scale: 1.3 }, { scale: 1, duration: 0.12, ease: 'back.out(3)', immediateRender: false }, 6.36)
    .to('.sc4__dim', { opacity: 1, duration: 0.18 }, 6.42)
    .set('.sc4 .sc4__slot.is-hero', { opacity: 0 }, 6.44)
    .fromTo('.sc4__hero', { opacity: 1, scale: 200 / 560 }, { scale: 1, duration: 0.34, ease: 'back.out(1.5)', immediateRender: false }, 6.44)
    .set('.sc4__hero', { opacity: 1 }, 6.44)
    .to('.sc4__ring', { scale: 1.72, y: -170, duration: 0.34, ease: 'back.out(1.5)' }, 6.44)
    .fromTo('.sc4__card', { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'back.out(1.6)' }, 6.62)
    .fromTo('.sc4__spotted', { scale: 2.2, rotation: -24, opacity: 0 }, { scale: 1, rotation: -6, opacity: 1, duration: 0.22, ease: 'back.out(2.6)' }, 6.74)
    .fromTo('.sc4__card .sx-price', { scale: 0, rotation: 40 }, { scale: 1, rotation: -6, duration: 0.24, ease: 'back.out(3)' }, 6.88);
  flash(6.4, 0.6);
  hide('.sc4', 7.5);

  // ── S5 · 7.50–9.80 · REAL PRODUCT SCANNER ────────────────
  show('.sc5', 7.5);
  tl.fromTo('.sc5__obj', { y: 320, scale: 0.86, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.4)' }, 7.5)
    .fromTo('.sc5__c', { scale: 1.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, stagger: 0.03 }, 7.52)
    .fromTo('.sc5__label', { opacity: 0 }, { opacity: 1, duration: 0.1 }, 7.6)
    .set('.sc5__beam', { opacity: 1 }, 7.78)
    .fromTo('.sc5__beam', { top: 380 }, { top: 1140, duration: 1.15, ease: 'none' }, 7.78)
    .set('.sc5__beam', { opacity: 0 }, 8.93)
    .fromTo('.sc5__xray', { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: 'none' }, 7.78)
    .to('.sc5__xray', { clipPath: 'inset(100% 0% 0% 0%)', duration: 0.14, ease: 'power2.in' }, 8.93);
  q('.sc5__row').forEach((row, i) => {
    const at = 8.0 + i * 0.27;
    const dd = row.querySelector('dd')!;
    tl.fromTo(row, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.14 }, at);
    scramble(tl, dd, dd.getAttribute('data-text') ?? '', at, 0.24);
  });
  tl.fromTo('.sc5__stamp', { scale: 2.8, rotation: 30, opacity: 0 }, { scale: 1, rotation: -10, opacity: 1, duration: 0.26, ease: 'back.out(2.6)' }, 9.02);
  flash(9.02, 0.5, '#0078ff');
  shake('.sc5', 9.1, 20);
  hide('.sc5', 9.8);

  // ── S6 · 9.80–12.00 · DROP MACHINE: BANG BANG BANG ───────
  show('.sc6', 9.8);
  tl.fromTo('.sc6__title span', { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.24, stagger: 0.06, ease: 'power4.out' }, 9.8)
    .fromTo('.sc6__cabinet', { y: 260, opacity: 0 }, { y: 0, opacity: 1, duration: 0.26, ease: 'back.out(1.3)' }, 9.82)
    .fromTo('.sc6__led', { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2 }, 9.95)
    .fromTo('.sc6__led b', { opacity: 1 }, { opacity: 0.45, duration: 0.18, repeat: 9, yoyo: true, ease: 'steps(1)' }, 10.1);
  const objs = q('.sc6__obj');
  const bangs = q('.sc6__bang');
  const tagCols = q('.sc6__tags > div');
  DROPS.forEach((_, i) => {
    const T = 9.9 + i * 0.5;
    const F = 0.26; // fall time
    tl.fromTo(objs[i]!, { y: -1300, rotation: i % 2 ? 16 : -16, opacity: 1 }, { y: 0, rotation: 0, duration: F, ease: 'power3.in' }, T)
      .fromTo(objs[i]!, { scaleY: 0.84, scaleX: 1.08 }, { scaleY: 1, scaleX: 1, duration: 0.3, ease: 'elastic.out(1.2, 0.35)', immediateRender: false }, T + F)
      .fromTo(bangs[i]!, { scale: 0.2, rotation: -34, opacity: 1 }, { scale: 1, rotation: i % 2 ? 8 : -8, duration: 0.18, ease: 'back.out(3)' }, T + F)
      .to(bangs[i]!, { opacity: 0, scale: 1.15, duration: 0.1 }, T + F + 0.34)
      .fromTo('.sc6__cabinet', { y: 12 }, { y: 0, duration: 0.24, ease: 'elastic.out(1.4, 0.2)', immediateRender: false }, T + F)
      .fromTo(tagCols[i]!.children, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.16, stagger: 0.04 }, T + F + 0.04);
  });
  gsap.set(objs, { opacity: 0 });
  hide('.sc6', 12.0);

  // ── S7 · 12.00–13.70 · THE VAULT ─────────────────────────
  show('.sc7', 12.0);
  tl.fromTo('.sc7__title span', { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.18, stagger: 0.05 }, 12.0)
    .fromTo('.sc7__slot', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, stagger: 0.02, ease: 'back.out(1.8)' }, 12.0)
    .fromTo('.sc7__counter', { opacity: 0 }, { opacity: 1, duration: 0.12 }, 12.05);
  const digits = q('.sc7__digit');
  gsap.set(digits, { yPercent: 115 });
  const vobjs = q('.sc7__obj');
  VAULT_ITEMS.forEach((_, i) => {
    const T = 12.16 + i * 0.24;
    tl.fromTo(vobjs[i]!, { y: -1100, scale: 1.25, rotation: i % 2 ? 14 : -14, opacity: 1 }, { y: 0, scale: 1, rotation: 0, duration: 0.2, ease: 'power3.in' }, T)
      .fromTo(vobjs[i]!, { scaleY: 0.86, scaleX: 1.06 }, { scaleY: 1, scaleX: 1, duration: 0.24, ease: 'elastic.out(1.2, 0.35)', immediateRender: false }, T + 0.2)
      .fromTo(vobjs[i]!.querySelector('.sc7__stamp'), { scale: 2.4, rotation: 24, opacity: 0 }, { scale: 1, rotation: -12, opacity: 1, duration: 0.16, ease: 'back.out(3)' }, T + 0.22)
      .fromTo(digits[i]!, { yPercent: 115 }, { yPercent: 0, duration: 0.14, ease: 'back.out(2)' }, T + 0.2);
    if (i > 0) tl.to(digits[i - 1]!, { yPercent: -115, duration: 0.12, ease: 'power3.in' }, T + 0.2);
  });
  gsap.set(vobjs, { opacity: 0 });
  tl.fromTo('.sc7__updated', { scale: 1.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: 'back.out(2.4)' }, 13.36)
    .fromTo('.sc7__counter b', { scale: 1.12 }, { scale: 1, duration: 0.3, ease: 'elastic.out(1.2, 0.3)', immediateRender: false }, 13.36);
  // everything moves outward as the lockup opens
  tl.to(
    vobjs,
    {
      x: (i: number) => [-700, 0, 700, -700, 700][i] ?? 0,
      y: (i: number) => [-500, -900, -500, 600, 600][i] ?? 0,
      duration: 0.3,
      ease: 'power3.in',
    },
    13.7,
  ).to('.sc7__slot, .sc7__title, .sc7__counter, .sc7__updated', { opacity: 0, scale: 0.9, duration: 0.2 }, 13.7);
  hide('.sc7', 14.02);

  // ── S8 · 13.70–15.80 · FINAL LOCKUP, END ON BLUE ─────────
  show('.sc8', 13.72);
  tl.set('.sc8', { background: 'transparent' }, 13.72)
    .fromTo('.sc8__iris', { scale: 0 }, { scale: 1, duration: 0.32, ease: 'power3.inOut' }, 13.72)
    .to('.sc-bug, .sc-hud', { opacity: 0, duration: 0.12 }, 13.72);
  const rim = q('.sc8__obj');
  const rimPos = RIM.filter((r) => r[3] > 0);
  rim.forEach((el, i) => {
    const [, x, b] = rimPos[i]!;
    tl.fromTo(
      el,
      { x: 540 - x, y: 1000 - b, scale: 0.15, rotation: 0, opacity: 1 },
      { x: 0, y: 0, scale: 1, rotation: ((i * 29) % 18) - 9, duration: 0.6, ease: 'expo.out' },
      14.0 + Math.abs(i - rim.length / 2) * 0.012,
    );
    tl.to(el, { y: i % 2 ? -8 : 8, duration: 0.6, ease: 'sine.inOut', repeat: 1, yoyo: true }, 14.6);
  });
  gsap.set(rim, { opacity: 0 });
  tl.fromTo('.sc8__mark', { scale: 3, rotation: -24, opacity: 0 }, { scale: 1, rotation: -4, opacity: 1, duration: 0.26, ease: 'back.out(2.4)' }, 14.04)
    .fromTo('.sc8__line span', { yPercent: 80, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.26, stagger: 0.07, ease: 'power4.out' }, 14.22)
    .fromTo('.sc8__small', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 }, 14.6);
  flash(14.04, 0.45);
  shake('.sc8__lockup', 14.1, 18);

  // pad to the exact duration: the last frame holds on blue
  tl.set({}, {}, DURATION);
  return tl;
}
