import { useEffect, useRef, useState } from 'react';

import { gsap, isTouch } from '../lib/gsap';

/**
 * Small blue collector dot + targeting ring. Any element with
 * `data-cursor="INSPECT"` (or ENTER, COLLECT, DRAG, SCAN…) expands the ring.
 */
export function Cursor() {
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (isTouch()) return;
    document.documentElement.classList.add('has-cursor');
    const dx = gsap.quickSetter(dot.current, 'x', 'px');
    const dy = gsap.quickSetter(dot.current, 'y', 'px');
    const rx = gsap.quickTo(ring.current, 'x', { duration: 0.18, ease: 'power3.out' });
    const ry = gsap.quickTo(ring.current, 'y', { duration: 0.18, ease: 'power3.out' });
    let current = '';
    let seen = false;
    const move = (e: PointerEvent) => {
      if (!seen) {
        seen = true;
        root.current?.classList.add('is-live');
        gsap.set(ring.current, { x: e.clientX, y: e.clientY });
      }
      dx(e.clientX);
      dy(e.clientY);
      rx(e.clientX);
      ry(e.clientY);
      const t = (e.target as Element | null)?.closest?.('[data-cursor]');
      const next = t?.getAttribute('data-cursor') ?? '';
      if (next !== current) {
        current = next;
        setLabel(next);
        root.current?.classList.toggle('is-active', !!next);
      }
    };
    const down = () => root.current?.classList.add('is-down');
    const up = () => root.current?.classList.remove('is-down');
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  return (
    <div className="cursor" ref={root} aria-hidden>
      <div className="cursor__ring" ref={ring}>
        <span className="cursor__label">{label}</span>
      </div>
      <div className="cursor__dot" ref={dot} />
    </div>
  );
}
