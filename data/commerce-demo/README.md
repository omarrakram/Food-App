# Demo merchant catalogue

**This is not a supermarket.** No company named here exists, no commercial
agreement stands behind it, and no row in this folder describes a real price
or a real shelf.

It exists so the ordering flow — missing ingredients → products → cart →
checkout → merchant dashboard → delivery — can be built and tested end to end
before a partner catalogue exists.

## Why it is quarantined here

`data/ingredients/` and `data/recipes/` are AKALT's food intelligence: the
canonical ingredients and the recipes that reference them. Nothing in this
folder may reach them, and nothing in them may reference a SKU.

`scripts/__tests__/commerce-demo-isolation.test.ts` enforces that:

- every `ingredient_slug` in `mappings.csv` must exist in the canonical
  catalogue, so a mapping cannot invent an ingredient;
- no demo product id, external id or brand may appear anywhere in
  `data/ingredients/` or `data/recipes/`;
- the generated catalogue may only be imported from `features/commerce`;
- the demo merchant must be `is_demo: true` and `is_enabled: false`.

## Why it cannot be mistaken for a partner

`is_demo` is written on the merchant row rather than inferred from its slug,
so the distinction survives in the data. A demo merchant that is also enabled
is refused in production builds — the flag is not decoration.

Prices are deliberately round and obviously synthetic. They are not a market
survey and must never be rendered as a live price outside development.

## Files

| file | |
|---|---|
| `merchant.json` | the merchant and its one branch |
| `products.csv` | what it "sells" |

### The allergens column

A blank cell is **refused by the importer**. Write `none` when the merchant
declares no allergens, or `unknown` when they publish no allergen data at all.

Those are different facts with different consequences: `none` is safe for an
allergic customer, `unknown` is not safe, it is merely unlabelled. A blank cell
cannot say which it means, and treating unknown as none is how somebody gets
served the thing they are allergic to.
| `mappings.csv` | canonical ingredient → product, with source and verification |

Regenerate the bundled TypeScript with `npm run commerce:demo`.
