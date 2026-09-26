import type { CSSProperties } from 'react';
import { LOGO } from '../brand/assets';
import { C } from './palette';

/**
 * A woven label in the brand's bright blue. The wordmark is typeset
 * (BE—INDIE) unless the official logo file is supplied as `logo.*`.
 * `stitch` 0..1 sews the border on, left to right.
 */
export function WovenLabel({
  w = 240,
  h = 88,
  stitch = 1,
  style,
  line2,
}: {
  w?: number;
  h?: number;
  stitch?: number;
  style?: CSSProperties;
  line2?: string;
}) {
  const inset = 7;
  return (
    <div style={{ position: 'absolute', width: w, height: h, background: C.electric, color: C.paper, ...style }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${(1 - stitch) * 100}% 0 0)` }} aria-hidden>
        <rect x={inset} y={inset} width={w - 2 * inset} height={h - 2 * inset} fill="none" stroke={C.paper} strokeOpacity={0.85} strokeWidth={2} strokeDasharray="7 5" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
        {LOGO ? (
          <img src={LOGO} alt="BE-INDIE" style={{ height: h * 0.38, filter: 'brightness(0) invert(1)' }} />
        ) : (
          <span className="d" style={{ fontSize: h * 0.46, lineHeight: 0.9, letterSpacing: '0.01em' }}>
            BE—INDIE
          </span>
        )}
        {line2 && (
          <span className="m" style={{ fontSize: Math.max(9, h * 0.12), letterSpacing: '0.2em', opacity: 0.9 }}>
            {line2}
          </span>
        )}
      </div>
    </div>
  );
}

/** The editorial wordmark: typeset stand-in unless the official file exists. */
export function Wordmark({ size, color = 'currentColor', style }: { size: number; color?: string; style?: CSSProperties }) {
  if (LOGO) return <img src={LOGO} alt="BE-INDIE" style={{ height: size * 0.72, display: 'block', ...style }} />;
  return (
    <span className="d" style={{ fontSize: size, color, display: 'block', ...style }}>
      BE—INDIE
    </span>
  );
}
