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

| Proposed                                                       | Verdict                                | Why                                                                                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bechamel, mahshi filling, besara, koshari sauce, ful mix       | **Reject — these are dishes**          | Each is a recipe with its own ingredients and steps. A dish in the ingredient table cannot be priced, cannot carry allergens honestly, and cannot be matched against. They belong in `data/recipes/`. |
| domiati cheese                                                 | **Reject — duplicate**                 | Domiati _is_ Egyptian white cheese. The catalogue already has `white-cheese` with `gebna beida`/`جبنة بيضاء`. This is an alias, not a row.                                                            |
| barameely cheese                                               | **Reject — a form, not a concept**     | White cheese aged in barrels. Same ingredient, different maturation. Alias.                                                                                                                           |
| istanbouly cheese                                              | **Reject — a variety**                 | A variety of roumy. Alias on `roumy-cheese`.                                                                                                                                                          |
| "indomie / instant noodles" as two entries                     | **Merge**                              | One row `instant-noodles`; `indomie`/`اندومي` is its highest-traffic alias. A genericised brand is still a brand.                                                                                     |
| "vegetable oil generic"                                        | **Reject**                             | Already reachable through `sunflower-oil` aliases. A second generic row splits matching for no gain.                                                                                                  |
| frozen molokhia, frozen okra, frozen spinach, frozen artichoke | **Reject as rows — make them aliases** | See below.                                                                                                                                                                                            |

### Where the proposal was right

| Proposed                                    | Verdict               | Why                                                                                                                                  |
| ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| whole chicken (`farkha`)                    | **Accept as a row**   | A whole bird is bought, priced and cooked differently from any cut. It is _currently_ aliased to `chicken-breast`, which is the bug. |
| `werk`, `sedr`                              | **Correctly aliases** | Cuts that already exist as rows. No new concepts.                                                                                    |
| gebna talaga, areesh, mish                  | **Accept as rows**    | Three genuinely different cheeses — fresh soft, curd, and fermented. Not spellings of one thing.                                     |
| sole (`samak moosa`)                        | **Accept**            | A distinct species, currently offering salmon and tilapia.                                                                           |
| lupini (`termis`)                           | **Accept**            | A distinct legume with no catalogue equivalent.                                                                                      |
| red lentils vs `lentils`                    | **Accept**            | A cooking-behaviour distinction: red lentils dissolve, green hold shape. `green-lentils` already exists, so this is consistent.      |
| shawarma spice, baharat blend, zaatar blend | **Accept as rows**    | Bought as blends, not assembled. Distinct from their components.                                                                     |
| corn flakes, halawa                         | **Accept**            | Packaged products used as ingredients.                                                                                               |

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

## 10. Staged implementation plan

Each stage ends with the probe re-run and its number recorded. No stage begins
before the previous one's number has moved.

| Stage                              | Work                                                                                                                                                                                                                                                           | Measured exit condition                                                                                        |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **0. Instrument**                  | ✅ Truth-labelled benchmark: five measured outcomes, the safety invariant, alias-collision checks, benchmark hygiene checks                                                                                                                                    | 75% correct / 17% dead / **14 cross-group** recorded; 1 known alias collision named                            |
| **1. Aliases only**                | ✅ **Done** — three batches, 257 ingredients unchanged, 717 → 997 aliases, three wrong aliases removed, the `حمص` collision decided                                                                                                                            | **86% correct** (target ≥85% ✅), cross-group 10 (target ≤5 ❌ — all ten are missing concepts, not vocabulary) |
| **2. P0 ingredients**              | ~100 rows — revised down by §3c, which removed dishes, duplicate cheeses and frozen forms: Egyptian meat cuts, poultry cuts, the three real Egyptian cheeses, breakfast/packaged, dairy. Each at the Stage-1 alias standard and passing the §3c ontology rules | Correct **≥92%**, dead ends **≤10**, **cross-group = 0**                                                       |
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
