import { useEffect, useRef } from 'react';

import { BrandMark } from '../components/BrandMark';
import { ProductObject } from '../components/ProductObject';
import { brand, concept, facts } from '../data/brand';
import { products } from '../data/products';
import { gsap, reducedMotion, ScrollTrigger } from '../lib/gsap';

// Heap rows for the cascade (bottom first) and the perimeter they burst out to.
const HEAP = [6, 5, 3, 2];
const RING: [number, number][] = [
  [7, 22], [21, 17], [36, 15], [64, 15], [79, 17], [93, 22],
  [6, 50], [94, 50],
  [7, 78], [21, 84], [36, 88], [50, 90], [64, 88], [79, 84], [93, 78], [50, 16],
];

/**
 * THE CASCADE → END FRAME. Real products fall and stack, the stack collapses
 * into one spot, then bursts out to the edges around the lockup.
 */
export function EndFrame() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const items = q('.end__item');
    const stage = q('.end__stage')[0] as HTMLElement;

    const ringPos = (i: number) => {
      const r = stage.getBoundingClientRect();
      const [x, y] = RING[i % RING.length]!;
      return { x: (x / 100) * r.width, y: (y / 100) * r.height };
    };
    const heapPos = (i: number) => {
      const r = stage.getBoundingClientRect();
      let row = 0;
      let k = i;
      while (row < HEAP.length && k >= HEAP[row]!) k -= HEAP[row++]!;
      const n = HEAP[Math.min(row, HEAP.length - 1)]!;
      const gap = Math.min(r.width / 7.5, 190);
      return { x: r.width / 2 + (k - (n - 1) / 2) * gap, y: r.height - r.height * 0.06 - row * r.height * 0.13, rot: ((i * 37) % 22) - 11 };
    };

    const settle = () =>
      items.forEach((it, i) => {
        const pos = ringPos(i);
        gsap.set(it, { x: pos.x, y: pos.y, xPercent: -50, yPercent: -50, rotate: ((i * 29) % 16) - 8, scale: 1, autoAlpha: 1 });
      });

    if (reducedMotion()) {
      settle();
      gsap.set(q('.end__lockup > *'), { autoAlpha: 1 });
      return;
    }

    gsap.set(items, { xPercent: -50, yPercent: -100, autoAlpha: 0 });
    gsap.set(q('.end__lockup > *'), { autoAlpha: 0 });
    const tl = gsap.timeline({ paused: true });
    items.forEach((it, i) => {
      const h = heapPos(i);
      tl.fromTo(
        it,
        { x: h.x + (((i * 53) % 40) - 20), y: -stage.clientHeight * 0.4, rotate: h.rot * 3, autoAlpha: 1 },
        { x: h.x, y: h.y, rotate: h.rot, duration: 0.5, ease: 'bounce.out' },
        i * 0.05,
      );
    });
    const center = () => ({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
    tl.to(items, { x: () => center().x, y: () => center().y + 60, scale: 0.08, rotate: 0, duration: 0.35, ease: 'power3.in', stagger: 0.008 }, '+=0.2')
      .fromTo(q('.end__spot'), { scale: 0 }, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, '-=0.1')
      .to(q('.end__spot'), { scale: 0, duration: 0.2, ease: 'power3.in' }, '+=0.02')
      .addLabel('burst')
      .to(items, {
        x: (i: number) => ringPos(i).x,
        y: (i: number) => ringPos(i).y,
        yPercent: -50,
        rotate: (i: number) => ((i * 29) % 16) - 8,
        scale: 1,
        duration: 0.9,
        ease: 'expo.out',
        stagger: { each: 0.015, from: 'center' },
      }, 'burst')
      .fromTo(q('.end__mark'), { scale: 2.6, rotate: -20, autoAlpha: 0 }, { scale: 1, rotate: -4, autoAlpha: 1, duration: 0.45, ease: 'back.out(2.6)' }, 'burst+=0.05')
      .fromTo(q('.end__line span'), { yPercent: 110, autoAlpha: 1 }, { yPercent: 0, duration: 0.55, stagger: 0.08, ease: 'power4.out' }, 'burst+=0.2')
      .set(q('.end__line'), { autoAlpha: 1 }, 'burst+=0.2')
      .to(q('.end__lockup > *:not(.end__mark):not(.end__line)'), { autoAlpha: 1, duration: 0.4, stagger: 0.06 }, 'burst+=0.5');

    const st = ScrollTrigger.create({ trigger: el, start: 'top 55%', once: true, onEnter: () => tl.play() });
    const onResize = () => tl.progress() === 1 && settle();
    window.addEventListener('resize', onResize);
    return () => {
      st.kill();
      tl.kill();
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <footer className="end" ref={root} aria-labelledby="end-h">
      <div className="end__stage">
        {products.map((prod) => (
          <div key={prod.id} className="end__item" aria-hidden>
            <ProductObject product={prod} height="100%" />
          </div>
        ))}
        <span className="end__spot" aria-hidden />
        <div className="end__lockup">
          <div className="end__mark">
            <BrandMark tone="white" />
          </div>
          <h2 id="end-h" className="display end__line ink-outline">
            <span>Every fandom</span>
            <span>has a spot.</span>
          </h2>
          <p className="mono end__small">
            {concept.title} · Unofficial digital concept
            <br />
            {concept.author} / {concept.year} · Not affiliated with Pop Spot
          </p>
          <a className="btn btn--white" href="/showcase" data-cursor="PLAY">
            ▶ Play the 15s collector-film
          </a>
        </div>
      </div>

      <div className="end__foot">
        <div>
          <p className="mono mute">The real store</p>
          <a className="cond end__link" href={brand.site} target="_blank" rel="noreferrer">
            popspotme.com ↗
          </a>
          <p className="mono">{brand.handle}</p>
        </div>
        <div>
          <p className="mono mute">What Pop Spot says it is</p>
          <ul className="mono end__facts">
            <li>{facts.reseller}</li>
            <li>{facts.lines}</li>
            <li>{facts.delivery}</li>
          </ul>
        </div>
        <div>
          <p className="mono mute">About this concept</p>
          <p className="mono">
            “Every fandom has a spot” is concept copy, not a Pop Spot slogan. Product photos are real Pop Spot imagery;
            names and numbers come from popspotme.com listings. Unmatched items carry neutral labels. Prices and stock are set by the store.
          </p>
        </div>
      </div>
    </footer>
  );
}
