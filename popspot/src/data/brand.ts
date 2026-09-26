/**
 * Brand facts used by the concept. Only statements Pop Spot makes publicly are
 * listed here, with where they were read. Concept copy (the headlines) lives in
 * the components and is always framed as concept copy, never as a slogan.
 */

export const brand = {
  name: 'POP SPOT',
  handle: '@popspotegypt',
  site: 'https://popspotme.com/',
  /**
   * The official Pop Spot wordmark could not be downloaded (popspotme.com and the
   * brand's social accounts are egress-blocked from the build environment), and
   * redrawing it is not allowed. Drop the real file at
   * `public/popspot/brand/logo.svg` (or .png) and set the path here: every
   * brand mark in the site and /showcase switches to it. Until then the name is
   * set in plain type — a label, not an imitation of the logo.
   */
  officialLogoSrc: null as string | null,
  /**
   * Pop Spot blue as specified in the brief (#0078FF); not sampled from an
   * official asset, since none could be retrieved.
   */
  blue: '#0078FF',
};

/** Public statements, verified via search results for popspotme.com pages (2026-09-26). */
export const facts = {
  reseller: 'Funko Authorized Reseller', // popspotme.com/about, FAQs
  lines: 'Funko Pop! & Loungefly', // popspotme.com homepage description
  delivery: 'Delivery across Egypt', // popspotme.com/faqs (via Aramex)
};

export const concept = {
  title: 'THE COLLECTORVERSE',
  line: 'EVERY FANDOM HAS A SPOT.',
  author: 'OMAR AKRAM',
  year: '2026',
  disclaimer: 'UNOFFICIAL DIGITAL CONCEPT — NOT AFFILIATED WITH POP SPOT',
};
