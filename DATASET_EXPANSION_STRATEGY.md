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

| Outcome                               |   Count |    Share |
| ------------------------------------- | ------: | -------: |
| Resolves to the **right** ingredient  |     165 |      65% |
| Search finds the **right** ingredient |      25 |      10% |
| **Correct overall**                   | **190** |  **75%** |
| Dead end — nothing at all             |      42 |      17% |
| Wrong, same food group                |       8 |       3% |
| **Wrong, DIFFERENT food group**       |  **14** | **5.5%** |

> **These numbers replaced an earlier, wronger set.** The first pass counted
> whether `resolveIngredient` returned _anything_ and reported 66% / 18% / 17%.
> That measured the wrong quantity in both directions: it ignored the 25 terms
> where search finds the right answer, and it counted two confident **alias**
> errors as successes — `whole chicken` → `chicken-breast`, and `pita` →
> `baladi-bread`. 167 resolutions minus those two is the 165 above. The
> difference between "returned" and "returned the right thing" is the
> difference between a benchmark and a counter.

**Wrong answers are two very different events.** Eight are misses inside a
food group — `gebna rumi` offering white cheese, `pita` offering baladi bread,
`cottage cheese` offering mozzarella. Fourteen cross food groups, and arrive
with exactly the confidence of a correct answer:

| A user types            | The app offers | They meant       |
| ----------------------- | -------------- | ---------------- |
| `farawla`               | caraway        | strawberry       |
| `shammam`               | pigeon         | cantaloupe       |
| `arnab`                 | cauliflower    | rabbit           |
| `termis`                | buttermilk     | lupini beans     |
| `فول أخضر`              | green onion    | green fava beans |
| `wara enab` / `ورق عنب` | grapes         | vine leaves      |
| `vine leaves`           | tea            | vine leaves      |
| `قشطة`                  | tomatoes       | clotted cream    |
| `ماجي`                  | watercress     | stock cube       |
| `مش`                    | apricot        | mish cheese      |
| `قريش`                  | lamb chops     | areesh cheese    |
| `corn flakes`           | corn oil       | corn flakes      |

**A dead end is honest; a cross-group answer is not.** "Add anyway" recovers
the first. Nothing recovers the second: the user taps a plausible-looking
suggestion, and the matching engine then reasons about caraway.

So **25% of terms fail, and 5.5% actively mislead**. The second number is the
one with a hard target of zero.

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

| Group                                                              | State        | Missing, specifically                                                                                                                                                                                    | Pri    |
| ------------------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Egyptian meat cuts**                                             | ~absent      | kawareh (trotters), mombar, ras, mokh, lahma dani/mutton, rekab, kebda eskandarani, batarekh, shank, mince grades                                                                                        | **P0** |
| **Poultry cuts**                                                   | partial      | **whole chicken (farkha)**, kawanes (gizzards), drumstick as distinct, carcass/bones for stock, quail (semman)                                                                                           | **P0** |
| **Egyptian cheeses**                                               | partial      | **gebna talaga**, **areesh (قريش)**, **mish (مش)**, processed triangles, cheese spread. Domiati, baramili and istanbouly are the SAME white brined family and become aliases of `white-cheese` — see §3c | **P0** |
| **Frozen**                                                         | 4 items      | frozen molokhia, okra, spinach, mixed veg ✓, artichoke hearts, burger patties, fish fillet, pastry sheets                                                                                                | **P0** |
| **Breakfast / packaged**                                           | ~absent      | corn flakes, jam (mrabba), **halawa**, honey ✓, cheese triangles, processed spread, rusk (bo'smat)                                                                                                       | **P0** |
| **Dairy**                                                          | thin         | **eshta/qeshta** (distinct from `cream`), sour cream, laban rayeb, kariesh, full/skim milk distinction                                                                                                   | **P0** |
| **Legumes**                                                        | good         | **termis (lupini)**, fool nabet, besara base. (Red lentils are already the `lentils` row — see §3c)                                                                                                      | P1     |
| **Breads**                                                         | thin         | **feeno**, shami as distinct from baladi, fiteer, semit, bo'smat, brown baladi                                                                                                                           | P1     |
| **Fish / seafood**                                                 | good         | **sole (samak moosa)**, subeit (cuttlefish), denis, bouri ✓, moza, bisara fish                                                                                                                           | P1     |
| **Canned / jarred**                                                | scattered    | canned fava, canned chickpeas, canned corn, canned peas, canned mushroom, passata, cream of mushroom                                                                                                     | P1     |
| **Baking**                                                         | good         | **baking soda**, corn starch distinct from cornflour, custard powder, cake flour, food colouring, mastic (mastika), mahlab                                                                               | P1     |
| **Sauces / condiments**                                            | good         | shatta as a condiment, garlic sauce (toumeya), tartar, ranch, tahini ✓, pomegranate molasses ✓                                                                                                           | P1     |
| **International in Egypt**                                         | thin         | **indomie / instant noodles**, sriracha, oyster sauce, rice vinegar, nori, pesto, jarred pasta sauce, mirin                                                                                              | P1     |
| **Prepared**                                                       | partial      | bechamel, mahshi filling, besara, shawarma spice, koshari sauce, ful mix                                                                                                                                 | P1     |
| **Herbs**                                                          | good         | marjoram (bardakoosh), sage, tarragon, fresh thyme                                                                                                                                                       | P2     |
| **Snacks**                                                         | absent       | biscuits, chips, popcorn kernels, wafers                                                                                                                                                                 | P2     |
| **Oils / fats**                                                    | good         | samna baladi vs nabati as distinct, palm oil                                                                                                                                                             | P2     |
| Vegetables · Fruit · Spices · Rice/grains · Pasta · Meat (species) | **adequate** | —                                                                                                                                                                                                        | —      |

**The pattern:** the catalogue is organised the way a supermarket aisle is, and
Egyptian kitchens are organised around **cuts, forms and preparations** —
`farkha` vs `sedr` vs `werk`, `gebna talaga` vs `areesh` vs `mish`, fresh vs
frozen molokhia. Species-level coverage is good; form-level coverage is where
the dead ends are.

---

## 3b. How the benchmark measures, and why an earlier version could not

`src/features/ingredients/__tests__/vocabulary-coverage.test.ts` with its
truth table in `fixtures/vocabulary-benchmark.ts`.

### The assertion that had to be replaced

The first version ended with a check that read like a safety net and was not
one:

```ts
const stillWrong = MUST_NOT_SUGGEST.filter(/* … */);
expect(stillWrong.length).toBeLessThanOrEqual(MUST_NOT_SUGGEST.length);
```

`stillWrong` is filtered **from `MUST_NOT_SUGGEST` itself**, so its length can
never exceed the array's. The condition is true by construction. It could not
fail, it could not notice a newly introduced wrong match, and it licensed
every known wrong pair to keep passing forever. The same defect class as a
green test asserting nothing — and worth naming, because the shape is
seductive: a real list, a real filter, a real `expect`, and no possible
failure.

### The truth table

Every term now carries an expected outcome, of one of three kinds:

| Kind        | Meaning                                                                                    | Example                                                |
| ----------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `canonical` | the catalogue has this exact concept; anything else is wrong                               | `farawla` → `strawberry`                               |
| `oneOf`     | genuinely ambiguous in Egyptian usage, with a written `because`                            | `shatta` → chili pepper **or** flakes **or** hot sauce |
| `absent`    | the catalogue genuinely lacks it; only a dead end or a same-group suggestion is acceptable | `termis` → _(lupini beans, legume)_                    |

`oneOf` carries a mandatory justification string. An `oneOf` written to make a
failing term pass is how a benchmark stops being a benchmark, and the
requirement to write the reason is the only thing standing between those two
states.

### Five outcomes, counted separately

| Outcome             | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `RESOLVED_CORRECT`  | `resolveIngredient` returns an acceptable slug         |
| `SEARCH_CORRECT`    | nothing resolves, but the top search hit is acceptable |
| `DEAD_END`          | nothing at all — the honest failure                    |
| `WRONG_SAME_GROUP`  | wrong, but from the same food group. A miss            |
| `WRONG_OTHER_GROUP` | wrong, from a different food group. **A lie**          |

Food group comes from `fixtures/food-groups.ts`, which is deliberately **not**
the catalogue's `category`. `category` is an aisle taxonomy — `protein` holds
beef, tilapia, lentils and tofu — and is useless for asking "could a cook
mistake this for the real thing?". The fixture maps 25 kitchen-meaningful
groups, with every slug whose category misleads listed explicitly.

### The safety invariant

> An unknown term may return **no** canonical result. It must never
> confidently return an **unrelated** ingredient.

Expressed as `WRONG_OTHER_GROUP === 0`, currently pinned at its measured 14 so
the list can be worked down term by term. Every stage lowers the number, and a
fifteenth fails the build the moment it appears — because it is counted from
live results, not filtered from the list that defines it.

### Bounds, all set at the measured state

| Assertion                    | Bound          | Measured |
| ---------------------------- | -------------- | -------- |
| correct share                | ≥ 0.748        | 0.748    |
| wrong answers, any kind      | ≤ 22           | 22       |
| cross-group answers          | ≤ 14           | 14       |
| cross-group alias collisions | allowlist of 1 | 1        |

No slack. A floor with room in it is a floor that never catches anything.

### Benchmark hygiene checks

The benchmark is also checked for being well-formed, because a typo in a truth
table reports a regression that does not exist:

- every slug it names exists in the catalogue;
- every food-group override names a real slug;
- every expectation has a resolvable group;
- no term appears under two different concepts.

### Alias collision checks

Two, on the catalogue itself:

- **Cross-group collisions fail the build.** One alias claimed by ingredients
  in different food groups is a silent wrong answer waiting for whoever adds
  the next row, since which one wins is decided by insertion order into the
  alias index.
- **Same-group collisions are reported, not failed.** Two ingredients
  answering to one word can be a deliberate modelling choice; it is printed so
  it stays a decision rather than an accident.

**The check found exactly one cross-group collision, and it explains a live
inconsistency.** `حمص` is claimed by both `chickpeas` (legume) and
`hummus-dip` (prepared). Insertion order is alphabetical by accident, so the
Arabic `حمص` resolves to the pulse while the transliteration `homos` has no
alias at all and falls through to search, which offers the dip. Two spellings
of one word, two different answers. It is allowlisted with its reason rather
than silently tolerated; **Stage 1 fixes it as a data change** by deciding
which concept owns the bare word and giving the other a qualified alias.

### This set does NOT gate launch

The 254 terms were used to _find_ the catalogue's gaps. Once Stage 1 writes
aliases against them, a high score here measures whether those aliases were
written — which is already known. The benchmark stays as the **development**
instrument: it catches regressions, it proves a stage moved the number, and it
is fast enough to run on every commit.

### The independent holdout, required before launch

Launch validation needs a **separate set of raw ingredient terms that were not
used to author the catalogue**. Requirements:

1. **Collected from real Egyptian users**, not written by whoever wrote the
   aliases. Sources, in order of preference: the unmatched-term tally from
   §5C once the app has traffic; a written exercise with 20–30 Egyptian
   households listing what is in their kitchen in their own words; typed
   pantry and cook-search terms from a closed beta.
2. **Sealed before the aliases are written.** Collected, labelled with the
   same truth-table scheme, and then _not looked at_ during authoring. A
   holdout inspected during training is training data.
3. **At least 300 terms**, skewed toward Franco-Arab transliteration and
   colloquial forms, because those are where the failures concentrate.
4. **Labelled by a native Egyptian speaker**, including the `absent` cases —
   deciding that the catalogue genuinely lacks a concept is a judgement about
   Egyptian food, not about the catalogue.
5. **Run once per stage, not iterated against.** If the holdout number is
   used to decide which aliases to write next, it has become a second
   development set and a third holdout is needed.

**Launch gate: ≥90% correct and 0 cross-group answers on the holdout.** The
development benchmark's ≥95% is a necessary condition for reaching that, not
a substitute for measuring it.

---

## 3c. Ontology audit of the proposed P0/P1 list

The gap list in §3 was written before this audit and **contained real
ontology errors**. Corrected here before any of it becomes data.

### Errors found in the proposal

| Proposed                                                       | Verdict                                               | Why                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bechamel, mahshi filling, besara, koshari sauce, ful mix       | **Reject — these are dishes**                         | Each is a recipe with its own ingredients and steps. A dish in the ingredient table cannot be priced, cannot carry allergens honestly, and cannot be matched against. They belong in `data/recipes/`.                                              |
| domiati cheese                                                 | **Reject — duplicate**                                | Domiati _is_ Egyptian white cheese. The catalogue already has `white-cheese` with `gebna beida`/`جبنة بيضاء`. Alias, not a row.                                                                                                                    |
| barameely cheese                                               | **Reject — a form, alias**                            | Domiati matured in barrels in brine. Saltier and firmer, but a cook reaching for white cheese would accept it (rinsed), so the interchangeability rule makes it one row. Alias on `white-cheese`.                                                  |
| istanbouly cheese                                              | **CORRECTED — alias of `white-cheese`, NOT of roumy** | **An earlier version of this document called it a variety of roumy. That was wrong.** Roumy is a hard, aged, yellow cheese; istanbouly is a soft white brined cheese of the Domiati family — a different family entirely. Alias on `white-cheese`. |
| "indomie / instant noodles" as two entries                     | **Merge**                                             | One row `instant-noodles`; `indomie`/`اندومي` is its highest-traffic alias. A genericised brand is still a brand.                                                                                                                                  |
| "vegetable oil generic"                                        | **Reject**                                            | Already reachable through `sunflower-oil` aliases. A second generic row splits matching for no gain.                                                                                                                                               |
| frozen molokhia, frozen okra, frozen spinach, frozen artichoke | **Reject as rows — make them aliases**                | See below.                                                                                                                                                                                                                                         |

### Where the proposal was right

| Proposed                                    | Verdict                         | Why                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| whole chicken (`farkha`)                    | **Accept as a row**             | A whole bird is bought, priced and cooked differently from any cut. It is _currently_ aliased to `chicken-breast`, which is the bug.                                                                                                                |
| `werk`, `sedr`                              | **Correctly aliases**           | Cuts that already exist as rows. No new concepts.                                                                                                                                                                                                   |
| gebna talaga, areesh, mish                  | **Accept as rows**              | Three genuinely different cheeses — fresh soft, curd, and fermented. Not spellings of one thing.                                                                                                                                                    |
| sole (`samak moosa`)                        | **Accept**                      | A distinct species, currently offering salmon and tilapia.                                                                                                                                                                                          |
| lupini (`termis`)                           | **Accept**                      | A distinct legume with no catalogue equivalent.                                                                                                                                                                                                     |
| red lentils vs `lentils`                    | **CORRECTED — already present** | **An earlier version proposed adding `red-lentils`. The catalogue's `lentils` row is ALREADY named "red lentils"** (`عدس`, aliases `ads`/`adas`/`عدس أحمر`). Adding a second row would duplicate it. `green-lentils` covers the hold-shape variety. |
| shawarma spice, baharat blend, zaatar blend | **Accept as rows**              | Bought as blends, not assembled. Distinct from their components.                                                                                                                                                                                    |
| corn flakes, halawa                         | **Accept**                      | Packaged products used as ingredients.                                                                                                                                                                                                              |

### The Egyptian white-cheese family, stated properly

An earlier version of §3c got this wrong in a way worth recording: it filed
**istanbouly** under roumy. Roumy is a hard, aged, yellow cheese; istanbouly is
a soft white brined cheese. They are not in the same family and one is not a
variety of the other.

Applying the interchangeability rule — _would a pantry entry under one fail to
satisfy a recipe calling for the other, and would a cook consider them
interchangeable?_ — to the white/brined group:

| Cheese                    | Verdict                 | Reasoning                                                                                                                                                                                                                                                                                     |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domiati** (دمياطي)      | alias of `white-cheese` | It _is_ the Egyptian white cheese. Already an alias.                                                                                                                                                                                                                                          |
| **Istanbouly** (إسطنبولي) | alias of `white-cheese` | A low-salt fresh variety of the same brined cheese. A cook uses it wherever white cheese is called for.                                                                                                                                                                                       |
| **Baramili** (برميلي)     | alias of `white-cheese` | Domiati matured in barrels. A form, not a concept: saltier and firmer, but interchangeable after rinsing, and the §3c form rule says a form earns a row only when a recipe genuinely requires it.                                                                                             |
| **Talaga** (طلاجة)        | **its own row**         | Assessed independently rather than collapsed for being "also white and soft". Talaga is essentially _unsalted_, sold fresh and eaten fresh; brined white cheese is salty enough to change a dish. Swapping either way is wrong, and Egyptian shops price and sell them as different products. |
| **Areesh** (قريش)         | **its own row**         | Curd cheese made from laban rayeb. Different production, different texture, different uses (salads, fatta, stuffings). Not a form of brined cheese.                                                                                                                                           |
| **Mish** (مش)             | **its own row**         | Aged and fermented in whey for months. Pungent, and nothing substitutes for it.                                                                                                                                                                                                               |

So three rows, not six, and no alias of roumy. Baramili and istanbouly are
flagged for native review: a speaker may judge baramili's salt level material
enough to deserve a qualified form.

### The fresh-versus-frozen rule

**A frozen form is an alias of the fresh ingredient unless a recipe genuinely
distinguishes them.**

In Egypt, frozen molokhia _is_ the normal form — most households never see the
fresh leaf. Creating `frozen-molokhia` as a separate row would mean a pantry
holding it fails to match a recipe calling for `molokhia`, which is the
opposite of what the user wants and a regression in matching semantics.

Only two frozen rows earn their place, and both already exist: `frozen-fries`
and `frozen-mixed-veg` — because neither has a single fresh equivalent. The
proposed frozen molokhia, okra, spinach and artichoke become aliases on their
fresh rows.

### The rules this audit establishes

Applied to every candidate before it becomes a row:

1. **Is it a dish?** If it has a recipe, it is a recipe.
2. **Is it a different name for something we have?** Then it is an alias.
   Egyptian Arabic having several words for one food is a reason to write
   several aliases, never several rows.
3. **Is it a cut or a form?** A cut earns a row only when it is bought,
   priced and cooked differently (`whole chicken` yes, `sedr` no — that one
   already has a row). A form — frozen, dried, canned — earns a row only when
   a recipe genuinely requires that form.
4. **Is it a brand?** Then it is an alias, under the generic concept.
5. **Would two rows break matching?** If a pantry entry under one would fail
   to satisfy a recipe under the other, and a cook would consider them
   interchangeable, they are one row.

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

### Photography expands with the recipes, or coverage collapses

**67 of 161 recipes have a photograph — 42%.** Adding 139 recipes with no
photographs leaves 67 of 300, which is **22%**. The catalogue would grow by 86%
and the share of recipes a user sees photographed would nearly halve. That is a
visible downgrade delivered by an expansion, and it would land on Home and
Discover first, where the geometric fallback already does the most work.

So the rule:

> **Every recipe batch produces or updates its photography backlog, and photo
> coverage is reported with the batch. A batch that lowers the coverage
> percentage is not finished.**

Concretely, per batch:

1. Run `npm run audit:photos` **after** the batch lands. It ranks
   unphotographed recipes by how often they actually reach a screen — pantry
   reach, speed, ingredient count, launch market, Discover membership — so the
   backlog re-sorts itself around the new recipes rather than appending them.
2. Record photo coverage before and after in the batch's commit message, the
   same way test counts already are.
3. **Shoot or license to hold the line at ≥42%**, prioritising the batch's own
   recipes where they rank high. 139 new recipes need roughly **58 new
   photographs** to keep coverage flat, and about **113** to reach 60%.
4. Batches whose recipes rank highest for exposure — the five-ingredient meals
   and the Egyptian core, which land on Home and in Discover's collections —
   carry the largest share of that photography, because the backlog's own
   ranking puts them at the top anyway.

| After             | Recipes | Photographed |       Coverage |
| ----------------- | ------: | -----------: | -------------: |
| Today             |     161 |           67 |            42% |
| Batches 1–2 (+75) |     236 |          ~99 | **42%** — held |
| Batches 3–6 (+64) |     300 |         ~126 | **42%** — held |
| Launch goal       |     300 |         ~180 |        **60%** |

Holding 42% is the floor, not the ambition. The point is that photography
stops being a separate project running behind the dataset and becomes part of
the definition of a finished batch.

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

## 9b. Stage 1 result: what vocabulary alone was worth

Three batches, aliases only. No canonical rows, no recipes, no schema, no
change to search or matching.

|                              |        Before |             After |                  |
| ---------------------------- | ------------: | ----------------: | ---------------- |
| Correct                      | 190/254 (75%) | **218/254 (86%)** | target ≥85% ✅   |
| — resolved directly          |           165 |           **205** |                  |
| — found via search           |            25 |                13 |                  |
| Dead ends                    |            42 |            **21** |                  |
| Wrong, same group            |             8 |             **5** |                  |
| Wrong, cross group           |            14 |            **10** | target ≤5 ❌     |
| Cross-group alias collisions |             1 |             **0** | ✅               |
| Canonical ingredients        |           257 |           **257** | unchanged ✅     |
| Aliases                      |           717 |           **997** | mean 2.79 → 3.88 |

### The ceiling, and how it is known to be a ceiling

**Every benchmark term whose concept the catalogue actually has now resolves
correctly — all 218 of them.** That is asserted, not claimed: the benchmark
splits its results on whether the expectation is `absent`, and the
non-absent failure list is empty.

So all 36 remaining failures are concepts the catalogue does not contain. No
alias can close any of them without aliasing a term to an ingredient it is
not, which is the one thing this stage was told not to do.

**This is why cross-group cannot reach ≤5 in Stage 1.** Ten of the fourteen
cross-group answers were missing concepts from the start; only four were
vocabulary gaps, and all four are fixed. The target is reachable — it just
needs Stage 2's rows, not more words.

### The three alias errors removed

Each of these was actively telling users one thing is another:

| Alias                      | Was on          | Why it was wrong                                                                                     |
| -------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `pita`                     | `baladi-bread`  | Baladi and shami are different breads, obviously so in this market, and `pita-bread` already existed |
| `حمص`                      | `hummus-dip`    | The bare Arabic word is the pulse; the dip claiming it too made resolution depend on insertion order |
| `baking soda`, `بيكربونات` | `baking-powder` | Different leaveners. Powder is soda plus an acid plus a starch; substituting either way fails a bake |

### The mistake the per-batch gate caught

I invented `bataates` as a transliteration for potato in batch 2. Egyptian
بطاطس is `batatis` (potato) and بطاطا is `bataata` (**sweet** potato) — one
letter apart. The bad spelling pulled `bataa` off sweet potato and onto potato,
and the benchmark reported it as a new same-group wrong answer before the batch
could be committed. This is the argument for measuring every batch rather than
every stage.

### Terms wanting native-speaker review

Written with reasonable confidence, but each is a judgement an Egyptian
speaker should confirm:

| Term               | Written as                        | The doubt                                                                                                                                                                    |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zaatar` / `زعتر`  | resolves to `thyme-dried`         | The herb and the sesame-and-sumac blend share the word. The blend is a genuine missing row                                                                                   |
| `زعتر بري`         | alias of `oregano` (pre-existing) | Wild thyme and oregano are close but arguably distinct                                                                                                                       |
| `shatta`           | `chili-flakes`                    | In Egypt shatta is the fresh pepper, the dried flakes AND the bottled sauce depending on the household. Modelled as `oneOf` in the benchmark, resolved to flakes in the data |
| `dibs`             | `molasses`                        | Generic syrup word; `dibs el-balah` is specifically date syrup, which is a separate row                                                                                      |
| `3weda`            | alias of `cloves`                 | Regional; common in some Egyptian households, unfamiliar in others                                                                                                           |
| `iklil el gabal`   | alias of `rosemary`               | More Levantine than Egyptian                                                                                                                                                 |
| `lift`             | alias of `turnip`                 | Correct, but collides with the English word for an elevator in a mixed-script field                                                                                          |
| `hummus` (English) | the dip, not the pulse            | Deliberate: the two languages disagree about this word                                                                                                                       |

### What Stage 1 did not and could not measure

Batches 2 and 3 added 205 aliases across 96 ingredients and moved the headline
number by zero, because batch 1 had already closed every term the benchmark
probes. Those two batches raised mean alias density from 3.08 to 3.88 and made
ten more terms resolve directly rather than through ranked search — real
improvements the 254-term set is structurally unable to score.

**This is the circularity the holdout exists for, arriving exactly on
schedule.** Nothing about Stage 1's number should be read as a launch signal.

---

## 9c. Stage 2A result: closing the benchmark's own gaps

Stage 2A was scoped to the 14 concepts the Stage 1 measurement proved were
missing outright, plus two ontology corrections, in two reviewable batches.

### The numbers

| | Stage 1 exit | Batch A `065d85f` | Batch B |
|---|---|---|---|
| Benchmark terms | 254 | 254 | **256** |
| Correct | 218 (86%) | 235 (93%) | **254 (99%)** |
| Dead ends | 21 | 15 | **0** |
| Wrong, same group | 5 | 3 | **2** |
| Wrong, **different group** (safety) | 10 | 1 | **0** |
| Failures on concepts we have | 0 | 0 | **0** |
| Canonical ingredients | 257 | 264 | **271** |
| Aliases | 997 | 1050 | **1095** |

**Read the 99% correctly: it is a ceiling effect, not a grade.** This benchmark
was written FROM the catalogue's gaps — every term in it was chosen because it
probed something suspected of being missing or wrong. Closing those gaps
exhausts the set. The score now carries no information about anything except
the gaps already known, which is precisely the circularity §3b's independent
holdout exists to break. What the set is still worth is REGRESSION: it now
fails on any wrong answer at all.

The two remaining wrong answers are `drumsticks` and `drumstick`, one open
question counted twice — see below. They are recorded in the benchmark and
left failing on purpose.

### The 14 concepts added

**Batch A** — `vine-leaves` (the ingredient; mahshi wara enab stays a recipe),
`areesh-cheese`, `mish-cheese`, `talaga-cheese`, `clotted-cream` (eshta),
`lupini-beans` (termis), `green-fava-beans` (fresh in the pod, a different
purchase from dried `fava-beans`).

**Batch B** — `whole-chicken`, `chicken-gizzards` (kawanes), `trotters`
(kawareh), `sausage-casing`, `sole-fish` (samak moosa), `halva` (halawa
tehiniya), `corn-flakes`.

Each was put through the §3c rules before it was written: not a dish, not an
alias of something we already have, not a brand, distinct enough in buying and
cooking to earn a row, and no interchangeability regression.

`sausage-casing` is the §3c rule applied literally, as instructed: the
INGREDIENT is the edible casing, with `mombar` as the household alias. Stuffed
mombar is a dish and belongs in the recipe catalogue, not here.

`corn-flakes` declares `gluten` deliberately. Mainstream corn flakes carry
barley malt, and an allergen declaration is the one field where the safe
reading wins over the pedantic one.

### The two ontology corrections

**Istamboli and Baramili are not roumy.** They are the Egyptian soft, white,
brined Domiati family. Earlier text in this document said otherwise and was
wrong. Applying the interchangeability rule, neither earned a row: both became
aliases of `white-cheese`, the row that already carries `domiati` and `feta`.
Talaga was assessed on its own terms rather than collapsed for also being white
and soft — it is essentially unsalted, which is exactly what makes swapping it
for a brined cheese wrong in both directions — and it earned a row.

**No `red-lentils` row.** The catalogue's `lentils` row is already named *red
lentils*. The earlier proposal was stale and is withdrawn.

### Whole chicken: the one that needed more than a row

`whole chicken` resolved to `chicken-breast`, with full confidence and no fuzzy
tier involved, because `chicken-breast` claimed `chicken` as an alias and
`whole` was stripped as a preparation word. **No CSV row could have fixed it**:
any alias written for a whole bird normalises to `chicken` too, and lands on
the breast again.

Three changes, each needed:

1. **`whole` is protected when it leads a phrase** (`normalise.ts`). Checked
   against every other `whole …` phrase before the change rather than after:
   `whole wheat` unchanged; `whole spices` used to resolve to `mixed spice`,
   which was WRONG — whole spices are unground, not a blend — and now suggests
   it instead; `whole tomatoes` likewise; `whole milk` stops resolving and
   suggests `milk`. Giving `milk` a `whole milk` alias was tried and removed:
   it shares its leading token with every other `whole …` phrase, so the fuzzy
   band put milk at the TOP of the results for `whole wheat` and `whole grain
   rice`. One phrase resolving is not worth four phrases answering "milk".
2. **The generic words left `chicken-breast`** — `chicken`, `فراخ`, `دجاج`,
   `firakh`. A word that names six ingredients belongs to none of them. It
   resolved to breast for no better reason than that `chicken-breast` sorts
   before `chicken-thigh`.
3. **A family-word concept** (`ingredientFamily`), because removing the alias
   broke search in a way that mattered more than the bug it fixed — see below.

`دجاجة` was proposed as an alias and rejected: ta-marbuta folding turns it into
`دجاج`, the generic word, which would have made bare "chicken" mean a whole
bird — the same lie with a different row on the end of it.

### Scope note: the family-word change was not in the plan

Removing `chicken` as an alias broke eight tests, and they were right to break.
`something without chicken` silently dropped the exclusion, and
`requiredIngredients: ['chicken']` returned nothing. Someone who says "without
chicken" and is served chicken thighs has been failed by the app.

Resolution returns ONE ingredient; the honest answer for a generic word is a
set. So `ingredientFamily(term)` returns the rows whose canonical name contains
the term as a whole token — read off the catalogue's own naming, not a
hand-kept list, so a seventh chicken row extends the family with nothing to
update. It is consulted in exactly three places:

- `recipeContains` — a family word matches any member, which is what both
  callers mean: "without chicken" rules out every cut, "with chicken" is
  satisfied by any one.
- `extractIngredients` — yields the WORD, not the family, because
  `requiredIngredients` is an AND and expanding `chicken` to six cuts would
  build a query no recipe satisfies.
- `planQuery` — nothing. SQL's `requireSlugs` is an AND and cannot express "any
  of these six", so a family word contributes nothing to the narrowing and the
  client filter enforces it, the same division of labour dislikes already use.

**It is deliberately NOT consulted by pantry matching.** Owning "chicken" is a
claim about one specific thing in a fridge, and a claim that vague is the bug
this milestone removed.

This is more than "add 14 rows", and it is recorded here rather than buried:
the alternative was to leave either the lie or the broken exclusion in place,
and neither was acceptable. No ranking or scoring rule was touched.

### Rejected, and why

- **`red-lentils`** — the row exists under the name `lentils`.
- **`istamboli`, `baramili`** — aliases of `white-cheese`, not rows.
- **`fresh white cheese`** as a talaga alias — the import guard rejected it and
  was right: `fresh` is a noise word, so it normalised to `white cheese` and
  collided with that row's own name. Talaga is precisely NOT brined white
  cheese, and the alias would have undone the distinction the row exists to
  make.
- **stuffed mombar** as an ingredient — it is a dish.
- **`دجاجة` / `dagaga`** — folds to the generic `دجاج`.
- **`whole milk`** as a milk alias — measured harm to four other phrases.
- **bare `moosa`** as a sole alias — a given name, not an ingredient word, and
  one edit from `kosa`, so it stole zucchini through the fuzzy tier. Caught by
  the benchmark on the batch it was introduced in. `koosa` and `kousa` were
  added to `zucchini` so that word resolves by alias instead of by guess.

### Stage 2B conflict, recorded not resolved — SETTLED IN STAGE 2A.1, see §9d

**`chicken-thigh` carries `drumsticks` as an alias.** Defensible — أوراك is
sold as the leg quarter, thigh and drumstick attached — but a drumstick is not
a thigh. **This must be settled BEFORE any drumstick row is added**, or the two
will fight over the word and the first-writer-wins tiebreak will decide it
arbitrarily, exactly as it decided `chicken`.

It is now IN the benchmark, labelled `absent('drumsticks', 'poultry')` and
failing, so the wrong-answer bound is 2 rather than 0. Getting it to zero was
one deletion away and that deletion is the move this benchmark was rebuilt to
make impossible.

### Terms wanting native-speaker review

- **`دجاج` (MSA) now reaches nothing at all.** Egyptian households say فراخ,
  which does surface the cuts, but the MSA word returning an empty list is a
  genuine gap. It cannot be fixed with an alias — no single row may own it, and
  the import guard enforces global alias uniqueness — so it needs the family
  concept extended to Arabic generic words, or a disambiguation affordance.
  **Stage 2B.**
- **`كوارع` vs `أكارع`** for trotters — both are used; both are aliases.
- **`ممبار` as the casing vs the stuffed dish** — the household word almost
  always means the finished dish. Modelling the casing is right for an
  ingredient ontology but a shopper typing ممبار may expect the recipe.
- **`حلاوة`** alone can mean sweetness generally; `حلاوة طحينية` is the
  product. The bare word is an alias of `halva` here.

### What Stage 2A did not do

No schema change. No change to the hosted Supabase database. No recipes. No
pricing. No ranking or scoring change. The broad ~100-row P0 expansion has not
begun.

---

## 9d. Stage 2A.1: hardening the family semantics

Stage 2A introduced family words — a word naming a SET of ingredients rather
than one — because removing `chicken` as an alias of `chicken-breast` broke
exclusion and requirement. 2A.1 hardens that mechanism, settles the drumstick,
and surveys what the heuristic had quietly started to believe.

### The family invariant now matches its own documentation

`ingredientFamily` documented that a family names more than one ingredient and
then returned one-item buckets. Harmless in effect — a singleton behaved like
an alias — and wrong in kind, because it meant a family word and an alias did
the same job through two mechanisms with two review paths. A family is now at
least **two distinct canonical ingredients**; a word heading exactly one is not
a family, and belongs in the alias column where a human reads it.

### Chicken is now declared, and bilingual

Inference reads canonical NAMES, and the two languages do not name a family the
same way. `فراخ` appears in `صدور فراخ` and `أوراك فراخ` but not in `فرخة` (a
whole bird) or `كوانس` (gizzards), so the Arabic word reached five rows where
the English word reached seven, and `دجاج` reached none at all. A user typing
فراخ and a user typing chicken are asking the same question.

So the chicken family is **declared** rather than inferred:

| | |
|---|---|
| Terms | `chicken` `فراخ` `firakh` `farakh` `دجاج` `dagag` `dajaj` |
| Members | `chicken-breast`, `chicken-thigh`, `chicken-drumstick`, `chicken-wings`, `chicken-liver`, `chicken-gizzards`, `whole-chicken` |

Three invariants are asserted, not assumed. **None of those terms may resolve
to a single ingredient** — a resolution beats a family, so one that slipped
through would silently reinstate the Stage 2A bug with a different row on the
end of it. **The member list must be complete**: any catalogue row whose name
carries a chicken token and is not listed fails the suite, so an eighth chicken
row cannot be added without someone deciding whether it belongs. And **a family
word still never fills a pantry** — `chicken` in the fridge claims no cut.

### The drumstick is settled

`drumsticks` was an alias of `chicken-thigh`, recorded in the benchmark as an
open conflict and left failing. It now has its own row:

    chicken-drumstick    chicken drumsticks / دبابيس فراخ    90 g per piece

`أوراك` stays with the thigh row — it genuinely IS the leg quarter, thigh and
drumstick attached — but the drumstick is bought, priced and cooked on its own.
The benchmark entry moved from `absent` to `canonical`, and its two terms
became four rather than being deleted.

### What the token heuristic had started to believe

`npm run audit:families` prints every family, and the first run found a live
bug rather than a theoretical one.

The inferred rule took any token shared by two canonical names, which made
every **adjective** a family. `green` meant beans, fava beans, lentils, onion
and peas. `white` meant a cheese, a bean, a pepper and an egg white. `hot` meant
a hot dog or hot sauce; `mixed`, `brown`, `black` and `ground` the same. These
reached real queries, because search extracts required ingredients from query
tokens and a requirement is a hard filter, not a boost:

| Query | Became |
|---|---|
| `green salad for 4` | must contain one of five unrelated green things |
| `white fish dinner` | must contain tilapia AND an egg white — satisfiable by nothing |
| `brown bread breakfast` | must contain baladi bread AND brown rice or brown sugar |
| `hot dinner in 20 minutes` | must contain a hot dog or hot sauce |

**The fix is one rule: an inferred family is a HEAD NOUN, not any token.** A
modifier tells you which one; only the head tells you what kind, and a family
is a kind. The head is the **last** token in English and the **first** in
Arabic, because the two languages build a noun phrase from opposite ends —
`white cheese` against `جبنة بيضاء`, `chicken breast` against `صدور فراخ`.
Reading either from the wrong end puts the adjectives straight back.

Inferred families fell from **116 to 65**, and those spanning food groups from
**77 to 37**. Every query above now behaves. It costs the English `chicken`
family, whose head is `breast` — which is exactly what the declared layer is
for, and it had to be declared for Arabic regardless.

### What survives, and is intended

`cheese` / `جبنه`, `bread` / `عيش`, `bean`, `oil` / `زيت`, `sauce` / `صوص`,
`seed`, `powder`, `milk` / `لبن`, `pepper` / `فلفل`. These are real parent
concepts: "without cheese" means all of them.

Many never fire at all, because **resolution beats a family**: `rice`, `corn`,
`water`, `bread`, `beef`, `seed`, `حمص`, `فول`, `دقيق` and `رومي` all resolve to
one ingredient, so their buckets are never consulted. That is the intended
precedence and it removes most of the remaining risk surface.

Two inferred families are mild accidents, both low-harm and left alone:
`cube` (beef cubes, stock cube) and `flake` (chili flakes, corn flakes). They
are genuine head nouns; the words are just doing double duty. Neither is a word
a cook types on its own.

### The model this is standing in for — for later approval, not now

A head noun read off a name is a heuristic standing in for a real **parent /
child relationship**, and the places it strains are visible in the audit:

- **`فول`** heads fava beans, peanuts (`فول سوداني`) and soybeans (`فول
  الصويا`). Three unrelated foods sharing a head. Only bare `فول` resolving to
  fava beans keeps this from mattering.
- **`رومي`** heads both `جبنة رومي` and `ديك رومي` — a cheese and a turkey.
  Same accident, same accidental rescue.
- **`cream`** covers clotted cream, cream and ice cream; **`pea`** covers black
  eyed peas, green peas and split peas. Defensible as families, but nothing
  distinguishes "a kind of" from "made with".

The eventual fix is an explicit `parentSlug` (or a family table) so the
catalogue states these relationships instead of having them inferred from
spelling. **That is a schema change and is not proposed here** — it belongs with
the alias table and the unknown-term table in §5, for separate approval. The
declared layer is the interim: anything the heuristic gets wrong can be stated
explicitly without new schema.

### Terms wanting native-speaker review

- **`دبابيس` / `دبابيس فراخ`** for drumsticks — the term I am most confident
  about, and still the one a native speaker should confirm first, since the
  whole row rests on it. The Franco `dababees` is my spelling of it and wants
  checking more than the Arabic does.
- **`dagag` / `dajaj`** as Franco for `دجاج` — Modern Standard rather than
  Egyptian. Included so an MSA speaker is not stranded; a native reviewer may
  prefer to drop them.
- **`farakh`** beside `firakh` — both turn up in typed Franco; neither is
  standardised.
- **`رومي` alone** currently resolves to `turkey`, not to `roumy-cheese`. At a
  deli counter the word almost certainly means the cheese. This predates Stage
  2A and is not changed here, but it looks wrong and wants a decision.

### What Stage 2A.1 did not do

No schema change. No change to the hosted Supabase database. No recipes, no
pricing, no P0 expansion. One canonical row added — the drumstick — and no
change to ranking, scoring or the fuzzy tier.

---

## 10. Staged implementation plan

Each stage ends with the probe re-run and its number recorded. No stage begins
before the previous one's number has moved.

| Stage                              | Work                                                                                                                                                                                                                                                           | Measured exit condition                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **0. Instrument**                  | ✅ Truth-labelled benchmark: five measured outcomes, the safety invariant, alias-collision checks, benchmark hygiene checks                                                                                                                                    | 75% correct / 17% dead / **14 cross-group** recorded; 1 known alias collision named                            |
| **1. Aliases only**                | ✅ **Done** — three batches, 257 ingredients unchanged, 717 → 997 aliases, three wrong aliases removed, the `حمص` collision decided                                                                                                                            | **86% correct** (target ≥85% ✅), cross-group 10 (target ≤5 ❌ — all ten are missing concepts, not vocabulary) |
| **2A. Benchmark-gap closure**      | ✅ **Done** — the 14 concepts the Stage 1 measurement proved missing, in two batches, plus the cheese and red-lentil ontology corrections and the `whole chicken` normaliser fix                                                                             | **99% correct**, dead ends **0**, **cross-group 0**; 2 wrong answers left, both the one recorded drumstick conflict                    |
| **2A.1. Family semantics**         | ✅ **Done** — family invariant fixed, chicken declared bilingually, drumstick row added and the alias conflict settled, inferred families restricted to head nouns                                                                              | **100% correct**, dead ends 0, wrong answers of any kind **0**; inferred families 116 → 65                                            |
| **2B. P0 ingredients**             | ~100 rows — revised down by §3c, which removed dishes, duplicate cheeses and frozen forms: Egyptian meat cuts, poultry cuts, the three real Egyptian cheeses, breakfast/packaged, dairy. Each at the Stage-1 alias standard and passing the §3c ontology rules | Correct **≥92%**, dead ends **≤10**, **cross-group = 0**                                                       |
| **3. Unknown-ingredient handling** | `ingredientId: string \| null` in types; custom-ingredient affordance in the picker and pantry; local tally of unmatched terms                                                                                                                                 | A typed unknown is visibly distinct, still never matches a recipe, and is counted                              |
| **4. P1 ingredients**              | ~170 rows: legumes, breads, seafood, canned, baking, condiments, international                                                                                                                                                                                 | Correct **≥95%** on the development benchmark, catalogue ~530                                                  |
| **5. Recipes to 300**              | The six batches in §8, each paired with any ingredients it needs **and its photography**                                                                                                                                                                       | Every §8 target met; ≤5-ingredient recipes ≥44; Egyptian ≥30%; **photo coverage never below 42%**              |
| **6. Prices**                      | P0 then P1 from §9, tied to the recipe batches                                                                                                                                                                                                                 | Slot coverage **≥95%**                                                                                         |
| **7. Long tail**                   | ~100 P2 rows only if the benchmark still shows gaps                                                                                                                                                                                                            | Development benchmark ≥95% sustained; stop when it plateaus                                                    |
| **8. Holdout validation**          | Collect and seal the independent holdout per §3b, label it with a native speaker, run it **once**                                                                                                                                                              | **≥90% correct and 0 cross-group on the holdout.** This, not the development benchmark, gates launch           |

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
