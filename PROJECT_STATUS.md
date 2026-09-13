# Project Status

**Read this first.** Written so another session can continue without any of the
previous session's context.

| | |
|---|---|
| **Last updated** | 2026-09-11 |
| **Current phase** | Product build-out. Phase A (recipe catalogue) complete; see "Build-out progress". |
| **App name** | Akla (working name — see "Renaming") |
| **Stack** | Expo SDK 57 · React Native 0.86 · React 19.2 · Expo Router 57 · TypeScript 6 (strict) · Supabase · TanStack Query 5 · Zod 4 · Anthropic (Claude) via Edge Functions |
| **Launch market** | Egypt · EGP · English and Arabic, both complete **including the food itself** (see "Localisation") |

---

## Build-out progress

The product is moving past MVP: a real catalogue, real filtering, accounts,
profiles, social features and community submissions. Phases run in order
because each depends on the one before it.

| Phase | What | State |
|---|---|---|
| A | 150+ structured recipes with an import/validation pipeline | **done** — 153 recipes |
| B | Recipe image architecture with provenance and licensing | **done** — manifest + resolver; assets pending |
| C | `RecipeConstraints` with genuine hard filtering | in progress |
| D | Database-backed recipe search | not started |
| E–G | Auth hardening, profiles, storage uploads | not started |
| H, P | Drawer navigation and information architecture | not started |
| I–K | Friends, 1-to-1 messaging, recipe sharing | not started |
| L–N | Community submissions, moderation, admin | not started |
| O | In-app notifications | not started |
| Q–U | Privacy, security, performance, preview, tests | not started |

### Phase A — the recipe catalogue

**The recipes are DATA.** `data/recipes/*.json`, one file per cuisine, compiled
into `src/features/recipes/catalogue.generated.ts` by `npm run recipes:import`
and into `supabase/seed.sql` by `npm run seed:generate`. Adding a recipe is a
JSON object; it is never a TypeScript literal in a component.

153 recipes: egyptian 32, levantine 22, american 18, asian 18, mediterranean
18, italian 16, indian 11, mexican 9, turkish 9. Every one carries an English
and an Arabic title, description and every cooking step.

**Every ingredient line references the canonical ingredient catalogue by slug.**
That is what makes exclusion, requirement, pantry matching, pricing and Arabic
naming work at all — a free-text ingredient is invisible to every engine in the
product. `recipe_ingredients` additionally distinguishes three things that
`is_optional` alone was conflating: optional, garnish, and pantry staple.

The importer is a gate, not a formatter. It refuses to emit on: a duplicate or
near-duplicate title (Dice coefficient ≥ 0.86 on normalised titles), an unknown
ingredient slug, an allergen the ingredients imply but the recipe does not
declare, a diet tag the ingredients contradict, servings/times/nutrition
outside believable bounds, a step referencing an ingredient the recipe does not
list, an untranslated step, or image metadata without a licence.

It found four real allergen-declaration bugs in the original 14 recipes on its
first run: butter, bread, yogurt and cheese present but undeclared. Runtime
allergen filtering reads ingredient-implied allergens too, so users were
protected — but the declared list is what feeds the indexed database filter, so
those were real gaps for server-side filtering.

`npm run recipes:import -- --check` runs in CI.

---

## Last known passing state

Verified on `claude/expo-rn-setup-mom5gw` (also the repository's default
branch):

| Check | Command | Result |
|---|---|---|
| App typecheck | `npx tsc --noEmit` | **pass**, 0 errors |
| Script typecheck | `npx tsc --noEmit -p scripts/tsconfig.json` | **pass**, 0 errors |
| Lint | `npx eslint . --max-warnings=0` | **pass**, 0 errors, 0 warnings |
| Unit + component tests | `npm test` | **pass**, 394/394 across 23 suites, 2 projects |
| Database + RLS suite | `./scripts/db-test.sh` | **pass**, 45/45 assertions |
| Edge function types | `npm run fn:check` | **pass** |
| Edge function tests | `npm run fn:test` | **pass**, 5/5 |
| Catalogue / price / type drift | `ingredients:import --check`, `prices:import --check`, `db:types:check` | **pass** |
| Web production bundle | `npx expo export --platform web` | **pass** |
| Whole-app browser walk | `npm run smoke:web` | **pass**, 59 interaction checks, no page errors |
| Native production build | `eas build` | **not run** — needs an EAS project id |

### The test suite runs on two platforms

`npm test` runs two Jest projects. `native` is the component suite as before.
`web` runs `*.web.test.tsx` under `jest-expo/web`, where `.web.tsx` wins module
resolution exactly as it does in Metro.

That project exists because of a real crash: a `.web.tsx` file re-exported from
`'./date-field'`, which on web resolves back to **itself**. TypeScript and the
native Jest project both resolve that specifier to the `.tsx` sibling, so
neither could see it. Only a web-platform resolver can.

### Running the database suite in this sandbox

No Postgres runs by default. Start one as the `postgres` user (initdb refuses
to run as root):

```bash
export PATH=/usr/lib/postgresql/16/bin:$PATH
useradd -m postgres 2>/dev/null; mkdir -p /tmp/pgdata; chown postgres /tmp/pgdata
su postgres -c "PATH=$PATH initdb -D /tmp/pgdata -U postgres -A trust"
su postgres -c "PATH=$PATH pg_ctl -D /tmp/pgdata -o '-k /tmp -p 55432 -c listen_addresses=127.0.0.1' -l /tmp/pg.log start"
PGHOST=/tmp PGPORT=55432 PGUSER=postgres ./scripts/db-test.sh
```

### Environment notes (Claude Code Web)

- `api.expo.dev` and `docs.expo.dev` are blocked. **Prefix Expo CLI commands
  with `EXPO_OFFLINE=1`** — it resolves versions from
  `node_modules/expo/bundledNativeModules.json` instead.
- `images.unsplash.com` and `deno.land` are blocked. Deno is installed from npm
  (`deno@2.9.6`) instead, and `--min-dep-age 0` is required because the sandbox
  pins a minimum dependency age.
- **Docker is unavailable**, so `supabase gen types` cannot run here. CI runs it
  instead — see "Database types" below.

---

## End-to-end verification

`npm run smoke:web` exports the web bundle, serves it, and drives a headless
browser through what a person actually does — not just what routes exist. 53
assertions cover onboarding, the pantry add/edit/delete flow from **both**
entry points and its staple rules, ingredient selection and removal, the Saved
tabs, opening
and clearing filters, saving a shopping-list item, switching language and
reading the rendered Arabic back, and a deep link surviving a reload.

It needs a browser driver, deliberately not a dependency of the app:

```bash
npm i -D playwright-core && npx playwright install chromium
npm run smoke:web
```

`CHROMIUM_PATH` and `PLAYWRIGHT_CORE` override discovery when a browser already
exists (which is how it runs in this sandbox).

**It has caught eight bugs no unit test would have.** Most recently: the pantry
add sheet crashing into the error boundary, and `Alert.alert` silently doing
nothing on web so every confirmation in the app was dead.

It used to only visit routes, and reported green while tapping "+" on the
Pantry crashed. Visiting a route proves the route renders and nothing more, so
every check here now asserts on the *result* of an interaction. Two further
notes for whoever runs it next — React Native Web's `TextInput` ignores
Playwright's `fill()` (use `pressSequentially`), and blocked remote image
requests are the sandbox's egress policy, not the app.

---

## What is built

### Screens
Bottom tabs (Home, Discover, Pantry, Saved, Profile); cook-with-what-I-have and
eat-within-my-budget flows with a shared sortable results view; recipe detail
with have/need split, serving scaling and step check-off; distraction-free
cooking mode; natural-language search; shopping list; **six-step** onboarding;
seven settings screens; auth screens.

### Domain engines — pure, offline, unit-tested
| Module | Responsibility |
|---|---|
| `ingredients/normalise.ts` | Arabic-aware canonicalisation, prompt sanitisation |
| `ingredients/matching.ts` | Alias resolution, availability index, match percentage |
| `ingredients/freshness.ts` | Expiry buckets; expired items never counted |
| `pricing/units.ts` | Unit conversion, serving scaling, kitchen fractions |
| `pricing/price-book.ts` | `PriceBook` interface, country support, staleness |
| `pricing/estimate.ts` | Deterministic costing, completeness, budget verdicts |
| `recipes/rank.ts` | Hard filters (allergens, diet, flags, appliances) + ranking |
| `search/interpret.ts` | Deterministic constraint extraction, incl. exclusions |
| `grocery/` | `GroceryProvider` adapter + registry + mock |
| `ai/schema.ts` | The model contract; generates its own JSON Schema |

### Data, and where it lives
Everything a person edits is a data file, not code:

| Data | Source | Generated into | Command |
|---|---|---|---|
| Ingredients (257) | `data/ingredients/catalogue.csv` | `catalogue.generated.ts` | `npm run ingredients:import` |
| Prices (69) | `data/prices/eg.csv` | `pricing/price-data.ts` | `npm run prices:import` |
| Database seed | the two above | `supabase/seed.sql` | `npm run seed:generate` |

Each importer validates and refuses bad input, and CI fails on drift. **257
ingredients recognised, 69 priced** — recognition and pricing are deliberately
separate concerns, and an unpriced ingredient is a supported state.

### Release
`eas.json`, `EAS.md`, CI (typecheck, lint, tests, Deno check + tests, three
drift checks, bundle, database suite, database-type drift), a GitHub Pages
preview workflow, and `SECURITY_REVIEW.md`.

---

## Preview status

**Live at https://omarrakram.github.io/Food-App/** — open it on a phone, no
install, no account, no key.

`.github/workflows/preview.yml` builds and deploys on every push to
`claude/expo-rn-setup-mom5gw` (markdown-only changes excluded). Pages is
enabled and deploying; nothing manual is needed again unless the repository's
Pages source is changed.

Deep links and refresh work because the export is built for the subpath it is
served from (`EXPO_WEB_BASE_URL` → `experiments.baseUrl`) and Expo's static
output writes one HTML file per route. `404.html` is a copy of `index.html`, so
a stale bookmark reaches the app rather than GitHub's error page. Nothing
rewrites the URL at runtime — doing so breaks React Navigation.

The workflow refuses to publish if the bundle contains a secret-shaped string;
no secrets are provided to it, and the app falls back to its bundled catalogue
without a backend.

The earlier Claude Artifact is not a substitute: artifacts are private, so a
phone browser that is not signed in to claude.ai gets a 404.

---

## Remaining work

### Credential-gated (nothing to build until these exist)
1. **Supabase project** — accounts, sync and edge functions are inert without
   it. The app runs fully on local data meanwhile.
2. **`ANTHROPIC_API_KEY`** — generation is inert; local catalogue results still
   answer every screen.
3. **EAS project id** — `npx eas init`, then native builds work.
4. **Apple / Google developer accounts** — store submission.
5. **Grocery provider agreements** — commercial, not technical.

### Buildable now
| Item | Notes |
|---|---|
| Recipe photography | `RecipeImage` is the single seam; set `imageUrl` and every screen picks it up. Until then a designed branded fallback is used |
| Price survey refresh | Edit `data/prices/eg.csv`, run `npm run prices:import -- --date=YYYY-MM-DD` |
| Designed app icon | Current mark is generated by `scripts/generate-icons.py` |
| Integration tests against a local Supabase | Sign-up → onboarding → pantry → suggestions; guest→account migration |
| Apple / Google sign-in | Scaffolded; `socialAuthAvailability()` returns false without client ids |

---

## Known issues

| # | Issue | Impact |
|---|---|---|
| 1 | Price estimates are illustrative, surveyed 2026-08-01 | Always rendered as estimates, with a staleness warning past 180 days — but needs a real survey before launch |
| 2 | 188 of 257 ingredients have no price | By design. The UI says "Price estimate unavailable" rather than guessing |
| 3 | `database.types.ts` is hand-maintained | CI now diffs it against the real schema, so drift fails the build rather than surfacing at runtime |
| 4 | Recipe imagery is a branded placeholder | Deliberate: no hot-linking, no licence exposure. Needs owned assets |
| 5 | Edge functions are type-checked and unit-tested but never executed against Claude in CI | Needs an API key. Run `supabase functions serve` before trusting a change |
| 6 | AI-generated recipes render in English for an Arabic reader | Deliberate. The model answers in one language and we do not machine-translate a cooking step or a safety note behind the user's back. Asking the model for Arabic directly is the fix, and is a feature, not a bug fix |

No known crashes. No known data-loss paths. No open security findings.

Deep links under the GitHub Pages subpath are checked separately, by serving
`dist/` behind `/Food-App` exactly as Pages does: the root, a tab deep link, a
nested settings route, a reload of each, and an unknown path landing on the
`404.html` copy of `index.html` rather than a blank page.

### Fixed in this pass

| Was | Root cause | Fix |
|---|---|---|
| Pantry "+" crashed into the error boundary | `date-field.web.tsx` re-exported from `'./date-field'`, which on web resolves to **itself** — the re-export became a getter returning itself and the first call blew the stack | Helpers moved to `date-field.shared.ts`, which has no platform suffix and so cannot be resolved to a platform variant. Covered by a web-platform Jest project and by the smoke test |
| Every confirmation in the app did nothing on web | `Alert.alert` is a silent no-op in react-native-web — exiting cooking mode, signing out, deleting an account and clearing history were all dead | `src/lib/confirm.ts`: the platform dialog on native, `window.confirm` on web |
| Arabic UI rendered in English | Recipe content, ingredient names and units were data and code, not dictionary keys | See "Localisation" |
| Discover's zero-result state had no way out | The collection filter had no "everything" state to return to | An "Everything" chip, and a one-tap reset inside the empty state whenever a collection is active |
| Selected ingredients were easy to miss | A soft tint, a few pixels from rows of unselected pills that are also pill-shaped | Solid fill, a tick, and an explicit "remove {name}" accessibility label |
| An Arabic keyboard could not search | Every pattern in `interpretQuery` was `\d`, which is ASCII-only | Arabic-Indic digits normalised before parsing |

---

## Architectural decisions worth not re-litigating

1. **Local-first behind one interface per collection.** The app works fully
   signed out; sign-in is a migration, not a reset.
2. **The model never decides a fact software can compute.** Availability, match
   percentage, cost, allergen safety and expiry are deterministic code.
3. **`PriceTag` is the only price renderer**, and a price carries its own
   completeness. A total assembled from incomplete data can only grow, so
   "over budget" stays assertable and "within budget" does not.
4. **Money is an integer count of minor units.** Estimates render to whole
   units; live prices keep their piastres.
5. **Diet is two things.** An exclusive eating style, and flags (halal, keto)
   that coexist with it and each other.
6. **Allergens filter, never rank** — applied to the catalogue and again after
   AI generation, through the same code path.
7. **A perishable is never an assumed staple.** Enforced in the data, in the
   availability engine, and in the importer.
8. **RLS is the entire client-side security boundary**, so it is tested like
   one: 45 assertions including forged foreign keys and a coverage check.
9. **Recognition and pricing are separate data.** Adding a food must never
   require inventing a price for it.
10. **Recipe ids are deterministic UUIDv5**, so a recipe saved offline is the
    same row after sign-in.
11. **The budget reaches the model as a band, never an amount.**
12. **Deep links are a hosting concern.** The web build is configured for the
    path it is served from; nothing rewrites the URL at runtime, because doing
    so breaks React Navigation.
13. **A module with two platform implementations keeps its shared code in a
    third file with no platform suffix.** `'./x'` inside `x.web.tsx` resolves
    to itself on web; a suffix-free module cannot be resolved to a variant, so
    the ambiguity cannot come back. This cost the pantry add screen once.
14. **Ingredient names are stored in English and translated at render.**
    Matching, pricing and the shopping list all key off one spelling; a pantry
    written in Arabic must still match a recipe written in English.

---

## Localisation

**Key parity was never the finish line.** The dictionary hit 468/468 while the
rendered Arabic app still showed English everywhere it mattered: every recipe
title, description and cooking step; every ingredient name; every unit ("300 g",
"4 cloves"); the search examples; the expiry and protein filter chips; the
currency code. A rendered audit of every major screen found **158 lines of
Latin script**; it now finds one, and that one is deliberate.

Four layers, because the English came from four different places:

1. **UI copy** — `src/i18n/locales/{en,ar}.ts`. `ar` is typed as a total
   record, so a missing translation is a compile error, and seven runtime
   assertions cover what types cannot: empty values, stale keys, both halves of
   every plural, invented placeholders, and English left in place.
2. **Ingredient names** — `data/ingredients/catalogue.csv` carries `name_ar`
   for all 257 entries. Names are **stored** canonically in English so matching
   stays language-blind (an Arabic pantry must still match an English recipe);
   `features/ingredients/display.ts` is the only thing that turns one into what
   the user reads.
3. **Recipe content** — titles, descriptions, steps and safety notes have their
   own Arabic columns (`title_ar`, `description_ar`, `instruction_ar`,
   `safety_note_ar`) in the fixtures, the migrations and the seed.
   `features/recipes/localise.ts` chooses between them, and also holds the
   shared phrasebook for preparations ("finely chopped" → «مفروم ناعم»), which
   are repeated vocabulary rather than per-recipe prose.
4. **Units and money** — `unitLabel` and `formatQuantity` take the translator;
   `currencySymbol` renders ج.م rather than "EGP".

**Nullable on purpose.** An AI-generated recipe comes back in one language, and
machine-translating a cooking step — where "simmer" and "boil" are different
instructions, and a safety note is a safety note — is not something to do
silently. Null means "no Arabic yet" and the renderer falls back to English.

Three things stop this regressing:

- An **ESLint rule** (`no-restricted-syntax`, `src/**/*.tsx`) fails the build
  when a literal English string reaches a user-facing prop. Every leak above
  was invisible to the dictionary check because none of it was ever a key.
- `features/recipes/__tests__/localise.test.ts` asserts every curated recipe,
  step, safety note (**including its temperatures**), ingredient name and
  preparation phrase has Arabic.
- `npm run smoke:web` reads the rendered Arabic recipe, cook and pantry screens
  and fails on any Latin character.

**The one deliberate exception** is "English" on the language picker: a language
is named in its own language. It is listed in the parity test's
`intentionallyLatin` set along with the brand names and an email example.

Arabic is written for an Egyptian consumer rather than transliterated. The
`_one` plural forms deliberately omit `{count}`, because Arabic lexicalises the
singular («طبق واحد»). `interpretQuery` normalises Arabic-Indic digits before
parsing, so "أقل من ١٥٠ جنيه" is understood — before that every number pattern
was `\d`, which is ASCII-only, and an Arabic keyboard produced nothing.

RTL applies at native startup, so the Language screen detects a pending
direction change and offers the restart directly (expo-updates on native, a
plain reload on web).

---

## Renaming

Three places: `app.json` (`name`, `slug`, `scheme`, bundle identifiers), the
`common.appName` key in `src/i18n/locales/{en,ar}.ts`, and `name` in
`package.json`.

---

## Commands

```bash
npm install
cp .env.example .env.local          # optional — the app runs without it

EXPO_OFFLINE=1 npx expo start       # EXPO_OFFLINE only needed behind a proxy
npm run verify                      # typecheck + lint + test
npm run smoke:web                   # export + drive the app in a real browser
npm test -- --selectProjects web     # the web-platform Jest project on its own

npm run fn:check                    # type-check the edge functions (Deno)
npm run fn:test                     # run their tests

npm run ingredients:import          # data/ingredients/catalogue.csv -> TS
npm run prices:import               # data/prices/eg.csv -> TS
npm run seed:generate               # regenerate supabase/seed.sql
./scripts/db-test.sh                # migrations + seed + 45 RLS assertions

npm run db:types:from-url           # regenerate Supabase types (needs Docker)
python3 scripts/generate-icons.py   # regenerate the placeholder icons
```
