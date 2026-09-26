import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { C } from '../ui/palette';
import { usePlates } from './plates';
import { DURATION, SCENES, SPECS } from './scenes';
import './showcase.css';

const q = new URLSearchParams(location.search);
/** ?t=4.5 renders one frame and holds it. */
const FREEZE = q.has('t') ? Number(q.get('t')) : null;
/** ?capture exposes window.__seek(t) for the frame renderer and never plays. */
const CAPTURE = q.has('capture');
/** Seconds of held first frame before playback (time to hit record). */
const DELAY = Number(q.get('delay') ?? 2.5);
const LOOP = q.has('loop');

declare global {
  interface Window {
    __seek?: (t: number) => void;
    __duration?: number;
  }
}

export function Showcase() {
  const { plates, error } = usePlates(SPECS);
  const [t, setT] = useState(FREEZE ?? 0);
  const [scale, setScale] = useState(1);
  const paused = useRef(false);
  const origin = useRef(0);

  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / 1080, window.innerHeight / 1920));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!plates) return;
    window.__duration = DURATION;
    window.__seek = (x: number) => flushSync(() => setT(x));
    document.body.dataset.ready = '1';
    if (FREEZE !== null || CAPTURE) return;
    let raf = 0;
    let pauseAt = 0;
    origin.current = performance.now() + DELAY * 1000;
    const tick = (now: number) => {
      if (!paused.current) {
        let x = (now - origin.current) / 1000;
        if (x > DURATION + 1.5 && LOOP) {
          origin.current = now + 800;
          x = 0;
        }
        setT(Math.max(0, Math.min(DURATION, x)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'r') {
        origin.current = performance.now() + 600;
        paused.current = false;
      }
      if (e.key === ' ') {
        e.preventDefault();
        if (paused.current) origin.current += performance.now() - pauseAt;
        else pauseAt = performance.now();
        paused.current = !paused.current;
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
    };
  }, [plates]);

  const frame = Math.floor(t * 24);
  return (
    <div className="sc-viewport">
      <div className="sc-stage" style={{ transform: `scale(${scale})`, left: (window.innerWidth - 1080 * scale) / 2 }}>
        {plates ? (
          <>
            {SCENES.filter((s) => t >= s.from && t < s.to).map((s) => (
              <s.C key={s.from} t={t} P={plates} />
            ))}
            <div
              className="full"
              style={{
                backgroundImage: `url(${plates.grain})`,
                backgroundPosition: `${(frame * 73) % 256}px ${(frame * 131) % 256}px`,
                mixBlendMode: 'overlay',
                opacity: 0.16,
                pointerEvents: 'none',
              }}
            />
          </>
        ) : (
          <div className="full" style={{ background: C.ink, display: 'grid', placeItems: 'center', color: C.paper }}>
            <div className="m" style={{ fontSize: 22, opacity: 0.7 }}>{error ? `ERROR — ${error}` : 'PREPARING PLATES'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
