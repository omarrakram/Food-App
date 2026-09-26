import { useEffect, useLayoutEffect, useRef } from 'react';

import { brand } from '../data/brand';
import { numberLabel, priceLabel, product } from '../data/products';
import { gsap, reducedMotion } from '../lib/gsap';
import { useStore } from '../lib/store';

export function BagDrawer() {
  const { bag, bagOpen, setBagOpen, removeFromBag } = useStore();
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBagOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setBagOpen]);

  useLayoutEffect(() => {
    const d = el.current;
    if (!d) return;
    const dur = reducedMotion() ? 0 : 0.4;
    if (bagOpen) {
      gsap.set(d, { display: 'block' });
      gsap.fromTo(d.querySelector('.bag__panel'), { xPercent: 105 }, { xPercent: 0, duration: dur, ease: 'power4.out' });
      gsap.fromTo(d.querySelector('.bag__scrim'), { autoAlpha: 0 }, { autoAlpha: 1, duration: dur });
      (d.querySelector('.bag__close') as HTMLElement | null)?.focus();
    } else {
      gsap.to(d.querySelector('.bag__panel'), { xPercent: 105, duration: dur * 0.7, ease: 'power3.in' });
      gsap.to(d.querySelector('.bag__scrim'), { autoAlpha: 0, duration: dur * 0.7, onComplete: () => gsap.set(d, { display: 'none' }) });
    }
  }, [bagOpen]);

  const known = bag.map((id) => product(id));
  const priced = known.filter((p) => p.price != null);
  const subtotal = priced.reduce((s, p) => s + (p.price ?? 0), 0);

  return (
    <div className="bag" ref={el} style={{ display: 'none' }}>
      <div className="bag__scrim" onClick={() => setBagOpen(false)} />
      <aside className="bag__panel" role="dialog" aria-modal="true" aria-label="Collection bag">
        <div className="bag__head">
          <h2 className="display">Bag</h2>
          <span className="mono">{String(bag.length).padStart(2, '0')} objects</span>
          <button className="btn btn--white btn--sm bag__close" onClick={() => setBagOpen(false)}>
            Close
          </button>
        </div>
        {known.length === 0 ? (
          <div className="bag__empty">
            <span className="bag__slot" aria-hidden />
            <p className="mono">Empty slot. Spot something and hit “Add to collection”.</p>
          </div>
        ) : (
          <ul className="bag__list">
            {known.map((p, i) => (
              <li key={`${p.id}-${i}`} className="bag__item">
                <img src={p.image} alt="" />
                <div>
                  <p className="cond">{p.name}</p>
                  <p className="mono mute">
                    {numberLabel(p) ?? p.n} · {p.franchise ?? 'Unlisted'}
                  </p>
                </div>
                <span className={p.price != null ? 'price-gun' : 'price-gun price-gun--muted'}>{priceLabel(p)}</span>
                <button className="bag__remove mono" onClick={() => removeFromBag(i)} aria-label={`Remove ${p.name}`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="bag__foot">
          <p className="mono">
            Listed prices: {subtotal ? `${subtotal.toLocaleString('en-US')} EGP` : '—'}
            {priced.length < known.length && <span className="mute"> · {known.length - priced.length} to confirm on store</span>}
          </p>
          <a className="btn btn--yellow" href={brand.site} target="_blank" rel="noreferrer">
            Checkout on popspotme.com ↗
          </a>
          <p className="mono mute">Concept UI. Prices and availability are set by Pop Spot.</p>
        </div>
      </aside>
    </div>
  );
}
