/**
 * Photo slots.
 *
 * Drop official BE-INDIE imagery into `src/assets/brand/` using the slot name
 * as the file name (e.g. `hero.jpg`, `product-destiny-black.webp`). It is
 * picked up at build time and replaces the procedural wash study for that
 * slot everywhere — site and showcase — with the same crops and treatments.
 *
 * Nothing in this repository is BE-INDIE photography. Until a slot is filled
 * the page says so, in the slot's own metadata line.
 */
import type { WashId } from './data';
import type { Framing } from '../lib/denim/compositions';
import { study } from '../lib/denim/compositions';
import type { DenimJob } from '../lib/denim/types';

const files = import.meta.glob('../assets/brand/*.{jpg,jpeg,png,webp,avif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const PHOTO: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  PHOTO[name] = url;
}

export interface Slot {
  /** What the slot wants, in plain words — shown in the asset list. */
  wants: string;
  /** Focal point for cover-cropping a supplied photo, 0..1. */
  focus: [number, number];
  fallback: { wash: WashId; framing: Framing; seed: number; mirror?: boolean; top?: number; pitch?: number };
}

export const SLOTS = {
  hero: {
    wants: 'Campaign photograph, portrait, full-bleed. Denim-led look.',
    focus: [0.5, 0.35],
    fallback: { wash: 'midnight', framing: 'waistband', seed: 21 },
  },
  scanner: {
    wants: 'Full-length model in denim, portrait, plain background.',
    focus: [0.5, 0.45],
    fallback: { wash: 'sponge', framing: 'waistband', seed: 33, mirror: true, top: 0.22 },
  },
  'scanner-detail': {
    wants: 'Macro of the same garment’s fabric (for the scanner loupe).',
    focus: [0.5, 0.5],
    fallback: { wash: 'sponge', framing: 'macro', seed: 34 },
  },
  'product-destiny-black': {
    wants: 'Destiny Black Jeans — product or campaign image.',
    focus: [0.5, 0.45],
    fallback: { wash: 'black', framing: 'seam', seed: 41 },
  },
  'product-destiny-sponge': {
    wants: 'Destiny Sponge Jeans — product or campaign image.',
    focus: [0.5, 0.45],
    fallback: { wash: 'sponge', framing: 'pocket', seed: 42 },
  },
  'product-wide-leg-midnight': {
    wants: 'Wide Leg Midnight Blue — product or campaign image.',
    focus: [0.5, 0.6],
    fallback: { wash: 'midnight', framing: 'hem', seed: 43 },
  },
  'product-indie-fit': {
    wants: 'Indie Fit Jeans Blue Wash — product or campaign image.',
    focus: [0.5, 0.45],
    fallback: { wash: 'faded', framing: 'pocket', seed: 44 },
  },
  'product-be-fluffy': {
    wants: 'Be-Fluffy 2.0 Cloud Wash — product image showing the fringe.',
    focus: [0.5, 0.6],
    fallback: { wash: 'cloud', framing: 'fray', seed: 45 },
  },
  'product-relaxed-grey': {
    wants: 'Relaxed Mens Jeans Grey — product or campaign image.',
    focus: [0.5, 0.45],
    fallback: { wash: 'grey', framing: 'seam', seed: 46, mirror: true },
  },
  collage: {
    wants: 'One look, portrait — it is duplicated through print treatments.',
    focus: [0.5, 0.4],
    fallback: { wash: 'faded', framing: 'waistband', seed: 51, top: 0.18 },
  },
  detail: {
    wants: 'Close-up of denim: seam, stitching or wash detail.',
    focus: [0.5, 0.5],
    fallback: { wash: 'faded', framing: 'macro', seed: 61 },
  },
  end: {
    wants: 'Closing campaign photograph, portrait.',
    focus: [0.5, 0.35],
    fallback: { wash: 'midnight', framing: 'waistband', seed: 21 },
  },
} satisfies Record<string, Slot>;

export type SlotId = keyof typeof SLOTS;

export const hasPhoto = (slot: SlotId) => Boolean(PHOTO[slot]);

export type PlateReq =
  | { type: 'denim'; job: DenimJob }
  | { type: 'photo'; url: string; width: number; height: number; focus: [number, number] };

export function slotRequest(slot: SlotId, W: number, H: number): { key: string; req: PlateReq } {
  const s: Slot = SLOTS[slot];
  const url = PHOTO[slot];
  if (url) return { key: `photo:${slot}:${W}x${H}`, req: { type: 'photo', url, width: W, height: H, focus: s.focus } };
  const f = s.fallback;
  const job = study(f.wash, f.framing, W, H, f.seed, { mirror: f.mirror, top: f.top, pitch: f.pitch });
  return { key: `study:${job.key}`, req: { type: 'denim', job } };
}

/** The metadata line that tells the truth about what is on screen. */
export function slotCredit(slot: SlotId) {
  return hasPhoto(slot) ? 'IMAGE / BE-INDIE' : 'WASH STUDY / RENDERED';
}

export const LOGO: string | undefined = PHOTO['logo'];
