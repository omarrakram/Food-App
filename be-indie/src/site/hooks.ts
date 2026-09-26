import { useEffect, useRef, useState, type RefObject } from 'react';
import { slotRequest, type SlotId } from '../brand/assets';
import { requestPlate } from '../lib/denim/client';
import type { DenimJob, PlateSet, Treatment } from '../lib/denim/types';
import type { TreatOpts } from '../lib/denim/worker';

/** A plate for a photo slot (or its wash study), with print treatments. */
export function useSlotPlate(slot: SlotId, W: number, H: number, treatments: Treatment[] = ['base'], opts?: TreatOpts) {
  const [plate, setPlate] = useState<PlateSet | null>(null);
  const key = `${slot}|${W}|${H}|${treatments.join(',')}`;
  useEffect(() => {
    let live = true;
    const { key: k, req } = slotRequest(slot, W, H);
    requestPlate(k, req, treatments, opts).then((p) => live && setPlate(p));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return plate;
}

/** A plate straight from a denim job (used where no photo slot applies). */
export function useJobPlate(job: DenimJob | null, treatments: Treatment[] = ['base'], opts?: TreatOpts) {
  const [plate, setPlate] = useState<PlateSet | null>(null);
  const key = job ? `${job.key}|${treatments.join(',')}` : '';
  useEffect(() => {
    if (!job) return;
    let live = true;
    setPlate(null);
    requestPlate(`study:${job.key}`, { type: 'denim', job }, treatments, opts).then((p) => live && setPlate(p));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return plate;
}

/** True once the element has been on screen. */
export function useSeen<T extends Element>(ref: RefObject<T | null>, threshold = 0.35) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen, threshold]);
  return seen;
}

/** Seconds since `start` became true; stops ticking after `duration`. */
export function useClock(start: boolean, duration: number) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setT(duration);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const x = (now - t0) / 1000;
      setT(Math.min(duration, x));
      if (x < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, duration]);
  return t;
}

/** Scroll progress of an element through the viewport: 0 at its top meeting the viewport top, 1 at its bottom meeting the viewport bottom. */
export function useScrollProgress<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      setP(span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
  return p;
}

/** Element's visible-relative progress: -1 below the fold → 0 centred → 1 above. */
export function useViewportOffset<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const read = () => {
      raf.current = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const c = r.top + r.height / 2 - window.innerHeight / 2;
      setP(Math.max(-1, Math.min(1, -c / window.innerHeight)));
    };
    const on = () => {
      if (!raf.current) raf.current = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [ref]);
  return p;
}
