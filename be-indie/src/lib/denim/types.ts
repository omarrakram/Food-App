export type RGB = [number, number, number];

/**
 * A wash is a material description, not a product photograph. Each one here is
 * derived from a wash BE-INDIE publishes in its own product copy (see
 * `src/brand/data.ts`) and rendered procedurally as a study of that wash.
 */
export interface Wash {
  id: string;
  /** Dye colour of the warp yarn where it is untouched. */
  warp: RGB;
  /** Warp colour where the wash has worn it back. */
  warpFaded: RGB;
  /** Undyed core that shows through at the extreme of abrasion. */
  core: RGB;
  weft: RGB;
  /** Stitching thread, when the product copy names it. */
  thread: RGB;
  /** Base fade 0..1. */
  fade: number;
  /** Amplitude of the mottled, irregular fade. */
  mottle: number;
  /** Feature size of the mottle in output px. */
  mottleScale: number;
  /** Large, soft cloud patches (cloud wash). */
  cloud?: number;
  /** Bleach / sponge spotting (e.g. "grey sponge spots"). */
  sponge?: { density: number; scale: number; colour: RGB };
}

export type Pt = [number, number];

export type Feature =
  | {
      kind: 'seam';
      pts: Pt[];
      /** Two parallel needles. */
      double?: boolean;
      gap?: number;
      stitch?: number;
      /** Ridge width in px (the folded seam allowance). 0 = flat topstitch. */
      ridge?: number;
      /** Which side of the path casts the overlap shadow. */
      side?: 1 | -1;
      thread?: RGB;
    }
  | { kind: 'edge'; pts: Pt[]; side?: 1 | -1; depth?: number }
  | { kind: 'button'; x: number; y: number; r: number }
  | { kind: 'rivet'; x: number; y: number; r: number }
  | { kind: 'bartack'; x: number; y: number; angle: number; len: number; thread?: RGB }
  | {
      kind: 'whiskers';
      x: number;
      y: number;
      count: number;
      length: number;
      angle: number;
      spread: number;
      strength?: number;
    }
  | { kind: 'wear'; x: number; y: number; rx: number; ry: number; strength: number }
  | { kind: 'fold'; pts: Pt[]; width: number; depth: number }
  | { kind: 'fray'; y: number; length: number; bg: RGB };

export interface DenimJob {
  key: string;
  width: number;
  height: number;
  /** Warp spacing in output px. */
  pitch: number;
  /** Supersampling factor. */
  ss?: number;
  seed: number;
  wash: Wash;
  features?: Feature[];
  /** Gentle undulation of fabric lying on a surface. */
  drape?: number;
  drapeScale?: number;
  /** Directional light across the frame: angle (rad), strength. */
  light?: { angle: number; strength: number };
  /** Depth of field falloff (fraction of height sharp in the middle band). */
  dof?: { focus: number; band: number; blur: number };
  vignette?: number;
}

export type Treatment = 'base' | 'negative' | 'riso' | 'halftone' | 'copy' | 'duotone';

export type PlateSet = Partial<Record<Treatment, string>> & { base: string };
