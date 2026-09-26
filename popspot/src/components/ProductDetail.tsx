import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { numberLabel, priceLabel, product, products, spotId, type Product } from '../data/products';
import { gsap, reducedMotion } from '../lib/gsap';
import { useStore } from '../lib/store';
import { Barcode } from './Barcode';
import { nativeHeight } from './ProductObject';

const VERIFICATION_TEXT: Record<Product['verification'], string> = {
  listing: 'Pop Spot listing',
  'search-summary': 'Pop Spot listing (search index)',
  'character-only': 'Character listed · variant unconfirmed',
  unverified: 'Not matched to a listing',
};

function Row({ k, v, dim = false }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className={`pdp__row ${dim ? 'is-dim' : ''}`}>
      <dt className="mono">{k}</dt>
      <dd className="cond">{v}</dd>
    </div>
  );
}

/**
 * The inspection table. The product is pulled forward out of wherever it was
 * clicked, through a blue portal, into a collector-box viewing window.
 */
export function ProductDetail() {
  const { detail, closeDetail, openDetail, addToBag, toggleVault, inVault } = useStore();
  const root = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const lastFocus = useRef<Element | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const p = detail ? product(detail.id) : null;

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!p) return;
      const i = products.findIndex((x) => x.id === p.id);
      const next = products[(i + dir + products.length) % products.length]!;
      openDetail(next.id, null);
    },
    [p, openDetail],
  );

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, closeDetail, step]);

  // Open: blue portal from the click point, then the product flies into the window.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (!detail) {
      document.documentElement.classList.remove('is-locked');
      gsap.to(el, {
        clipPath: 'circle(0% at 50% 50%)',
        duration: 0.35,
        ease: 'power3.in',
        onComplete: () => {
          gsap.set(el, { display: 'none' });
          (lastFocus.current as HTMLElement | null)?.focus?.();
        },
      });
      return;
    }
    setShowOriginal(false);
    const first = el.style.display === 'none' || !el.style.display;
    if (first) lastFocus.current = document.activeElement;
    document.documentElement.classList.add('is-locked');
    gsap.set(el, { display: 'grid' });
    closeBtn.current?.focus({ preventScroll: true });
    if (reducedMotion()) {
      gsap.set(el, { clipPath: 'none' });
      return;
    }
    const from = detail.from;
    const cx = from ? from.left + from.width / 2 : window.innerWidth / 2;
    const cy = from ? from.top + from.height / 2 : window.innerHeight / 2;
    const tl = gsap.timeline();
    if (first) {
      tl.fromTo(el, { clipPath: `circle(0% at ${cx}px ${cy}px)` }, { clipPath: `circle(160% at ${cx}px ${cy}px)`, duration: 0.6, ease: 'power3.inOut' });
    }
    const target = img.current;
    if (target) {
      const to = target.getBoundingClientRect();
      if (from && to.width) {
        const s = from.height / to.height;
        tl.fromTo(
          target,
          { x: from.left + from.width / 2 - (to.left + to.width / 2), y: from.top + from.height / 2 - (to.top + to.height / 2), scale: s, rotate: -4 },
          { x: 0, y: 0, scale: 1, rotate: 0, duration: 0.75, ease: 'expo.out' },
          first ? 0.08 : 0,
        );
      } else {
        tl.fromTo(target, { y: 80, scale: 0.8, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.6)' }, 0);
      }
    }
    tl.fromTo(
      el.querySelectorAll('.pdp__row, .pdp__title > *, .pdp__actions > *'),
      { x: 30, autoAlpha: 0 },
      { x: 0, autoAlpha: 1, duration: 0.4, stagger: 0.035, ease: 'power3.out' },
      first ? 0.3 : 0.05,
    );
    tl.fromTo(el.querySelector('.pdp__bignum'), { yPercent: 30, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: 'power3.out' }, first ? 0.25 : 0);
  }, [detail]);

  // 2.5D: the window tilts a few degrees toward the pointer, gloss follows. Real photo, no invented sides.
  const onMove = (e: React.PointerEvent) => {
    const w = win.current;
    if (!w || reducedMotion() || e.pointerType !== 'mouse') return;
    const r = w.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(w, { rotateY: nx * 9, rotateX: -ny * 7, duration: 0.5, ease: 'power3.out' });
    gsap.to(w.querySelector('.pdp__gloss'), { xPercent: nx * 40, duration: 0.5, ease: 'power3.out' });
  };
  const onLeave = () => {
    if (win.current) gsap.to(win.current, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'power3.out' });
  };

  const saved = p ? inVault(p.id) : false;

  return (
    <div className="pdp" ref={root} role="dialog" aria-modal="true" aria-label={p ? `Inspect ${p.name}` : 'Inspect'} style={{ display: 'none' }}>
      {p && (
        <>
          <div className="pdp__stage" onPointerMove={onMove} onPointerLeave={onLeave}>
            <div className="pdp__window" ref={win} style={{ ['--accent' as string]: p.accent }}>
              <span className="pdp__bignum display outline-text" aria-hidden>
                {p.number ?? p.n}
              </span>
              <span className="pdp__spot" aria-hidden />
              <img
                ref={img}
                key={p.id + String(showOriginal)}
                className={`pdp__img ${showOriginal ? 'is-original' : ''}`}
                src={showOriginal ? p.original : p.image}
                alt={p.verification === 'unverified' ? `Collectible ${p.n}` : p.name}
                style={showOriginal ? undefined : { maxHeight: Math.round(nativeHeight(p) * 1.7) }}
              />
              <span className="pdp__gloss" aria-hidden />
              <span className="pdp__corner pdp__corner--tl mono">{spotId(p)}</span>
              <span className="pdp__corner pdp__corner--tr">
                {numberLabel(p) ? <span className="tag tag--yellow">{numberLabel(p)}</span> : <span className="tag">Unnumbered</span>}
              </span>
              <span className="pdp__corner pdp__corner--bl mono">{p.format ?? 'Collectible'}</span>
              <span className="pdp__corner pdp__corner--br">
                <Barcode value={p.sku ?? p.id} height={22} />
              </span>
            </div>
            <div className="pdp__view mono" role="group" aria-label="Photo view">
              <button className={!showOriginal ? 'is-on' : ''} onClick={() => setShowOriginal(false)}>
                Cutout
              </button>
              <button className={showOriginal ? 'is-on' : ''} onClick={() => setShowOriginal(true)}>
                Original photo
              </button>
            </div>
          </div>

          <aside className="pdp__data">
            <div className="pdp__top">
              <p className="mono mute">Collector data · {String(products.indexOf(p) + 1).padStart(2, '0')}/{products.length}</p>
              <div className="pdp__nav">
                <button className="btn btn--ink btn--icon btn--sm" onClick={() => step(-1)} aria-label="Previous product" data-cursor="PREV">
                  ←
                </button>
                <button className="btn btn--ink btn--icon btn--sm" onClick={() => step(1)} aria-label="Next product" data-cursor="NEXT">
                  →
                </button>
                <button ref={closeBtn} className="btn btn--white btn--sm" onClick={closeDetail} data-cursor="CLOSE">
                  Close
                </button>
              </div>
            </div>
            <div className="pdp__title">
              <p className="mono">{p.universe ? `Universe / ${p.universe}` : 'Universe / unsorted'}</p>
              <h2 className="display ink-outline">{p.name}</h2>
              <div className="pdp__tags">
                {p.tags.map((t) => (
                  <span key={t} className={`tag ${t === 'CHASE LISTED' ? 'tag--red' : t === 'GLOW' ? 'tag--ink' : 'tag--blue'}`}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <dl className="pdp__rows">
              <Row k="Item" v={p.name} />
              <Row k="Franchise" v={p.franchise ?? '—'} dim={!p.franchise} />
              <Row k="Format" v={p.format ?? '—'} dim={!p.format} />
              <Row k="Number" v={numberLabel(p) ?? 'Not stated'} dim={!p.number} />
              <Row k="Status" v="Check store" dim />
              <Row k="Price" v={priceLabel(p)} dim={p.price == null} />
              <Row k="Source" v={VERIFICATION_TEXT[p.verification]} />
            </dl>
            <div className="pdp__actions">
              <button className="btn" onClick={(e) => addToBag(p.id, e.currentTarget.closest('.pdp')?.querySelector('.pdp__img'))} data-cursor="COLLECT">
                Add to collection
              </button>
              <button
                className={`btn ${saved ? 'btn--yellow' : 'btn--white'}`}
                onClick={(e) => toggleVault(p.id, e.currentTarget.closest('.pdp')?.querySelector('.pdp__img'))}
                aria-pressed={saved}
                data-cursor="VAULT"
              >
                {saved ? '✓ In vault' : 'Save to vault'}
              </button>
              {p.sourceUrl && (
                <a className="pdp__source mono" href={p.sourceUrl} target="_blank" rel="noreferrer" data-cursor="OPEN">
                  View listing on popspotme.com ↗
                </a>
              )}
              <p className="mono mute pdp__note">“Add to collection” adds to your bag. Concept only — checkout would hand off to the real store.</p>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
