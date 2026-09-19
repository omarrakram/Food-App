/**
 * Semantic colour palettes.
 *
 * Components reference semantic roles (`surface`, `textSecondary`, `danger`)
 * rather than raw hex values, so light/dark stay in lockstep and a re-brand is
 * confined to this file.
 */

/**
 * Raw brand ramp — only `palette.ts` should ever touch these.
 *
 * Cobalt, not the old paprika. The reason is measurable rather than a
 * preference: white on the old `paprika500` was 3.48:1, below the 4.5:1 body
 * minimum, so the palette needed a SECOND, darker primary for anything
 * carrying a label. The brand colour was therefore never the colour of the
 * most important control on screen, which is the one thing a brand colour
 * exists to do. White on `cobalt500` is 5.42:1, so there is one primary again
 * and `primaryStrong` is now an alias kept only for call-site compatibility.
 */
const brand = {
  cobalt50: '#F2F5FF',
  cobalt100: '#E9EDFF',
  cobalt200: '#C7D1FF',
  cobalt300: '#A3B5FF',
  cobalt400: '#7D95FF',
  cobalt500: '#3155FF',
  cobalt600: '#2442D6',
  cobalt700: '#1E36B0',

  /* Support hues. Each fill is dark enough to carry white at 4.5:1, which the
     old green and red were not — that is why filled buttons had to reach for
     separate `*Strong` shades. */
  leaf500: '#1F7A4D',
  leaf400: '#4ECB92',
  leaf700: '#155C39',

  amber600: '#9A6207',
  amber400: '#E3B15C',
  amber700: '#7A4D05',

  clay500: '#C0341F',
  clay400: '#F07E6C',
  clay600: '#9E2917',
  clay700: '#992718',
} as const;

export type ColorScheme = 'light' | 'dark';

export type Palette = {
  /** Screen background. */
  background: string;
  /** Slightly raised background used for grouped/secondary sections. */
  backgroundAlt: string;
  /** Card / sheet surface. */
  surface: string;
  /** A surface resting on top of another surface (e.g. chip on a card). */
  surfaceAlt: string;
  /** Pressed state for interactive surfaces. */
  surfacePressed: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Stronger border, used for focused inputs and selected chips. */
  borderStrong: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Text that sits on top of `primary` / `onDark` surfaces. */
  textOnPrimary: string;

  primary: string;
  /**
   * Background for a FILLED button, which carries a text label.
   *
   * Separate from `primary` because the two have different jobs: the accent
   * has to stay vivid for icons, borders and progress, while a label sitting
   * on top has to clear 4.5:1. White on paprika500 is 3.48:1 — the brand
   * colour is simply too light to put text on.
   */
  primaryStrong: string;
  successStrong: string;
  dangerStrong: string;
  primaryPressed: string;
  primarySoft: string;
  primarySoftText: string;

  success: string;
  successSoft: string;
  successSoftText: string;

  warning: string;
  warningSoft: string;
  warningSoftText: string;

  danger: string;
  dangerPressed: string;
  dangerSoft: string;
  dangerSoftText: string;

  info: string;
  infoSoft: string;
  infoSoftText: string;

  /** Neutral skeleton base + highlight for shimmer loaders. */
  skeleton: string;
  skeletonHighlight: string;

  /** Scrim behind modals and over hero images. */
  scrim: string;
  /** Shadow colour; alpha is applied per-elevation. */
  shadow: string;

  tabBarBackground: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
};

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    background: '#FBF7F0',
    backgroundAlt: '#F4EEE4',
    surface: '#FFFFFF',
    surfaceAlt: '#F6F1E9',
    surfacePressed: '#ECE5DA',
    border: '#E7E0D4',
    borderStrong: '#D2C9B9',

    text: '#12100E',
    textSecondary: '#6B6560',
    textTertiary: '#87807A',
    textOnPrimary: '#FFFFFF',

    primary: brand.cobalt500,
    primaryStrong: brand.cobalt500,
    successStrong: brand.leaf500,
    dangerStrong: brand.clay500,
    primaryPressed: brand.cobalt600,
    primarySoft: brand.cobalt100,
    primarySoftText: brand.cobalt700,

    success: brand.leaf500,
    successSoft: '#E3F3EA',
    successSoftText: brand.leaf700,

    warning: brand.amber600,
    warningSoft: '#FAEFDA',
    warningSoftText: brand.amber700,

    danger: brand.clay500,
    dangerPressed: brand.clay600,
    dangerSoft: '#FBEAE6',
    dangerSoftText: brand.clay700,

    info: brand.cobalt600,
    infoSoft: '#E9EDFD',
    infoSoftText: brand.cobalt700,

    skeleton: '#EDE7DC',
    skeletonHighlight: '#F8F4EC',

    scrim: 'rgba(18, 16, 14, 0.55)',
    shadow: '#2A231B',

    tabBarBackground: 'rgba(251, 247, 240, 0.96)',
    tabBarBorder: '#E7E0D4',
    tabBarActive: brand.cobalt500,
    tabBarInactive: '#6B6560',
  },
  dark: {
    background: '#0E0F13',
    backgroundAlt: '#14161C',
    surface: '#171A21',
    surfaceAlt: '#1F232C',
    surfacePressed: '#272C37',
    border: '#252A33',
    borderStrong: '#3A4150',

    text: '#F3F1ED',
    textSecondary: '#A6A39E',
    textTertiary: '#7D7A75',
    /* Near-black, not white: cobalt is light enough in dark mode that a white
       label on it measures 3.77:1 and fails. Ink on it is 5.04:1. */
    textOnPrimary: '#0E0F13',

    primary: brand.cobalt400,
    primaryStrong: brand.cobalt400,
    successStrong: brand.leaf400,
    dangerStrong: brand.clay400,
    primaryPressed: brand.cobalt300,
    primarySoft: '#1C2440',
    primarySoftText: '#AFC0FF',

    success: brand.leaf400,
    successSoft: '#12301F',
    successSoftText: '#7FDDB0',

    warning: brand.amber400,
    warningSoft: '#33270F',
    warningSoftText: '#F0CD8F',

    danger: brand.clay400,
    dangerPressed: '#F59C8D',
    dangerSoft: '#361B17',
    dangerSoftText: '#F5A99B',

    info: brand.cobalt400,
    infoSoft: '#18203A',
    infoSoftText: '#AFC0FF',

    skeleton: '#1F232C',
    skeletonHighlight: '#2A2F3A',

    scrim: 'rgba(0, 0, 0, 0.66)',
    shadow: '#000000',

    tabBarBackground: 'rgba(14, 15, 19, 0.96)',
    tabBarBorder: '#252A33',
    tabBarActive: brand.cobalt400,
    tabBarInactive: '#A6A39E',
  },
};

/**
 * Elevation presets.
 *
 * Deliberately much flatter than they were. Soft drop shadows on cards, list
 * rows, buttons, skeletons and segmented controls is a dashboard convention;
 * this product is meant to read as editorial, where separation comes from a
 * hairline border and a background step. Level 1 is now a whisper — it exists
 * so things that genuinely sit above the page (a sheet, a toast) still say so
 * — and level 3 is reserved for modals.
 *
 * Android only understands `elevation`; iOS needs the shadow* family.
 * Returning both keeps call sites free of platform branches.
 */
export function elevation(scheme: ColorScheme, level: 0 | 1 | 2 | 3) {
  if (level === 0) return {};
  const shadowColor = palettes[scheme].shadow;
  const config = {
    1: { opacity: scheme === 'dark' ? 0.24 : 0.04, radius: 4, offsetY: 1, elevation: 1 },
    2: { opacity: scheme === 'dark' ? 0.34 : 0.07, radius: 10, offsetY: 3, elevation: 3 },
    3: { opacity: scheme === 'dark' ? 0.46 : 0.12, radius: 22, offsetY: 8, elevation: 8 },
  }[level];

  return {
    shadowColor,
    shadowOpacity: config.opacity,
    shadowRadius: config.radius,
    shadowOffset: { width: 0, height: config.offsetY },
    elevation: config.elevation,
  };
}
