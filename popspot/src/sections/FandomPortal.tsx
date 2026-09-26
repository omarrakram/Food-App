import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ProductObject } from '../components/ProductObject';
import { inUniverse, numberLabel, UNIVERSES, type Universe } from '../data/products';
import { gsap, reducedMotion, ScrollTrigger } from '../lib/gsap';
import { useStore } from '../lib/store';

const THEME: Record<Universe, { key: string; line: string }> = {
  ANIME: { key: 'anime', line: 'Speed lines on' },
  SPORTS: { key: 'sports', line: 'Stadium board live' },
  MARVEL: { key: 'marvel', line: 'Red light district of heroes' },
  'MOVIES & TV': { key: 'screen', line: 'Now showing' },
  'DISNEY · PIXAR': { key: 'disney', line: 'Soft focus, big eyes' },
};

/** Arrangement presets inside the portal, by product count: [x%, bottom%, height%, width%, z]. */
const LAYOUT: Record<number, [number, number, number, number, number][]> = {
  1: [[50, 7, 74, 70, 3]],
  2: [
    [36, 9, 62, 44, 3],
    [66, 13, 54, 40, 2],
  ],
  3: [
    [50, 6, 64, 40, 3],
    [22, 17, 44, 32, 2],
    [79, 17, 46, 32, 2],
  ],
  4: [
    [37, 6, 58, 34, 4],
    [65, 8, 54, 34, 3],
    [15, 23, 38, 28, 2],
    [86, 23, 38, 28, 2],
  ],
};

/**
 * THE FANDOM PORTAL. Each universe swaps in its own real products — nothing is
 * recoloured. Only universes with verified products are shown.
 */
export function FandomPortal() {
  const { openDetail } = useStore();
  const [u, setU] = useState<Universe>('ANIME');
  const [shown, setShown] = useState<Universe>('ANIME');
  const touched = useRef(false);
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const pick = (next: Universe, byUser = true) => {
    if (byUser) touched.current = true;
    setU(next);
  };

  // EJECT the current set, then SNAP the next universe in.
  useEffect(() => {
    if (u === shown) return;
    const s = stage.current;
    if (!s || reducedMotion()) {
      setShown(u);
      return;
    }
    busy.current = true;
    const q = gsap.utils.selector(s);
    gsap
      .timeline({
        onComplete: () => {
          busy.current = false;
          setShown(u);
        },
      })
      .to(q('.portal__obj'), { yPercent: 40, rotate: (i: number) => (i % 2 ? 18 : -18), autoAlpha: 0, duration: 0.22, ease: 'power3.in', stagger: 0.03 })
      .to(q('.portal__num'), { yPercent: -60, autoAlpha: 0, duration: 0.2, ease: 'power3.in' }, 0)
      .to(q('.portal__disc'), { scale: 0.94, duration: 0.18, ease: 'power2.in' }, 0);
  }, [u, shown]);

  useLayoutEffect(() => {
    const s = stage.current;
    if (!s || reducedMotion()) return;
    const q = gsap.utils.selector(s);
    gsap
      .timeline()
      .fromTo(q('.portal__disc'), { scale: 0.94 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.45)' })
      .fromTo(q('.portal__num'), { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.45, ease: 'power4.out' }, 0)
      .fromTo(
        q('.portal__obj'),
        { yPercent: 55, scale: 0.7, rotate: (i: number) => (i % 2 ? -12 : 12), autoAlpha: 0 },
        { yPercent: 0, scale: 1, rotate: 0, autoAlpha: 1, duration: 0.55, ease: 'back.out(1.9)', stagger: 0.06 },
        0.02,
      )
      .fromTo(q('.portal__fx'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0);
  }, [shown]);

  // Auto-cycle while on screen until the visitor takes over.
  useEffect(() => {
    const el = root.current;
    if (!el || reducedMotion()) return;
    let timer = 0;
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 60%',
      end: 'bottom 40%',
      onToggle: (self) => {
        window.clearInterval(timer);
        if (self.isActive)
          timer = window.setInterval(() => {
            if (touched.current || busy.current) return;
            setU((cur) => UNIVERSES[(UNIVERSES.indexOf(cur) + 1) % UNIVERSES.length]!);
          }, 3200);
      },
    });
    return () => {
      window.clearInterval(timer);
      st.kill();
    };
  }, []);

  const items = inUniverse(shown);
  const layout = LAYOUT[Math.min(items.length, 4)] ?? LAYOUT[1]!;
  const lead = items[0];
  const theme = THEME[shown];

  return (
    <section className={`portal portal--${theme.key}`} id="universes" ref={root} aria-labelledby="portal-h">
      <div className="portal__head">
        <p className="mono">02 — The fandom portal</p>
        <h2 id="portal-h" className="display portal__h">
          Find your
          <br />
          fandom.
        </h2>
        <p className="mono portal__hint">Hover, tap or use arrow keys. Each universe loads its own real products.</p>
      </div>

      <div
        className="portal__labels"
        role="tablist"
        aria-label="Universes"
        onKeyDown={(e) => {
          const i = UNIVERSES.indexOf(u);
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            pick(UNIVERSES[(i + 1) % UNIVERSES.length]!);
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            pick(UNIVERSES[(i - 1 + UNIVERSES.length) % UNIVERSES.length]!);
          }
        }}
      >
        {UNIVERSES.map((x) => {
          const list = inUniverse(x);
          const franchises = [...new Set(list.map((y) => y.franchise))].join(' · ');
          return (
            <button
              key={x}
              role="tab"
              aria-selected={x === u}
              tabIndex={x === u ? 0 : -1}
              className={`portal__label ${x === u ? 'is-on' : ''}`}
              onPointerEnter={(e) => e.pointerType === 'mouse' && pick(x)}
              onClick={() => pick(x)}
              data-cursor="ENTER"
            >
              <span className="display">{x}</span>
              <sup className="mono">{String(list.length).padStart(2, '0')}</sup>
              <span className="mono portal__fr">{franchises}</span>
            </button>
          );
        })}
      </div>

      <div className="portal__stage" ref={stage}>
        <span className="portal__num display" aria-hidden>
          {lead?.number ?? ''}
        </span>
        <div className="portal__disc" aria-hidden>
          <span className="portal__fx" />
          <span className="portal__ring" />
        </div>
        {items.slice(0, 4).map((prod, i) => {
          const [x, b, h, w, z] = layout[i]!;
          return (
            <button
              key={prod.id}
              className="portal__obj"
              style={{ left: `${x - w / 2}%`, width: `${w}%`, bottom: `${b}%`, height: `${h}%`, zIndex: z }}
              onClick={(e) => openDetail(prod.id, e.currentTarget.querySelector('img'))}
              data-cursor="INSPECT"
              aria-label={`Inspect ${prod.name}`}
            >
              <ProductObject product={prod} height="100%" fit />
            </button>
          );
        })}
        <div className="portal__readout">
          <span className="tag tag--ink">Universe / {shown}</span>
          <span className="mono">{theme.line}</span>
        </div>
        <ul className="portal__chips">
          {items.map((prod) => (
            <li key={prod.id}>
              <button className="portal__chip" onClick={(e) => openDetail(prod.id, e.currentTarget)} data-cursor="INSPECT">
                <b className="mono">{numberLabel(prod) ?? '—'}</b>
                <span className="cond">{prod.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
