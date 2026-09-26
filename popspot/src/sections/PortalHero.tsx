import { useEffect, useRef, useState } from 'react';

import { Barcode } from '../components/Barcode';
import { BrandMark } from '../components/BrandMark';
import { ProductObject } from '../components/ProductObject';
import { facts } from '../data/brand';
import { numberLabel, p, priceLabel, products } from '../data/products';
import { gsap, isTouch, reducedMotion } from '../lib/gsap';
import { useStore } from '../lib/store';

/**
 * The depth field: every other real product, placed in 3D around the hero
 * object (x/y in % of the viewport from centre, z in px). Far objects dim.
 */
const FIELD: { n: string; x: number; y: number; z: number; r: number; mobile?: boolean }[] = [
  { n: '03', x: 35, y: -31, z: -700, r: 5, mobile: true },
  { n: '02', x: -8, y: -40, z: -1150, r: -4 },
  { n: '04', x: 45, y: 6, z: -820, r: 6, mobile: true },
  { n: '05', x: -30, y: -41, z: -1350, r: -3 },
  { n: '06', x: 13, y: -41, z: -950, r: 7 },
  { n: '07', x: -3, y: 31, z: -620, r: -5 },
  { n: '12', x: 25, y: -45, z: -1450, r: 4 },
  { n: '13', x: -25, y: 33, z: -520, r: 6, mobile: true },
  { n: '14', x: 48, y: -25, z: -1050, r: 3 },
  { n: '15', x: -42, y: 29, z: -720, r: -4 },
  { n: '11', x: 3, y: -12, z: -1550, r: -2 },
  { n: '01', x: -40, y: -13, z: -1250, r: 6, mobile: true },
  { n: '09', x: 31, y: 39, z: -950, r: -3 },
  { n: '16', x: 48, y: -4, z: 60, r: -8, mobile: true },
  { n: '10', x: 44, y: 31, z: 110, r: 6, mobile: true },
];

/** The back wall: a far, dim shelf grid of the same real products, for depth. */
const BACK: { n: string; x: number; y: number }[] = [
  ['01', -52, -36], ['13', -34, -40], ['06', -16, -38], ['16', 2, -42], ['03', 20, -38], ['10', 38, -40], ['15', 56, -36],
  ['12', -58, 4], ['04', -40, 0], ['14', 44, 2], ['02', 62, 0],
  ['05', -50, 42], ['07', -30, 46], ['11', 30, 46], ['09', 52, 42],
].map(([n, x, y]) => ({ n: n as string, x: x as number, y: y as number }));

const HERO = p('08');
const depthAlpha = (z: number) => (z > 0 ? 1 : Math.max(0.3, 1 + z / 1700));

export function PortalHero({ ready }: { ready: boolean }) {
  const { openDetail, setSearchOpen } = useStore();
  const root = useRef<HTMLElement>(null);
  const cam = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  // The scroll timeline records its start values when created, so it waits for the intro to land.
  const [introDone, setIntroDone] = useState(false);

  // Intro: object detected → scan → lock → slam → the collection shoots back into depth.
  useEffect(() => {
    const el = root.current;
    if (!ready || !el || started.current) return;
    started.current = true;
    const q = gsap.utils.selector(el);
    const items = q('.hero__item');
    const mobile = window.innerWidth < 760;
    const place = (i: number) => {
      const f = FIELD[i]!;
      return {
        xPercent: -50,
        yPercent: -50,
        x: (f.x * window.innerWidth * (mobile ? 1.15 : 1)) / 100,
        y: (f.y * window.innerHeight) / 100,
        z: f.z,
        rotate: f.r,
        autoAlpha: depthAlpha(f.z),
      };
    };
    items.forEach((it, i) => gsap.set(it, place(i)));

    if (reducedMotion()) {
      gsap.set(q('.hero__reticle, .hero__detect'), { autoAlpha: 0 });
      setIntroDone(true);
      return;
    }

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => setIntroDone(true) });
    tl.set(q('.hero__title-line > span, .hero__stamp, .hero__meta, .hero__bottom > *'), { autoAlpha: 0 })
      .set(items, { autoAlpha: 0 })
      .set(q('.hero__hero'), { scale: 0.18, transformOrigin: '50% 45%' })
      .fromTo(q('.hero__reticle'), { scale: 1.8, autoAlpha: 0, rotate: -90 }, { scale: 1, autoAlpha: 1, rotate: 0, duration: 0.45 })
      .fromTo(q('.hero__detect'), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.2 }, 0.1)
      .fromTo(q('.hero__beam'), { yPercent: -60, autoAlpha: 1 }, { yPercent: 60, duration: 0.38, ease: 'none' }, 0.25)
      .to(q('.hero__beam'), { autoAlpha: 0, duration: 0.08 })
      .to(q('.hero__reticle'), { scale: 0.7, duration: 0.14, ease: 'power4.in' }, 0.62)
      .to(q('.hero__reticle, .hero__detect'), { autoAlpha: 0, duration: 0.12 }, 0.8)
      .to(q('.hero__hero'), { scale: 1, duration: 0.7, ease: 'expo.out' }, 0.76)
      .fromTo(q('.hero__flash'), { autoAlpha: 0.9 }, { autoAlpha: 0, duration: 0.45, ease: 'power2.out' }, 0.8)
      .fromTo(
        items,
        { x: 0, y: 0, z: 700, autoAlpha: 0, rotate: 0 },
        {
          x: (i: number) => place(i).x,
          y: (i: number) => place(i).y,
          z: (i: number) => FIELD[i]!.z,
          rotate: (i: number) => FIELD[i]!.r,
          autoAlpha: (i: number) => depthAlpha(FIELD[i]!.z),
          duration: 1.05,
          ease: 'expo.out',
          stagger: { each: 0.025, from: 'random' },
        },
        0.84,
      )
      .fromTo(q('.hero__back'), { autoAlpha: 0 }, { autoAlpha: 0.22, duration: 0.8, stagger: { each: 0.02, from: 'center' } }, 0.9)
      .fromTo(q('.hero__title-line > span'), { yPercent: 105, autoAlpha: 1 }, { yPercent: 0, duration: 0.6, stagger: 0.07, ease: 'power4.out' }, 0.92)
      .fromTo(q('.hero__stamp'), { scale: 2.6, rotate: -24, autoAlpha: 0 }, { scale: 1, rotate: -7, autoAlpha: 1, duration: 0.42, ease: 'back.out(2.6)' }, 1.25)
      .fromTo(q('.hero__pin'), { x: -8 }, { x: 0, duration: 0.3, ease: 'elastic.out(1.2, 0.3)' }, 1.36)
      .to(q('.hero__meta, .hero__bottom > *'), { autoAlpha: 1, duration: 0.3, stagger: 0.05 }, 1.3);
    return () => {
      tl.kill();
    };
  }, [ready]);

  // Pointer parallax: the whole depth field turns a few degrees; perspective does the rest.
  useEffect(() => {
    if (isTouch() || reducedMotion()) return;
    const c = cam.current;
    if (!c) return;
    const ry = gsap.quickTo(c, 'rotationY', { duration: 0.9, ease: 'power3.out' });
    const rx = gsap.quickTo(c, 'rotationX', { duration: 0.9, ease: 'power3.out' });
    const move = (e: PointerEvent) => {
      ry((e.clientX / window.innerWidth - 0.5) * 7);
      rx(-(e.clientY / window.innerHeight - 0.5) * 5);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);

  // Scroll: fall through the shelf. Objects fly past the camera, the spot opens into the portal.
  useEffect(() => {
    const el = root.current;
    if (!introDone || !el || reducedMotion()) return;
    const q = gsap.utils.selector(el);
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: 'top top', end: '+=120%', scrub: 0.6, pin: q('.hero__pin')[0], anticipatePin: 1 },
      });
      q('.hero__item').forEach((it, i) => {
        const z = FIELD[i]!.z;
        tl.to(it, { z: z + 1500, autoAlpha: 0, ease: 'power2.in', duration: 1 }, ((z + 1600) / 1800) * 0.25);
      });
      tl.to(q('.hero__back'), { autoAlpha: 0, duration: 0.5 }, 0.3);
      tl.to(q('.hero__title'), { scale: 1.6, xPercent: -8, autoAlpha: 0, ease: 'power2.in', duration: 0.7 }, 0)
        .to(q('.hero__hero'), { scale: 2.6, yPercent: 25, autoAlpha: 0, ease: 'power2.in', duration: 0.8 }, 0.15)
        .to(q('.hero__stamp, .hero__meta, .hero__bottom'), { autoAlpha: 0, duration: 0.3 }, 0)
        .fromTo(q('.hero__portal'), { scale: 0 }, { scale: 1, ease: 'power3.in', duration: 0.6 }, 0.55);
    }, el);
    return () => ctx.revert();
  }, [introDone]);

  return (
    <section className="hero" id="top" ref={root} aria-label="Pop Spot Collectorverse">
      <div className="hero__pin">
        <div className="hero__rings" aria-hidden />
        <div className="hero__field">
          <div className="hero__cam" ref={cam}>
            {BACK.map((b, i) => (
              <span
                key={`back-${i}`}
                className="hero__back"
                aria-hidden
                style={{ transform: `translate(-50%, -50%) translate3d(${b.x * 3.4}vw, ${b.y * 3.2}vh, -2600px)` }}
              >
                <img src={p(b.n).image} alt="" />
              </span>
            ))}
            {FIELD.map((f) => {
              const prod = p(f.n);
              return (
                <button
                  key={f.n}
                  className={`hero__item ${f.mobile ? 'is-mobile' : ''}`}
                  onClick={(e) => openDetail(prod.id, e.currentTarget.querySelector('img'))}
                  data-cursor="INSPECT"
                  aria-label={`Inspect ${prod.name}`}
                  tabIndex={-1}
                >
                  <ProductObject product={prod} height="30vh" eager />
                </button>
              );
            })}
          </div>
        </div>

        <h1 className="hero__title display">
          <span className="hero__title-line">
            <span>What are</span>
          </span>
          <span className="hero__title-line">
            <span>you</span>
          </span>
          <span className="hero__title-line">
            <span>hunting?</span>
          </span>
          <span className="sr-only"> — Pop Spot Collectorverse, an unofficial digital concept</span>
        </h1>

        <div className="hero__hero">
          <span className="hero__spot" aria-hidden />
          <button className="hero__hero-btn" onClick={(e) => openDetail(HERO.id, e.currentTarget.querySelector('img'))} data-cursor="INSPECT" aria-label={`Inspect ${HERO.name}`}>
            <ProductObject product={HERO} height="100%" eager />
          </button>
          <span className="hero__reticle" aria-hidden>
            <span className="hero__beam" />
          </span>
          <span className="hero__detect mono" aria-hidden>
            Object detected
          </span>
          <div className="hero__stamp" aria-hidden>
            <BrandMark tone="blue" />
          </div>
        </div>
        <span className="hero__flash" aria-hidden />

        <div className="hero__meta">
          <p className="mono">
            <span className="tag tag--blue">Collector ID / 001</span>
          </p>
          <p className="hero__spotted">
            <span className="mono">Spotted</span>
            <b className="cond">
              {HERO.name} {numberLabel(HERO)}
            </b>
            <span className="mono">
              {HERO.franchise} · {HERO.format}
            </span>
          </p>
          <span className="price-gun">{priceLabel(HERO)}</span>
          <div className="hero__ctas">
            <button className="btn" onClick={(e) => openDetail(HERO.id, e.currentTarget)} data-cursor="INSPECT">
              Inspect {numberLabel(HERO)}
            </button>
            <button className="btn btn--white" onClick={() => setSearchOpen(true)} data-cursor="HUNT">
              Start the hunt
            </button>
          </div>
        </div>

        <div className="hero__bottom">
          <span className="hero__code">
            <Barcode value="POPSPOT-001" height={22} />
          </span>
          <p className="mono hero__facts">
            <span>{facts.reseller}</span>
            <span>{facts.lines}</span>
            <span>{facts.delivery}</span>
            <span>{products.length} real objects in this concept</span>
          </p>
          <a className="mono hero__scroll" href="#universes" data-cursor="ENTER">
            Scroll to enter ↓
          </a>
        </div>
        <span className="hero__portal" aria-hidden />
      </div>
    </section>
  );
}
