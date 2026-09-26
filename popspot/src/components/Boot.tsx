import { useEffect, useRef, useState } from 'react';

import { products } from '../data/products';
import { gsap, reducedMotion } from '../lib/gsap';
import { preloadImages } from '../lib/preload';

/**
 * No spinner: one inventory dot per real product, lit as its photograph is
 * decoded. Then the dots collapse into a single blue spot that opens the site.
 */
export function Boot({ onDone }: { onDone: () => void }) {
  const [loaded, setLoaded] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const cap = window.setTimeout(finish, 3500);
    preloadImages(
      products.map((p) => p.image),
      (n) => setLoaded(n),
    ).then(finish);

    function finish() {
      if (done.current) return;
      done.current = true;
      window.clearTimeout(cap);
      const el = root.current;
      if (!el || reducedMotion()) {
        onDone();
        return;
      }
      const tl = gsap.timeline({ onComplete: onDone });
      tl.to(el.querySelectorAll('.boot__dot'), { x: (_i: number, t: HTMLElement) => {
          const r = t.getBoundingClientRect();
          return window.innerWidth / 2 - (r.left + r.width / 2);
        }, duration: 0.32, ease: 'power3.in', stagger: { each: 0.012, from: 'edges' } })
        .to(el.querySelector('.boot__label'), { autoAlpha: 0, y: -8, duration: 0.2 }, 0)
        .set(el.querySelector('.boot__spot'), { autoAlpha: 1 })
        .fromTo(
          el,
          { clipPath: 'circle(150% at 50% 50%)' },
          { clipPath: 'circle(0% at 50% 50%)', duration: 0.55, ease: 'power4.inOut' },
          '+=0.04',
        );
    }
    return () => window.clearTimeout(cap);
  }, []);

  return (
    <div className="boot" ref={root} role="status" aria-live="polite">
      <div className="boot__row" aria-hidden>
        {products.map((p, i) => (
          <i key={p.id} className={`boot__dot ${i < loaded ? 'is-on' : ''}`} />
        ))}
        <i className="boot__spot" />
      </div>
      <p className="boot__label mono">
        Scanning collection… <b>{String(loaded).padStart(2, '0')}</b>/{products.length}
      </p>
    </div>
  );
}
