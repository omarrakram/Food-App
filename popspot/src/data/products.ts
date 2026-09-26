/**
 * The product manifest. Every collectible rendered anywhere in the concept —
 * homepage, overlays and /showcase — comes from this list. Components never
 * hard-code product names, numbers or prices.
 *
 * Imagery: the 16 real Pop Spot product photographs supplied in the asset pack
 * (`public/popspot/products/`, untouched) and their background-free cutouts
 * (`public/popspot/cutouts/`, made by `scripts/cutout.py`, no generative fill).
 *
 * Metadata rules
 * --------------
 * popspotme.com could not be opened from the build environment (egress-blocked),
 * so metadata was verified through search-engine results *for popspotme.com
 * product pages* on 2026-09-26. Each entry records how far it was verified:
 *
 *  - `listing`         A popspotme.com product URL and title were returned, and
 *                      the supplied image matches that title (character, pose,
 *                      stickers). Name, number and franchise come from the title.
 *  - `search-summary`  The search engine described a popspotme.com listing that
 *                      matches the image, but did not return the page URL.
 *  - `character-only`  Pop Spot lists this character, but which variant the image
 *                      shows is unconfirmed, so no number/price/status is shown.
 *  - `unverified`      No matching Pop Spot listing was found. Only neutral
 *                      labels (OBJECT 01…) are shown — nothing is inferred from
 *                      the image.
 *
 * Price and stock status are time-sensitive. Only one price was returned by the
 * search index (Salah #41); every other price renders as "see store". No stock
 * status was verifiable, so none is claimed. No rarity scores exist anywhere.
 */

export type Universe = 'ANIME' | 'SPORTS' | 'MARVEL' | 'MOVIES & TV' | 'DISNEY · PIXAR';

export type Verification = 'listing' | 'search-summary' | 'character-only' | 'unverified';

export interface Product {
  /** Stable id, matches the supplied file number. */
  id: string;
  /** Two-digit index from the asset pack (01–16). */
  n: string;
  /** Background-free cutout used for composition. */
  image: string;
  /** The untouched supplied photograph. */
  original: string;
  /** Intrinsic cutout size (px) so layouts can reserve space without a reflow. */
  w: number;
  h: number;
  /** A boxed (in-package) photograph rather than a loose figure. */
  boxed: boolean;
  verification: Verification;
  /** Display name. Neutral ("OBJECT 01") when unverified. */
  name: string;
  /** Pop Spot listing title, verbatim, when known. */
  listingTitle: string | null;
  /** Funko number without "#", only when the listing states it. */
  number: string | null;
  franchise: string | null;
  universe: Universe | null;
  /** Product line as written on the listing or box. */
  format: string | null;
  /** EGP, only when a Pop Spot price was returned. */
  price: number | null;
  /** Labels stated in the listing title (EXCLUSIVE, GLOW, CHASE LISTED). */
  tags: string[];
  /** Pop Spot SKU from the listing URL. */
  sku: string | null;
  sourceUrl: string | null;
  /** Presentation-only accent sampled by eye from the product's own colours. */
  accent: string;
}

const STORE = 'https://popspotme.com';

const base = (n: string, w: number, h: number) => ({
  id: `product-${n}`,
  n,
  image: `/popspot/cutouts/product-${n}.webp`,
  original: `/popspot/products/popspot_product_${n}.png`,
  w,
  h,
});

export const products: Product[] = [
  {
    ...base('01', 324, 486),
    boxed: false,
    verification: 'unverified',
    name: 'OBJECT 01',
    listingTitle: null,
    number: null,
    franchise: null,
    universe: null,
    format: null,
    price: null,
    tags: [],
    sku: null,
    sourceUrl: null,
    accent: '#2F8F5B',
  },
  {
    ...base('02', 568, 416),
    boxed: false,
    verification: 'listing',
    name: 'Toji Fushiguro',
    listingTitle: 'Funko Pop! Anime: Jujutsu Kaisen - Toji Fushiguro (Exclusive) #1889',
    number: '1889',
    franchise: 'Jujutsu Kaisen',
    universe: 'ANIME',
    format: 'Pop! Anime',
    price: null,
    tags: ['EXCLUSIVE', 'CHASE LISTED'],
    sku: 'FU85324',
    sourceUrl: `${STORE}/product/FU85324/funko-pop-toji-fushiguro-jujutsu-kaisen`,
    accent: '#5B3E8C',
  },
  {
    ...base('03', 376, 514),
    boxed: false,
    verification: 'listing',
    name: 'Satoru Gojo',
    listingTitle:
      'Funko Pop! Anime: Jujutsu Kaisen - Satoru Gojo Cursed Technique Lapse Blue #1885',
    number: '1885',
    franchise: 'Jujutsu Kaisen',
    universe: 'ANIME',
    format: 'Pop! Anime',
    price: null,
    tags: [],
    sku: 'FU85326',
    sourceUrl: `${STORE}/product/FU85326/funko-pop-satoru-gojo-jujutsu-kaisen`,
    accent: '#5FD0FF',
  },
  {
    ...base('04', 466, 540),
    boxed: false,
    verification: 'listing',
    name: 'Ryomen Sukuna',
    listingTitle: 'Ryomen Sukuna With Heart (Glow In The Dark) (Exclusive)',
    number: null,
    franchise: 'Jujutsu Kaisen',
    universe: 'ANIME',
    format: 'Pop! Anime',
    price: null,
    tags: ['EXCLUSIVE', 'GLOW', 'CHASE LISTED'],
    sku: 'FG-FU62648',
    sourceUrl: `${STORE}/product/FG-FU62648-Chase/funko-pop-jujutsu-kaisen-ryomen-heart-chase`,
    accent: '#E0352B',
  },
  {
    ...base('05', 376, 512),
    boxed: false,
    verification: 'character-only',
    name: 'L Lawliet',
    listingTitle: null,
    number: null,
    franchise: 'Death Note',
    universe: 'ANIME',
    format: null,
    price: null,
    tags: [],
    sku: null,
    sourceUrl: null,
    accent: '#C8232C',
  },
  {
    ...base('06', 428, 542),
    boxed: false,
    verification: 'listing',
    name: 'Unmasked Iron Spider',
    listingTitle:
      'Funko Pop! Super Heroes: Marvel - Avengers Endgame - Spiderman - Unmasked Iron Spider (Exclusive) #1142',
    number: '1142',
    franchise: 'Avengers: Endgame',
    universe: 'MARVEL',
    format: 'Pop! Super Heroes',
    price: null,
    tags: ['EXCLUSIVE'],
    sku: 'FG-FU68253',
    sourceUrl: `${STORE}/product/FG-FU68253/funko-pop-unmasked-iron-spider`,
    accent: '#D9A516',
  },
  {
    ...base('07', 492, 516),
    boxed: false,
    verification: 'search-summary',
    name: 'John Cena',
    listingTitle:
      'Funko Pop! Sports: WWE - John Cena with WWE Championship Belt (Exclusive) #203',
    number: '203',
    franchise: 'WWE',
    universe: 'SPORTS',
    format: 'Pop! Sports',
    price: null,
    tags: ['EXCLUSIVE'],
    sku: null,
    sourceUrl: null,
    accent: '#E3B341',
  },
  {
    ...base('08', 580, 938),
    boxed: false,
    verification: 'listing',
    name: 'Mohamed Salah',
    listingTitle: 'Funko Pop! Sports: Football - Liverpool - Mohamed Salah #41',
    number: '41',
    franchise: 'Liverpool FC',
    universe: 'SPORTS',
    format: 'Pop! Sports',
    price: 995,
    tags: [],
    sku: 'FU52173',
    sourceUrl: `${STORE}/product/FU52173/funko-pop-mohamed-salah`,
    accent: '#D71920',
  },
  {
    ...base('09', 320, 514),
    boxed: false,
    verification: 'unverified',
    name: 'OBJECT 09',
    listingTitle: null,
    number: null,
    franchise: null,
    universe: null,
    format: null,
    price: null,
    tags: [],
    sku: null,
    sourceUrl: null,
    accent: '#3A7D34',
  },
  {
    ...base('10', 716, 928),
    boxed: true,
    verification: 'listing',
    name: 'Captain Ray Holt with Cheddar',
    listingTitle:
      'Funko Pop! Tv Series: Brooklyn Nine-Nine - Captain Ray Holt with Cheddar #1626',
    number: '1626',
    franchise: 'Brooklyn Nine-Nine',
    universe: 'MOVIES & TV',
    format: 'Pop! Television',
    price: null,
    tags: [],
    sku: 'FU61401',
    sourceUrl: `${STORE}/product/FU61401/funko-pop-ray-holt-cheddar-1626`,
    accent: '#F4D21C',
  },
  {
    ...base('11', 390, 516),
    boxed: false,
    verification: 'unverified',
    name: 'OBJECT 11',
    listingTitle: null,
    number: null,
    franchise: null,
    universe: null,
    format: null,
    price: null,
    tags: [],
    sku: null,
    sourceUrl: null,
    accent: '#D8D8D8',
  },
  {
    ...base('12', 338, 510),
    boxed: false,
    verification: 'character-only',
    name: 'Harry Potter',
    listingTitle: null,
    number: null,
    franchise: 'Harry Potter',
    universe: 'MOVIES & TV',
    format: null,
    price: null,
    tags: [],
    sku: null,
    sourceUrl: `${STORE}/product-category/Pop%20Spot%20-%20License%20-%20Harry%20potter`,
    accent: '#56C13B',
  },
  {
    ...base('13', 462, 518),
    boxed: false,
    verification: 'listing',
    name: 'Boo',
    listingTitle: 'Funko Pop! Cartoon Animation: Disney Pixar - Monsters Inc. - Boo #386',
    number: '386',
    franchise: 'Monsters, Inc.',
    universe: 'DISNEY · PIXAR',
    format: 'Pop! Animation',
    price: null,
    tags: [],
    sku: 'FU29392',
    sourceUrl: `${STORE}/product/FU29392/funko-pop-monsters-inc-boo-386`,
    accent: '#F05A9A',
  },
  {
    ...base('14', 412, 590),
    boxed: false,
    verification: 'search-summary',
    name: 'Kimi Antonelli',
    listingTitle:
      'Funko Pop! Sports: Racing - Formula 1 - Mercedes AMG Petronas F1 Team - Kimi Antonelli with Helmet #13',
    number: '13',
    franchise: 'Formula 1',
    universe: 'SPORTS',
    format: 'Pop! Sports',
    price: null,
    tags: [],
    sku: null,
    sourceUrl: null,
    accent: '#00A19C',
  },
  {
    ...base('15', 374, 594),
    boxed: false,
    verification: 'listing',
    name: 'Victor Wembanyama',
    listingTitle: 'Funko Pop! Sports: Basketball NBA San Antonio Spurs - Victor Wembanyama #174',
    number: '174',
    franchise: 'NBA · San Antonio Spurs',
    universe: 'SPORTS',
    format: 'Pop! Sports',
    price: null,
    tags: [],
    sku: 'FU75120',
    sourceUrl: `${STORE}/product/FU75120/funko-pop-nba-victor-wembanyama`,
    accent: '#A7A9AC',
  },
  {
    ...base('16', 410, 532),
    boxed: false,
    verification: 'listing',
    name: 'Cowgirl Barbie',
    listingTitle: 'Funko Pop! Movies: Mattel - Barbie - Cowgirl Barbie #1447',
    number: '1447',
    franchise: 'Barbie',
    universe: 'MOVIES & TV',
    format: 'Pop! Movies',
    price: null,
    tags: [],
    sku: 'FU72637',
    sourceUrl: `${STORE}/product/FU72637/funko-pop-barbie-cowgirl-barbie`,
    accent: '#E4408E',
  },
];

export const UNIVERSES: Universe[] = ['ANIME', 'SPORTS', 'MARVEL', 'MOVIES & TV', 'DISNEY · PIXAR'];

const byId = new Map(products.map((p) => [p.id, p]));

export function product(id: string): Product {
  const p = byId.get(id);
  if (!p) throw new Error(`Unknown product ${id}`);
  return p;
}

/** Shorthand by pack number: p('08') → Mohamed Salah. */
export const p = (n: string) => product(`product-${n}`);

export const inUniverse = (u: Universe) => products.filter((x) => x.universe === u);

/** "#1885" or null. */
export const numberLabel = (x: Product) => (x.number ? `#${x.number}` : null);

/** Price text: only a returned Pop Spot price is ever shown as a number. */
export const priceLabel = (x: Product) =>
  x.price != null ? `${x.price.toLocaleString('en-US')} EGP` : 'SEE STORE';

/** Pop Spot style shelf id — derived from the manifest index, not invented stock data. */
export const spotId = (x: Product) => `SPOT-${x.n.padStart(4, '0')}`;

export const isVerified = (x: Product) =>
  x.verification === 'listing' || x.verification === 'search-summary';
