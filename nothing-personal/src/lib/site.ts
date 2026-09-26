import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { BEATS, DURATION } from './timeline';
import type { Layout } from './layout';

gsap.registerPlugin(ScrollTrigger);

/** vh of scroll per second of timeline */
export const SCROLL_VH_PER_SECOND = 70;
export const INTRO_END = BEATS.pull - 0.04;
export const TRACK_VH = Math.round((DURATION - INTRO_END) * SCROLL_VH_PER_SECOND) + 100;

let introPlayed = false;

/**
 * The website: the hook plays on its own, then scroll owns the playhead.
 * The pointer drives the crosshair, a few pixels of parallax and the red
 * plate on the product; ADD and sizes actually respond.
 */
export function runSite(
  stage: HTMLElement,
  track: HTMLElement,
  tl: gsap.core.Timeline,
  pointer: () => void,
  L: Layout,
) {
  const $ = (k: string) => stage.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
  const cursor = $('cursor');
  const hint = $('hint');
  let st: ScrollTrigger | null = null;
  let intro: gsap.core.Tween | null = null;

  const arm = () => {
    st = ScrollTrigger.create({
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.7,
      animation: tl.tweenFromTo(INTRO_END, DURATION, { paused: true, ease: 'none' }),
      onUpdate: (self) => gsap.to(hint, { opacity: self.progress > 0.01 ? 0 : 0.8, duration: 0.3, overwrite: true }),
    });
    gsap.to(hint, { opacity: 0.8, duration: 0.6, delay: 0.2 });
  };

  if (!introPlayed && window.scrollY < 4) {
    introPlayed = true;
    intro = tl.tweenFromTo(0, INTRO_END, { ease: 'none', onComplete: arm });
  } else {
    arm();
  }

  // ---- pointer
  gsap.set(cursor, { visibility: 'visible', x: L.W * 0.62, y: L.H * 0.54 });
  const xTo = gsap.quickTo(cursor, 'x', { duration: 0.16, ease: 'power3' });
  const yTo = gsap.quickTo(cursor, 'y', { duration: 0.16, ease: 'power3' });
  const par = [
    { el: $('s1-ph-in'), k: 0.03 },
    { el: $('s3-tee-in'), k: 0.012 },
    { el: $('s2-img'), k: 0.01 },
  ].map(({ el, k }) => ({
    x: gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3' }),
    y: gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3' }),
    k,
  }));
  const onMove = (e: PointerEvent) => {
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    xTo(x);
    yTo(y);
    const nx = x / r.width - 0.5;
    const ny = y / r.height - 0.5;
    for (const p of par) {
      p.x(-nx * p.k * L.W);
      p.y(-ny * p.k * L.H);
    }
    const hot = (e.target as HTMLElement).closest?.('.hit');
    cursor.classList.toggle('is-hot', !!hot);
  };
  stage.addEventListener('pointermove', onMove);
  gsap.ticker.add(pointer);

  // ---- commerce, lightly
  const addToBag = () => {
    gsap.set([$('s3-add-0'), $('bag-0')], { visibility: 'hidden' });
    gsap.set([$('s3-add-1'), $('bag-1')], { visibility: 'visible' });
    gsap.set($('bag-dot'), { opacity: 1 });
    gsap.fromTo($('cursor-ring'), { opacity: 1, scale: 0.6 }, { opacity: 0, scale: 2.4, duration: 0.35, ease: 'expo.out' });
  };
  const sizes = Array.from(stage.querySelectorAll<HTMLElement>('[data-k^="s5-size-"]'));
  const onClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-k="s3-add"]') || t.closest('[data-k="s5-add"]')) addToBag();
    const size = t.closest<HTMLElement>('[data-k^="s5-size-"]');
    if (size) {
      sizes.forEach((s) => (s.style.color = ''));
      size.style.color = 'var(--red)';
    }
  };
  stage.addEventListener('click', onClick);

  return () => {
    intro?.kill();
    st?.kill();
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('click', onClick);
    gsap.ticker.remove(pointer);
  };
}
