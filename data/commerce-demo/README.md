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
| `mappings.csv` | canonical ingredient → product, with source and verification |

Regenerate the bundled TypeScript with `npm run commerce:demo`.

### The allergens column

A blank cell is **refused by the importer**. Write `none` when the merchant
declares no allergens, or `unknown` when they publish no allergen data at all.

Those are different facts with different consequences: `none` is safe for an
allergic customer, `unknown` is not safe, it is merely unlabelled. A blank cell
cannot say which it means, and treating unknown as none is how somebody gets
served the thing they are allergic to.

## The rows that exist to be awkward

Most of this catalogue is unremarkable on purpose. A handful of rows are not,
because every sourcing state the app can produce has to be reachable in a
build somebody can actually open — a state that only exists in a unit test is
a state nobody has ever looked at.

| row | what it makes reachable |
|---|---|
| `dm-tom-500` — `low_stock` | a purchasable product that is nearly gone: it still ranks, below an in-stock rival |
| `dm-pot-2000` — `out_of_stock`, and the only potato | `no_purchasable_match`. Every other ingredient here has a second option, so without this the state is unreachable in the demo |
| `dm-cream-500` — `out_of_stock` beside an in-stock `dm-cream-200` | out-of-stock loses to a stocked rival rather than making the whole line fail |
| `dm-bakery-baladi` — allergens `unknown` | `needs_confirmation` for anybody with an allergy set. Unlabelled is not safe |
| `dm-legacy-chk` — `is_active: 0` | a delisted row the catalogue still carries and the sourcer must ignore |
| `dm-pasta-400` — the only pasta, `gluten` | `no_eligible_match` for a coeliac: every option conflicts, and none is offered anyway |

Ingredients with no mapping at all — tomato paste, vinegar, chilli flakes —
are what produce `unmapped`, and there is nothing to add for that: it is the
shape of any real catalogue.
