import { useEffect, useRef } from 'react';

import { gsap } from '../lib/gsap';
import { useStore } from '../lib/store';

export function Toast() {
  const { toast } = useStore();
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toast || !el.current) return;
    const tl = gsap
      .timeline()
      .fromTo(el.current, { autoAlpha: 0, y: 30, rotate: -6, scale: 1.4 }, { autoAlpha: 1, y: 0, rotate: -2, scale: 1, duration: 0.32, ease: 'back.out(2.4)' })
      .to(el.current, { autoAlpha: 0, y: 12, duration: 0.25, ease: 'power2.in' }, '+=1.6');
    return () => {
      tl.kill();
    };
  }, [toast]);
  return (
    <div className="toast" ref={el} role="status" aria-live="polite">
      <span className="toast__stamp" aria-hidden>
        ✓
      </span>
      <span className="mono">{toast?.text}</span>
    </div>
  );
}
