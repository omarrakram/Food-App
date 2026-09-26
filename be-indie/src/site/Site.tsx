/**
 * BE—INDIE, the explorable site. Chapters, not blocks:
 *   00 boot / brand   01 independence   02 the denim scanner
 *   03 the collection (horizontal archive)   04 print room (drag the proofs)
 *   05 detail   06 your own version / credits
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BRAND, BRAND_QUOTE, PRODUCTS, SOURCES, type Product } from '../brand/data';
import { PHOTO, SLOTS, hasPhoto, slotCredit, type SlotId } from '../brand/assets';
import { study } from '../lib/denim/compositions';
import { ease, jitter, lerp, seg, typed } from '../showcase/time';
import { WovenLabel } from '../ui/Label';
import { Barcode, ColourBar, CropMarks, RegMark, Ticks } from '../ui/marks';
import { C } from '../ui/palette';
import { useClock, useJobPlate, useScrollProgress, useSeen, useSlotPlate, useViewportOffset } from './hooks';
import './site.css';

/* ── shared bits ─────────────────────────────────────────────────── */

function Plate({ src, alt = '', className = '', style }: { src?: string; alt?: string; className?: string; style?: CSSProperties }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`plate ${loaded ? 'is-in' : ''} ${className}`} style={style}>
      {src && <img src={src} alt={alt} draggable={false} onLoad={() => setLoaded(true)} />}
      <i className="plate__bar" aria-hidden />
    </div>
  );
}

const Mono = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) => (
  <div className={`m ${className}`} style={style}>
    {children}
  </div>
);

/* ── nav + bag ───────────────────────────────────────────────────── */

function Nav({ bag, onBag, onSearch }: { bag: number; onBag: () => void; onSearch: () => void }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const under = document.elementsFromPoint(window.innerWidth / 2, 28).find((el) => el instanceof HTMLElement && el.dataset.nav);
      setDark((under as HTMLElement | undefined)?.dataset.nav === 'dark');
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`nav ${dark ? 'is-dark' : ''}`}>
      <a href="#top" className="nav__mark d" aria-label="BE—INDIE concept, top">
        BE—INDIE
      </a>
      <Mono className="nav__meta">CAIRO / EG — UNOFFICIAL DIGITAL CONCEPT</Mono>
      <nav className="m nav__links" aria-label="Primary">
        <a href="#collection">WOMEN</a>
        <a href="#collection">MEN</a>
        <a href="#scanner">DENIM</a>
        <a href="#print-room">LOOKBOOK</a>
        <button type="button" onClick={onSearch}>
          SEARCH
        </button>
        <button type="button" onClick={onBag}>
          BAG ({bag})
        </button>
      </nav>
    </header>
  );
}

function Search({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30);
  }, [open]);
  const hits = PRODUCTS.filter((p) => `${p.name} ${p.washLabel} ${p.fit}`.toLowerCase().includes(q.toLowerCase()));
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-label="Search the archive" onClick={onClose}>
      <div className="search" onClick={(e) => e.stopPropagation()}>
        <Mono className="search__label">SEARCH THE ARCHIVE — {hits.length} RESULT{hits.length === 1 ? '' : 'S'}</Mono>
        <input ref={input} className="search__input d" value={q} onChange={(e) => setQ(e.target.value)} placeholder="DESTINY…" onKeyDown={(e) => e.key === 'Escape' && onClose()} />
        <ul className="search__list">
          {hits.map((p) => (
            <li key={p.slug}>
              <a className="m" href={p.url} target="_blank" rel="noreferrer">
                <span>{p.name.toUpperCase()}</span>
                <span>{p.washLabel}</span>
                <span>VIEW ON BE-INDIE.COM →</span>
              </a>
            </li>
          ))}
        </ul>
        <button className="m overlay__close" type="button" onClick={onClose}>
          CLOSE ×
        </button>
      </div>
    </div>
  );
}

function Bag({ open, items, onClose, onRemove }: { open: boolean; items: Product[]; onClose: () => void; onRemove: (slug: string) => void }) {
  if (!open) return null;
  return (
    <div className="overlay" role="dialog" aria-label="Bag" onClick={onClose}>
      <aside className="bag" onClick={(e) => e.stopPropagation()}>
        <div className="bag__head">
          <span className="d">BAG ({items.length})</span>
          <button className="m" type="button" onClick={onClose}>
            CLOSE ×
          </button>
        </div>
        {items.length === 0 && <Mono className="bag__empty">NOTHING PULLED FROM THE ARCHIVE YET.</Mono>}
        <ul>
          {items.map((p, k) => (
            <li key={p.slug} className="bag__row">
              <span className="m">0{k + 1}</span>
              <span className="m">{p.name.toUpperCase()}</span>
              <button className="m" type="button" onClick={() => onRemove(p.slug)}>
                REMOVE
              </button>
            </li>
          ))}
        </ul>
        <Mono className="bag__note">
          THIS IS A CONCEPT — NOTHING IS SOLD HERE.{'\n'}EACH PIECE IS AVAILABLE FROM BE-INDIE DIRECTLY:
        </Mono>
        <div className="bag__links">
          {items.map((p) => (
            <a key={p.slug} className="m" href={p.url} target="_blank" rel="noreferrer">
              {p.name.toUpperCase()} ON BE-INDIE.COM →
            </a>
          ))}
        </div>
      </aside>
    </div>
  );
}

/* ═══ 00 — BOOT ══════════════════════════════════════════════════ */

function Hero() {
  const plate = useSlotPlate('hero', 1600, 1000, ['base', 'copy']);
  const t = useClock(Boolean(plate), 1.8);
  const scan = ease.inOutCubic(seg(t, 0.05, 0.6));
  const lock = ease.outExpo(seg(t, 0.5, 1.1));
  const off = 26 * (1 - lock);
  const cutout = PHOTO['hero-cutout'];
  const word = (color: string, dx: number, dy: number, blend?: CSSProperties['mixBlendMode'], extra?: CSSProperties) => (
    <div className="hero__word d" style={{ color, transform: `translate(${dx}px, ${dy}px)`, mixBlendMode: blend, ...extra }} aria-hidden={color !== C.paper}>
      BE—INDIE
    </div>
  );
  return (
    <section className="hero" id="top" aria-label="BE—INDIE" data-nav="light">
      <div className="hero__img" style={{ clipPath: `inset(0 0 ${(1 - scan) * 100}% 0)` }}>
        {plate && <img src={plate.base} alt="" />}
      </div>
      {scan > 0 && scan < 1 && (
        <>
          <div className="hero__img" style={{ clipPath: `inset(${Math.max(0, scan * 100 - 22)}% 0 ${(1 - scan) * 100}% 0)` }}>
            {plate && <img src={plate.copy} alt="" />}
          </div>
          <i className="hero__scan" style={{ top: `${scan * 100}%` }} />
        </>
      )}
      <div className="hero__shade" />
      {lock < 1 && word(C.electric, off, -off * 0.6, 'screen', { opacity: 0.9 })}
      {lock < 1 && word(C.signal, -off * 0.8, off * 0.5, 'screen', { opacity: 0.8 })}
      <h1 className="hero__h1" style={{ clipPath: `inset(0 0 ${(1 - scan) * 100}% 0)` }}>
        {word(C.paper, 0, 0)}
        <span className="sr">BE-INDIE — an unofficial digital concept</span>
      </h1>
      {cutout && <img className="hero__cutout" src={cutout} alt="" />}

      <CropMarks inset={28} len={22} gap={6} color="rgba(236,231,219,.6)" />
      <Mono className="hero__col hero__col--l">
        {typed('CAIRO / EGYPT', t, 0.7)}
        {'\n'}
        {typed(`EST. ${BRAND.est}`, t, 0.78)}
        {'\n'}
        {typed('READY TO WEAR', t, 0.86)}
        {'\n'}
        {typed('DENIM / EXPERIMENTAL', t, 0.94)}
      </Mono>
      <div className="hero__col hero__col--r">
        <Mono>[INDIE / 001]</Mono>
        <a className="m hero__cta" href={BRAND.site} target="_blank" rel="noreferrer">
          SUMMER 26 — EXPLORE ON BE-INDIE.COM →
        </a>
      </div>
      <ColourBar size={14} colours={[C.indigo, C.denim, C.wash, C.paper, C.grey, C.ink, C.electric, C.thread]} style={{ position: 'absolute', left: '2.2vw', top: 'calc(64px + 7.2em)' }} />
      {t > 1.0 && <WovenLabel w={200} h={74} stitch={ease.outCubic(seg(t, 1.0, 1.4))} line2="INDEPENDENT / CAIRO" style={{ right: '2.2vw', top: '38%' }} />}
      <Mono className="hero__credit">{slotCredit('hero')}</Mono>
    </section>
  );
}

/* ═══ 01 — INDEPENDENCE ══════════════════════════════════════════ */

function Independence({ fill }: { fill?: string }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useSeen(ref, 0.3);
  const t = useClock(seen, 2.2);
  const lines = ['IS A', 'STATE', 'OF', 'MIND.'];
  const pv = ease.inOutCubic(seg(t, 0, 0.5));
  return (
    <section className="indep" ref={ref} aria-labelledby="indep-h" data-nav="dark">
      <Mono className="chapter">[CH.01 / INDEPENDENCE]</Mono>
      <h2 id="indep-h" className="sr">
        Independence is a state of mind
      </h2>
      <div className="indep__vert" aria-hidden>
        <div className="indep__vert-in d" style={{ backgroundImage: fill ? `url(${fill})` : undefined, clipPath: `inset(-10% ${(1 - pv) * 100}% -10% 0)` }}>
          INDEPENDENCE
        </div>
      </div>
      <div className="indep__lines" aria-hidden>
        {lines.map((l, k) => {
          const a = 0.45 + k * 0.22;
          const p = ease.outQuart(seg(t, a, a + 0.16));
          return (
            <div key={l} className={`indep__line d ${l === 'MIND.' ? 'is-accent' : ''}`} style={{ clipPath: `inset(-10% ${(1 - p) * 100}% -10% 0)` }}>
              {l}
              {p > 0 && p < 1 && <i className="indep__head" style={{ left: `${p * 100}%` }} />}
            </div>
          );
        })}
        {t > 1.3 && <RegMark size={28} color={C.signal} style={{ position: 'absolute', right: '6%', bottom: '24%' }} />}
      </div>
      <div className="indep__copy">
        <blockquote className="indep__quote">
          <p>“{BRAND_QUOTE.text}”</p>
          <footer className="m">— {BRAND_QUOTE.credit.toUpperCase()}</footer>
        </blockquote>
        <p className="indep__about">
          Locally designed in Cairo, BE-INDIE works in denim that is dyed, stained, layered and cut. The brand describes itself as the balance of trendy and timeless for an edgy, rebellious spirit — bold colour, stand-out prints, and a bright blue label you can pick out across a room.
        </p>
        <Mono className="indep__meta">
          {'EST. 2019 — CAIRO / EG\nDENIM / EXPERIMENTAL\nSTATE OF MIND / INDEPENDENT'}
        </Mono>
      </div>
      <CropMarks inset={24} len={22} gap={6} color="rgba(16,17,24,.4)" />
    </section>
  );
}

/* ═══ 02 — THE DENIM SCANNER ═════════════════════════════════════ */

const SCAN_ORDER = ['destiney-sponge', 'destiny-black-jeans', 'wide-leg-midnight-blue', 'indie-fit-jeans-blue-wash', 'be-fluffy-2-0-cloud-wash', 'relaxed-jeans-blue-wash'];

function Scanner() {
  const [slug, setSlug] = useState(SCAN_ORDER[0]);
  const prod = PRODUCTS.find((p) => p.slug === slug)!;
  const slot = prod.slot as SlotId;
  const plate = useSlotPlate(slot, 800, 1040, ['base', 'riso', 'negative']);
  const macroJob = useMemo(() => study(prod.wash, 'macro', 800, 1040, 90 + SCAN_ORDER.indexOf(slug)), [prod.wash, slug]);
  const loupe = useJobPlate(hasPhoto(slot) ? null : macroJob);
  const frame = useRef<HTMLDivElement>(null);
  const [edgeFrac, setEdgeFrac] = useState(0);
  const target = useRef<number | null>(null);
  const idleAt = useRef(0);

  useEffect(() => {
    let raf = 0;
    let y = 0.1;
    let last = -1;
    const t0 = performance.now();
    const tick = (now: number) => {
      const el = frame.current;
      if (el) {
        const idle = now - idleAt.current > 2200 || target.current === null;
        const goal = idle ? 0.5 - 0.5 * Math.cos(((now - t0) / 1000) * 0.55) : target.current!;
        y += (goal - y) * (idle ? 0.06 : 0.18);
        const H = el.clientHeight;
        const band = H * 0.2;
        const edge = y * (H + band);
        el.style.setProperty('--edge', `${edge}px`);
        el.style.setProperty('--top', `${edge - band}px`);
        el.style.setProperty('--par', `${-edge * 0.25}px`);
        const f = Math.round(Math.min(1, Math.max(0, edge / H)) * 1000);
        if (f !== last) {
          last = f;
          setEdgeFrac(f / 1000);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    target.current = Math.min(1.05, Math.max(0, (e.clientY - r.top) / r.height));
    idleAt.current = performance.now();
  };

  const details = [`WASH / ${prod.washLabel}`, `FIT / ${prod.fit}`, ...prod.details];
  const hitAt = (k: number) => 0.12 + (k / Math.max(1, details.length - 1)) * 0.74;

  return (
    <section className="scanner" id="scanner" aria-labelledby="scan-h" data-nav="light">
      <Mono className="chapter chapter--light">[CH.02 / DENIM STUDIES]</Mono>
      <div className="scanner__frame" ref={frame} onPointerMove={onMove} onPointerLeave={() => (idleAt.current = 0)}>
        {plate && <img className="scanner__base" src={plate.base} alt={`${prod.name} — ${hasPhoto(slot) ? 'BE-INDIE image' : 'rendered wash study'}`} />}
        {plate?.riso && <img className="scanner__riso" src={plate.riso} alt="" />}
        {plate?.negative && <img className="scanner__neg" src={plate.negative} alt="" />}
        <div className="scanner__loupe">{(loupe?.base ?? plate?.base) && <img src={loupe?.base ?? plate?.base} alt="" style={hasPhoto(slot) ? { transform: 'translateY(var(--par)) scale(2.4)' } : undefined} />}</div>
        <i className="scanner__light" />
        <i className="scanner__top" />
        <div className="scanner__ticks scanner__ticks--t">
          <Ticks length={1200} every={10} major={5} h={12} color="rgba(236,231,219,.85)" />
        </div>
        <div className="scanner__ticks scanner__ticks--b">
          <Ticks length={1200} every={10} major={5} h={12} dir="up" color="rgba(236,231,219,.85)" />
        </div>
        <Mono className="scanner__read">{`PASS 0${SCAN_ORDER.indexOf(slug) + 1} — LOUPE ×2.4\nY ${String(Math.round(edgeFrac * 1040)).padStart(4, '0')} / 1040`}</Mono>
        {!plate && <Mono className="scanner__wait">PRINTING PLATE…</Mono>}
        <Mono className="scanner__credit">{slotCredit(slot)}</Mono>
      </div>

      <div className="scanner__side">
        <h2 id="scan-h" className="scanner__h d">
          THE DENIM
          <br />
          SCANNER
        </h2>
        <Mono className="scanner__hint">MOVE ACROSS THE PLATE — PRINT BEHIND, LOUPE IN THE LIGHT, NEGATIVE AHEAD.</Mono>
        <ol className="scanner__list" aria-label="Choose a wash">
          {SCAN_ORDER.map((s, k) => {
            const p = PRODUCTS.find((x) => x.slug === s)!;
            return (
              <li key={s}>
                <button type="button" className={`m ${s === slug ? 'is-on' : ''}`} onClick={() => setSlug(s)} aria-pressed={s === slug}>
                  <span>0{k + 1}</span>
                  <span>{p.name.toUpperCase()}</span>
                  <span>{p.washLabel.split(' / ')[0]}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="scanner__spec">
          <div className="d scanner__name">{prod.display.join(' ')}</div>
          <ul>
            {details.map((d, k) => (
              <li key={d} className={`m ${edgeFrac >= hitAt(k) ? 'is-hit' : ''}`}>
                <span>A{k + 1}</span>
                {d}
              </li>
            ))}
          </ul>
          <a className="m link" href={prod.url} target="_blank" rel="noreferrer">
            VIEW PIECE ON BE-INDIE.COM →
          </a>
        </div>
      </div>
    </section>
  );
}

/* ═══ 03 — THE COLLECTION ════════════════════════════════════════ */

function ArchiveItem({ p, k, onAdd, inBag }: { p: Product; k: number; onAdd: () => void; inBag: boolean }) {
  const slot = p.slot as SlotId;
  const plate = useSlotPlate(slot, 800, 1040);
  return (
    <article className="item" aria-labelledby={`item-${p.slug}`}>
      <div className="item__num d" aria-hidden>
        0{k + 1}
      </div>
      <Plate className="item__plate" src={plate?.base} alt={`${p.name} — ${hasPhoto(slot) ? 'BE-INDIE image' : 'rendered wash study'}`} />
      <Mono className="item__tag">DENIM STUDY / 0{k + 1}</Mono>
      <h3 id={`item-${p.slug}`} className="item__name d">
        {p.display[0]}
        <br />
        {p.display[1]}
      </h3>
      <Mono className="item__spec">{[p.name.toUpperCase(), `WASH / ${p.washLabel}`, `FIT / ${p.fit}`, ...p.details.slice(0, 3)].join('\n')}</Mono>
      <div className="item__foot">
        <Barcode value={p.slug} width={120} height={26} color={C.ink} />
        <a className="m link" href={p.url} target="_blank" rel="noreferrer">
          VIEW PIECE →
        </a>
        <button type="button" className="m link" onClick={onAdd} disabled={inBag}>
          {inBag ? 'IN BAG ✓' : 'ADD TO BAG +'}
        </button>
      </div>
      <Mono className="item__credit">{slotCredit(slot)}</Mono>
    </article>
  );
}

function Collection({ bag, onAdd }: { bag: string[]; onAdd: (slug: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const p = useScrollProgress(ref);
  const [span, setSpan] = useState(0);
  useEffect(() => {
    const m = () => setSpan(Math.max(0, (track.current?.scrollWidth ?? 0) - window.innerWidth));
    m();
    window.addEventListener('resize', m);
    const id = setTimeout(m, 400);
    return () => {
      window.removeEventListener('resize', m);
      clearTimeout(id);
    };
  }, []);
  const idx = Math.min(PRODUCTS.length, Math.max(1, Math.round(p * (PRODUCTS.length - 1)) + 1));
  return (
    <section className="collection" id="collection" ref={ref} style={{ height: `calc(100vh + ${span}px)` }} aria-labelledby="coll-h" data-nav="dark">
      <div className="collection__sticky">
        <div className="collection__head">
          <Mono className="chapter">[CH.03 / THE COLLECTION]</Mono>
          <Mono>{`DENIM STUDY 0${idx} — 0${PRODUCTS.length}`}</Mono>
        </div>
        <div className="collection__track" ref={track} style={{ transform: `translate3d(${-p * span}px,0,0)` }}>
          <div className="collection__intro">
            <h2 id="coll-h" className="d">
              DENIM /
              <br />
              REPRO—
              <br />
              GRAMMED
            </h2>
            <Mono>{'SIX PIECES FROM THE CURRENT ARCHIVE.\nNAMES, WASHES AND DETAILS AS BE-INDIE\nLISTS THEM. NO PRICES — THIS IS A CONCEPT.'}</Mono>
          </div>
          {PRODUCTS.map((pr, k) => (
            <ArchiveItem key={pr.slug} p={pr} k={k} onAdd={() => onAdd(pr.slug)} inBag={bag.includes(pr.slug)} />
          ))}
          <div className="collection__outro">
            <a className="d" href="https://be-indie.com/collections/jeans" target="_blank" rel="noreferrer">
              ALL DENIM
              <br />
              ON BE-INDIE.COM →
            </a>
          </div>
        </div>
        <div className="collection__rule">
          <i style={{ transform: `scaleX(${p})` }} />
        </div>
      </div>
    </section>
  );
}

/* ═══ 04 — PRINT ROOM ════════════════════════════════════════════ */

type Proof = { key: 'base' | 'riso' | 'halftone' | 'copy'; label: string; x: number; y: number; r: number };
const PROOFS: Proof[] = [
  { key: 'base', label: '01A  FULL COLOUR', x: 6, y: 14, r: -3 },
  { key: 'riso', label: '02A  RISO / BLUE', x: 29, y: 22, r: 2.5 },
  { key: 'halftone', label: '03A  HALFTONE 45°', x: 52, y: 12, r: -1.5 },
  { key: 'copy', label: '04A  PHOTOCOPY', x: 72, y: 24, r: 3.5 },
];

function PrintRoom() {
  const plate = useSlotPlate('collage', 900, 1200, ['base', 'riso', 'halftone', 'copy'], { halftoneCell: 11, halftoneGamma: 2.1 });
  const [pos, setPos] = useState(PROOFS.map((p) => ({ x: p.x, y: p.y, r: p.r, z: 1 })));
  const [registered, setRegistered] = useState(false);
  const room = useRef<HTMLDivElement>(null);
  const drag = useRef<{ k: number; dx: number; dy: number } | null>(null);
  const zTop = useRef(10);
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      setT(now / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const down = (k: number) => (e: React.PointerEvent) => {
    const r = room.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top) / r.height) * 100;
    drag.current = { k, dx: px - pos[k].x, dy: py - pos[k].y };
    (e.target as Element).setPointerCapture(e.pointerId);
    setRegistered(false);
    setPos((ps) => ps.map((p, i) => (i === k ? { ...p, z: ++zTop.current } : p)));
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const r = room.current!.getBoundingClientRect();
    const { k, dx, dy } = drag.current;
    const x = ((e.clientX - r.left) / r.width) * 100 - dx;
    const y = ((e.clientY - r.top) / r.height) * 100 - dy;
    setPos((ps) => ps.map((p, i) => (i === k ? { ...p, x: Math.min(82, Math.max(-4, x)), y: Math.min(60, Math.max(0, y)) } : p)));
  };
  const up = () => (drag.current = null);

  return (
    <section className="print" id="print-room" aria-labelledby="print-h" data-nav="dark">
      <Mono className="chapter">[CH.04 / PRINT ROOM]</Mono>
      <div className="print__head">
        <h2 id="print-h" className="d">
          LOOK 03 /
          <br />
          PROOFS
        </h2>
        <Mono>{'ONE LOOK, FOUR PASSES.\nDRAG THE PROOFS. THEN REGISTER THEM.'}</Mono>
        <button type="button" className="m print__btn" onClick={() => setRegistered((v) => !v)}>
          {registered ? 'SPREAD PROOFS ↔' : 'REGISTER ⊕'}
        </button>
      </div>
      <div className={`print__room ${registered ? 'is-registered' : ''}`} ref={room} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {PROOFS.map((p, k) => {
          const s = pos[k];
          const jx = registered || p.key !== 'riso' ? 0 : jitter(t, 7, 3);
          const style: CSSProperties = registered
            ? { left: '36%', top: '6%', transform: 'rotate(0deg)', zIndex: p.key === 'base' ? 20 : 10 - k }
            : { left: `${s.x}%`, top: `${s.y}%`, transform: `rotate(${s.r}deg)`, zIndex: s.z };
          return (
            <figure key={p.key} className="proof" style={style} onPointerDown={down(k)}>
              <div className="proof__img">
                {plate?.[p.key] && <img src={plate[p.key]} alt="" draggable={false} />}
                {p.key === 'riso' && plate?.riso && !registered && <img src={plate.riso} alt="" draggable={false} style={{ mixBlendMode: 'multiply', opacity: 0.45, transform: `translate(${jx}px, ${jx * 0.6}px)` }} />}
              </div>
              <figcaption className="m">{p.label}</figcaption>
            </figure>
          );
        })}
        <div className="print__over d" aria-hidden>
          LOOK 03
        </div>
        <Mono className="print__frag print__frag--a">BE-INDIE</Mono>
        <Mono className="print__frag print__frag--b">CAIRO</Mono>
        <Mono className="print__frag print__frag--c">INDEPENDENT / ALWAYS</Mono>
        {registered && <CropMarks inset={0} len={26} gap={8} color={C.ink} style={{ left: '36%', top: '6%', width: 'var(--proof-w)', height: 'calc(var(--proof-w) * 4 / 3)', right: 'auto', bottom: 'auto' }} />}
      </div>
      <Mono className="print__credit">{slotCredit('collage')}</Mono>
    </section>
  );
}

/* ═══ 05 — DETAIL ════════════════════════════════════════════════ */

function Detail() {
  const plate = useSlotPlate('detail', 1600, 1000);
  const ref = useRef<HTMLElement>(null);
  const o = useViewportOffset(ref);
  return (
    <section className="detail" ref={ref} aria-label="Denim detail" data-nav="light">
      <div className="detail__img" style={{ transform: `scale(${lerp(1.08, 1.0, (o + 1) / 2)}) translateY(${o * -3}%)` }}>
        {plate && <img src={plate.base} alt={hasPhoto('detail') ? 'BE-INDIE denim detail' : 'Rendered denim detail study'} />}
      </div>
      <div className="detail__shade" />
      <div className="detail__txt">
        <div className="d">
          DENIM /
          <br />
          DETAIL 04
        </div>
        <i />
        <Mono>{'100% EGYPTIAN COTTON\nDESIGNED IN CAIRO'}</Mono>
        <Mono className="detail__credit">{slotCredit('detail')}</Mono>
      </div>
    </section>
  );
}

/* ═══ 06 — YOUR OWN VERSION / CREDITS ════════════════════════════ */

function End() {
  const slots = Object.keys(SLOTS) as SlotId[];
  return (
    <section className="end" aria-labelledby="end-h" data-nav="light">
      <i className="end__stitch" aria-hidden />
      <Mono className="chapter chapter--light">[CH.06 / YOUR OWN VERSION]</Mono>
      <div className="end__left">
        <h2 id="end-h" className="end__h d">
          WEAR
          <br />
          YOUR OWN
          <br />
          VERSION.
        </h2>
        <Mono className="end__concept">HEADLINE: CONCEPT COPY — NOT A BE-INDIE SLOGAN</Mono>
      </div>
      <div className="end__lock">
        <div className="d end__mark">BE—INDIE</div>
        <div className="d end__state">
          INDEPENDENCE
          <br />
          IS A STATE OF MIND.
        </div>
        <a className="m end__cta" href={BRAND.site} target="_blank" rel="noreferrer">
          THE REAL THING: BE-INDIE.COM →
        </a>
      </div>
      <footer className="end__foot">
        <div>
          <Mono className="end__lbl">DIGITAL CONCEPT</Mono>
          <Mono>{'OMAR AKRAM / 2026\nUNOFFICIAL CONCEPT\nNOT AFFILIATED WITH BE-INDIE'}</Mono>
        </div>
        <div>
          <Mono className="end__lbl">RESEARCH</Mono>
          {SOURCES.map((s) => (
            <a key={s.url} className="m" href={s.url} target="_blank" rel="noreferrer">
              {s.label.toUpperCase()}
            </a>
          ))}
        </div>
        <div>
          <Mono className="end__lbl">IMAGERY</Mono>
          <Mono>
            {slots
              .map((s) => `${hasPhoto(s) ? '●' : '○'} ${s.toUpperCase()}`)
              .join('\n')}
          </Mono>
          <Mono className="end__note">○ = RENDERED WASH STUDY, AWAITING OFFICIAL IMAGE</Mono>
        </div>
        <div>
          <Mono className="end__lbl">TYPE</Mono>
          <Mono>{'ARCHIVO (CONDENSED 62%)\nHANKEN GROTESK\nIBM PLEX MONO\n\nWORDMARK TYPESET —\nNOT THE OFFICIAL LOGO'}</Mono>
        </div>
      </footer>
    </section>
  );
}

/* ═══ page ═══════════════════════════════════════════════════════ */

export function Site() {
  const heroFill = useSlotPlate('hero', 1600, 1000, ['base', 'copy']);
  const [bag, setBag] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bi-bag') ?? '[]');
    } catch {
      return [];
    }
  });
  const [bagOpen, setBagOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem('bi-bag', JSON.stringify(bag));
    } catch {
      /* private mode */
    }
  }, [bag]);
  useEffect(() => {
    document.body.dataset.ready = heroFill ? '1' : '0';
  }, [heroFill]);
  return (
    <div className="site">
      <Nav bag={bag.length} onBag={() => setBagOpen(true)} onSearch={() => setSearchOpen(true)} />
      <main>
        <Hero />
        <Independence fill={heroFill?.base} />
        <Scanner />
        <Collection bag={bag} onAdd={(s) => setBag((b) => (b.includes(s) ? b : [...b, s]))} />
        <PrintRoom />
        <Detail />
        <End />
      </main>
      <Search open={searchOpen} onClose={() => setSearchOpen(false)} />
      <Bag open={bagOpen} items={bag.map((s) => PRODUCTS.find((p) => p.slug === s)!).filter(Boolean)} onClose={() => setBagOpen(false)} onRemove={(s) => setBag((b) => b.filter((x) => x !== s))} />
    </div>
  );
}
