import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadAssets, type Assets } from './lib/assets';
import { computeLayout, type Layout } from './lib/layout';
import { buildTimeline, DURATION } from './lib/timeline';
import { runSite, TRACK_VH } from './lib/site';
import { grainTexture, inkTexture } from './lib/grain';
import { Hook, Manifesto, Catalogue, Separation, Detail, Ending, Chrome } from './Scenes';

const params = new URLSearchParams(location.search);
const SHOWCASE =
  location.pathname.replace(/\/+$/, '').endsWith('/showcase') || params.has('showcase');
const AUTOPLAY = params.has('autoplay');
const SEEK = params.has('t') ? Number(params.get('t')) : null;
const SAFE = params.has('safe');
const PREP_MS = 500;

async function fontsReady() {
  await Promise.all([
    document.fonts.load('860 100px "Archivo Variable"', 'PERSONAL.0123456789'),
    document.fonts.load('italic 380 100px "Newsreader Variable"', '(nothing)'),
    document.fonts.load('400 100px "IBM Plex Mono"', 'NP-01'),
  ]);
  await document.fonts.ready;
}

function stageSize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!SHOWCASE) return { W: vw, H: vh };
  const W = Math.floor(Math.min(vw, (vh * 9) / 16));
  return { W, H: Math.round((W * 16) / 9) };
}

type Phase = 'idle' | 'prep' | 'playing' | 'paused' | 'done';

declare global {
  interface Window {
    __np?: {
      ready: boolean;
      duration: number;
      seek: (t: number) => void;
      play: () => void;
      pause: () => void;
      time: () => number;
    };
  }
}

export function App() {
  const [assets, setAssets] = useState<Assets | null>(null);
  const [L, setL] = useState<Layout | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [time, setTime] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const prepRef = useRef<number | null>(null);

  // load fonts + images, then measure
  useEffect(() => {
    if (!SHOWCASE && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (!SHOWCASE) window.scrollTo(0, 0);
    let alive = true;
    Promise.all([fontsReady(), loadAssets()]).then(([, a]) => {
      if (!alive) return;
      const { W, H } = stageSize();
      setAssets(a);
      setL(computeLayout(W, H));
    });
    let id = 0;
    const onResize = () => {
      clearTimeout(id);
      id = window.setTimeout(() => {
        const { W, H } = stageSize();
        setL((prev) => (!prev || (prev.W === W && prev.H === H) ? prev : computeLayout(W, H)));
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // build the master timeline once the stage exists (and on resize)
  useLayoutEffect(() => {
    if (!assets || !L || !stageRef.current) return;
    const prev = tlRef.current;
    const at = prev ? prev.time() : (SEEK ?? 0);
    const wasPlaying = prev ? prev.isActive() : false;
    prev?.kill();
    const { tl, pointer } = buildTimeline({ root: stageRef.current, L, cursorLive: !SHOWCASE });
    tlRef.current = tl;
    window.__np = {
      ready: true,
      duration: DURATION,
      seek: (t) => void tl.pause(t, false),
      play: () => void tl.play(),
      pause: () => void tl.pause(),
      time: () => tl.time(),
    };

    if (!SHOWCASE) {
      tl.time(at, false);
      return runSite(stageRef.current, trackRef.current!, tl, pointer, L);
    }

    tl.eventCallback('onComplete', () => setPhase('done'));
    tl.time(at, false);
    if (wasPlaying) tl.play();
    if (SEEK !== null && !prev) setPhase('paused');
    else if (AUTOPLAY && !prev) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, L]);

  const start = () => {
    const tl = tlRef.current;
    if (!tl) return;
    if (prepRef.current) clearTimeout(prepRef.current);
    tl.pause(0);
    setPhase('prep');
    prepRef.current = window.setTimeout(() => {
      setPhase('playing');
      tl.play(0);
    }, PREP_MS);
  };

  // showcase keys: R replay · SPACE play/pause · ESC reset · ←/→ step
  useEffect(() => {
    if (!SHOWCASE) return;
    const onKey = (e: KeyboardEvent) => {
      const tl = tlRef.current;
      if (!tl) return;
      if (e.key === 'r' || e.key === 'R') start();
      else if (e.key === ' ') {
        e.preventDefault();
        if (phase === 'idle' || phase === 'done') start();
        else if (tl.paused()) {
          tl.play();
          setPhase('playing');
        } else {
          tl.pause();
          setPhase('paused');
        }
      } else if (e.key === 'Escape') {
        if (prepRef.current) clearTimeout(prepRef.current);
        tl.pause(0);
        setPhase('idle');
      } else if (e.key === 'Enter' && phase === 'idle') start();
      else if (e.key === 'ArrowRight' && tl.paused())
        tl.time(Math.min(DURATION, tl.time() + (e.shiftKey ? 1 : 1 / 30)));
      else if (e.key === 'ArrowLeft' && tl.paused())
        tl.time(Math.max(0, tl.time() - (e.shiftKey ? 1 : 1 / 30)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // HUD clock only while paused (no React work during playback)
  useEffect(() => {
    if (phase !== 'paused' && phase !== 'done') return;
    const id = setInterval(() => setTime(tlRef.current?.time() ?? 0), 100);
    return () => clearInterval(id);
  }, [phase]);

  if (!assets || !L) return <div className={SHOWCASE ? 'shell-showcase' : 'site-blank'} />;

  const stage = (
    <div
      className="stage"
      ref={stageRef}
      style={{ width: L.W, height: L.H, ['--ink-tex' as string]: `url(${inkTexture()})` }}
      data-landscape={L.portrait ? undefined : ''}
    >
      <Hook assets={assets} L={L} />
      <Manifesto assets={assets} L={L} />
      <Catalogue assets={assets} L={L} />
      <Separation assets={assets} L={L} />
      <Detail assets={assets} L={L} />
      <Ending assets={assets} L={L} />
      <Chrome assets={assets} />
      <div className="grain" style={{ backgroundImage: `url(${grainTexture()})` }} />
      {SAFE && (
        <div className="safe">
          <div style={{ left: 0, right: 0, top: 0, height: '8.5%' }} />
          <div style={{ left: 0, right: 0, bottom: 0, height: '21%' }} />
          <div style={{ right: 0, top: '38%', bottom: '21%', width: '13%' }} />
        </div>
      )}
      {SHOWCASE && phase === 'idle' && SEEK === null && !AUTOPLAY && (
        <button className="start" onClick={start}>
          <span>START — ENTER</span>
        </button>
      )}
    </div>
  );

  if (!SHOWCASE) {
    return (
      <div className="site" ref={trackRef} style={{ height: `${TRACK_VH}vh` }}>
        {stage}
      </div>
    );
  }

  const hudVisible = phase === 'paused' || phase === 'done' || phase === 'idle';
  return (
    <div className="shell-showcase">
      {stage}
      {hudVisible && SEEK === null && !AUTOPLAY && (
        <div className="hud">
          {`${time.toFixed(2)} / ${DURATION.toFixed(2)}\nR  replay\nSPACE  play / pause\nESC  reset\n← →  step`}
        </div>
      )}
    </div>
  );
}
