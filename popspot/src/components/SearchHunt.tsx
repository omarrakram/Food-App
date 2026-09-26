import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { numberLabel, products, type Product } from '../data/products';
import { gsap, reducedMotion } from '../lib/gsap';
import { useStore } from '../lib/store';

type Tab = 'CHARACTERS' | 'FRANCHISES' | 'PRODUCTS';
const TABS: Tab[] = ['CHARACTERS', 'FRANCHISES', 'PRODUCTS'];
const HINTS = ['Salah', 'Gojo', '1626', 'Anime', 'Exclusive', 'Barbie'];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');

function haystack(p: Product, tab: Tab) {
  if (tab === 'CHARACTERS') return norm(`${p.name} ${p.verification === 'unverified' ? 'object unlisted' : ''}`);
  if (tab === 'FRANCHISES') return norm(`${p.franchise ?? ''} ${p.universe ?? ''}`);
  return norm(`${p.listingTitle ?? p.name} ${p.number ?? ''} ${p.sku ?? ''} ${p.format ?? ''} ${p.tags.join(' ')}`);
}

/** CHARACTER HUNT — search as the centre of the store, not a text box in a corner. */
export function SearchHunt() {
  const { searchOpen, setSearchOpen, openDetail } = useStore();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('CHARACTERS');
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const ping = useRef<HTMLSpanElement>(null);
  const grid = useRef<HTMLUListElement>(null);

  // "/" opens the hunt from anywhere; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (searchOpen) {
      gsap.set(el, { display: 'block' });
      if (!reducedMotion()) {
        gsap.fromTo(el, { clipPath: 'circle(0% at 50% 0%)' }, { clipPath: 'circle(150% at 50% 0%)', duration: 0.5, ease: 'power3.inOut' });
        gsap.fromTo(
          el.querySelectorAll('.hunt__title span'),
          { yPercent: 110 },
          { yPercent: 0, duration: 0.5, stagger: 0.06, ease: 'power4.out', delay: 0.15 },
        );
      }
      window.setTimeout(() => input.current?.focus(), 60);
    } else {
      gsap.to(el, { clipPath: 'circle(0% at 50% 0%)', duration: 0.3, ease: 'power2.in', onComplete: () => gsap.set(el, { display: 'none' }) });
    }
  }, [searchOpen]);

  const results = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return products;
    return products.filter((p) => haystack(p, tab).includes(s));
  }, [q, tab]);

  // Results fan outward from the input, like cards spread on a table.
  useLayoutEffect(() => {
    if (!searchOpen || !grid.current || reducedMotion()) return;
    const cards = grid.current.querySelectorAll('.hunt__card');
    gsap.fromTo(
      cards,
      { y: -60, scale: 0.6, rotate: (i: number) => (i % 2 ? 14 : -14), autoAlpha: 0 },
      { y: 0, scale: 1, rotate: 0, autoAlpha: 1, duration: 0.42, ease: 'back.out(1.7)', stagger: { each: 0.025, from: 'center' } },
    );
  }, [results, searchOpen]);

  const beep = () => {
    if (ping.current && !reducedMotion())
      gsap.fromTo(ping.current, { scale: 0.4, autoAlpha: 1 }, { scale: 2.6, autoAlpha: 0, duration: 0.45, ease: 'power2.out' });
  };

  return (
    <div className="hunt" ref={root} role="dialog" aria-modal="true" aria-label="Character hunt" hidden={false} style={{ display: 'none' }}>
      <div className="hunt__inner">
        <div className="hunt__head">
          <p className="mono hunt__kicker">
            <span className="hunt__rec" aria-hidden /> Hunt mode · {products.length} objects indexed
          </p>
          <button className="btn btn--white btn--sm" onClick={() => setSearchOpen(false)} data-cursor="CLOSE">
            Close <kbd className="mono">esc</kbd>
          </button>
        </div>
        <h2 className="hunt__title display" aria-hidden>
          <span>Who are</span>
          <span>you looking for?</span>
        </h2>
        <label className="hunt__field">
          <span className="hunt__spot" aria-hidden>
            <span ref={ping} className="hunt__ping" />
          </span>
          <span className="sr-only">Search characters, franchises or products</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              beep();
            }}
            placeholder="Type a character…"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="hunt__tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={t === tab} className={`hunt__tab ${t === tab ? 'is-on' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
          <span className="mono hunt__count">
            {String(results.length).padStart(2, '0')} spotted
          </span>
        </div>
        {!q && (
          <p className="mono hunt__hints">
            Try:{' '}
            {HINTS.map((h) => (
              <button key={h} onClick={() => setQ(h)} className="hunt__hint">
                {h}
              </button>
            ))}
          </p>
        )}
        <ul className="hunt__grid" ref={grid}>
          {results.map((p) => (
            <li key={p.id}>
              <button
                className="hunt__card"
                data-cursor="INSPECT"
                onClick={(e) => {
                  openDetail(p.id, e.currentTarget.querySelector('img'));
                  setSearchOpen(false);
                }}
              >
                <span className="hunt__num mono">{numberLabel(p) ?? p.n}</span>
                <img src={p.image} alt="" loading="lazy" />
                <span className="hunt__name cond">{p.name}</span>
                <span className="mono mute">{p.franchise ?? 'Unlisted object'}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="hunt__none">
              <p className="display">Not spotted.</p>
              <p className="mono">Nothing in this concept's {products.length} objects matches “{q}”.</p>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
