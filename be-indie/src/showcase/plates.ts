import { useEffect, useState } from 'react';
import { slotRequest, type SlotId } from '../brand/assets';
import { requestPlate } from '../lib/denim/client';
import type { PlateSet, Treatment } from '../lib/denim/types';
import type { TreatOpts } from '../lib/denim/worker';
import { grainTexture, paperTexture } from '../lib/paper';
import { fontsReady } from '../styles/fonts';

export interface PlateSpec {
  slot: SlotId;
  W: number;
  H: number;
  treatments: Treatment[];
  opts?: TreatOpts;
}

export type Plates<K extends string> = Record<K, PlateSet> & { paper: string; grain: string };

export function loadPlates<K extends string>(specs: Record<K, PlateSpec>): Promise<Plates<K>> {
  const entries = Object.entries(specs) as [K, PlateSpec][];
  return Promise.all([
    fontsReady(),
    paperTexture(),
    grainTexture(),
    ...entries.map(([, s]) => {
      const { key, req } = slotRequest(s.slot, s.W, s.H);
      return requestPlate(key, req, s.treatments, s.opts);
    }),
  ]).then(([, paper, grain, ...sets]) => {
    const out = { paper, grain } as Plates<K>;
    entries.forEach(([k], i) => ((out as Record<string, unknown>)[k] = sets[i]));
    // decode every bitmap before the clock starts, so no frame waits on one
    const urls = (sets as PlateSet[]).flatMap((s) => Object.values(s)) as string[];
    return Promise.all(
      urls.map((u) => {
        const im = new Image();
        im.src = u;
        return im.decode().catch(() => undefined);
      }),
    ).then(() => out);
  });
}

export function usePlates<K extends string>(specs: Record<K, PlateSpec>) {
  const [plates, setPlates] = useState<Plates<K> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadPlates(specs).then(setPlates, (e) => setError(String(e)));
    // specs are module constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { plates, error };
}
