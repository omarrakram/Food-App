/**
 * Everything factual in this concept lives here, with where it came from.
 *
 * Research was done through web search on 2026-09-26. be-indie.com,
 * int.be-indie.com, the Shopify CDN and Instagram were not reachable from the
 * build environment, so product copy below is what the brand's own product
 * pages returned through search indexing. Prices are deliberately omitted:
 * they could not be verified.
 *
 * Copy marked `concept: true` is original to this concept and is never
 * presented as a BE-INDIE slogan.
 */
import type { Wash } from '../lib/denim/types';

export const SOURCES = [
  { label: 'be-indie.com — DENIM collection', url: 'https://be-indie.com/collections/jeans' },
  { label: 'be-indie.com — About us', url: 'https://be-indie.com/pages/about-us' },
  { label: 'int.be-indie.com — product pages', url: 'https://int.be-indie.com/collections/jeans-trousers' },
  { label: 'CairoScene / SceneNow — brand coverage', url: 'https://scenenow.com/Styled/Be-Bold-with-Distinctive-New-Denim-Brand-Be-Indie' },
] as const;

/** Wording attributed to the brand in press coverage. */
export const BRAND_QUOTE = {
  text: 'Being independent is a state of mind, it’s the overall resistance to mainstream culture.',
  credit: 'BE-INDIE, in conversation with CairoScene',
};

export const BRAND = {
  name: 'BE-INDIE',
  city: 'CAIRO',
  country: 'EG',
  est: '2019',
  // from be-indie.com/pages/about-us (search-indexed excerpt)
  about:
    'The delicate balance of trendy and timeless — for the edgy and rebellious spirit. Known for bold colours and stand-out prints.',
  instagram: '@be__indie',
  site: 'https://be-indie.com/',
};

/* ── Washes, as the product copy describes them ──────────────────── */

export const WASH = {
  sponge: {
    id: 'sponge',
    warp: [24, 34, 74],
    warpFaded: [66, 90, 142],
    core: [176, 186, 206],
    weft: [204, 199, 186],
    thread: [214, 196, 158], // "beige stitching"
    fade: 0.14,
    mottle: 0.1,
    mottleScale: 160,
    sponge: { density: 0.9, scale: 46, colour: [150, 155, 162] }, // "grey sponge spots"
  },
  black: {
    id: 'black',
    warp: [24, 24, 28],
    warpFaded: [74, 76, 82],
    core: [150, 150, 152],
    weft: [46, 46, 50],
    thread: [34, 34, 37], // "black stitching"
    fade: 0.14,
    mottle: 0.14,
    mottleScale: 200,
  },
  midnight: {
    id: 'midnight',
    warp: [18, 26, 58],
    warpFaded: [52, 72, 124],
    core: [160, 174, 204],
    weft: [192, 188, 174],
    thread: [56, 70, 112],
    fade: 0.08,
    mottle: 0.08,
    mottleScale: 220,
  },
  faded: {
    id: 'faded',
    warp: [40, 62, 114],
    warpFaded: [104, 134, 182],
    core: [204, 214, 228],
    weft: [214, 210, 198],
    thread: [128, 146, 178],
    fade: 0.42,
    mottle: 0.2,
    mottleScale: 150,
  },
  cloud: {
    id: 'cloud',
    warp: [58, 86, 142],
    warpFaded: [146, 172, 210],
    core: [226, 231, 238],
    weft: [228, 224, 214],
    thread: [180, 192, 212],
    fade: 0.52,
    mottle: 0.12,
    mottleScale: 120,
    cloud: 0.62,
  },
  grey: {
    id: 'grey',
    warp: [70, 72, 78],
    warpFaded: [132, 134, 140],
    core: [204, 204, 202],
    weft: [188, 186, 178],
    thread: [110, 112, 118],
    fade: 0.3,
    mottle: 0.18,
    mottleScale: 170,
  },
} satisfies Record<string, Wash>;

export type WashId = keyof typeof WASH;

/* ── Products ───────────────────────────────────────────────────── */

export interface Product {
  slug: string;
  /** Name exactly as the brand lists it. */
  name: string;
  /** Display split for the huge type. */
  display: [string, string];
  wash: WashId;
  washLabel: string;
  fit: string;
  details: string[];
  url: string;
  /** Photo slot that replaces the wash study when supplied. */
  slot: string;
}

export const PRODUCTS: Product[] = [
  {
    slug: 'destiny-black-jeans',
    name: 'Destiny Black Jeans',
    display: ['DESTINY', 'BLACK'],
    wash: 'black',
    washLabel: 'BLACK',
    fit: 'LOOSE CUT / LOW RISE',
    details: ['2-POCKET CONSTRUCTION', 'FULL LENGTH', 'BLACK STITCHING', 'SILVER BUTTONS'],
    url: 'https://int.be-indie.com/products/destiny-black-jeans',
    slot: 'product-destiny-black',
  },
  {
    slug: 'destiney-sponge',
    name: 'Destiny Sponge Jeans',
    display: ['DESTINY', 'SPONGE'],
    wash: 'sponge',
    washLabel: 'DARK BLUE / GREY SPONGE SPOTS',
    fit: 'LOOSE CUT / LOW RISE',
    details: ['4-POCKET CONSTRUCTION', 'FULL LENGTH', 'BEIGE STITCHING', 'SILVER BUTTONS', '100% EGYPTIAN COTTON'],
    url: 'https://int.be-indie.com/products/destiney-sponge',
    slot: 'product-destiny-sponge',
  },
  {
    slug: 'wide-leg-midnight-blue',
    name: 'Wide Leg Midnight Blue',
    display: ['WIDE LEG', 'MIDNIGHT'],
    wash: 'midnight',
    washLabel: 'MIDNIGHT BLUE',
    fit: 'WIDE LEG',
    details: ['MIDNIGHT BLUE'],
    url: 'https://int.be-indie.com/products/wide-leg-midnight-blue',
    slot: 'product-wide-leg-midnight',
  },
  {
    slug: 'indie-fit-jeans-blue-wash',
    name: 'Indie Fit Jeans Blue Wash',
    display: ['INDIE FIT', 'BLUE WASH'],
    wash: 'faded',
    washLabel: 'FADED BLUE WASH',
    fit: 'STRAIGHT LEG / MID RISE',
    details: ['5-POCKET', '100% EGYPTIAN COTTON'],
    url: 'https://int.be-indie.com/products/indie-fit-jeans-blue-wash',
    slot: 'product-indie-fit',
  },
  {
    slug: 'be-fluffy-2-0-cloud-wash',
    name: 'Be-Fluffy 2.0 Cloud Wash',
    display: ['BE-FLUFFY', '2.0'],
    wash: 'cloud',
    washLabel: 'CLOUD WASH',
    fit: 'MID RISE / SHORTS',
    details: ['4-POCKET', 'FRINGES'],
    url: 'https://int.be-indie.com/products/be-fluffy-2-0-cloud-wash',
    slot: 'product-be-fluffy',
  },
  {
    slug: 'relaxed-jeans-blue-wash',
    name: 'Relaxed Mens Jeans Grey',
    display: ['RELAXED', 'GREY'],
    wash: 'grey',
    washLabel: 'GREY WASH',
    fit: 'STRAIGHT LEG / SLIGHTLY OVERSIZED',
    details: ['4-POCKET', 'MENSWEAR'],
    url: 'https://int.be-indie.com/products/relaxed-jeans-blue-wash',
    slot: 'product-relaxed-grey',
  },
];

export const bySlug = (slug: string) => PRODUCTS.find((p) => p.slug === slug)!;
