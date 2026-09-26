import { useCallback, useEffect, useRef, useState } from 'react';

import { facts } from '../data/brand';
import { numberLabel, p, priceLabel, products, spotId, type Product } from '../data/products';
import { gsap, reducedMotion, ScrollTrigger } from '../lib/gsap';
import { useStore } from '../lib/store';

interface Line {
  k: string;
  v: string;
  known: boolean;
}

/** Only facts in the manifest. Unknown fields say so — no invented rarity scores. */
function readout(x: Product): Line[] {
  return [
    { k: 'Format', v: x.format ? `Funko ${x.format}` : 'Not listed', known: !!x.format },
    { k: 'Number', v: numberLabel(x) ?? 'Not stated', known: !!x.number },
    { k: 'Item', v: x.verification === 'unverified' ? `Object ${x.n}` : x.name, known: x.verification !== 'unverified' },
    { k: 'Franchise', v: x.franchise ?? 'Not listed', known: !!x.franchise },
    { k: 'Universe', v: x.universe ?? 'Unsorted', known: !!x.universe },
    { k: 'Labels', v: x.tags.length ? x.tags.join(' · ') : 'None listed', known: x.tags.length > 0 },
    { k: 'Price', v: priceLabel(x), known: x.price != null },
    { k: 'Spot ID', v: spotId(x), known: true },
  ];
}

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/';

function scramble(el: HTMLElement, text: string, duration = 0.35) {
  const o = { t: 0 };
  return gsap.to(o, {
    t: 1,
    duration,
    ease: 'none',
    onUpdate: () => {
      const n = Math.floor(o.t * text.length);
      let out = text.slice(0, n);
      for (let i = n; i < text.length; i++) out += text[i] === ' ' ? ' ' : GLYPHS[(i * 7 + Math.floor(o.t * 40)) % GLYPHS.length];
      el.textContent = out;
    },
    onComplete: () => void (el.textContent = text),
  });
}

/**
 * THE SCANNER. A real product enters the chamber; a blue beam passes top to
 * bottom and the collector data it can verify prints out. Ends: SPOTTED ✓.
 */
export function RarityScanner() {
  const { openDetail } = useStore();
  const [id, setId] = useState(p('10').id);
  const root = useRef<HTMLElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const seen = useRef(false);
  const current = products.find((x) => x.id === id)!;

  const scan = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    tl.current?.kill();
    const lines = q('.scan__val') as HTMLElement[];
    const data = readout(current);
    lines.forEach((l) => (l.textContent = '············'));
    if (reducedMotion()) {
      lines.forEach((l, i) => (l.textContent = data[i]!.v));
      gsap.set(q('.scan__row'), { autoAlpha: 1 });
      gsap.set(q('.scan__stamp'), { autoAlpha: 1, scale: 1, rotate: -10 });
      gsap.set(q('.scan__xray'), { clipPath: 'inset(0% 0% 100% 0%)' });
      return;
    }
    const t = gsap.timeline();
    t.set(q('.scan__stamp'), { autoAlpha: 0 })
      .set(q('.scan__row'), { autoAlpha: 0.25 })
      .set(q('.scan__verdict'), { autoAlpha: 0 })
      .fromTo(q('.scan__obj'), { y: 120, scale: 0.8, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.45, ease: 'back.out(1.6)' })
      .fromTo(q('.scan__beam'), { top: '0%', autoAlpha: 1 }, { top: '100%', duration: 1.5, ease: 'none' }, 0.4)
      .fromTo(q('.scan__xray'), { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'none' }, 0.4)
      .to(q('.scan__xray'), { clipPath: 'inset(100% 0% 0% 0%)', duration: 0.35, ease: 'power2.in' }, 1.95)
      .to(q('.scan__beam'), { autoAlpha: 0, duration: 0.1 }, 1.9);
    lines.forEach((l, i) => {
      const at = 0.45 + (i / lines.length) * 1.45;
      t.to(q('.scan__row')[i]!, { autoAlpha: 1, duration: 0.1 }, at);
      t.add(scramble(l, data[i]!.v, 0.3), at);
    });
    t.fromTo(q('.scan__stamp'), { scale: 2.8, rotate: 25, autoAlpha: 0 }, { scale: 1, rotate: -10, autoAlpha: 1, duration: 0.4, ease: 'back.out(2.8)' }, 2.05)
      .fromTo(q('.scan__chamber'), { x: -10 }, { x: 0, duration: 0.4, ease: 'elastic.out(1.3, 0.3)' }, 2.12)
      .fromTo(q('.scan__verdict'), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 2.3);
    tl.current = t;
  }, [current]);

  // First scan when the chamber comes into view; every tray pick rescans.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (seen.current) {
      scan();
      return;
    }
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 55%',
      once: true,
      onEnter: () => {
        seen.current = true;
        scan();
      },
    });
    return () => st.kill();
  }, [scan]);

  const data = readout(current);

  return (
    <section className="scan" id="scanner" ref={root} aria-labelledby="scan-h">
      <div className="scan__head">
        <p className="mono">05 — The scanner</p>
        <h2 id="scan-h" className="display">
          Scan{' '}
          <br />
          it.
        </h2>
        <p className="mono scan__note">Reads only what Pop Spot lists. No rarity scores, no guesses.</p>
      </div>

      <div className="scan__tray" role="listbox" aria-label="Choose an object to scan">
        {products.map((x) => (
          <button
            key={x.id}
            role="option"
            aria-selected={x.id === id}
            className={`scan__slot ${x.id === id ? 'is-on' : ''}`}
            onClick={() => setId(x.id)}
            data-cursor="SCAN"
            aria-label={`Scan ${x.name}`}
          >
            <img src={x.image} alt="" loading="lazy" />
            <span className="mono">{x.n}</span>
          </button>
        ))}
      </div>

      <div className="scan__chamber">
        <span className="scan__corner scan__corner--tl" aria-hidden />
        <span className="scan__corner scan__corner--tr" aria-hidden />
        <span className="scan__corner scan__corner--bl" aria-hidden />
        <span className="scan__corner scan__corner--br" aria-hidden />
        <span className="scan__grid" aria-hidden />
        <div className="scan__objwrap">
          <button className="scan__obj" onClick={(e) => openDetail(current.id, e.currentTarget.querySelector('img'))} data-cursor="INSPECT" aria-label={`Inspect ${current.name}`}>
            <img src={current.image} alt={current.verification === 'unverified' ? `Collectible ${current.n}` : current.name} style={{ aspectRatio: `${current.w}/${current.h}` }} />
            <span className="scan__xray" aria-hidden style={{ WebkitMaskImage: `url(${current.image})`, maskImage: `url(${current.image})` }} />
          </button>
        </div>
        <span className="scan__beam" aria-hidden />
        <span className="scan__chamber-label mono" aria-hidden>
          Chamber 01 · {spotId(current)}
        </span>
        <div className="scan__stamp" aria-hidden>
          <span>Spotted</span>
          <b>✓</b>
        </div>
      </div>

      <div className="scan__readout" aria-live="polite">
        <dl>
          {data.map((l) => (
            <div className={`scan__row ${l.known ? '' : 'is-unknown'}`} key={l.k}>
              <dt className="mono">{l.k}</dt>
              <dd className="cond scan__val">{l.v}</dd>
            </div>
          ))}
        </dl>
        <p className="scan__verdict mono">
          <span className="tag tag--blue">✓ Spotted</span> Sold by a {facts.reseller.toLowerCase()} · verify on store
        </p>
        <button className="btn btn--white btn--sm" onClick={scan} data-cursor="SCAN">
          ↻ Scan again
        </button>
      </div>
    </section>
  );
}
