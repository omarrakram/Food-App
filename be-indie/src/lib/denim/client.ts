import type { PlateRequest, PlateResponse, TreatOpts } from './worker';
import type { DenimJob, PlateSet, Treatment } from './types';

type Pending = { resolve: (p: PlateSet) => void; reject: (e: Error) => void };

const POOL = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
const workers: Worker[] = [];
const load: number[] = [];
const pending = new Map<number, Pending>();
const cache = new Map<string, Promise<PlateSet>>();
let nextId = 1;

function worker(): [Worker, number] {
  if (workers.length < POOL) {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const idx = workers.length;
    w.onmessage = (e: MessageEvent<PlateResponse>) => {
      load[idx]--;
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (!e.data.ok) return p.reject(new Error(e.data.error));
      const set = {} as PlateSet;
      for (const [k, b] of Object.entries(e.data.blobs)) set[k as Treatment] = URL.createObjectURL(b as Blob);
      p.resolve(set);
    };
    workers.push(w);
    load.push(0);
  }
  let best = 0;
  for (let k = 1; k < workers.length; k++) if (load[k] < load[best]) best = k;
  return [workers[best], best];
}

type Req = { type: 'denim'; job: DenimJob } | { type: 'photo'; url: string; width: number; height: number; focus: [number, number] };

export function requestPlate(key: string, req: Req, treatments: Treatment[] = ['base'], opts?: TreatOpts): Promise<PlateSet> {
  const k = `${key}|${treatments.join(',')}|${opts ? JSON.stringify(opts) : ''}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const p = new Promise<PlateSet>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const [w, idx] = worker();
    load[idx]++;
    w.postMessage({ ...req, id, treatments, opts } as PlateRequest);
  });
  cache.set(k, p);
  return p;
}
