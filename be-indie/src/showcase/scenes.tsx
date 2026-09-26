/**
 * The seven scenes of /showcase. Every value on screen is a pure function of
 * `t` (seconds), so a frame is reproducible: `?t=4.5` always renders the same
 * poster, and the frame-capture script can step through at exactly 60 fps.
 *
 * Stage: 1080 × 1920. Essential text stays inside x 60–920, y 170–1500
 * (clear of the TikTok/Reels chrome); only image and oversized type bleed.
 */
import type { CSSProperties, ReactNode } from 'react';
import { BRAND, BRAND_QUOTE, PRODUCTS, bySlug } from '../brand/data';
import { slotCredit, type SlotId } from '../brand/assets';
import type { PlateSet } from '../lib/denim/types';
import { Barcode, ColourBar, CropMarks, RegMark, Ticks } from '../ui/marks';
import { WovenLabel } from '../ui/Label';
import { C } from '../ui/palette';
import type { PlateSpec, Plates } from './plates';
import { clamp01, ease, jitter, lerp, seg, snap, typed } from './time';

export const SPECS = {
  hero: { slot: 'hero', W: 1080, H: 1920, treatments: ['base', 'copy'] },
  scan: {
    slot: 'scanner',
    W: 1080,
    H: 1920,
    treatments: ['base', 'riso', 'negative'],
  },
  loupe: { slot: 'scanner-detail', W: 1080, H: 1920, treatments: ['base'] },
  p1: { slot: 'product-destiny-black', W: 740, H: 940, treatments: ['base'] },
  p2: { slot: 'product-wide-leg-midnight', W: 740, H: 940, treatments: ['base'] },
  p3: { slot: 'product-indie-fit', W: 740, H: 940, treatments: ['base'] },
  p4: { slot: 'product-be-fluffy', W: 740, H: 940, treatments: ['base'] },
  collage: {
    slot: 'collage',
    W: 1080,
    H: 1920,
    treatments: ['base', 'riso', 'halftone', 'copy'],
    opts: { halftoneCell: 12, halftoneGamma: 2.1 },
  },
  detail: { slot: 'detail', W: 1080, H: 1920, treatments: ['base'] },
  end: { slot: 'end', W: 1080, H: 1920, treatments: ['base', 'copy'] },
} satisfies Record<string, PlateSpec>;

export type ShowPlates = Plates<keyof typeof SPECS>;
type SP = { t: number; P: ShowPlates };

export const DURATION = 15.5;

/* ── tiny layout helpers ────────────────────────────────────────── */

const abs = (css: CSSProperties): CSSProperties => ({ position: 'absolute', ...css });

function Img({ src, style }: { src?: string; style?: CSSProperties }) {
  if (!src) return null;
  return <img src={src} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...style }} />;
}

function Mono({ children, size = 24, color, style, weight = 500 }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties; weight?: number }) {
  return (
    <div className="m" style={{ position: 'absolute', fontSize: size, color, fontWeight: weight, ...style }}>
      {children}
    </div>
  );
}

/** Metadata strip along the top safe line. */
function TopRow({ left, right, color }: { left: string; right: string; color: string }) {
  return (
    <>
      <Mono size={22} color={color} style={{ left: 60, top: 178 }}>
        {left}
      </Mono>
      <Mono size={22} color={color} style={{ right: 160, top: 178, textAlign: 'right' }}>
        {right}
      </Mono>
    </>
  );
}

/** Reveal left→right like a print head, with the head visible while moving. */
function Printed({ p, head = C.electric, children, style }: { p: number; head?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: 'absolute', ...style }}>
      <div style={{ clipPath: `inset(-10% ${(1 - p) * 100}% -10% 0)` }}>{children}</div>
      {p > 0 && p < 1 && <div style={abs({ top: '-4%', bottom: '-4%', left: `${p * 100}%`, width: 10, background: head })} />}
    </div>
  );
}

/* ═══ 00 — BRAND IMPACT (0.00–1.50) ═══════════════════════════════ */

export function Impact({ t, P }: SP) {
  // frame 0 already carries the wordmark as two loose colour plates;
  // the scanner prints the key plate, then the plates pull into register.
  const scan = ease.inOutCubic(seg(t, 0.0, 0.42));
  const lineY = scan * 1960;
  const trail = 320;
  const lock = ease.outExpo(seg(t, 0.4, 0.9));
  const off = 30 * (1 - lock);
  const hit = t >= 0.9 && t < 0.95 ? 1.012 : 1;
  const push = lerp(1.08, 1.0, ease.outCubic(seg(t, 0, 1.5)));
  const flash = t >= 1.4 && t < 1.47;

  const word = (fill: string, dx: number, dy: number, blend?: CSSProperties['mixBlendMode'], opacity = 1) => (
    <div style={abs({ left: 50 + dx, top: 250 + dy, color: fill, mixBlendMode: blend, opacity, transform: `scale(${hit})`, transformOrigin: '0 0' })}>
      <div className="d" style={{ fontSize: 480, lineHeight: 0.74 }}>
        BE—
        <br />
        INDIE
      </div>
    </div>
  );

  return (
    <div className="full" style={{ background: C.ink }}>
      <div className="full" style={{ clipPath: `inset(0 0 ${Math.max(0, 1920 - lineY)}px 0)` }}>
        <Img src={P.hero.base} style={{ transform: `scale(${push})` }} />
        <div className="full" style={{ background: 'linear-gradient(180deg, rgba(10,12,24,.55) 0%, rgba(10,12,24,0) 45%, rgba(10,12,24,0) 60%, rgba(10,12,24,.6) 100%)' }} />
      </div>
      {scan < 1 && (
        <>
          {/* the copier's trail: hard black-and-white just behind the light */}
          <div className="full" style={{ clipPath: `inset(${Math.max(0, lineY - trail)}px 0 ${Math.max(0, 1920 - lineY)}px 0)` }}>
            <Img src={P.hero.copy} style={{ transform: `scale(${push})` }} />
          </div>
          <div style={abs({ left: 0, right: 0, top: lineY - 3, height: 6, background: '#fff', boxShadow: '0 0 30px 10px rgba(236,231,219,.75)' })} />
        </>
      )}

      {/* colour plates: loose at frame 0, locked by 0.9s */}
      {lock < 1 && word(C.electric, off, -off * 0.6, 'screen', 0.95)}
      {lock < 1 && word(C.signal, -off * 0.8, off * 0.5, 'screen', 0.85)}
      <div className="full" style={{ clipPath: `inset(0 0 ${Math.max(0, 1920 - lineY)}px 0)` }}>
        {word(C.paper, 0, 0)}
      </div>

      <CropMarks inset={44} len={30} gap={8} color="rgba(236,231,219,.75)" />
      <TopRow left="[INDIE / 001]" right="DIGITAL CONCEPT — 2026" color="rgba(236,231,219,.85)" />

      <Mono size={26} color={C.paper} style={{ left: 60, top: 1150, lineHeight: 1.45 }}>
        {typed('CAIRO / EG', t, 0.62)}
        {'\n'}
        {typed(`EST. ${BRAND.est}`, t, 0.7)}
        {'\n'}
        {typed('READY TO WEAR', t, 0.78)}
        {'\n'}
        {typed('DENIM / EXPERIMENTAL', t, 0.86)}
      </Mono>
      <ColourBar size={20} colours={[C.indigo, C.denim, C.wash, C.paper, C.grey, C.ink, C.electric, C.thread]} style={abs({ left: 60, top: 1110 })} />
      {t >= 0.9 && <WovenLabel w={250} h={92} stitch={ease.outCubic(seg(t, 0.9, 1.25))} line2="INDEPENDENT / CAIRO" style={{ left: 640, top: 1180, transform: `translateY(${(1 - snap(t, 0.9, 0.12)) * 30}px)` }} />}
      <Mono size={18} color="rgba(236,231,219,.7)" style={{ left: 60, top: 1420 }}>
        {slotCredit('hero')}
      </Mono>
      {flash && <Img src={P.hero.copy} />}
    </div>
  );
}

/* ═══ 01 — INDEPENDENCE (1.50–3.50) ═══════════════════════════════ */

export function Independence({ t, P }: SP) {
  const pv = ease.inOutCubic(seg(t, 1.5, 1.86));
  const lock = ease.outCubic(seg(t, 1.8, 2.3));
  const lines: { text: string; at: number; size: number; color: string; top: number }[] = [
    { text: 'IS A', at: 1.96, size: 262, color: C.ink, top: 470 },
    { text: 'STATE', at: 2.2, size: 262, color: C.ink, top: 680 },
    { text: 'OF', at: 2.45, size: 262, color: C.ink, top: 890 },
    { text: 'MIND.', at: 2.7, size: 286, color: C.electric, top: 1100 },
  ];
  const wordLen = 1450;
  const fs = 255;
  return (
    <div className="full" style={{ background: C.paper }}>
      <Img src={P.paper} />
      <TopRow left="[CH.01 / INDEPENDENCE]" right="BE—INDIE" color={C.ink} />

      {/* the vertical word, printed bottom→top, filled with denim */}
      <div style={abs({ left: 56, top: 190 + wordLen, width: wordLen, transformOrigin: '0 0', transform: 'rotate(-90deg)' })}>
        {lock < 1 && (
          <div className="d" style={abs({ left: 0, top: (1 - lock) * 16, fontSize: fs, lineHeight: 0.8, color: C.electric, opacity: 0.8 * (1 - lock), mixBlendMode: 'multiply', clipPath: `inset(-10% ${(1 - pv) * 100}% -10% 0)`, transform: `translateX(${(1 - lock) * 14}px)` })}>
            INDEPENDENCE
          </div>
        )}
        <div
          className="d"
          style={{
            fontSize: fs,
            lineHeight: 0.8,
            backgroundImage: `url(${P.hero.base})`,
            backgroundSize: '1080px 1920px',
            backgroundPosition: '-120px -700px',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            clipPath: `inset(-10% ${(1 - pv) * 100}% -10% 0)`,
          }}
        >
          INDEPENDENCE
        </div>
        {pv > 0 && pv < 1 && <div style={abs({ top: -10, height: fs * 0.8 + 20, left: pv * 1440, width: 12, background: C.ink })} />}
      </div>

      {lines.map((l) => {
        const p = ease.outQuart(seg(t, l.at, l.at + 0.13));
        if (t < l.at) return null;
        const big = l.text === 'MIND.';
        const stamp = big ? lerp(1.12, 1, snap(t, l.at, 0.16)) : 1;
        return (
          <Printed key={l.text} p={p} head={big ? C.ink : C.electric} style={{ left: 300, top: l.top }}>
            <div className="d" style={{ fontSize: l.size, lineHeight: 0.8, color: l.color, transform: `scale(${stamp})`, transformOrigin: '0 50%' }}>
              {l.text}
            </div>
          </Printed>
        );
      })}

      {t >= 2.7 && (
        <>
          <RegMark size={34} color={C.signal} style={abs({ left: 862, top: 1060 })} />
          <Mono size={20} color={C.ink} style={{ left: 304, top: 1356, lineHeight: 1.5, opacity: 0.9 }}>
            {typed('“BEING INDEPENDENT IS A STATE OF MIND,', t, 2.9, 140)}
            {'\n'}
            {typed('IT’S THE OVERALL RESISTANCE TO MAINSTREAM CULTURE.”', t, 3.05, 160)}
            {'\n'}
            <span style={{ opacity: 0.6 }}>{typed(`— ${BRAND_QUOTE.credit.toUpperCase()}`, t, 3.2, 160)}</span>
          </Mono>
        </>
      )}
      <CropMarks inset={44} len={30} gap={8} color="rgba(16,17,24,.5)" />
    </div>
  );
}

/* ═══ 02 — THE DENIM SCANNER (3.50–6.00) ══════════════════════════ */

const SCAN_TAGS: { ax: number; ay: number; lx: number; ly: number; text: string; code: string }[] = [
  { ax: 389, ay: 500, lx: 500, ly: 420, text: 'SILVER BUTTONS', code: 'A1' },
  { ax: 262, ay: 790, lx: 470, ly: 720, text: 'GREY SPONGE SPOTS', code: 'A2' },
  { ax: 799, ay: 1114, lx: 360, ly: 1010, text: 'BEIGE STITCHING', code: 'A3' },
];

export function Scanner({ t, P }: SP) {
  const p = seg(t, 3.5, 5.9);
  const q = p - (0.42 * Math.sin(2 * Math.PI * p)) / (2 * Math.PI);
  const half = 170;
  const c = lerp(-half, 1920 + half + 40, q);
  const edge = c + half;
  const top = c - half;
  const product = bySlug('destiney-sponge');
  const done = t >= 5.9;

  const clipAbove = `inset(0 0 ${Math.max(0, 1920 - Math.max(0, top))}px 0)`;
  const clipBand = `inset(${Math.max(0, top)}px 0 ${Math.max(0, 1920 - edge)}px 0)`;

  const title = (color: string) => (
    <div style={abs({ left: 56, top: 1150 })}>
      <div className="d" style={{ fontSize: 236, lineHeight: 0.78, color }}>
        DESTINY
        <br />
        SPONGE
      </div>
    </div>
  );

  return (
    <div className="full" style={{ background: C.ink }}>
      <Img src={P.scan.base} />
      <div className="full" style={{ background: 'linear-gradient(180deg, rgba(10,12,24,0) 55%, rgba(10,12,24,.55) 100%)' }} />
      {title(C.paper)}

      {/* scanned: printed halftone */}
      <div className="full" style={{ clipPath: done ? 'none' : clipAbove }}>
        <Img src={P.scan.riso} />
        {title(C.ink)}
      </div>

      {/* the loupe */}
      {!done && (
        <div className="full" style={{ clipPath: clipBand }}>
          <Img src={P.loupe.base} style={{ transform: `translateY(${-c * 0.25}px) scale(1.1)` }} />
          <div className="full" style={{ boxShadow: 'inset 0 0 120px rgba(0,0,10,.6)' }} />
        </div>
      )}

      {!done && (
        <>
          {/* negative sliver at the leading edge */}
          <div className="full" style={{ clipPath: `inset(${edge}px 0 ${Math.max(0, 1920 - edge - 18)}px 0)` }}>
            <Img src={P.scan.negative} />
          </div>
          <div style={abs({ left: 0, right: 0, top: edge + 18, height: 110, background: 'linear-gradient(180deg, rgba(236,231,219,.32), rgba(236,231,219,0))' })} />
          <div style={abs({ left: 0, right: 0, top: edge - 1, height: 3, background: C.paper, boxShadow: '0 0 14px rgba(236,231,219,.9)' })} />
          <div style={abs({ left: 0, right: 0, top: top, height: 1.5, background: 'rgba(236,231,219,.8)' })} />
          <Ticks length={1080} every={12} major={5} h={16} color="rgba(236,231,219,.85)" style={abs({ left: 0, top: top + 2 })} />
          <Ticks length={1080} every={12} major={5} h={16} dir="up" color="rgba(236,231,219,.85)" style={abs({ left: 0, top: edge - 18 })} />
          <Mono size={20} color={C.paper} style={{ right: 160, top: top + 28, lineHeight: 1.4, textAlign: 'right', textShadow: '0 1px 8px rgba(0,0,10,.6)', opacity: top + 28 > 220 ? 1 : 0 }}>
            {'DENIM SCANNER — PASS 01\nLOUPE ×2.4'}
          </Mono>
          <Mono size={20} color={C.paper} style={{ right: 160, top: edge - 60, textAlign: 'right', textShadow: '0 1px 8px rgba(0,0,10,.6)', opacity: edge - 60 > 220 ? 1 : 0 }}>
            {`Y ${String(Math.max(0, Math.round(edge))).padStart(4, '0')} / 1920`}
          </Mono>
        </>
      )}

      {/* inspection tags */}
      <svg width={1080} height={1920} style={abs({ inset: 0 })} aria-hidden>
        {SCAN_TAGS.map((g) => {
          const k = clamp01((edge - g.ay) / 140);
          if (k <= 0) return null;
          const ex = lerp(g.ax, g.lx, ease.outCubic(k));
          const ey = lerp(g.ay, g.ly + 22, ease.outCubic(k));
          return (
            <g key={g.code}>
              <circle cx={g.ax} cy={g.ay} r={12} fill="none" stroke={C.paper} strokeWidth={2} />
              <circle cx={g.ax} cy={g.ay} r={3.5} fill={C.paper} />
              <line x1={g.ax} y1={g.ay} x2={ex} y2={ey} stroke={C.paper} strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>
      {SCAN_TAGS.map((g) => {
        const k = clamp01((edge - g.ay - 80) / 240);
        if (k <= 0) return null;
        return (
          <div key={g.code} className="m" style={abs({ left: g.lx, top: g.ly, background: C.paper, color: C.ink, fontSize: 24, fontWeight: 600, padding: '8px 14px 7px', display: 'flex', gap: 14, whiteSpace: 'pre' })}>
            <span style={{ color: C.electric }}>{g.code}</span>
            <span>{g.text.slice(0, Math.ceil(g.text.length * k))}</span>
          </div>
        );
      })}

      <TopRow left="[CH.02 / DENIM SCANNER]" right={slotCredit('scanner')} color={C.paper} />
      <Mono size={24} color={C.paper} style={{ left: 60, top: 1100, textShadow: '0 1px 8px rgba(0,0,10,.5)' }}>
        DENIM STUDY / 02
      </Mono>
      <Mono size={22} color={C.paper} style={{ left: 60, top: 1512, lineHeight: 1.45, textShadow: '0 1px 8px rgba(0,0,10,.5)' }}>
        {`${product.fit}\n${product.washLabel}\n100% EGYPTIAN COTTON`}
      </Mono>
      {done && (
        <Mono size={22} color={C.ink} style={{ left: 640, top: 1100, background: C.paper, padding: '6px 12px' }}>
          PASS COMPLETE
        </Mono>
      )}
    </div>
  );
}

/* ═══ 03 — PRODUCT ARCHIVE (6.00–9.00) ════════════════════════════ */

const ARCHIVE: { slug: string; plate: 'p1' | 'p2' | 'p3' | 'p4'; slot: SlotId; bg: string; fg: string; num: string; rot: number }[] = [
  { slug: 'destiny-black-jeans', plate: 'p1', slot: 'product-destiny-black', bg: C.paper, fg: C.ink, num: C.electric, rot: -1.4 },
  { slug: 'wide-leg-midnight-blue', plate: 'p2', slot: 'product-wide-leg-midnight', bg: C.electric, fg: C.paper, num: C.paper, rot: 1.1 },
  { slug: 'indie-fit-jeans-blue-wash', plate: 'p3', slot: 'product-indie-fit', bg: C.ink, fg: C.paper, num: C.electric, rot: -0.6 },
  { slug: 'be-fluffy-2-0-cloud-wash', plate: 'p4', slot: 'product-be-fluffy', bg: C.paper, fg: C.ink, num: C.electric, rot: 0 },
];
const A0 = 6.0;
const AD = 0.75;

export function Archive({ t, P }: SP) {
  const i = Math.min(ARCHIVE.length - 1, Math.floor((t - A0) / AD));
  const cur = ARCHIVE[i];
  const at = A0 + i * AD;
  const prod = bySlug(cur.slug);
  const name = prod.display;

  return (
    <div className="full" style={{ background: cur.bg }}>
      {cur.bg === C.paper && <Img src={P.paper} />}
      <Mono size={22} color={cur.fg} style={{ right: 160, top: 178 }}>{`[CH.03] DENIM STUDY / 0${i + 1} — 04`}</Mono>

      {/* plates stack: each lands on the one before */}
      {ARCHIVE.slice(0, i + 1).map((a, k) => {
        const s = snap(t, A0 + k * AD, 0.16);
        const x = 250 + (1 - s) * 1100;
        const r = lerp(5, a.rot, s);
        const settle = k === i ? lerp(1.035, 1, ease.outCubic(seg(t, at + 0.1, at + 0.6))) : 1;
        return (
          <div key={a.slug} style={abs({ left: x, top: 250, width: 740, height: 940, transform: `rotate(${r}deg) scale(${settle})`, boxShadow: '0 30px 60px rgba(0,0,10,.28)' })}>
            <Img src={P[a.plate].base} style={{ transform: `skewX(${(1 - s) * -8}deg)` }} />
          </div>
        );
      })}

      {/* index: the counter rolls */}
      <div style={abs({ left: 40, top: 205, height: 330, overflow: 'hidden' })}>
        {[i - 1, i].map((n) => {
          if (n < 0) return null;
          const s = snap(t, at, 0.14);
          const y = n === i ? (1 - s) * 330 : -s * 330;
          return (
            <div key={n} className="d" style={{ position: n === i ? 'relative' : 'absolute', top: 0, fontSize: 420, lineHeight: 0.8, color: ARCHIVE[n].num, transform: `translateY(${y}px)` }}>
              0{n + 1}
            </div>
          );
        })}
      </div>

      {/* name, masked in line by line */}
      <div style={abs({ left: 52, top: 1122 })}>
        {name.map((line, k) => {
          const s = snap(t, at + 0.05 + k * 0.05, 0.14);
          return (
            <div key={k} style={{ overflow: 'hidden', height: 168 }}>
              <div className="d" style={{ fontSize: 212, lineHeight: 0.8, color: cur.bg === C.paper ? C.paper : cur.fg, mixBlendMode: cur.bg === C.paper ? 'difference' : 'normal', transform: `translateY(${(1 - s) * 175}px)` }}>
                {line}
              </div>
            </div>
          );
        })}
      </div>

      <Mono size={22} color={cur.fg} style={{ left: 60, top: 1478, lineHeight: 1.5 }}>
        {typed(`${prod.name.toUpperCase()}  —  ${prod.fit}`, t, at + 0.12, 120)}
      </Mono>
      <Mono size={18} color={cur.fg} style={{ left: 60, top: 560, lineHeight: 1.6, opacity: 0.92 }}>
        {['WASH /', ...prod.washLabel.split(' / '), '', ...prod.details.slice(0, 3).flatMap((d) => (d.length > 13 ? d.split(' ') : [d]))]
          .map((d, k) => typed(d, t, at + 0.14 + k * 0.03, 160))
          .join('\n')}
      </Mono>
      <div style={abs({ left: 60, top: 1000, transformOrigin: '0 0', transform: 'rotate(-90deg) translateX(-100%)' })}>
        <Barcode value={prod.slug} width={170} height={34} color={cur.fg} style={{ opacity: 0.85 }} />
      </div>
      <Mono size={16} color={cur.fg} style={{ right: 160, top: 1478, opacity: 0.65, textAlign: 'right' }}>
        {slotCredit(cur.slot)}
      </Mono>
    </div>
  );
}

/* ═══ 04 — PRINT ROOM / COLLAGE (9.00–11.50) ══════════════════════ */

interface Sheet {
  key: 'base' | 'riso' | 'halftone' | 'copy';
  x: number;
  y: number;
  at: number;
  label: string;
}
const CW = 450;
const CH = 600;
const SHEETS: Sheet[] = [
  { key: 'base', x: 75, y: 290, at: 9.0, label: '01A  FULL COLOUR' },
  { key: 'riso', x: 555, y: 290, at: 9.15, label: '02A  RISO / BLUE' },
  { key: 'halftone', x: 75, y: 930, at: 9.3, label: '03A  HALFTONE 45°' },
  { key: 'copy', x: 555, y: 930, at: 9.45, label: '04A  PHOTOCOPY' },
];
const CLEAN = { x: 150, y: 330, w: 780, h: 1040 };

/** Grease-pencil loop around the chosen frame. */
function PencilLoop({ p, x, y, w, h }: { p: number; x: number; y: number; w: number; h: number }) {
  const d = `M ${x + w * 0.62} ${y - 18} C ${x + w * 1.08} ${y - 30}, ${x + w + 30} ${y + h * 0.9}, ${x + w * 0.55} ${y + h + 26} C ${x + w * 0.05} ${y + h + 40}, ${x - 34} ${y + h * 0.3}, ${x + w * 0.2} ${y - 10} C ${x + w * 0.4} ${y - 24}, ${x + w * 0.7} ${y - 26}, ${x + w * 0.8} ${y - 6}`;
  return (
    <svg width={1080} height={1920} style={abs({ inset: 0, zIndex: 9, pointerEvents: 'none' })} aria-hidden>
      <path d={d} fill="none" stroke={C.signal} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} opacity={0.9} />
    </svg>
  );
}

export function PrintRoom({ t, P }: SP) {
  const snapClean = snap(t, 11.0, 0.12);
  const clean = t >= 11.0;
  const collage = P.collage as PlateSet;
  const frag = (text: string, x0: number, y0: number, x1: number, y1: number, a: number, b: number, z: number, style?: CSSProperties) => {
    const p = ease.inOutCubic(seg(t, a, b));
    if (t < a || clean) return null;
    return (
      <div className="m" style={abs({ left: lerp(x0, x1, p), top: lerp(y0, y1, p), zIndex: z, background: C.paper, color: C.ink, fontSize: 24, fontWeight: 600, padding: '6px 12px', whiteSpace: 'pre', boxShadow: '0 2px 6px rgba(30,24,10,.15)', ...style })}>
        {text}
      </div>
    );
  };
  const over = ease.outQuart(seg(t, 9.72, 9.9));

  return (
    <div className="full" style={{ background: C.paper }}>
      <Img src={P.paper} />
      <TopRow left="[CH.04 / PRINT ROOM]" right={clean ? 'LOOK 03 / REGISTERED' : 'LOOK 03 / CONTACT SHEET'} color={C.ink} />

      {SHEETS.map((s, k) => {
        if (t < s.at) return null;
        const inP = ease.outCubic(seg(t, s.at, s.at + 0.18));
        const x = lerp(s.x, CLEAN.x, snapClean);
        const y = lerp(s.y, CLEAN.y, snapClean);
        const w = lerp(CW, CLEAN.w, snapClean);
        const h = lerp(CH, CLEAN.h, snapClean);
        if (clean && s.key !== 'base') return null;
        const src = clean ? collage.base : collage[s.key];
        const jx = jitter(t, 31 + k, 6);
        const jy = jitter(t, 41 + k, 4);
        return (
          <div key={s.key} style={abs({ left: x, top: y, width: w, height: h, zIndex: clean ? 5 : 1 + k })}>
            <div className="full" style={{ clipPath: `inset(0 0 ${(1 - inP) * 100}% 0)`, overflow: 'hidden', background: C.ink, border: clean ? 'none' : `8px solid ${C.ink}` }}>
              <Img src={src} />
              {s.key === 'riso' && !clean && <Img src={collage.riso} style={{ mixBlendMode: 'multiply', opacity: 0.5, transform: `translate(${jx}px, ${jy}px)` }} />}
            </div>
            {inP < 1 && <div style={abs({ left: -8, right: -8, top: `${inP * 100}%`, height: 5, background: '#fff', boxShadow: '0 0 24px 8px rgba(255,255,255,.85)' })} />}
            {!clean && (
              <Mono size={18} color={C.ink} style={{ left: 0, top: CH + 8, opacity: inP, display: 'flex', gap: 20 }}>
                {s.label}
              </Mono>
            )}
          </div>
        );
      })}

      {/* overprint: two drums, slightly out of register, pulled by hand */}
      {!clean && t >= 9.72 && (
        <>
          <div className="d" style={abs({ left: 52 + jitter(t, 93, 5), top: 780 + jitter(t, 94, 4), zIndex: 6, fontSize: 332, lineHeight: 0.78, color: C.signal, mixBlendMode: 'multiply', opacity: 0.55, clipPath: `inset(-5% ${(1 - over) * 100}% -5% 0)` })}>
            LOOK 03
          </div>
          <div className="d" style={abs({ left: 46, top: 774, zIndex: 6, fontSize: 332, lineHeight: 0.78, color: C.electric, opacity: 0.94, clipPath: `inset(-5% ${(1 - over) * 100}% -5% 0)` })}>
            LOOK 03
          </div>
        </>
      )}

      {!clean && <PencilLoop p={ease.inOutCubic(seg(t, 10.15, 10.55))} x={SHEETS[0].x} y={SHEETS[0].y} w={CW} h={CH} />}
      {!clean && t >= 10.5 && (
        <div className="m" style={abs({ left: 360, top: 238, zIndex: 9, color: C.signal, fontSize: 26, fontWeight: 600, transform: `rotate(-4deg)`, opacity: seg(t, 10.5, 10.56) })}>
          ← SELECT
        </div>
      )}

      {/* tape */}
      {!clean && t >= 10.62 && (
        <>
          <div style={abs({ left: 760, top: 262, width: 150, height: 46, background: 'rgba(245,240,226,.78)', transform: `rotate(${lerp(-12, -6, snap(t, 10.62))}deg)`, zIndex: 8, boxShadow: '0 1px 3px rgba(0,0,0,.1)' })} />
          <div style={abs({ left: 120, top: 1506, width: 150, height: 46, background: 'rgba(245,240,226,.78)', transform: `rotate(${lerp(12, 7, snap(t, 10.72))}deg)`, zIndex: 8, boxShadow: '0 1px 3px rgba(0,0,0,.1)' })} />
        </>
      )}

      {/* fragments travel between layers: under the overprint, then over it */}
      {frag('BE-INDIE', 600, 690, 640, 700, 9.55, 10.8, t < 10.1 ? 5 : 7)}
      {frag('CAIRO', 120, 1400, 150, 1380, 9.65, 10.8, t < 10.2 ? 5 : 7, { background: C.ink, color: C.paper })}
      {frag('INDEPENDENT / ALWAYS', 520, 1580, 480, 1560, 9.85, 10.8, 7, { background: C.electric, color: C.paper })}

      {clean && (
        <>
          <div style={abs({ left: CLEAN.x, top: CLEAN.y, width: CLEAN.w, height: CLEAN.h, zIndex: 9 })}>
            <CropMarks inset={0} len={36} gap={12} color={C.ink} />
          </div>
          <RegMark size={34} color={C.ink} style={abs({ left: 523, top: 262 })} />
          <RegMark size={34} color={C.ink} style={abs({ left: 523, top: 1404 })} />
          <div style={abs({ left: CLEAN.x, top: CLEAN.y + CLEAN.h + 50, zIndex: 9, transform: `translateY(${(1 - snapClean) * 20}px)` })}>
            <div className="d" style={{ fontSize: 150, lineHeight: 0.8, color: C.ink }}>
              LOOK 03
            </div>
          </div>
          <Mono size={20} color={C.ink} style={{ left: 610, top: CLEAN.y + CLEAN.h + 56, lineHeight: 1.5, zIndex: 9 }}>
            {'BE-INDIE\nCAIRO / EG\n' + slotCredit('collage')}
          </Mono>
        </>
      )}
    </div>
  );
}

/* ═══ 05 — DETAIL (11.50–13.50) ═══════════════════════════════════ */

export function Detail({ t, P }: SP) {
  const k = seg(t, 11.5, 13.5);
  const push = lerp(1.0, 1.06, ease.inOutSine(k));
  const a1 = ease.outCubic(seg(t, 11.75, 12.35));
  const a2 = ease.outCubic(seg(t, 12.3, 12.9));
  return (
    <div className="full" style={{ background: C.ink }}>
      <Img src={P.detail.base} style={{ transform: `scale(${push}) translateY(${lerp(0, -30, k)}px)` }} />
      <div className="full" style={{ background: 'linear-gradient(125deg, rgba(220,228,245,.55) 0%, rgba(200,212,240,0) 42%, rgba(0,0,0,0) 62%, rgba(2,4,12,.6) 100%)', mixBlendMode: 'soft-light' }} />
      <div className="full" style={{ background: 'radial-gradient(120% 80% at 40% 40%, rgba(0,0,0,0) 45%, rgba(4,6,14,.6) 100%)' }} />
      <div style={abs({ left: 60, top: 260, opacity: a1, transform: `translateY(${(1 - a1) * 14}px)` })}>
        <div className="d" style={{ fontSize: 118, lineHeight: 0.84, color: C.paper }}>
          DENIM /
          <br />
          DETAIL 04
        </div>
      </div>
      <div style={abs({ left: 62, top: 500, width: lerp(0, 330, a2), height: 1.5, background: 'rgba(236,231,219,.85)' })} />
      {/* measurement, quietly */}
      <div style={abs({ left: 60, top: 760, transformOrigin: '0 0', transform: 'rotate(90deg) translateY(-16px)', opacity: 0.8 * a1, clipPath: `inset(0 ${(1 - a1) * 100}% 0 0)` })}>
        <Ticks length={720} every={12} major={5} h={16} color={C.paper} />
      </div>
      <svg width={1080} height={1920} style={abs({ inset: 0, opacity: a2 })} aria-hidden>
        <circle cx={540} cy={1114} r={14} fill="none" stroke={C.paper} strokeWidth={2} />
        <line x1={552} y1={1124} x2={lerp(552, 640, a2)} y2={lerp(1124, 1236, a2)} stroke={C.paper} strokeWidth={1.5} />
      </svg>
      <Mono size={22} color={C.ink} style={{ left: 640, top: 1236, background: C.paper, padding: '6px 12px', opacity: a2, fontWeight: 600 }}>
        SEAM / DOUBLE STITCH
      </Mono>
      <Mono size={24} color={C.paper} style={{ left: 64, top: 528, lineHeight: 1.6, opacity: a2, textShadow: '0 1px 10px rgba(0,0,20,.45)' }}>
        {'100% EGYPTIAN COTTON\nDESIGNED IN CAIRO'}
      </Mono>
      <Mono size={18} color="rgba(236,231,219,.75)" style={{ left: 64, top: 626, opacity: a2 }}>
        {slotCredit('detail')}
      </Mono>
    </div>
  );
}

/* ═══ 06 — CAMPAIGN LOCKUP (13.50–15.50) ══════════════════════════ */

export function Lockup({ t, P }: SP) {
  const s = snap(t, 13.5, 0.14);
  const lines = ['INDEPENDENCE', 'IS A STATE', 'OF MIND.'];
  const settle = lerp(1.05, 1.0, ease.outCubic(seg(t, 13.5, 15.5)));
  const lock = ease.outCubic(seg(t, 13.55, 13.95));
  const off = (1 - lock) * 18;
  const credit = seg(t, 14.45, 14.9);
  return (
    <div className="full" style={{ background: C.ink }}>
      <Img src={P.end.base} style={{ transform: `scale(${settle})`, transformOrigin: '50% 30%' }} />
      <div className="full" style={{ background: 'linear-gradient(180deg, rgba(8,10,22,.2) 0%, rgba(8,10,22,.35) 50%, rgba(8,10,22,.82) 100%)' }} />
      <CropMarks inset={44} len={30} gap={8} color="rgba(236,231,219,.7)" />
      {t >= 14.2 && (
        <svg width={1080} height={1920} style={abs({ inset: 0 })} aria-hidden>
          <rect x={30} y={30} width={1020} height={1860} fill="none" stroke={C.thread} strokeOpacity={0.9} strokeWidth={3} strokeDasharray="16 10" pathLength={5760} style={{ clipPath: 'none' }} strokeDashoffset={0} mask="url(#sew)" />
          <defs>
            <mask id="sew">
              <rect x={0} y={0} width={1080} height={1920} fill="black" />
              <path d="M 540 30 L 1050 30 L 1050 1890 L 30 1890 L 30 30 L 540 30" fill="none" stroke="white" strokeWidth={14} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - ease.inOutCubic(seg(t, 14.2, 15.1))} />
            </mask>
          </defs>
        </svg>
      )}

      <div style={abs({ left: 52, top: 236, opacity: s > 0 ? 1 : 0, transform: `translateY(${(1 - s) * -60}px)` })}>
        {lock < 1 && (
          <div className="d" style={abs({ left: off, top: -off * 0.5, fontSize: 262, color: C.electric, mixBlendMode: 'screen', whiteSpace: 'nowrap' })}>
            BE—INDIE
          </div>
        )}
        <div className="d" style={{ fontSize: 262, color: C.paper, whiteSpace: 'nowrap', position: 'relative' }}>
          BE—INDIE
        </div>
      </div>

      <div style={abs({ left: 58, top: 690 })}>
        {lines.map((l, k) => {
          const p = ease.outQuart(seg(t, 13.85 + k * 0.14, 13.99 + k * 0.14));
          return (
            <Printed key={l} p={p} head={C.electric} style={{ position: 'relative', height: 132 }}>
              <div className="d" style={{ fontSize: 150, lineHeight: 0.84, color: C.paper }}>
                {l}
              </div>
            </Printed>
          );
        })}
      </div>

      {t >= 14.3 && <WovenLabel w={250} h={92} stitch={ease.outCubic(seg(t, 14.3, 14.7))} line2="INDEPENDENT / CAIRO" style={{ left: 60, top: 1150 }} />}

      <div style={abs({ left: 60, right: 160, top: 1296, height: 1.5, background: 'rgba(236,231,219,.6)', transformOrigin: '0 0', transform: `scaleX(${ease.outCubic(credit)})` })} />
      <Mono size={24} color={C.paper} style={{ left: 60, top: 1320, lineHeight: 1.55 }}>
        {typed('DIGITAL CONCEPT', t, 14.5, 90)}
        {'\n'}
        {typed('OMAR AKRAM / 2026', t, 14.6, 90)}
      </Mono>
      <Mono size={18} color="rgba(236,231,219,.72)" style={{ left: 560, top: 1324, lineHeight: 1.65 }}>
        {typed('UNOFFICIAL CONCEPT', t, 14.75, 90)}
        {'\n'}
        {typed('NOT AFFILIATED WITH BE-INDIE', t, 14.85, 90)}
      </Mono>
    </div>
  );
}

/* ═══ running order ═══════════════════════════════════════════════ */

export const SCENES: { from: number; to: number; C: (p: SP) => ReactNode }[] = [
  { from: 0, to: 1.5, C: Impact },
  { from: 1.5, to: 3.5, C: Independence },
  { from: 3.5, to: 6.0, C: Scanner },
  { from: 6.0, to: 9.0, C: Archive },
  { from: 9.0, to: 11.5, C: PrintRoom },
  { from: 11.5, to: 13.5, C: Detail },
  { from: 13.5, to: Infinity, C: Lockup },
];

export const PRODUCT_COUNT = PRODUCTS.length;
