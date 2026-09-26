import { useEffect, useRef } from 'react';

import { ProductObject } from '../components/ProductObject';
import { numberLabel, product } from '../data/products';
import { gsap, reducedMotion } from '../lib/gsap';
import { useStore, type VaultState } from '../lib/store';

const STATES: { s: VaultState; icon: string }[] = [
  { s: 'OWNED', icon: '●' },
  { s: 'WANTED', icon: '○' },
  { s: 'PRE-ORDERED', icon: '◷' },
];
const SLOTS = 8;

/** MY VAULT — the wishlist as a display case. Stored in this browser only. */
export function Vault() {
  const { vault, vaultIsDemo, setVaultState, toggleVault, openDetail } = useStore();
  const root = useRef<HTMLElement>(null);
  const prev = useRef(vault.map((v) => v.id));

  // A newly saved object gets stamped into its slot.
  useEffect(() => {
    const added = vault.filter((v) => !prev.current.includes(v.id));
    prev.current = vault.map((v) => v.id);
    if (!root.current || reducedMotion()) return;
    added.forEach((a) => {
      const slot = root.current!.querySelector(`[data-slot="${a.id}"]`);
      if (!slot) return;
      gsap.fromTo(slot.querySelector('.vault__obj'), { y: -60, scale: 1.3, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2)' });
      gsap.fromTo(slot.querySelector('.vault__stamp'), { scale: 2.5, rotate: 30, autoAlpha: 0 }, { scale: 1, rotate: -12, autoAlpha: 1, duration: 0.35, ease: 'back.out(3)', delay: 0.25 });
    });
  }, [vault]);

  const owned = vault.filter((v) => v.state === 'OWNED').length;
  const count = String(vault.length).padStart(2, '0');

  return (
    <section className="vault" id="vault" ref={root} aria-labelledby="vault-h">
      <div className="vault__head">
        <div>
          <p className="mono">07 — My vault</p>
          <h2 id="vault-h" className="display">
            The vault.
          </h2>
        </div>
        <div className="vault__counter" aria-label={`${vault.length} items in vault`}>
          <span className="mono">Vault /</span>
          <b className="display">{count}</b>
          <span className="mono">
            Items
            <br />
            {String(owned).padStart(2, '0')} owned
          </span>
        </div>
        <p className="mono vault__note">
          {vaultIsDemo ? (
            <>
              <span className="tag tag--yellow">Demo vault</span> Save anything on this page and it becomes yours.
            </>
          ) : (
            <>Saved in this browser only. Concept — no account needed.</>
          )}
        </p>
      </div>

      <ul className="vault__grid">
        {Array.from({ length: Math.max(SLOTS, vault.length) }, (_, i) => {
          const entry = vault[i];
          if (!entry)
            return (
              <li key={`empty-${i}`} className="vault__slot is-empty">
                <span className="vault__slot-no mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="vault__empty mono">
                  Empty slot
                  <br />
                  Spot something
                </span>
              </li>
            );
          const prod = product(entry.id);
          return (
            <li key={entry.id} className={`vault__slot is-${entry.state.toLowerCase().replace('-', '')}`} data-slot={entry.id}>
              <span className="vault__slot-no mono">{String(i + 1).padStart(2, '0')}</span>
              <button className="vault__obj" onClick={(e) => openDetail(prod.id, e.currentTarget.querySelector('img'))} data-cursor="INSPECT" aria-label={`Inspect ${prod.name}`}>
                <ProductObject product={prod} height="100%" fit />
              </button>
              <span className="vault__stamp" aria-hidden>
                {entry.state === 'OWNED' ? 'Owned' : entry.state === 'WANTED' ? 'Wanted' : 'Pre-ord.'}
              </span>
              <div className="vault__label">
                <b className="cond">{prod.name}</b>
                <span className="mono">{numberLabel(prod) ?? `OBJ ${prod.n}`}</span>
              </div>
              <div className="vault__states" role="radiogroup" aria-label={`Status of ${prod.name}`}>
                {STATES.map(({ s, icon }) => (
                  <button key={s} role="radio" aria-checked={entry.state === s} className={`vault__state mono ${entry.state === s ? 'is-on' : ''}`} onClick={() => setVaultState(prod.id, s)}>
                    <span aria-hidden>{icon}</span> {s}
                  </button>
                ))}
              </div>
              <button className="vault__remove mono" onClick={() => toggleVault(prod.id)} aria-label={`Remove ${prod.name} from vault`}>
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
