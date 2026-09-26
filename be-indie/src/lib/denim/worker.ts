/// <reference lib="webworker" />
import { renderDenim } from './generate';
import { duotone, halftone, negative, photocopy, riso } from './treatments';
import type { DenimJob, RGB, Treatment } from './types';

export type PlateRequest =
  | { id: number; type: 'denim'; job: DenimJob; treatments: Treatment[]; opts?: TreatOpts }
  | {
      id: number;
      type: 'photo';
      url: string;
      width: number;
      height: number;
      focus: [number, number];
      treatments: Treatment[];
      opts?: TreatOpts;
    };

export interface TreatOpts {
  halftoneCell?: number;
  halftoneInk?: RGB;
  halftonePaper?: RGB;
  halftoneGamma?: number;
  risoInk?: RGB;
  duo?: [RGB, RGB];
}

export type PlateResponse =
  | { id: number; ok: true; blobs: Partial<Record<Treatment, Blob>> }
  | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

async function source(req: PlateRequest): Promise<OffscreenCanvas> {
  if (req.type === 'denim') return renderDenim(req.job);
  const res = await fetch(req.url);
  if (!res.ok) throw new Error(`asset ${req.url}: ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(req.width, req.height);
  const ctx = c.getContext('2d')!;
  // cover-crop around a focal point, never stretched
  const s = Math.max(req.width / bmp.width, req.height / bmp.height);
  const w = bmp.width * s;
  const h = bmp.height * s;
  const x = Math.min(0, Math.max(req.width - w, req.width / 2 - req.focus[0] * w));
  const y = Math.min(0, Math.max(req.height - h, req.height / 2 - req.focus[1] * h));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, x, y, w, h);
  return c;
}

scope.onmessage = async (e: MessageEvent<PlateRequest>) => {
  const req = e.data;
  try {
    const canvas = await source(req);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    const blobs: Partial<Record<Treatment, Blob>> = {};
    const q = { type: 'image/jpeg', quality: 0.9 };
    blobs.base = await canvas.convertToBlob(q);
    const need = req.treatments.filter((t) => t !== 'base');
    if (need.length) {
      const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const tmp = new OffscreenCanvas(canvas.width, canvas.height);
      const tctx = tmp.getContext('2d')!;
      for (const t of need) {
        const o = req.opts ?? {};
        const out =
          t === 'negative'
            ? negative(src)
            : t === 'riso'
              ? riso(src, o.risoInk)
              : t === 'halftone'
                ? halftone(src, o.halftoneCell ?? 9, o.halftoneInk, o.halftonePaper, o.halftoneGamma)
                : t === 'copy'
                  ? photocopy(src)
                  : duotone(src, o.duo?.[0] ?? [14, 22, 52], o.duo?.[1] ?? [236, 231, 219]);
        tctx.putImageData(out, 0, 0);
        blobs[t] = await tmp.convertToBlob(q);
      }
    }
    scope.postMessage({ id: req.id, ok: true, blobs } satisfies PlateResponse);
  } catch (err) {
    scope.postMessage({ id: req.id, ok: false, error: String(err) } satisfies PlateResponse);
  }
};
