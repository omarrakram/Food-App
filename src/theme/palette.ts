/**
 * Semantic colour palettes.
 *
 * Components reference semantic roles (`surface`, `textSecondary`, `danger`)
 * rather than raw hex values, so light/dark stay in lockstep and a re-brand is
 * confined to this file.
 */

/** Raw brand ramp — only `palette.ts` should ever touch these. */
const brand = {
  paprika50: '#FFF1EB',
  paprika100: '#FFDCCB',
  paprika200: '#FFB894',
  paprika300: '#FF9464',
  paprika400: '#F5773E',
  paprika500: '#E85D2A',
  paprika600: '#C74A1E',
  paprika700: '#9C3915',

  basil400: '#3FBE85',
  basil500: '#2E9E6B',
  basil600: '#217A52',

  saffron400: '#F2B33D',
  saffron500: '#E09A1C',

  chili400: '#F1584F',
  chili500: '#DC3B31',
  chili600: '#B32A22',

  sky400: '#4C9BE8',
  sky500: '#2F7FD1',
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
    background: '#FFFBF7',
    backgroundAlt: '#FBF4EC',
    surface: '#FFFFFF',
    surfaceAlt: '#F7F1EA',
    surfacePressed: '#F0E8DF',
    border: '#EDE3D8',
    borderStrong: '#D9C9B8',

    text: '#1A1614',
    textSecondary: '#6B5F56',
    textTertiary: '#9C8E83',
    textOnPrimary: '#FFFFFF',

    primary: brand.paprika500,
    primaryPressed: brand.paprika600,
    primarySoft: brand.paprika50,
    primarySoftText: brand.paprika700,

    success: brand.basil500,
    successSoft: '#E4F6ED',
    successSoftText: brand.basil600,

    warning: brand.saffron500,
    warningSoft: '#FDF3DF',
    warningSoftText: '#8A5D06',

    danger: brand.chili500,
    dangerPressed: brand.chili600,
    dangerSoft: '#FDECEB',
    dangerSoftText: brand.chili600,

    info: brand.sky500,
    infoSoft: '#E8F1FC',
    infoSoftText: '#1E5C9E',

    skeleton: '#EFE7DE',
    skeletonHighlight: '#F9F4EE',

    scrim: 'rgba(26, 22, 20, 0.55)',
    shadow: '#8A6B52',

    tabBarBackground: 'rgba(255, 251, 247, 0.94)',
    tabBarBorder: '#EDE3D8',
    tabBarActive: brand.paprika500,
    tabBarInactive: '#9C8E83',
  },
  dark: {
    background: '#141210',
    backgroundAlt: '#1B1815',
    surface: '#211D1A',
    surfaceAlt: '#2A2521',
    surfacePressed: '#332D28',
    border: '#332D28',
    borderStrong: '#4A423B',

    text: '#F7F2EC',
    textSecondary: '#B3A79C',
    textTertiary: '#8A7E74',
    textOnPrimary: '#FFFFFF',

    primary: brand.paprika400,
    primaryPressed: brand.paprika300,
    primarySoft: '#3A2318',
    primarySoftText: brand.paprika200,

    success: brand.basil400,
    successSoft: '#16301F',
    successSoftText: '#7FD9AE',

    warning: brand.saffron400,
    warningSoft: '#332715',
    warningSoftText: '#F5CE7E',

    danger: brand.chili400,
    dangerPressed: brand.chili500,
    dangerSoft: '#3A1E1C',
    dangerSoftText: '#F79E98',

    info: brand.sky400,
    infoSoft: '#17273A',
    infoSoftText: '#9AC5F0',

    skeleton: '#2A2521',
    skeletonHighlight: '#363029',

    scrim: 'rgba(0, 0, 0, 0.66)',
    shadow: '#000000',

    tabBarBackground: 'rgba(20, 18, 16, 0.94)',
    tabBarBorder: '#332D28',
    tabBarActive: brand.paprika300,
    tabBarInactive: '#8A7E74',
  },
};

/**
 * Elevation presets. Android only understands `elevation`; iOS needs the
 * shadow* family. Returning both keeps call sites free of platform branches.
 */
export function elevation(scheme: ColorScheme, level: 0 | 1 | 2 | 3) {
  if (level === 0) return {};
  const shadowColor = palettes[scheme].shadow;
  const config = {
    1: { opacity: scheme === 'dark' ? 0.34 : 0.08, radius: 8, offsetY: 2, elevation: 2 },
    2: { opacity: scheme === 'dark' ? 0.42 : 0.11, radius: 16, offsetY: 6, elevation: 5 },
    3: { opacity: scheme === 'dark' ? 0.5 : 0.15, radius: 28, offsetY: 12, elevation: 10 },
  }[level];

  return {
    shadowColor,
    shadowOpacity: config.opacity,
    shadowRadius: config.radius,
    shadowOffset: { width: 0, height: config.offsetY },
    elevation: config.elevation,
  };
}
