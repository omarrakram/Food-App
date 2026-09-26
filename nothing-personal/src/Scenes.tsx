import type { CSSProperties } from 'react';
import type { Assets } from './lib/assets';
import type { Layout } from './lib/layout';
import { products, credits } from './content';

interface Props {
  assets: Assets;
  L: Layout;
}

const STRIPS = 7;
export const STRIP_COUNT = STRIPS;

/**
 * The official logo when it has been downloaded, drawn through its alpha so
 * it takes the colour of the scene; otherwise the name, set in type.
 */
function Wordmark({ assets, className, style, k, children }: {
  assets: Assets;
  className: string;
  style?: CSSProperties;
  k?: string;
  children: string;
}) {
  const logo = assets.logo;
  if (!logo) {
    return (
      <div className={className} data-k={k} style={style}>
        {children}
      </div>
    );
  }
  return (
    <div
      className={`${className} logo-mask`}
      data-k={k}
      role="img"
      aria-label="Nothing Personal"
      style={{
        ...style,
        aspectRatio: `${logo.w} / ${logo.h}`,
        WebkitMaskImage: `url(${logo.src})`,
        maskImage: `url(${logo.src})`,
      }}
    />
  );
}

function WordText({ L, fill }: { L: Layout; fill?: string }) {
  const w = L.word;
  return (
    <text
      x={0}
      y={w.cap / 2}
      fontSize={w.fs}
      textAnchor="middle"
      fill={fill}
      transform={`translate(${w.cx} ${w.cy}) rotate(${w.rot})`}
    >
      PERSONAL.
    </text>
  );
}

export function Hook({ assets, L }: Props) {
  const hook = assets.hook!;
  // auto-exposure: whatever photograph arrives, it prints into the red at
  // the same density
  const exposure = Math.min(1.9, Math.max(0.85, 0.6 / Math.max(0.05, hook.mean)));
  return (
    <section className="scene s1" data-k="s1">
      <svg className="s1-svg" viewBox={`0 0 ${L.W} ${L.H}`} aria-label="Personal.">
        <defs>
          <clipPath id="s1-clip">
            <WordText L={L} />
          </clipPath>
          <clipPath id="s1-wipe" clipPathUnits="userSpaceOnUse">
            <rect data-k="s1-wipe" x={0} y={0} width={L.W} height={L.H} />
          </clipPath>
        </defs>
        <g data-k="s1-k">
          <WordText L={L} fill="var(--ink)" />
        </g>
        <g data-k="s1-r">
          <WordText L={L} fill="var(--red)" />
        </g>
        <g clipPath="url(#s1-clip)" style={{ mixBlendMode: 'multiply' }}>
          <g clipPath="url(#s1-wipe)">
            <g data-k="s1-ph">
              <g data-k="s1-ph-in">
              <image
                href={hook.src}
                x={-L.W * 0.1}
                y={-L.H * 0.1}
                width={L.W * 1.2}
                height={L.H * 1.2}
                preserveAspectRatio="xMidYMid slice"
                style={{ filter: `grayscale(1) contrast(1.3) brightness(${exposure.toFixed(2)})` }}
              />
              </g>
            </g>
          </g>
        </g>
      </svg>
      <div className="abs serif s1-nothing" data-k="s1-nothing">
        (nothing)
      </div>
      <div className="abs mono s1-meta" data-k="s1-meta">
        <div>ISSUE 01</div>
        <div>NP / CAIRO</div>
        <div>UNATTACHED</div>
        <div>2026 CONCEPT</div>
      </div>
      <div className="fill s1-cover" data-k="s1-cover">
        <div className="abs serif s1-nothing">(nothing)</div>
      </div>
    </section>
  );
}

export function Manifesto({ assets, L }: Props) {
  const img = assets.manifesto!;
  const fs = { fontSize: L.fs.unbothered };
  return (
    <section className="scene s2" data-k="s2">
      <div className="abs mono s2-meta">
        <div>NP — MANIFESTO</div>
      </div>
      <div className="abs display s2-word s2-w1" data-k="s2-w1" style={fs}>
        UNBOTHERED
      </div>
      <div className="abs display s2-word s2-w2" data-k="s2-w2" style={fs}>
        BY TRENDS<span className="red">.</span>
      </div>
      <figure className="abs s2-clip" data-k="s2-clip">
        <img data-k="s2-img" src={img.src} alt="" style={{ objectPosition: img.pos }} />
        {/* the same line, in ink, where it crosses the print */}
        <div className="s2-inner" data-k="s2-inner">
          <div className="abs display s2-word s2-w2 s2-w2-ink" data-k="s2-w2i" style={fs}>
            BY TRENDS<span className="red">.</span>
          </div>
        </div>
      </figure>
      <div className="abs serif s2-un" data-k="s2-un">
        unattached.
      </div>
      <div className="abs display s2-n1" data-k="s2-n1" style={{ fontSize: L.fs.nothing }}>
        NOTHING,
      </div>
      <div className="abs serif s2-n2" data-k="s2-n2">
        yet everything.
      </div>
    </section>
  );
}

function Digits({ L, layer, bg }: { L: Layout; layer: number; bg: string }) {
  const fs = L.fs.digits;
  const step = L.H * 0.235;
  const top0 = L.H * 0.1;
  const zoom = 1.45;
  const bw = L.W * zoom;
  const bh = L.H * zoom;
  const left = L.W * 0.07;
  return (
    <div className="fill" data-k={`s3-109-${layer}`}>
      {['1', '0', '9'].map((d, i) => {
        const top = L.portrait ? top0 + i * step : L.H * 0.17;
        const x = L.portrait ? left : L.W * 0.06 + i * L.digitStep;
        const style: CSSProperties = {
          left: x,
          fontSize: fs,
          top,
          background: bg,
          backgroundSize: `${bw}px ${bh}px, auto`,
          backgroundPosition: `${-(bw - L.W) / 2 - x}px ${-(bh - L.H) / 2 - top}px, 0 0`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
        };
        return (
          <div key={d} className="abs display s3-digit" style={style}>
            {d}
          </div>
        );
      })}
    </div>
  );
}

export function Catalogue({ assets, L }: Props) {
  const { p01, p109, p98 } = products;
  // dark → light: the digits change material three times
  const layers = [
    `url(${assets.p109b!.src}) center / cover no-repeat, var(--ink)`,
    `url(${assets.p109!.src}) center / cover no-repeat, var(--paper-2)`,
    `url(${assets.p109a!.src}) center / cover no-repeat, var(--paper-2)`,
  ];
  return (
    <section className="scene s3" data-k="s3">
      <div className="s3-part s3-a" data-k="s3a">
        <div className="abs display s3-num s3-zero s3-zero-back" data-k="s3-0b">
          0
        </div>
        <div className="abs s3-tee" data-k="s3-tee">
          <img data-k="s3-tee-in" src={assets.p01!.src} alt="" />
        </div>
        <div className="abs display s3-num s3-zero s3-zero-front" data-k="s3-0f">
          0
        </div>
        <div className="abs display s3-num s3-one" data-k="s3-1">
          1
        </div>
        <div className="abs mono s3-label s3-a-label" data-k="s3a-label">
          <div>{p01.code}</div>
          <div>{p01.type}</div>
          <div>{p01.price}</div>
        </div>
        <div className="abs display s3-name s3-a-name" data-k="s3a-name">
          {p01.name}
        </div>
      </div>

      <div className="s3-part s3-b" data-k="s3b">
        {layers.map((bg, i) => (
          <Digits key={i} L={L} layer={i} bg={bg} />
        ))}
        <div className="abs mono s3-label s3-b-label" data-k="s3b-label">
          <div>{p109.code}</div>
          <div>{p109.type}</div>
          <div>{p109.price}</div>
        </div>
        <div className="abs display s3-name s3-b-name" data-k="s3b-name">
          {p109.name}
        </div>
      </div>

      <div className="s3-part s3-c" data-k="s3c">
        <div className="abs s3-jorts" data-k="s3-jorts">
          <img src={assets.p98!.src} alt="" />
        </div>
        <div className="abs display s3-raw" data-k="s3-raw">
          {p98.name}
        </div>
        <div className="abs mono s3-info" data-k="s3-info">
          <div>{p98.code}</div>
          <div>{p98.type}</div>
          <div>{p98.price}</div>
          <div>{p98.sizes.join('  ')}</div>
          <div className="s3-add hit" data-k="s3-add">
            <span className="bag-n">
              <i data-k="s3-add-0">[ ADD + ]</i>
              <i data-k="s3-add-1" className="red">
                [ ADDED ]
              </i>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Separation({ assets, L }: Props) {
  const img = assets.separation!;
  const strips = Array.from({ length: STRIPS }, (_, i) => i);
  return (
    <section className="scene s4" data-k="s4">
      <div className="abs display s4-word" data-k="s4-word" style={{ fontSize: L.fs.disconnect }}>
        <div>DIS</div>
        <div>CON</div>
        <div>NECT</div>
      </div>
      {strips.map((i) => (
        <div
          key={i}
          className="abs s4-strip"
          data-k={`s4-strip-${i}`}
          style={{ left: `${(i * 100) / STRIPS}cqw`, width: `calc(${100 / STRIPS}cqw + 0.5px)` }}
        >
          <div className="s4-frame" data-k={`s4-img-${i}`} style={{ left: `${(-i * 100) / STRIPS}cqw` }}>
            <img src={img.src} alt="" style={{ objectPosition: img.pos }} />
          </div>
          <div className="fill s4-dim" data-k={`s4-dim-${i}`} />
          <div
            className="s4-frame s4-ghost"
            data-k={`s4-ghost-${i}`}
            style={{ left: `${(-i * 100) / STRIPS}cqw` }}
          >
            <img src={img.ink} alt="" style={{ objectPosition: img.pos }} />
          </div>
        </div>
      ))}
      <div className="abs s4-scan" data-k="s4-scan">
        <span className="mono" data-k="s4-scan-t">
          SCAN
        </span>
      </div>
      <div className="abs mono s4-label" data-k="s4-label">
        <div>NP-73 · KNIT POLO</div>
        <div>/ DISCONNECT</div>
      </div>
    </section>
  );
}

export function Detail({ assets }: Props) {
  const p = products.p01;
  const a = assets.p01!;
  return (
    <section className="scene s5" data-k="s5">
      <div className="abs display s5-num" data-k="s5-num">
        01
      </div>
      <figure className="abs s5-prod" data-k="s5-prod" style={{ aspectRatio: `${a.w} / ${a.h}` }}>
        <img className="s5-photo" data-k="s5-photo" src={a.src} alt="" />
        <div className="s5-band" data-k="s5-band">
          <img src={a.ink} alt="" />
        </div>
      </figure>
      <div className="abs mono s5-info" data-k="s5-info">
        <div>{p.code}</div>
        <div>{p.type}</div>
        <div>/ {p.name}</div>
        <div>&nbsp;</div>
        <div>{p.price}</div>
        <div>&nbsp;</div>
        <div className="s5-sizes">
          {p.sizes.map((s) => (
            <span key={s} className="hit" data-k={`s5-size-${s}`}>
              {s}
            </span>
          ))}
        </div>
        <div>&nbsp;</div>
        <div className="hit" data-k="s5-add">
          [ ADD ]
        </div>
      </div>
    </section>
  );
}

export function Ending({ assets, L }: Props) {
  return (
    <section className="scene s6" data-k="s6">
      <Wordmark
        assets={assets}
        k="s6-brand"
        className={assets.logo ? 'abs s6-logo' : 'abs display s6-brand'}
        style={assets.logo ? undefined : { fontSize: L.fs.brand }}
      >
        {credits.brand}
      </Wordmark>
      <div className="abs mono s6-concept" data-k="s6-concept">
        {credits.concept}
      </div>
      <div className="abs mono s6-by" data-k="s6-by">
        {credits.role}
      </div>
      <div className="abs s6-author-wrap" style={{ fontSize: L.fs.author }}>
        <div className="display s6-author s6-author-r" data-k="s6-author-r">
          {credits.author}
        </div>
        <div className="display s6-author" data-k="s6-author">
          {credits.author}
        </div>
      </div>
      <div className="abs mono s6-disc" data-k="s6-disc">
        <div>{credits.disclaimer}</div>
        <div className="site-only s6-rights">{credits.rights}</div>
      </div>
    </section>
  );
}

export function Chrome({ assets }: { assets: Assets }) {
  return (
    <div className="chrome" data-k="chrome">
      <div className="nav" data-k="nav">
        <Wordmark assets={assets} className={assets.logo ? 'nav-logo' : 'nav-brand'}>
          NOTHING PERSONAL
        </Wordmark>
        <div className="mono nav-links">
          <span>SHOP</span>
          <span>ARCHIVE</span>
          <span className="nav-bag">
            {'BAG ('}
            <span className="bag-n">
              <span data-k="bag-0">0</span>
              <span data-k="bag-1">1</span>
            </span>
            {')'}
            <span className="bag-dot" data-k="bag-dot" />
          </span>
        </div>
      </div>
      <div className="mono tc" data-k="tc">
        TC 00:00:00
      </div>
      <div className="mono tc tc-right" data-k="tc-r">
        UNOFFICIAL CONCEPT
      </div>
      <div className="mono site-only scroll-hint" data-k="hint">
        SCROLL
      </div>
      <div className="cursor" data-k="cursor">
        <div className="ch-h" />
        <div className="ch-v" />
        <div className="ch-ring" data-k="cursor-ring" />
        <div className="mono ch-xy" data-k="cursor-xy">
          X 000 Y 000
        </div>
      </div>
    </div>
  );
}
