import { useEffect, useState } from 'react';
import { requestPlate } from './lib/denim/client';
import { study, type Framing } from './lib/denim/compositions';
import type { WashId } from './brand/data';
import type { PlateSet, Treatment } from './lib/denim/types';

const params = new URLSearchParams(location.search);
const W = Number(params.get('w') ?? 540);
const H = Number(params.get('h') ?? 960);
const items: [WashId, Framing][] = (params.get('items') ?? 'sponge:waistband,black:seam,midnight:hem,cloud:fray,faded:pocket,sponge:macro')
  .split(',')
  .map((s) => s.split(':') as [WashId, Framing]);
const tr = (params.get('t') ?? 'base').split(',') as Treatment[];

export function Lab() {
  const [plates, setPlates] = useState<(PlateSet | null)[]>(items.map(() => null));
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    Promise.all(
      items.map(([w, f], k) =>
        requestPlate(`lab-${k}`, { type: 'denim', job: study(w, f, W, H, 11 + k, params.get('pitch') ? { pitch: Number(params.get('pitch')) } : {}) }, tr).then((p) => {
          setPlates((prev) => prev.map((x, i) => (i === k ? p : x)));
          return p;
        }),
      ),
    ).then(() => {
      setMs(Math.round(performance.now() - t0));
      document.body.dataset.ready = '1';
    });
  }, []);
  return (
    <div style={{ background: '#ece7db', display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8 }}>
      <div style={{ width: '100%', font: '12px monospace' }}>ms {ms}</div>
      {plates.map((p, k) =>
        tr.map((t) => (
          <div key={k + t} style={{ width: W, height: H, background: '#ccc' }}>
            {p?.[t] && <img src={p[t]} width={W} height={H} style={{ display: 'block' }} />}
          </div>
        )),
      )}
    </div>
  );
}
