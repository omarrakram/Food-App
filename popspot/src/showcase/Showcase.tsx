import './showcase.css';
import '../styles/site.css';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { products } from '../data/products';
import { preloadImages } from '../lib/preload';
import { H, Scenes, W } from './scenes';
import { buildTimeline, DURATION } from './timeline';

declare global {
  interface Window {
    __showcase?: { duration: number; seek: (t: number) => void; play: () => void; ready: boolean };
  }
}

/**
 * /showcase — a deterministic, zero-input collector-film for screen recording.
 *
 *   /showcase              plays once after every image and font is ready
 *   /showcase?t=8.3        renders the frame at 8.3s and holds (review / stills)
 *   /showcase?loop=1       loops
 *   /showcase?autoplay=0   waits on the first frame; call window.__showcase.play()
 *   /showcase?delay=0      start immediately once ready (default 500ms hold on frame 0)
 */
export default function Showcase() {
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);

  // Fit the 1080×1920 stage to any window; at a 1080×1920 viewport the scale is exactly 1.
  useLayoutEffect(() => {
    document.documentElement.classList.add('is-showcase');
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
      document.documentElement.classList.remove('is-showcase');
    };
  }, []);

  // Nothing moves until every product photo is decoded and every font is loaded.
  useEffect(() => {
    let alive = true;
    Promise.all([
      preloadImages(products.flatMap((p) => [p.image])),
      document.fonts.load('800 100px "Bricolage Grotesque Variable"'),
      document.fonts.load('800 40px "Barlow Condensed"'),
      document.fonts.load('700 20px "JetBrains Mono Variable"'),
    ])
      .then(() => document.fonts.ready)
      .then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!ready || !el) return;
    const params = new URLSearchParams(window.location.search);
    const tl = buildTimeline(el);
    tl.seek(0);
    const at = params.get('t');
    const loop = params.get('loop') === '1';
    if (loop) tl.repeat(-1).repeatDelay(0.6);
    window.__showcase = {
      duration: DURATION,
      seek: (t: number) => {
        tl.pause();
        tl.seek(Math.max(0, Math.min(DURATION, t)), false);
      },
      play: () => tl.play(0),
      ready: true,
    };
    document.documentElement.dataset.showcaseReady = '1';
    let timer = 0;
    if (at != null) {
      tl.seek(Math.max(0, Math.min(DURATION, Number(at))), false);
    } else if (params.get('autoplay') !== '0') {
      timer = window.setTimeout(() => tl.play(0), Number(params.get('delay') ?? 500));
    }
    return () => {
      window.clearTimeout(timer);
      tl.kill();
    };
  }, [ready]);

  return (
    <div className="sx-viewport" aria-label="Pop Spot collector-film (unofficial concept)">
      <div className="sx-stage" ref={stage} style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <Scenes />
        {!ready && <p className="sx-loading sx-mono">Loading the vault…</p>}
      </div>
    </div>
  );
}
