import { BrandMark } from '../components/BrandMark';
import { concept } from '../data/brand';
import { numberLabel, p, priceLabel, products, type Product } from '../data/products';

/*
 * Every scene of the collector-film, composed for a 1080×1920 portrait stage.
 * Important text stays inside the TikTok/Reels safe box (x 72–900, y 190–1480).
 * All product imagery is the real supplied photography, sized so it is never
 * shown at more than ~1.6× its native pixels except in fast motion.
 */

export const W = 1080;
export const H = 1920;

/** A product image anchored at its bottom-centre (x, bottom) with a pixel height. */
export function Obj({ prod, h, className = '', style }: { prod: Product; h: number; className?: string; style?: React.CSSProperties }) {
  return (
    <img
      className={`sx-obj ${className}`}
      src={prod.image}
      alt=""
      draggable={false}
      style={{ height: h, width: Math.round((h * prod.w) / prod.h), ...style }}
    />
  );
}

/* ── S2: the explosion grid ─────────────────────────────── */
export const GRID_ORDER = ['06', '08', '03', '16', '10', '13', '02', '15', '04', '14', '12', '07', '05', '01', '11', '09'];
export const GRID_COLS = [180, 420, 660, 900];
export const GRID_ROWS = [760, 1000, 1240, 1480]; // bottom lines
/** Where each product flies during the explosion (x/y offset from centre, z depth). */
export const FLIGHT: [number, number, number, number][] = [
  [60, 250, 520, -6],
  [-300, 520, 420, 8],
  [310, -180, 300, -10],
  [-330, -300, 480, 12],
  [330, 560, 360, -8],
  [-160, -520, -200, 6],
  [300, 120, -320, -4],
  [-380, 120, -100, 10],
  [150, 700, 560, -12],
  [-250, 760, 150, 6],
  [420, -560, -420, -6],
  [-420, -620, -300, 8],
  [40, -700, -500, -3],
  [200, -420, 620, 14],
  [-80, 360, -600, -9],
  [380, 760, 100, 7],
];

/* ── S3: universes ──────────────────────────────────────── */
export interface UniverseShot {
  key: string;
  word: string[];
  num: string;
  items: { n: string; h: number; x: number; b: number; z: number }[];
}
export const SHOTS: UniverseShot[] = [
  {
    key: 'anime',
    word: ['ANIME'],
    num: p('03').number ?? '',
    items: [
      { n: '02', h: 300, x: 250, b: 1400, z: 1 },
      { n: '04', h: 390, x: 840, b: 1430, z: 2 },
      { n: '03', h: 410, x: 540, b: 1520, z: 3 },
    ],
  },
  {
    key: 'sports',
    word: ['SPORTS'],
    num: p('08').number ?? '',
    items: [
      { n: '15', h: 440, x: 220, b: 1420, z: 1 },
      { n: '14', h: 440, x: 870, b: 1420, z: 1 },
      { n: '08', h: 700, x: 540, b: 1560, z: 3 },
    ],
  },
  {
    key: 'marvel',
    word: ['MARVEL'],
    num: p('06').number ?? '',
    items: [{ n: '06', h: 560, x: 540, b: 1500, z: 2 }],
  },
  {
    key: 'screen',
    word: ['MOVIES', '& TV'],
    num: p('10').number ?? '',
    items: [
      { n: '12', h: 330, x: 640, b: 1300, z: 1 },
      { n: '16', h: 420, x: 830, b: 1500, z: 2 },
      { n: '10', h: 600, x: 350, b: 1540, z: 3 },
    ],
  },
  {
    key: 'disney',
    word: ['DISNEY', '· PIXAR'],
    num: p('13').number ?? '',
    items: [{ n: '13', h: 520, x: 540, b: 1500, z: 2 }],
  },
];

/* ── S4: the wall ───────────────────────────────────────── */
export const WALL_ROWS: string[][] = [
  ['03', '16', '06', '11', '13', '02', '15', '10'],
  ['10', '05', '14', '01', '12', '04', '09', '07'],
  ['15', '02', '13', '16', '06', '03', '11', '05'],
  ['12', '04', '07', '10', '08', '14', '01', '13'],
  ['07', '09', '04', '12', '01', '14', '05', '10'],
  ['06', '11', '03', '16', '08', '02', '15', '13'],
  ['01', '14', '10', '05', '09', '07', '12', '04'],
];
export const WALL_MID = 3;
export const WALL_SLOT = 230;
export const WALL_COPIES = 3;
export const WALL_HERO = '08';

/* ── S6: drop machine ───────────────────────────────────── */
export const DROPS = ['02', '06', '07'];

/* ── S7: vault ──────────────────────────────────────────── */
export const VAULT_ITEMS = ['03', '08', '13', '16', '10'];
export const VAULT_SLOTS: [number, number][] = [
  [72, 560],
  [384, 560],
  [696, 560],
  [72, 880],
  [384, 880],
  [696, 880],
  [72, 1200],
  [384, 1200],
  [696, 1200],
];
export const SLOT_W = 300;
export const SLOT_H = 300;

/* ── S8: lockup perimeter (bottom-centre x, bottom y, height) ── */
export const RIM: [string, number, number, number][] = [
  ['03', 150, 470, 240],
  ['16', 410, 430, 220],
  ['06', 680, 450, 230],
  ['13', 940, 480, 230],
  ['02', 120, 780, 170],
  ['15', 975, 800, 250],
  ['10', 140, 1560, 280],
  ['14', 960, 1520, 250],
  ['04', 330, 1740, 250],
  ['08', 580, 1830, 320],
  ['12', 820, 1760, 240],
  ['05', 110, 1900, 230],
  ['07', 1000, 1900, 230],
  ['11', 360, 1960, 200],
  ['01', 790, 1990, 190],
  ['09', 560, 480, 0],
];

export function Scenes() {
  const gojo = p('03');
  const salah = p(WALL_HERO);
  const holt = p('10');

  return (
    <>
      {/* ── S1 · OBJECT DETECTED ── */}
      <section className="sc sc1">
        <span className="sc1__vf sc1__vf--tl" />
        <span className="sc1__vf sc1__vf--tr" />
        <span className="sc1__vf sc1__vf--bl" />
        <span className="sc1__vf sc1__vf--br" />
        <p className="sc1__detect sx-mono">Object detected.</p>
        <div className="sc1__ring">
          <i />
        </div>
        <div className="sc1__obj">
          <Obj prod={gojo} h={390} />
          <span className="sc1__xray" style={{ WebkitMaskImage: `url(${gojo.image})`, maskImage: `url(${gojo.image})` }} />
        </div>
        <span className="sc1__beam" />
        <p className="sc1__id sx-mono">Collector ID / 001</p>
        <p className="sc1__hud sc1__hud--l sx-mono">
          X 540
          <br />Y 900
          <br />Z 000
        </p>
        <p className="sc1__hud sc1__hud--r sx-mono">
          {numberLabel(gojo)}
          <br />
          {gojo.franchise}
        </p>
        <p className="sc1__lock">Locked ✓</p>
      </section>

      {/* ── S2 · WHAT ARE YOU HUNTING? → shelf ── */}
      <section className="sc sc2">
        <div className="sc2__halftone" />
        <h1 className="sc2__words sx-display">
          <span>What</span>
          <span>are</span>
          <span>you</span>
          <span>hunting?</span>
        </h1>
        <div className="sc2__planks">
          {GRID_ROWS.map((y) => (
            <i key={y} style={{ top: y }} />
          ))}
        </div>
        <div className="sc2__field">
          {GRID_ORDER.map((n) => (
            <div className="sc2__p" key={n}>
              <Obj prod={p(n)} h={200} />
            </div>
          ))}
        </div>
        <p className="sc2__count">
          <b>{String(products.length).padStart(2, '0')}</b> objects spotted
        </p>
      </section>

      {/* ── S3 · FANDOM PORTAL ── */}
      <section className="sc sc3">
        {SHOTS.map((s, i) => (
          <div className={`sc3__u sc3__u--${s.key}`} key={s.key}>
            <div className="sc3__bg" />
            <span className="sc3__num sx-display">{s.num}</span>
            <h2 className="sc3__word sx-display">
              {s.word.map((w) => (
                <span key={w}>{w}</span>
              ))}
            </h2>
            {s.items.map((it) => (
              <div key={it.n} className="sc3__obj" style={{ left: it.x, top: it.b, zIndex: it.z }}>
                <Obj prod={p(it.n)} h={it.h} />
              </div>
            ))}
            <p className="sc3__tag sx-mono">
              Universe {String(i + 1).padStart(2, '0')}/05 · {s.items.length} real object{s.items.length > 1 ? 's' : ''}
            </p>
          </div>
        ))}
        <span className="sc3__iris" />
        <span className="sc3__frame" />
      </section>

      {/* ── S4 · THE WALL + SPOT LOCK ── */}
      <section className="sc sc4">
        {WALL_ROWS.map((row, r) => (
          <div className="sc4__row" key={r} style={{ top: 150 + r * 250 }}>
            <div className="sc4__track">
              {Array.from({ length: WALL_COPIES }).flatMap((_, c) =>
                row.map((n, i) => (
                  <div className={`sc4__slot ${r === WALL_MID && n === WALL_HERO && c === 1 ? 'is-hero' : ''}`} key={`${c}-${i}`}>
                    <Obj prod={p(n)} h={200} />
                  </div>
                )),
              )}
            </div>
          </div>
        ))}
        <span className="sc4__dim" />
        <div className="sc4__ring">
          <i />
          <span className="sx-mono">Spot 00</span>
        </div>
        <div className="sc4__hero">
          <Obj prod={salah} h={560} />
        </div>
        <div className="sc4__card">
          <span className="sc4__spotted sx-display">Spotted</span>
          <h3 className="sx-display">{salah.name}</h3>
          <p>
            <span className="sx-tag sx-tag--yellow">{numberLabel(salah)}</span>
            <span className="sx-mono">
              {salah.franchise} · {salah.format}
            </span>
          </p>
          <span className="sx-price">{priceLabel(salah)}</span>
        </div>
      </section>

      {/* ── S5 · REAL PRODUCT SCANNER ── */}
      <section className="sc sc5">
        <span className="sc5__grid" />
        <span className="sc5__c sc5__c--tl" />
        <span className="sc5__c sc5__c--tr" />
        <span className="sc5__c sc5__c--bl" />
        <span className="sc5__c sc5__c--br" />
        <p className="sc5__label sx-mono">Chamber 01 · scanning</p>
        <div className="sc5__obj">
          <Obj prod={holt} h={740} />
          <span className="sc5__xray" style={{ WebkitMaskImage: `url(${holt.image})`, maskImage: `url(${holt.image})` }} />
        </div>
        <span className="sc5__beam" />
        <dl className="sc5__data">
          {[
            ['Format', `Funko ${holt.format}`],
            ['Number', numberLabel(holt) ?? ''],
            ['Item', holt.name],
            ['Franchise', holt.franchise ?? ''],
          ].map(([k, v]) => (
            <div className="sc5__row" key={k}>
              <dt className="sx-mono">{k}</dt>
              <dd className="sx-cond" data-text={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <div className="sc5__stamp">
          <span>Spotted</span>
          <b>✓</b>
        </div>
      </section>

      {/* ── S6 · DROP MACHINE ── */}
      <section className="sc sc6">
        <div className="sc2__halftone" />
        <h2 className="sc6__title sx-display">
          <span>Drop</span>
          <span>incoming.</span>
        </h2>
        <div className="sc6__cabinet">
          <div className="sc6__glass">
            {DROPS.map((n, i) => (
              <div className="sc6__slot" key={n}>
                <span className="sc6__code">A{i + 1}</span>
                <span className="sc6__coil" />
              </div>
            ))}
            <span className="sc6__reflect" />
          </div>
        </div>
        {DROPS.map((n, i) => (
          <div className="sc6__obj" key={n} style={{ left: 72 + 36 + i * 300 + 132 }}>
            <Obj prod={p(n)} h={n === '02' ? 250 : 330} />
          </div>
        ))}
        {DROPS.map((n, i) => (
          <span className="sc6__bang sx-display" key={n} style={{ left: 72 + 36 + i * 300 + 132 }}>
            Bang!
          </span>
        ))}
        <div className="sc6__tags">
          {DROPS.map((n) => (
            <div key={n}>
              {p(n).tags.map((t) => (
                <span key={t} className={`sx-tag ${t === 'CHASE LISTED' ? 'sx-tag--red' : 'sx-tag--yellow'}`}>
                  {t}
                </span>
              ))}
              <b className="sx-cond">
                {p(n).name} {numberLabel(p(n))}
              </b>
            </div>
          ))}
        </div>
        <p className="sc6__led">
          <span className="sx-mono">Next drop</span>
          <b>COMING SOON</b>
          <span className="sx-mono">Concept UI</span>
        </p>
      </section>

      {/* ── S7 · THE VAULT ── */}
      <section className="sc sc7">
        <h2 className="sc7__title sx-display">
          <span>The</span>
          <span>vault.</span>
        </h2>
        <div className="sc7__counter">
          <span className="sx-mono">Collection</span>
          <b className="sx-display">
            {VAULT_ITEMS.map((_, i) => (
              <span key={i} className="sc7__digit">
                {String(i + 1).padStart(2, '0')}
              </span>
            ))}
          </b>
        </div>
        {VAULT_SLOTS.map(([x, y], i) => (
          <div className={`sc7__slot ${i < VAULT_ITEMS.length ? '' : 'is-empty'}`} key={i} style={{ left: x, top: y }}>
            <span className="sx-mono">{String(i + 1).padStart(2, '0')}</span>
          </div>
        ))}
        {VAULT_ITEMS.map((n, i) => {
          const [x, y] = VAULT_SLOTS[i]!;
          return (
            <div className="sc7__obj" key={n} style={{ left: x + SLOT_W / 2, top: y + SLOT_H - 26 }}>
              <Obj prod={p(n)} h={n === '10' ? 250 : 230} />
              <span className="sc7__stamp">{i % 2 ? 'Wanted' : 'Owned'}</span>
            </div>
          );
        })}
        <p className="sc7__updated">
          <span>🔒</span> Collection updated
        </p>
      </section>

      {/* ── S8 · LOCKUP ── */}
      <section className="sc sc8">
        <span className="sc8__iris" />
        {RIM.filter((r) => r[3] > 0).map(([n, x, b, h]) => (
          <div className="sc8__obj" key={n} style={{ left: x, top: b }}>
            <Obj prod={p(n)} h={h} />
          </div>
        ))}
        <div className="sc8__lockup">
          <div className="sc8__mark">
            <BrandMark tone="white" />
          </div>
          <h2 className="sc8__line sx-display">
            <span>Every</span>
            <span>fandom</span>
            <span>has a spot.</span>
          </h2>
          <p className="sc8__small sx-mono">
            Unofficial digital concept
            <br />
            {concept.author} / {concept.year}
            <br />
            Not affiliated with Pop Spot
          </p>
        </div>
      </section>

      {/* ── global layers ── */}
      <span className="sc-flash" />
      <div className="sc-bug">
        <BrandMark tone="blue" />
      </div>
      <p className="sc-hud sx-mono">Unofficial concept</p>
    </>
  );
}
