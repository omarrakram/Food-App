# Dataset expansion strategy

**An audit before an expansion.** Nothing in production data or schema changes
here. Every number below was measured against the shipped catalogue and the
shipped resolver, not estimated — the instrument is
`src/features/ingredients/__tests__/vocabulary-coverage.test.ts`, which is
committed alongside this document so the numbers can be re-measured after
every batch of additions.

---

## 1. The finding that should decide the plan

The catalogue's problem is **not that it is too small**. It is that the app
does not answer to the words Egyptians actually type.

254 terms a real Egyptian kitchen would produce — Egyptian Arabic, English,
and the Franco-Arab transliteration people use on a phone keyboard — were run
through `resolveIngredient` and `searchIngredients`, the same two functions
the picker and the pantry use:

| Outcome                                     | Count |   Share |
| ------------------------------------------- | ----: | ------: |
| Resolves to the right canonical ingredient  |   167 | **66%** |
| Nothing resolves; search offers _something_ |    45 |     18% |
| Nothing at all — a dead end                 |    42 | **17%** |

The middle row is where the real damage is. Of those 45, **19 resolve to an
ingredient from a different food group**, silently and confidently:

| A user types  | The app offers | They meant    |
| ------------- | -------------- | ------------- |
| `farawla`     | caraway        | strawberry    |
| `shammam`     | pigeon         | cantaloupe    |
| `arnab`       | cauliflower    | rabbit        |
| `termis`      | buttermilk     | lupini beans  |
| `broad beans` | tofu           | fava beans    |
| `vine leaves` | tea            | vine leaves   |
| `قشطة`        | tomatoes       | clotted cream |
| `ماجي`        | watercress     | stock cube    |
| `مش`          | apricots       | mish cheese   |
| `قريش`        | lamb chops     | areesh cheese |
| `corn flakes` | corn oil       | corn flakes   |

**A dead end is honest; a wrong answer is not.** "Add anyway" recovers the
first. Nothing recovers the second: the user taps a plausible-looking
suggestion, and the matching engine then reasons about caraway.

So roughly **one term in four either fails or lies**. That is the number the
expansion has to move, and headcount is not the lever that moves it.

### The engine is not at fault

`searchIngredients` is a nine-tier scorer — exact/prefix/token-prefix/substring
across canonical names and aliases separately, with edit-distance fuzzy matching
only as a last resort and suppressed entirely when any confident match exists.
`normaliseIngredientName` already strips Arabic diacritics, folds alef/yeh/ta-marbuta
variants, removes 30 preparation words, protects `ground`/`green`/`red`/`white`/`black`/`sweet`
as leading words, and singularises `-ies`/`-oes`/`-ses`/`-xes`/`-hes`.

Every wrong answer above is the engine behaving **correctly on data it does not
have**. `farawla` reaches caraway because nothing in the catalogue claims that
name and `caraway` is four edits away. This is an alias problem wearing a
search problem's clothes.

### A third of the failures need no new rows at all

Of the 61 failing terms, **20 map to an ingredient the catalogue already
contains** and are fixed by adding an alias:

`mekhalel`→pickles · `kromb`→cabbage · `bassal akhdar`→green onion ·
`goafa`→guava · `batteekh`→watermelon · `baharat`→mixed spice · `هيل`→cardamom ·
`kandooz`→veal · `lahma mafrooma`→ground beef · `batt`→duck ·
`deek roumi`→turkey · `werk`→chicken thighs · `sedr`→chicken breast ·
`adas`→lentils · `dibs`/`assal aswad`→molasses · `farawla`→strawberry ·
`shammam`→melon · `arnab`→rabbit · `broad beans`→fava beans · `ماجي`→stock cube

**Alias density, not ingredient count, is the first lever.** It is also the
cheapest: no Arabic name to write, no unit, no allergens, no price, no recipe
to place it in.

---

## 2. Current-state metrics

### Ingredients — 257

| Category   | Count | Read                                              |
| ---------- | ----: | ------------------------------------------------- |
| vegetables |    46 | good breadth, thin on Egyptian frozen forms       |
| protein    |    44 | broad species, almost no **cuts**                 |
| pantry     |    39 | a catch-all holding nuts, baking, legumes, drinks |
| spices     |    34 | strong                                            |
| fruit      |    24 | adequate                                          |
| sauces     |    20 | holds oils too                                    |
| dairy      |    19 | **weakest category relative to Egyptian usage**   |
| carbs      |    16 | good                                              |
| bakery     |     9 | thin                                              |
| frozen     |     4 | **effectively absent**                            |
| other      |     2 | water, ice                                        |

- **717 aliases**, mean **2.79** per ingredient, median 3, max 9, **zero
  ingredients with no alias**.
- **257/257 have an Arabic canonical name.** 254 carry at least one Arabic
  alias; three are Latin-only (`potatoes`, `chili-powder`, `tahini-salad`).
- 47 staples · 125 perishable · 87 with `grams_per_piece` · 79 with allergens.
- Units: `g` 175, `piece` 42, `ml` 22, then a long tail of `tsp`/`tbsp`/`bunch`/`can`/`slice`/`clove`.

The bilingual foundation is genuinely strong. **Arabic coverage is 100%; the
gap is transliteration and colloquial variants**, which is exactly what the
probe measures.

### Recipes — 161

| Axis        | Distribution                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cuisine     | egyptian 36 · levantine 22 · mediterranean 20 · american 19 · asian 18 · italian 16 · indian 11 · mexican 10 · turkish 9 |
| Meal type   | lunch 118 · dinner 101 · snack 43 · **breakfast 29** · **dessert 12**                                                    |
| Difficulty  | easy 123 · medium 31 · hard 7                                                                                            |
| Diet        | halal 161 · vegetarian 106 · vegan 52 · pescatarian 14 · keto 13                                                         |
| Appliance   | stove 105 · oven 36 · **blender 8 · grill 4 · air fryer 2**                                                              |
| Time        | median 30 min · ≤15 min 32 · ≤30 min 84 · 31–60 min 56 · >60 min 21                                                      |
| Ingredients | median 9 · **≤5 ingredients: 4 recipes** · 6–8: 72 · 9+: 85                                                              |

**Protein anchor:** 79 of 161 recipes contain no protein-category ingredient at
all. Of the 82 that do: eggs 20, ground beef 10, chicken thigh 10, chicken
breast 6, canned tuna 4, lamb 4 — and then a tail of single recipes.

### Catalogue ↔ recipe coupling

- 172 of 257 ingredients appear in at least one recipe — **66.9% utilisation**.
- **85 ingredients appear in no recipe at all** (anchovy, artichoke, asparagus,
  barley, beetroot, brown rice, caraway, cashews, chicken liver, cloves,
  coconut, condensed milk, crab, croissant, date syrup …).
- 46 ingredients appear in exactly one recipe.
- Zero dangling references: every recipe ingredient slug exists.

### Prices — 69

- 1,374 ingredient slots across 161 recipes; **1,035 priced = 75.3% slot
  coverage**.
- 65 of the 69 priced ingredients are actually used; 4 are priced but unused
  (`apples`, `black-eyed-peas`, `dukkah`, `liver`).
- 107 used ingredients have no price. The highest-traffic unpriced:
  ginger (16 recipes), soy sauce (15), sesame oil (12), stock cube (11),
  mint (9), turmeric (9), parmesan (8), chili powder (8), mixed spice (8),
  baking powder (7), vanilla (7), oregano (7), curry powder (7), dill (7),
  ghee (7).

---

## 3. Category coverage and the priority gaps

Assessed against the taxonomy in the brief. **P0** blocks the "type what is in
your kitchen" promise; **P1** is common enough to be noticed; **P2** is
long-tail.

| Group                                                              | State        | Missing, specifically                                                                                                      | Pri    |
| ------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Egyptian meat cuts**                                             | ~absent      | kawareh (trotters), mombar, ras, mokh, lahma dani/mutton, rekab, kebda eskandarani, batarekh, shank, mince grades          | **P0** |
| **Poultry cuts**                                                   | partial      | **whole chicken (farkha)**, kawanes (gizzards), drumstick as distinct, carcass/bones for stock, quail (semman)             | **P0** |
| **Egyptian cheeses**                                               | partial      | **gebna talaga**, **areesh (قريش)**, **mish (مش)**, domiati, barameely, istanbouly, processed triangles, cheese spread     | **P0** |
| **Frozen**                                                         | 4 items      | frozen molokhia, okra, spinach, mixed veg ✓, artichoke hearts, burger patties, fish fillet, pastry sheets                  | **P0** |
| **Breakfast / packaged**                                           | ~absent      | corn flakes, jam (mrabba), **halawa**, honey ✓, cheese triangles, processed spread, rusk (bo'smat)                         | **P0** |
| **Dairy**                                                          | thin         | **eshta/qeshta** (distinct from `cream`), sour cream, laban rayeb, kariesh, full/skim milk distinction                     | **P0** |
| **Legumes**                                                        | good         | **termis (lupini)**, fool nabet, red lentils as distinct from `lentils`, besara base                                       | P1     |
| **Breads**                                                         | thin         | **feeno**, shami as distinct from baladi, fiteer, semit, bo'smat, brown baladi                                             | P1     |
| **Fish / seafood**                                                 | good         | **sole (samak moosa)**, subeit (cuttlefish), denis, bouri ✓, moza, bisara fish                                             | P1     |
| **Canned / jarred**                                                | scattered    | canned fava, canned chickpeas, canned corn, canned peas, canned mushroom, passata, cream of mushroom                       | P1     |
| **Baking**                                                         | good         | **baking soda**, corn starch distinct from cornflour, custard powder, cake flour, food colouring, mastic (mastika), mahlab | P1     |
| **Sauces / condiments**                                            | good         | shatta as a condiment, garlic sauce (toumeya), tartar, ranch, tahini ✓, pomegranate molasses ✓                             | P1     |
| **International in Egypt**                                         | thin         | **indomie / instant noodles**, sriracha, oyster sauce, rice vinegar, nori, pesto, jarred pasta sauce, mirin                | P1     |
| **Prepared**                                                       | partial      | bechamel, mahshi filling, besara, shawarma spice, koshari sauce, ful mix                                                   | P1     |
| **Herbs**                                                          | good         | marjoram (bardakoosh), sage, tarragon, fresh thyme                                                                         | P2     |
| **Snacks**                                                         | absent       | biscuits, chips, popcorn kernels, wafers                                                                                   | P2     |
| **Oils / fats**                                                    | good         | samna baladi vs nabati as distinct, palm oil                                                                               | P2     |
| Vegetables · Fruit · Spices · Rice/grains · Pasta · Meat (species) | **adequate** | —                                                                                                                          | —      |

**The pattern:** the catalogue is organised the way a supermarket aisle is, and
Egyptian kitchens are organised around **cuts, forms and preparations** —
`farkha` vs `sedr` vs `werk`, `gebna talaga` vs `areesh` vs `mish`, fresh vs
frozen molokhia. Species-level coverage is good; form-level coverage is where
the dead ends are.

---

## 4. Alias and search strategy

### What the pipeline already supports, cleanly

| Requirement             | Supported              | Where                                                         |
| ----------------------- | ---------------------- | ------------------------------------------------------------- |
| English canonical       | yes                    | `name`                                                        |
| Arabic canonical        | yes                    | `name_ar`, 257/257                                            |
| English aliases         | yes                    | `aliases`, pipe-delimited                                     |
| Egyptian Arabic aliases | yes                    | same field, 254/257 carry ≥1                                  |
| Plural/singular         | **yes, automatically** | `singularise` handles `-ies`/`-oes`/`-ses`/`-xes`/`-hes`/`-s` |
| Spelling variation      | partial                | edit-distance fuzzy, ≥4 chars, budget 1–2                     |
| Transliteration         | **by hand only**       | must be typed into `aliases`                                  |
| Arabic orthography      | **yes, automatically** | diacritics, tatweel, alef/yeh/waw/ta-marbuta folding          |

**No schema change is needed for any of this.** The `aliases` column already
carries mixed-script values and the resolver already indexes them. The gap is
_content_, and the mean of 2.79 aliases per ingredient is the measure of it.

### The rule to adopt

Every canonical ingredient should carry, at minimum:

1. English canonical name
2. Arabic canonical name (Egyptian dialect, not MSA, where they differ)
3. 1–2 English synonyms (`aubergine`/`eggplant`, `coriander`/`cilantro`)
4. **2–4 Franco-Arab transliterations** — the highest-yield and most-neglected
   class. `farkha`, `sedr`, `werk`, `kozbara`, `betengan`, `koosa`. Include the
   `3`/`7`/`2` digit-substitution forms where common (`na3na3`, `7amam`).
5. 1–2 Arabic spelling variants the normaliser does **not** already fold —
   it handles diacritics and letter-form folding, so only genuinely different
   spellings need listing.
6. The plural **only where irregular**; regular plurals are automatic.

Target: **8–12 aliases per canonical ingredient**, against 2.79 today. At 650
ingredients that is roughly **6,000–8,000 alias strings**, a ~9× increase in
alias volume against a ~2.5× increase in row count. That ratio is the strategy
in one line.

### One search change worth considering later (not now)

The fuzzy tier currently accepts an edit distance of 1–2 on queries of ≥4
characters with no check that the result is plausible. That is what produces
`farawla`→caraway. Once aliases are dense, consider **requiring the fuzzy tier
to agree on food group**, or suppressing it when the best fuzzy score is below
a floor — so an unrecognised term becomes an honest dead end rather than a
confident wrong answer. Re-measure with the probe before and after; do not
change it while aliases are still sparse, because today fuzzy is carrying real
load.

---

## 5. Unknown-ingredient strategy

### What exists today

- **The picker already offers it.** Zero results renders `cook.noMatches` plus
  `cook.addAnyway` — "Add «{query}» anyway". The UI does not claim the
  ingredient does not exist.
- **The pantry already accepts it.** `quickAdd` writes a row from a typed name
  with no quantity, unit or date.
- **Matching already fails safe.** `buildAvailabilityIndex.addName` resolves to
  canonical when it can and otherwise keys on the normalised raw string. No
  recipe ingredient is stored as raw text, so an unknown name can never
  satisfy a recipe requirement. **Requirement 4 is already met.**
- **The database already allows it.** `pantry_items.ingredient_id` is
  `uuid references ingredients(id) on delete set null` — nullable by design —
  with `ingredient_name text not null` denormalised beside it. The migration's
  own comment says "so users can add things we do not know about."
  **Requirement 5 is structurally already met**: an unknown row can be linked
  to a canonical ingredient later by filling in `ingredient_id`, with no data
  loss.

### The three real gaps

1. **The app type is stricter than the database.** `PantryItem.ingredientId` is
   `string`, while the column is nullable. Nothing distinguishes "resolved" from
   "the user typed this and we do not know it" in application code. This is the
   one change genuinely required, and it is a _type_ change, not a schema
   change.
2. **Nothing is counted.** A term a hundred users type and the catalogue misses
   is the single most valuable signal available for prioritising the next batch
   of ingredients, and it is currently thrown away.
3. **The distinction is invisible to the user.** An unknown ingredient looks
   identical to a canonical one in the selection list, so there is no
   explanation for why it contributed nothing to the results.

### Minimum safe architecture

No schema change. Three steps, in order:

- **A. Make it visible in types.** `ingredientId: string | null`, matching the
  column. Everywhere that reads it already handles a miss; the type has simply
  been lying.
- **B. Mark it in the UI, quietly.** A custom ingredient renders with a
  "not in our list yet" affordance rather than a category badge, and the
  results screen can then honestly say a selection contributed nothing. Never
  "this does not exist" — always "we do not know this one yet".
- **C. Count it locally first.** A local tally of unmatched terms — normalised,
  count, first-seen, last-seen — needs no table and no migration. It answers
  "what are people asking for that we do not have" for the next batch. Only if
  that proves useful should server-side aggregation be considered, and that
  would be a separate proposal.

### Schema changes that would EVENTUALLY be required — for approval, not now

None are needed for requirements 1–5. These serve requirement 6 (auditing
repeated unknown terms) and future mapping ergonomics:

| Change                                                                                                         | Why                                                                                                            | When                                                                |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `unknown_ingredient_terms` table (normalised term, count, first/last seen, optional `mapped_to` ingredient id) | server-side aggregation of catalogue gaps across users                                                         | only after the local tally proves the signal is worth collecting    |
| `ingredient_aliases` table, replacing the pipe-delimited CSV column                                            | at 6,000–8,000 aliases a delimited string stops being reviewable or queryable                                  | at roughly 2,000 aliases                                            |
| `ingredients.parent_id` (self-reference)                                                                       | model `chicken breast` as a cut **of** `chicken`, so a pantry "farkha" can satisfy a recipe calling for breast | only if cut-level matching is wanted; adds real matching complexity |

Each is a separate proposal. None should be bundled with a data expansion.

---

## 6. Brands versus ingredients

**The rule: a brand is a way of saying an ingredient, never an ingredient.**

`Heinz ketchup`, `هاينز كاتشب` and `ketchup` must all resolve to the single
canonical `ketchup`. `Maggi`, `ماجي` and `stock cube` all resolve to
`stock-cube` — note the probe shows `ماجي` currently offering **watercress**,
which is precisely this gap.

Two consequences:

- **Brands enter as aliases, under the canonical ingredient.** No
  `heinz-ketchup` row, ever. A brand that earns its place earns it as a string
  in `aliases`, and only when people genuinely say it instead of the generic
  name — in Egypt that is a short list: Maggi, Indomie, Nestlé, Juhayna,
  Domty, Halwani, Rashidi, Heinz, Americana, Lipton, Corona.
- **Genericised brands are the interesting case.** `indomie` in Egypt means
  instant noodles the way `hoover` meant vacuum cleaner. The canonical
  ingredient is `instant-noodles`; `indomie`/`اندومي` is its most-used alias.
  The brand is how people speak; the ingredient is what they cook.

### The line that must not be crossed

|             | Cooking ingredient ontology                           | Supermarket SKU catalogue                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| Answers     | "what is this, for cooking?"                          | "which exact product, at what price, from whom?"           |
| Cardinality | ~650                                                  | tens of thousands                                          |
| Keyed by    | slug                                                  | barcode / retailer SKU                                     |
| Owns        | name, Arabic name, aliases, unit, allergens, category | brand, size, packaging, retailer, live price, availability |
| Changes     | rarely, editorially                                   | constantly, by feed                                        |
| Today       | `data/ingredients/catalogue.csv`                      | **does not exist, and must not be faked**                  |

A future SKU catalogue would reference an ingredient (`many SKUs → one
ingredient`), never replace it. Recipe matching, pantry matching and the
shopping list stay on the ingredient side of that line. Nothing in this
document assumes a product feed, live prices, stock, partners or delivery —
and the price data that exists today remains a **survey-based estimate**, which
every screen that shows it already says.

---

## 7. Recommended ingredient target

**650, not 800–1,200.**

The brief's range is a reasonable prior, and the evidence argues slightly
below it, for four reasons:

1. **Utilisation is already 67%.** 85 of 257 ingredients appear in no recipe.
   Adding 900 more long-tail rows pushes the unused share toward 80% and makes
   the catalogue mostly furniture.
2. **More rows make search worse before they make it better.** Every extra
   ingredient is another candidate in the fuzzy tier. The wrong answers above
   exist _because_ there are enough near-neighbours to beat a real match.
   Density of aliases narrows the field; density of rows widens it.
3. **Each row is expensive, and the expense is the point.** A quality row needs
   an Egyptian Arabic name, 8–12 aliases, a default unit, `grams_per_piece`
   where countable, allergens, staple/perishable flags — and reviewing 1,200 of
   those honestly is not achievable at the quality the first 257 were done at.
4. **The measured failures need ~100 new ingredients, not 900.** Of the 61
   failing terms, 20 need aliases only and roughly 25 need a new row. Scaling
   that failure profile across the full P0/P1 gap list lands at 300–400 new
   ingredients.

**Proposed shape at launch:**

|                           |  Now |          Target | Multiple |
| ------------------------- | ---: | --------------: | -------: |
| Canonical ingredients     |  257 |         **650** |     2.5× |
| Aliases                   |  717 | **6,000–7,500** |      ~9× |
| Aliases per ingredient    | 2.79 |        **9–11** |    ~3.5× |
| Household-term resolution |  66% |        **≥95%** |        — |
| Wrong-group suggestions   |   19 |           **0** |        — |

The last two rows are the acceptance criteria. Row count is a means; those are
the ends. If 650 ingredients hit 95% resolution, stop — and if 900 are needed
to hit it, that is a better argument for 900 than any target number is.

---

## 8. Recipe coverage and the path to ~300

### Where 161 is thin

| Gap                             |                  Now | Why it matters                                                                                                                                                   |
| ------------------------------- | -------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Recipes with ≤5 ingredients** |                **4** | The product's core promise is "cook with what I have". A median of 9 ingredients means most matches demand a well-stocked kitchen. This is the single worst gap. |
| **Egyptian share**              |             36 (22%) | The launch market's own food is outnumbered 4:1 by everything else.                                                                                              |
| **Breakfast**                   |                   29 | Egyptian breakfast is a whole cuisine — ful, ta'ameya, eggs, cheese, mish, halawa — and is under-served.                                                         |
| **Dessert**                     |                   12 | Ramadan and family occasions are dessert-shaped.                                                                                                                 |
| **Air fryer / grill / blender** |            2 / 4 / 8 | These appliance filters currently return almost nothing, so offering them is close to a false promise.                                                           |
| **Keto / pescatarian**          |              13 / 14 | Filter to either and the catalogue nearly empties.                                                                                                               |
| **Protein spread**              | 79 recipes have none | Chicken and eggs dominate what remains; lamb, fish, veal and offal are single-recipe tails.                                                                      |
| **>60 minutes**                 |                   21 | Slow-cooked Egyptian classics — fattah, mahshi, molokhia with rabbit — are structurally absent.                                                                  |

### An intentional path to 300

139 new recipes, **allocated to close measured gaps**, not spread evenly:

| Batch                        | Recipes | Selection rule                                                                                                                                                                      |
| ---------------------------- | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. **Five-ingredient meals** |      40 | ≤5 required ingredients, ≥80% staple reach, ≤30 min. Directly serves the picker. Target: 44 recipes at ≤5 ingredients.                                                              |
| 2. **Egyptian core**         |      35 | The dishes a household actually cooks weekly — mahshi variants, fattah, molokhia forms, besara, koshari components, ful variations, roz me3ammar. Target: Egyptian share 24% → 32%. |
| 3. **Egyptian breakfast**    |      15 | Ful, ta'ameya, eggs-with-basterma, cheese plates, feteer. Target: breakfast 29 → 44.                                                                                                |
| 4. **Protein spread**        |      20 | Deliberately anchored on under-represented proteins: fish (8), lamb/veal (6), offal (3), pulses-as-main (3).                                                                        |
| 5. **Appliance coverage**    |      15 | Air fryer (8) and grill (7), so those filters return a real list.                                                                                                                   |
| 6. **Dessert & occasion**    |      14 | Ramadan and Eid sweets, basbousa, konafa, roz bel laban, mahalabeya.                                                                                                                |

Two constraints on every new recipe:

- **It must use ingredients the catalogue already has, or ingredients being
  added in the same batch.** Recipes and ingredients expand together, in step —
  never a recipe referencing a slug that does not exist.
- **It must improve a measured axis.** Adding a 162nd stove-top chicken dish
  that takes 45 minutes and nine ingredients moves nothing.

Existing dataset gates still apply: no pair above 0.9 Jaccard similarity,
allergens declared, diet tags consistent, Arabic for every title, description,
step and safety note.

---

## 9. Price expansion priorities

**Price by slot coverage, not by row count.** 69 prices already cover **75.3%
of the 1,374 ingredient slots** across the catalogue, because pricing tracks
usage frequency and usage is heavily skewed.

| Tier      | What                                                                                                   | Count | Effect                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------ | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**    | Unpriced ingredients used in ≥5 recipes                                                                |   ~25 | ginger, soy sauce, sesame oil, stock cube, mint, turmeric, parmesan, chili powder, mixed spice, baking powder, vanilla, oregano, curry powder, dill, ghee, chili pepper, cheddar, cornflour, sesame seeds, cabbage … → slot coverage 75% → **~88%** |
| **P1**    | Every ingredient anchoring a _budget-visible_ recipe — proteins, dairy, carbs, oils in the new batches |   ~60 | → **≥95%** slot coverage                                                                                                                                                                                                                            |
| **P2**    | Spices and herbs by the gram                                                                           |   ~40 | negligible basket effect; their value is removing "N items we could not price" from the results screen                                                                                                                                              |
| **Never** | Ingredients in no recipe                                                                               |     — | 4 are priced today (`apples`, `black-eyed-peas`, `dukkah`, `liver`) and should not be extended                                                                                                                                                      |

**A spice priced at zero cost is still worth pricing**, because the honesty
counter on the results screen degrades user trust faster than a small price
error does. But it is P2: fix the proteins and dairy first, where a missing
price actually moves the estimate.

**Rule for new ingredients:** an ingredient does not need a price on the day it
is added. It needs one when a recipe uses it. Tie price work to recipe batches,
not to catalogue batches.

---

## 10. Staged implementation plan

Each stage ends with the probe re-run and its number recorded. No stage begins
before the previous one's number has moved.

| Stage                              | Work                                                                                                                                                      | Measured exit condition                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **0. Instrument** ✅               | Vocabulary probe committed as a test with floors                                                                                                          | 66% / 17% / 19 recorded                                                           |
| **1. Aliases only**                | No new rows. Add the ~20 known alias fixes, then sweep all 257 for Franco-Arab and colloquial forms toward 8–12 each                                      | Resolution **≥85%**, wrong-group suggestions **≤5**, still 257 ingredients        |
| **2. P0 ingredients**              | ~120 rows: Egyptian meat cuts, poultry cuts, Egyptian cheeses, frozen forms, breakfast/packaged, dairy — each with full alias set at the Stage-1 standard | Resolution **≥92%**, dead ends **≤10**, 0 wrong-group                             |
| **3. Unknown-ingredient handling** | `ingredientId: string \| null` in types; custom-ingredient affordance in the picker and pantry; local tally of unmatched terms                            | A typed unknown is visibly distinct, still never matches a recipe, and is counted |
| **4. P1 ingredients**              | ~180 rows: legumes, breads, seafood, canned, baking, condiments, international, prepared                                                                  | Resolution **≥95%**, catalogue ~550                                               |
| **5. Recipes to 300**              | The six batches in §8, each paired with any ingredients it needs                                                                                          | Every §8 target met; ≤5-ingredient recipes ≥44; Egyptian ≥30%                     |
| **6. Prices**                      | P0 then P1 from §9, tied to the recipe batches                                                                                                            | Slot coverage **≥95%**                                                            |
| **7. Long tail**                   | ~100 P2 rows only if the probe still shows gaps                                                                                                           | Resolution ≥95% sustained; stop when it plateaus                                  |

**Review gates.** Stages 1–2 and 4 add data that a native Egyptian speaker
should review before it ships — transliteration quality is the whole point and
is not something to take on trust from a generator. Stage 5 needs the same for
recipe text. Build the review into the batch size: batches of 40–60, not 500.

### What this plan deliberately does not do

- It does not generate ingredients or recipes in bulk before Stage 1 proves the
  alias lever works.
- It does not change the search algorithm while aliases are sparse, because
  today the fuzzy tier is carrying real load and removing it would convert
  wrong answers into dead ends without adding a single right one.
- It does not create brand rows, a SKU catalogue, or any live-price,
  stock, partner or delivery concept.
- It does not change the schema. The two changes that eventually earn their
  place — an alias table and an unknown-term table — are listed in §5 for
  separate approval.
