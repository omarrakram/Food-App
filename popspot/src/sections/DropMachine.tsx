import { useLayoutEffect, useRef, useState } from 'react';

import { ProductObject } from '../components/ProductObject';
import { numberLabel, p, type Product } from '../data/products';
import { gsap, reducedMotion } from '../lib/gsap';
import { useStore } from '../lib/store';

/** Three slots, three real products whose listing titles say EXCLUSIVE. */
const SLOTS: { code: string; product: Product }[] = [
  { code: 'A1', product: p('02') },
  { code: 'A2', product: p('06') },
  { code: 'A3', product: p('07') },
];

/**
 * THE DROP MACHINE. Pick a slot, pull the lever: the coil turns, the object
 * drops into the tray — BANG. A dropped slot shows EMPTY until restocked.
 * The countdown is concept UI: no future drop date has been published.
 */
export function DropMachine() {
  const { openDetail, toggleVault, inVault } = useStore();
  const [sel, setSel] = useState(0);
  const [empty, setEmpty] = useState<boolean[]>([false, false, false]);
  const [tray, setTray] = useState<Product | null>(null);
  const root = useRef<HTMLElement>(null);
  const busy = useRef(false);

  const drop = () => {
    const el = root.current;
    if (!el || busy.current) return;
    if (empty[sel]) {
      restock(sel);
      return;
    }
    busy.current = true;
    const q = gsap.utils.selector(el);
    const slot = q('.vend__slot')[sel] as HTMLElement;
    const obj = slot.querySelector('.vend__obj') as HTMLElement;
    const trayEl = q('.vend__tray')[0] as HTMLElement;
    const a = obj.getBoundingClientRect();
    const b = trayEl.getBoundingClientRect();
    const fall = b.top + b.height * 0.2 - a.bottom + a.height * 0.35;
    const done = () => {
      busy.current = false;
      setEmpty((e) => e.map((v, i) => (i === sel ? true : v)));
      setTray(SLOTS[sel]!.product);
      gsap.set(obj, { clearProps: 'all' });
    };
    if (reducedMotion()) return done();
    gsap
      .timeline({ onComplete: done })
      .to(q('.vend__lever'), { rotate: 38, duration: 0.14, ease: 'power2.in', yoyo: true, repeat: 1 }, 0)
      .to(slot.querySelector('.vend__coil'), { backgroundPositionX: '+=36px', duration: 0.45, ease: 'power1.inOut' }, 0.05)
      .to(obj, { scale: 1.06, y: -6, duration: 0.3, ease: 'power2.out' }, 0.05)
      .to(obj, { y: fall, rotate: sel === 1 ? -9 : 9, duration: 0.42, ease: 'power3.in' }, 0.36)
      .to(obj, { autoAlpha: 0, duration: 0.05 }, 0.78)
      .add(() => setTray(SLOTS[sel]!.product), 0.78)
      .fromTo(q('.vend__bang'), { scale: 0.2, rotate: -30, autoAlpha: 1 }, { scale: 1, rotate: -8, duration: 0.3, ease: 'back.out(3)' }, 0.78)
      .to(q('.vend__bang'), { autoAlpha: 0, scale: 1.2, duration: 0.2 }, 1.35)
      .fromTo(q('.vend__cabinet'), { y: 0 }, { y: 7, duration: 0.05, yoyo: true, repeat: 3, ease: 'none' }, 0.78);
  };

  // The object lands in the tray: THUNK, small bounce.
  useLayoutEffect(() => {
    const t = root.current?.querySelector('.vend__tray-obj');
    if (!tray || !t || reducedMotion()) return;
    gsap.fromTo(t, { y: -70, rotate: 14 }, { y: 0, rotate: 4, duration: 0.5, ease: 'bounce.out' });
  }, [tray]);

  const restock = (i: number) => {
    setEmpty((e) => e.map((v, j) => (j === i ? false : v)));
    const el = root.current;
    if (!el || reducedMotion()) return;
    const obj = el.querySelectorAll('.vend__slot')[i]?.querySelector('.vend__obj');
    if (obj) gsap.fromTo(obj, { y: -80, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, ease: 'back.out(1.8)' });
  };

  const chosen = SLOTS[sel]!;

  return (
    <section className="drops" id="drops" ref={root} aria-labelledby="drops-h">
      <div className="drops__left">
        <p className="mono">06 — Drop mode</p>
        <h2 id="drops-h" className="display ink-outline">
          Drop
          <br />
          incoming.
        </h2>
        <div className="drops__board" role="group" aria-label="Next drop">
          <p className="mono">Next drop</p>
          <p className="drops__led" aria-label="Coming soon">
            <span>COMING</span>
            <span>SOON</span>
          </p>
          <p className="mono drops__concept">
            <span className="tag tag--ink">Concept UI</span> No drop date is shown until Pop Spot publishes one.
          </p>
        </div>
        <ul className="drops__list">
          {SLOTS.map((s, i) => (
            <li key={s.code}>
              <button className={`drops__item ${i === sel ? 'is-on' : ''}`} onClick={() => setSel(i)} data-cursor="SELECT">
                <span className="mono drops__code">{s.code}</span>
                <img src={s.product.image} alt="" />
                <span>
                  <b className="cond">{s.product.name}</b>
                  <span className="mono">
                    {numberLabel(s.product)} · {s.product.franchise}
                  </span>
                </span>
                <span className="drops__tags">
                  {s.product.tags.map((t) => (
                    <span key={t} className={`tag ${t === 'CHASE LISTED' ? 'tag--red' : 'tag--yellow'}`}>
                      {t}
                    </span>
                  ))}
                </span>
                <span className="mono drops__state">{empty[i] ? 'Empty' : 'Loaded'}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="vend">
        <div className="vend__cabinet">
          <div className="vend__top">
            <span className="display">Drop machine</span>
            <span className="mono">Exclusives · 3 slots</span>
          </div>
          <div className="vend__glass">
            {SLOTS.map((s, i) => (
              <button
                key={s.code}
                className={`vend__slot ${i === sel ? 'is-on' : ''} ${empty[i] ? 'is-empty' : ''}`}
                onClick={() => setSel(i)}
                aria-label={`Select slot ${s.code}: ${s.product.name}${empty[i] ? ' (empty)' : ''}`}
                data-cursor="SELECT"
              >
                <span className="vend__obj">
                  <ProductObject product={s.product} height="100%" shadow={false} fit />
                </span>
                <span className="vend__coil" aria-hidden />
                <span className="vend__code mono">{s.code}</span>
                {empty[i] && <span className="vend__empty mono">Slot empty</span>}
              </button>
            ))}
            <span className="vend__reflection" aria-hidden />
          </div>
          <div className="vend__panel">
            <div className="vend__screen mono" aria-live="polite">
              {empty[sel] ? `${chosen.code} EMPTY — RESTOCK?` : `${chosen.code} · ${chosen.product.name}`}
            </div>
            <div className="vend__keys" aria-hidden>
              {SLOTS.map((s, i) => (
                <span key={s.code} className={`vend__key mono ${i === sel ? 'is-on' : ''}`}>
                  {s.code}
                </span>
              ))}
            </div>
            <button className="vend__drop" onClick={drop} data-cursor="DROP">
              <span className="vend__lever" aria-hidden />
              <span className="cond">{empty[sel] ? 'Restock' : 'Drop one'}</span>
            </button>
          </div>
          <div className="vend__tray">
            <span className="vend__flap" aria-hidden />
            {!tray && <span className="vend__hint mono">Tray empty — pull the lever</span>}
            {tray && (
              <button className="vend__tray-obj" onClick={(e) => openDetail(tray.id, e.currentTarget.querySelector('img'))} data-cursor="COLLECT" aria-label={`Inspect ${tray.name}`}>
                <ProductObject product={tray} height="100%" shadow={false} />
              </button>
            )}
            <span className="vend__bang display" aria-hidden>
              Bang!
            </span>
          </div>
        </div>
        {tray && (
          <div className="vend__after">
            <span className="mono">In tray: {tray.name}</span>
            <button className="btn btn--white btn--sm" onClick={(e) => toggleVault(tray.id, e.currentTarget)}>
              {inVault(tray.id) ? '✓ In vault' : 'Save to vault'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
