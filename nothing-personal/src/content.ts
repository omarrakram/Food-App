// Copy and catalogue data. Product names follow Nothing Personal's own
// naming; this is a speculative concept, prices are illustrative.

export const products = {
  p01: {
    code: 'NP-01',
    no: '01',
    type: 'BOXY',
    name: 'OFFLINE',
    price: 'LE 500',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
  },
  p109: {
    code: 'NP-109',
    no: '109',
    type: 'LINEN',
    name: 'LOW PWR',
    price: 'LE 950',
    sizes: ['S', 'M', 'L', 'XL'],
  },
  p98: {
    code: 'NP-98',
    no: '98',
    type: 'JORTS',
    name: 'RAW',
    price: 'LE 850',
    sizes: ['S', 'M', 'L', 'XL'],
  },
} as const;

export const credits = {
  brand: 'NOTHING PERSONAL.',
  concept: 'UNOFFICIAL DIGITAL CONCEPT',
  role: 'DESIGN + DEVELOPMENT',
  author: 'OMAR AKRAM',
  disclaimer: 'NOT AFFILIATED WITH NOTHING PERSONAL',
  rights: 'Brand names, products and photography remain the property of their respective owners.',
};
