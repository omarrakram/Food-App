import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Barcode } from '../components/Barcode';
import { ProductObject } from '../components/ProductObject';
import { numberLabel, priceLabel, products, spotId, UNIVERSES, type Product, type Universe } from '../data/products';
import { gsap, reducedMotion } from '../lib/gsap';
import { useStore } from '../lib/store';

type Filter = 'ALL' | Universe;
const FILTERS: Filter[] = ['ALL', ...UNIVERSES];
const BAY = 300; // px per shelf bay (desktop); mobile uses CSS var

/**
 * THE COLLECTOR SHELF. An endless store shelf: drag it, fling it, pull one
 * object forward to read its bin label. SURPRISE ME spins it and deals one out.
 */
export function CollectorShelf() {
  const { addToBag, toggleVault, inVault, openDetail } = useStore();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [pulled, setPulled] = useState<string | null>(null);
  const [gotId, setGotId] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const x = useRef(0);
  const spinning = useRef(false);

  const list = useMemo(() => (filter === 'ALL' ? products : products.filter((p) => p.universe === filter)), [filter]);
  const bay = () => (window.innerWidth < 760 ? 220 : BAY);
  const span = () => list.length * bay();

  const render = useCallback(() => {
    const t = track.current;
    if (!t) return;
    const w = span();
    const v = gsap.utils.wrap(-w * 2, -w, x.current); // always show the middle copy region
    t.style.transform = `translate3d(${v}px,0,0)`;
  }, [list]);

  // Start centred on the middle copy.
  useLayoutEffect(() => {
    x.current = -span();
    render();
    setPulled(null);
  }, [list, render]);

  // Drag + fling (pointer), wheel, keyboard.
  useEffect(() => {
    const t = track.current?.parentElement;
    if (!t) return;
    let down = false;
    let lastX = 0;
    let lastT = 0;
    let vel = 0;
    let moved = 0;
    let fling: gsap.core.Tween | null = null;
    const onDown = (e: PointerEvent) => {
      if (spinning.current) return;
      down = true;
      moved = 0;
      lastX = e.clientX;
      lastT = performance.now();
      vel = 0;
      fling?.kill();
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - lastX;
      const now = performance.now();
      vel = dx / Math.max(1, now - lastT);
      lastX = e.clientX;
      lastT = now;
      moved += Math.abs(dx);
      x.current += dx;
      render();
      if (moved > 6) t.classList.add('is-dragging');
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      window.setTimeout(() => t.classList.remove('is-dragging'), 0);
      if (reducedMotion()) return;
      const o = { v: x.current };
      fling = gsap.to(o, { v: x.current + vel * 380, duration: 0.9, ease: 'power3.out', onUpdate: () => ((x.current = o.v), render()) });
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      x.current -= e.deltaX;
      render();
    };
    // Suppress the click that ends a drag, so dragging never opens a product.
    const onClickCapture = (e: MouseEvent) => {
      if (t.classList.contains('is-dragging')) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    t.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    t.addEventListener('wheel', onWheel, { passive: false });
    t.addEventListener('click', onClickCapture, true);
    return () => {
      t.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      t.removeEventListener('wheel', onWheel);
      t.removeEventListener('click', onClickCapture, true);
    };
  }, [render]);

  // PULL: the chosen object comes forward; the rest of the shelf recedes.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const dur = reducedMotion() ? 0 : 0.45;
    q('.shelf__bay').forEach((b) => {
      const on = pulled !== null && (b as HTMLElement).dataset.id === pulled;
      gsap.to(b.querySelector('.shelf__obj'), {
        y: on ? -18 : 0,
        scale: on ? 1.16 : pulled ? 0.9 : 1,
        opacity: pulled && !on ? 0.28 : 1,
        duration: dur,
        ease: on ? 'back.out(1.8)' : 'power3.out',
      });
      gsap.to(b.querySelector('.shelf__bin'), { opacity: pulled && !on ? 0.3 : 1, duration: dur });
    });
    if (pulled) gsap.fromTo(q('.shelf__drawer'), { y: 30, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: dur, ease: 'power3.out' });
    else gsap.to(q('.shelf__drawer'), { autoAlpha: 0, duration: dur * 0.5 });
  }, [pulled]);

  /** Bring the middle-copy bay for `id` to the shelf centre. */
  const centreOn = (id: string, dur = 0.6) => {
    const i = list.findIndex((p) => p.id === id);
    const viewport = track.current?.parentElement?.clientWidth ?? window.innerWidth;
    const target = -(span() + i * bay()) + viewport / 2 - bay() / 2;
    const o = { v: x.current };
    return gsap.to(o, { v: target, duration: reducedMotion() ? 0 : dur, ease: 'power3.inOut', onUpdate: () => ((x.current = o.v), render()) });
  };

  const pull = (id: string) => {
    if (pulled === id) return setPulled(null);
    centreOn(id, 0.5);
    setPulled(id);
  };

  // SURPRISE ME: the shelf spins violently, slows, deals one random object.
  const surprise = () => {
    if (spinning.current) return;
    spinning.current = true;
    setPulled(null);
    setGotId(null);
    const pick = list[Math.floor(Math.random() * list.length)]!;
    const i = list.indexOf(pick);
    const viewport = track.current?.parentElement?.clientWidth ?? window.innerWidth;
    const base = -(span() + i * bay()) + viewport / 2 - bay() / 2;
    const loops = 4 + Math.floor(Math.random() * 2);
    const target = base - loops * span();
    const o = { v: x.current };
    const t = track.current;
    gsap
      .timeline({
        onComplete: () => {
          x.current = base;
          render();
          spinning.current = false;
          setPulled(pick.id);
          setGotId(pick.id);
        },
      })
      .to(t, { skewX: -8, duration: 0.2, ease: 'power2.in' }, 0)
      .to(o, { v: target, duration: reducedMotion() ? 0 : 2.3, ease: 'power4.inOut', onUpdate: () => ((x.current = o.v), render()) }, 0)
      .to(t, { skewX: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' }, 1.9);
  };

  useEffect(() => {
    if (!gotId || !root.current || reducedMotion()) return;
    gsap.fromTo(root.current.querySelector('.shelf__got'), { scale: 2.4, rotate: 20, autoAlpha: 0 }, { scale: 1, rotate: -4, autoAlpha: 1, duration: 0.45, ease: 'back.out(2.6)' });
  }, [gotId]);

  const pulledP: Product | null = pulled ? products.find((p) => p.id === pulled) ?? null : null;
  const got = gotId ? products.find((p) => p.id === gotId) : null;

  // Enough copies that a short list (one universe) still fills the viewport, like
  // several facings of the same Pop on a real shelf.
  const copies = Math.max(3, Math.ceil((typeof window === 'undefined' ? 1440 : window.innerWidth) / (list.length * bay())) + 2);
  const bays: { p: Product; copy: number }[] = [];
  for (let c = 0; c < copies; c++) list.forEach((p) => bays.push({ p, copy: c }));

  return (
    <section className="shelf" id="shelf" ref={root} aria-labelledby="shelf-h">
      <div className="shelf__head">
        <div>
          <p className="mono">04 — Collector shelf</p>
          <h2 id="shelf-h" className="display">
            Pull one
            <br />
            forward.
          </h2>
        </div>
        <div className="shelf__tabs" role="tablist" aria-label="Filter the shelf">
          {FILTERS.map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={f === filter}
              className={`shelf__tab ${f === filter ? 'is-on' : ''}`}
              onClick={() => {
                setGotId(null);
                setFilter(f);
              }}
              data-cursor="FILTER"
            >
              {f}
              <span className="mono">{String(f === 'ALL' ? products.length : products.filter((p) => p.universe === f).length).padStart(2, '0')}</span>
            </button>
          ))}
        </div>
        <button className="btn btn--yellow shelf__surprise" onClick={surprise} data-cursor="SPIN">
          ✦ Surprise me
        </button>
      </div>

      <div className="shelf__viewport" data-cursor="DRAG">
        <div className="shelf__track" ref={track}>
          {bays.map(({ p, copy }, i) => {
            const real = copy === 1;
            return (
              <div className="shelf__bay" key={`${p.id}-${copy}`} data-id={p.id} aria-hidden={!real || undefined} style={{ width: 'var(--bay)' }}>
                <button
                  className="shelf__obj"
                  tabIndex={real ? 0 : -1}
                  onClick={() => pull(p.id)}
                  data-cursor="PULL"
                  aria-label={`Pull forward ${p.name}`}
                  aria-pressed={pulled === p.id}
                >
                  <ProductObject product={p} height="100%" fit />
                </button>
                <div className="shelf__bin">
                  <span className="mono shelf__bin-id">{spotId(p)}</span>
                  <span className="cond shelf__bin-name">{p.name}</span>
                  <span className="shelf__bin-row">
                    {numberLabel(p) ? <b className="mono">{numberLabel(p)}</b> : <b className="mono mute">OBJ {p.n}</b>}
                    <Barcode value={p.sku ?? p.id + i} height={14} />
                  </span>
                  <span className={p.price != null ? 'price-gun shelf__price' : 'price-gun price-gun--muted shelf__price'}>{priceLabel(p)}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="shelf__plank" aria-hidden />
      </div>

      <div className="shelf__drawer" aria-live="polite">
        {pulledP && (
          <>
            <dl className="shelf__data">
              <div>
                <dt className="mono">Spot ID</dt>
                <dd className="cond">{spotId(pulledP)}</dd>
              </div>
              <div>
                <dt className="mono">Universe</dt>
                <dd className="cond">{pulledP.universe ?? 'Unsorted'}</dd>
              </div>
              <div>
                <dt className="mono">Type</dt>
                <dd className="cond">{pulledP.format ?? 'Collectible'}</dd>
              </div>
              <div>
                <dt className="mono">Status</dt>
                <dd className="cond mute">Check store</dd>
              </div>
              <div>
                <dt className="mono">Price</dt>
                <dd className="cond">{priceLabel(pulledP)}</dd>
              </div>
            </dl>
            <div className="shelf__actions">
              <button className="btn" onClick={(e) => addToBag(pulledP.id, e.currentTarget)} data-cursor="COLLECT">
                Add to collection
              </button>
              <button className="btn btn--white" onClick={(e) => toggleVault(pulledP.id, e.currentTarget)} data-cursor="VAULT">
                {inVault(pulledP.id) ? '✓ In vault' : 'Save to vault'}
              </button>
              <button
                className="btn btn--ink"
                onClick={() => openDetail(pulledP.id, root.current?.querySelector(`.shelf__bay[data-id="${pulledP.id}"]:not([aria-hidden]) img`) ?? null)}
                data-cursor="INSPECT"
              >
                Inspect →
              </button>
            </div>
          </>
        )}
      </div>

      {got && (
        <div className="shelf__got" role="status">
          <span className="mono">You got:</span>
          <b className="display">{got.name}</b>
        </div>
      )}
    </section>
  );
}
