import type { CSSProperties } from 'react';
import { hash2 } from '../lib/rng';

/** Printer's crop marks at the four corners of a box. */
export function CropMarks({ inset = 0, len = 34, gap = 10, color = 'currentColor', w = 1.5, style }: {
  inset?: number; len?: number; gap?: number; color?: string; w?: number; style?: CSSProperties;
}) {
  const s = (css: CSSProperties): CSSProperties => ({ position: 'absolute', background: color, ...css });
  const corners = [
    { top: inset, left: inset, dx: -1, dy: -1 },
    { top: inset, right: inset, dx: 1, dy: -1 },
    { bottom: inset, left: inset, dx: -1, dy: 1 },
    { bottom: inset, right: inset, dx: 1, dy: 1 },
  ];
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}>
      {corners.map((c, k) => {
        const v = c.dy < 0 ? { top: (c.top ?? 0) - gap - len } : { bottom: (c.bottom ?? 0) - gap - len };
        const hz = c.dx < 0 ? { left: (c.left ?? 0) - gap - len } : { right: (c.right ?? 0) - gap - len };
        const hx = c.dx < 0 ? { left: c.left } : { right: c.right };
        const vy = c.dy < 0 ? { top: c.top } : { bottom: c.bottom };
        return (
          <div key={k}>
            <div style={s({ ...v, ...hx, width: w, height: len })} />
            <div style={s({ ...vy, ...hz, height: w, width: len })} />
          </div>
        );
      })}
    </div>
  );
}

/** Registration target. */
export function RegMark({ size = 40, color = 'currentColor', w = 1.5, style }: { size?: number; color?: string; w?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', ...style }} aria-hidden>
      <circle cx="20" cy="20" r="11" fill="none" stroke={color} strokeWidth={w * (40 / size)} />
      <circle cx="20" cy="20" r="4.5" fill={color} />
      <line x1="0" y1="20" x2="40" y2="20" stroke={color} strokeWidth={w * (40 / size)} />
      <line x1="20" y1="0" x2="20" y2="40" stroke={color} strokeWidth={w * (40 / size)} />
    </svg>
  );
}

/** Deterministic barcode from a string — decorative, encodes nothing official. */
export function Barcode({ value, width = 220, height = 54, color = 'currentColor', style }: {
  value: string; width?: number; height?: number; color?: string; style?: CSSProperties;
}) {
  let seed = 0;
  for (const ch of value) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  let k = 0;
  while (x < width) {
    const bw = 1 + Math.floor(hash2(k, 1, seed) * 3.4);
    const gap = 1 + Math.floor(hash2(k, 2, seed) * 3);
    if (x + bw > width) break;
    bars.push({ x, w: bw });
    x += bw + gap;
    k++;
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', ...style }} aria-hidden>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill={color} />
      ))}
    </svg>
  );
}

/** Ruler ticks — garment measurement lines. */
export function Ticks({ length, every = 10, major = 5, h = 14, color = 'currentColor', dir = 'down', style }: {
  length: number; every?: number; major?: number; h?: number; color?: string; dir?: 'up' | 'down'; style?: CSSProperties;
}) {
  const n = Math.floor(length / every);
  return (
    <svg width={length} height={h} style={{ display: 'block', overflow: 'visible', ...style }} aria-hidden>
      {Array.from({ length: n + 1 }, (_, i) => {
        const big = i % major === 0;
        const th = big ? h : h * 0.45;
        const y1 = dir === 'down' ? 0 : h - th;
        return <line key={i} x1={i * every + 0.5} x2={i * every + 0.5} y1={y1} y2={y1 + th} stroke={color} strokeWidth={big ? 1.5 : 1} />;
      })}
    </svg>
  );
}

/** Print colour bar: the swatches a press operator checks. */
export function ColourBar({ size = 22, colours, style }: { size?: number; colours: string[]; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', ...style }}>
      {colours.map((c) => (
        <div key={c} style={{ width: size, height: size, background: c }} />
      ))}
    </div>
  );
}
