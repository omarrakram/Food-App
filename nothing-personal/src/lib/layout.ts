// Geometry that depends on real font metrics. Measured once the fonts are
// loaded, so the giant words land exactly where the timeline expects them.

export interface Layout {
  W: number;
  H: number;
  portrait: boolean;
  cap: number;
  /** S1: PERSONAL. */
  word: { fs: number; cx: number; cy: number; cap: number; rot: number };
  /** font sizes (px) for type that is fitted to a measure */
  fs: {
    unbothered: number;
    nothing: number;
    disconnect: number;
    brand: number;
    author: number;
    digits: number;
  };
}

function measure(text: string, fs: number) {
  const el = document.createElement('span');
  el.className = 'display';
  el.style.cssText = `position:absolute;visibility:hidden;left:-9999px;top:0;font-size:${fs}px;line-height:1`;
  el.textContent = text;
  document.body.appendChild(el);
  const w = el.getBoundingClientRect().width;
  el.remove();
  return w / fs;
}

/** font-size that makes `text` exactly `width` px wide */
const fit = (text: string, width: number) => width / measure(text, 100);

// Cap height of the display face as a fraction of the em.
function capRatio() {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `860 200px "Archivo Variable"`;
  return ctx.measureText('H').actualBoundingBoxAscent / 200;
}

export function computeLayout(W: number, H: number): Layout {
  const portrait = H >= W;
  const cap = capRatio();
  let word: Layout['word'];
  if (portrait) {
    // runs up the frame, bleeding past top and bottom
    const fs = fit('PERSONAL.', H * 1.08);
    word = { fs, cx: W * 0.585, cy: H * 0.5, cap: cap * fs, rot: -90 };
  } else {
    const fs = fit('PERSONAL.', W * 1.02);
    word = { fs, cx: W * 0.5, cy: H * 0.56, cap: cap * fs, rot: 0 };
  }
  const measureW = portrait ? W * 0.885 : W * 0.6;
  return {
    W,
    H,
    portrait,
    cap,
    word,
    fs: {
      unbothered: fit('UNBOTHERED', measureW),
      nothing: fit('NOTHING,', measureW),
      disconnect: portrait ? fit('NECT', W * 0.88) : fit('DISCONNECT', W * 0.96),
      brand: fit('NOTHING PERSONAL.', W * 0.87),
      author: fit('OMAR AKRAM', W * 0.875),
      digits: portrait ? (H * 0.29) / cap : (H * 0.62) / cap,
    },
  };
}
