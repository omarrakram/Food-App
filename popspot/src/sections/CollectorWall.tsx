import { useCallback, useEffect, useRef, useState } from 'react';

import { ProductObject } from '../components/ProductObject';
import { numberLabel, priceLabel, product, products, type Product } from '../data/products';
import { gsap, reducedMotion, ScrollTrigger } from '../lib/gsap';
import { useStore } from '../lib/store';

/** Five rows, each a different real-product order; rows run in alternating directions. */
const ROWS: string[][] = [
  ['03', '16', '08', '11', '06', '13', '02', '15'],
  ['10', '05', '14', '01', '12', '04', '09', '07'],
  ['15', '02', '13', '08', '16', '06', '03', '11'],
  ['07', '09', '04', '12', '01', '14', '05', '10'],
  ['06', '11', '03', '16', '08', '02', '15', '13'],
];
const MIDDLE = 2;
const SPEED = [0.55, -0.7, 0.62, -0.5, 0.66]; // px per frame at 60fps

interface Lock {
  id: string;
}

/**
 * THE WALL. Every object is a real product. A fixed blue SPOT sits at the
 * centre; lock on and the wall stops, the object is pulled into the spot.
 */
export function CollectorWall() {
  const { openDetail, toggleVault, inVault } = useStore();
  const root = useRef<HTMLElement>(null);
  const tracks = useRef<(HTMLDivElement | null)[]>([]);
  const offsets = useRef<number[]>(ROWS.map(() => 0));
  const speedMul = useRef(1);
  const boost = useRef(0);
  const [lock, setLock] = useState<Lock | null>(null);
  const clone = useRef<HTMLDivElement>(null);
  const active = useRef(false);

  // Marquee engine: one ticker drives all rows; scroll velocity adds a kick.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = reducedMotion();
    const tick = () => {
      if (!active.current) return;
      tracks.current.forEach((t, i) => {
        if (!t) return;
        const half = t.scrollWidth / 2;
        const v = reduce ? 0 : SPEED[i]! * speedMul.current * (1 + boost.current);
        offsets.current[i] = gsap.utils.wrap(-half, 0, offsets.current[i]! - v);
        t.style.transform = `translate3d(${offsets.current[i]}px,0,0)`;
      });
      boost.current *= 0.92;
    };
    gsap.ticker.add(tick);
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top bottom',
      end: 'bottom top',
      onToggle: (s) => (active.current = s.isActive),
      onUpdate: (s) => {
        boost.current = Math.min(6, Math.abs(s.getVelocity()) / 400);
      },
    });
    return () => {
      gsap.ticker.remove(tick);
      st.kill();
    };
  }, []);

  const spotCenter = () => {
    const s = root.current?.querySelector('.wall__spot')?.getBoundingClientRect();
    return s ? { x: s.left + s.width / 2, y: s.top + s.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
  };

  const doLock = useCallback((id: string, from: Element) => {
    const el = root.current;
    const c = clone.current;
    if (!el || !c) return;
    setLock({ id });
    gsap.to(speedMul, { current: 0, duration: 0.35, ease: 'power3.out' });
    const r = from.getBoundingClientRect();
    const sc = spotCenter();
    const host = el.getBoundingClientRect();
    const img = c.querySelector('img');
    if (img) img.src = product(id).image;
    const targetH = Math.min(window.innerHeight * 0.5, 460);
    gsap.set(c, {
      display: 'block',
      left: r.left - host.left + r.width / 2,
      top: r.top - host.top + r.height,
      height: r.height,
      xPercent: -50,
      yPercent: -100,
      x: 0,
      y: 0,
    });
    const q = gsap.utils.selector(el);
    const tl = gsap.timeline();
    tl.to(q('.wall__row'), { opacity: 0.18, duration: 0.3 }, 0)
      .to(
        c,
        {
          left: sc.x - host.left,
          top: sc.y - host.top + targetH * 0.5,
          height: targetH,
          duration: reducedMotion() ? 0 : 0.6,
          ease: 'expo.out',
        },
        0,
      )
      .fromTo(q('.wall__spot-ring'), { scale: 2.6 }, { scale: (targetH / 250) * 1.08, duration: 0.4, ease: 'back.out(2.4)' }, 0.25)
      .fromTo(q('.wall__card'), { autoAlpha: 0, x: 40 }, { autoAlpha: 1, x: 0, duration: 0.4, ease: 'power3.out' }, 0.35)
      .fromTo(q('.wall__spotted'), { scale: 2.2, rotate: -25, autoAlpha: 0 }, { scale: 1, rotate: -8, autoAlpha: 1, duration: 0.35, ease: 'back.out(2.4)' }, 0.42);
  }, []);

  const release = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    gsap.to(q('.wall__row'), { opacity: 1, duration: 0.3 });
    gsap.to(q('.wall__spot-ring'), { scale: 1, duration: 0.3, ease: 'power3.out' });
    gsap.to(q('.wall__card, .wall__spotted'), { autoAlpha: 0, duration: 0.2 });
    gsap.to(clone.current, { autoAlpha: 0, scale: 0.6, duration: 0.25, onComplete: () => gsap.set(clone.current, { display: 'none', autoAlpha: 1, scale: 1 }) });
    gsap.to(speedMul, { current: 1, duration: 0.8, ease: 'power2.in' });
    setLock(null);
  }, []);

  /** LOCK ON: find the object nearest the spot in the middle row, glide it in exactly, lock. */
  const lockNearest = () => {
    const t = tracks.current[MIDDLE];
    if (!t) return;
    const sc = spotCenter();
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    t.querySelectorAll<HTMLElement>('.wall__item').forEach((it) => {
      const r = it.getBoundingClientRect();
      const d = r.left + r.width / 2 - sc.x;
      if (Math.abs(d) < Math.abs(bestD)) {
        bestD = d;
        best = it;
      }
    });
    const target = best as HTMLElement | null;
    if (!target) return;
    gsap.to(speedMul, { current: 0, duration: 0.2 });
    const half = t.scrollWidth / 2;
    const obj = { v: offsets.current[MIDDLE]! };
    gsap.to(obj, {
      v: obj.v - bestD,
      duration: reducedMotion() ? 0 : 0.55,
      ease: 'power3.inOut',
      onUpdate: () => {
        offsets.current[MIDDLE] = obj.v;
        t.style.transform = `translate3d(${gsap.utils.wrap(-half, 0, obj.v)}px,0,0)`;
      },
      onComplete: () => doLock(target.dataset.id!, target.querySelector('.pobj')!),
    });
  };

  const locked: Product | null = lock ? product(lock.id) : null;

  return (
    <section className="wall" id="wall" ref={root} aria-labelledby="wall-h">
      <div className="wall__rows" aria-hidden={!!lock}>
        {ROWS.map((row, ri) => (
          <div className="wall__row" key={ri}>
            <div className="wall__track" ref={(n) => void (tracks.current[ri] = n)}>
              {[...row, ...row].map((n, i) => {
                const prod = product(`product-${n}`);
                const copy = i >= row.length;
                return (
                  <button
                    key={`${n}-${i}`}
                    className="wall__item"
                    data-id={prod.id}
                    tabIndex={copy || ri !== MIDDLE ? -1 : 0}
                    aria-hidden={copy || undefined}
                    onClick={(e) => (lock ? release() : doLock(prod.id, e.currentTarget.querySelector('.pobj')!))}
                    data-cursor="LOCK"
                    aria-label={`Lock on ${prod.name}`}
                  >
                    <ProductObject product={prod} height="100%" />
                    <span className="wall__label mono">
                      {numberLabel(prod) ?? `OBJ ${prod.n}`} · {prod.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="wall__head">
        <p className="mono">03 — The wall</p>
        <h2 id="wall-h" className="display">
          Spotted:{' '}
          <br />
          your next{' '}
          <br />
          obsession.
        </h2>
        <p className="mono wall__stats">
          Rows 05 · Objects {products.length} · All real
        </p>
        <div className="wall__controls">
          {lock ? (
            <button className="btn btn--white" onClick={release} data-cursor="RELEASE">
              Release
            </button>
          ) : (
            <button className="btn" onClick={lockNearest} data-cursor="LOCK">
              ◎ Lock on
            </button>
          )}
        </div>
      </div>

      <div className="wall__spot" aria-hidden>
        <span className="wall__spot-ring" />
        <span className="wall__spot-cross" />
        <span className="wall__spot-label mono">Spot 00</span>
      </div>

      <div className="wall__clone" ref={clone} aria-hidden>
        <img alt="" />
      </div>

      <div className="wall__spotted" aria-hidden>
        Spotted
      </div>

      <div className="wall__card" role="status" aria-live="polite">
        {locked && (
          <>
            <p className="mono">Lock confirmed · {locked.universe ?? 'Unsorted'}</p>
            <h3 className="display">{locked.name}</h3>
            <p className="wall__card-row">
              {numberLabel(locked) && <span className="tag tag--yellow">{numberLabel(locked)}</span>}
              <span className="mono">{locked.franchise ?? 'Not matched to a listing'}</span>
            </p>
            <p className="wall__card-row">
              <span className={locked.price != null ? 'price-gun' : 'price-gun price-gun--muted'}>{priceLabel(locked)}</span>
              {locked.tags.map((t) => (
                <span key={t} className="tag tag--blue">
                  {t}
                </span>
              ))}
            </p>
            <div className="wall__card-actions">
              <button className="btn btn--sm" onClick={(e) => openDetail(locked.id, e.currentTarget.closest('.wall')?.querySelector('.wall__clone img'))} data-cursor="INSPECT">
                Inspect
              </button>
              <button className="btn btn--white btn--sm" onClick={(e) => toggleVault(locked.id, e.currentTarget)} data-cursor="VAULT">
                {inVault(locked.id) ? '✓ In vault' : 'Save to vault'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
