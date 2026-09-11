# Project Status

**Read this first.** Written so another session can continue without any of the
previous session's context.

| | |
|---|---|
| **Last updated** | 2026-09-11 |
| **Current phase** | Post-review refinement pass complete. Remaining work is credential-gated. |
| **App name** | Akla (working name — see "Renaming") |
| **Stack** | Expo SDK 57 · React Native 0.86 · React 19.2 · Expo Router 57 · TypeScript 6 (strict) · Supabase · TanStack Query 5 · Zod 4 · Anthropic (Claude) via Edge Functions |
| **Launch market** | Egypt · EGP · English and Arabic, both complete |

---

## Last known passing state

Verified at commit `4fa46a2` on `claude/expo-rn-setup-mom5gw` (also the
repository's default branch):

| Check | Command | Result |
|---|---|---|
| App typecheck | `npx tsc --noEmit` | **pass**, 0 errors |
| Script typecheck | `npx tsc --noEmit -p scripts/tsconfig.json` | **pass**, 0 errors |
| Lint | `npx eslint . --max-warnings=0` | **pass**, 0 errors, 0 warnings |
| Unit + component tests | `npm test` | **pass**, 361/361 across 21 suites |
| Database + RLS suite | `./scripts/db-test.sh` | **pass**, 45/45 assertions |
| Edge function types | `npm run fn:check` | **pass** |
| Edge function tests | `npm run fn:test` | **pass**, 5/5 |
| Web production bundle | `npx expo export --platform web` | **pass** |
| Whole-app browser walk | `npm run smoke:web` | **pass**, 14 screens, no page errors |
| Native production build | `eas build` | **not run** — needs an EAS project id |

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

`npm run smoke:web` exports the web bundle, serves it, and walks a headless
browser from onboarding through cooking mode, the budget flow and every tab,
capturing 14 screenshots and failing on any page error.

It needs a browser driver, deliberately not a dependency of the app:

```bash
npm i -D playwright-core && npx playwright install chromium
npm run smoke:web
```

`CHROMIUM_PATH` and `PLAYWRIGHT_CORE` override discovery when a browser already
exists (which is how it runs in this sandbox).

**It has caught six bugs no unit test would have.** Most recently: a servings
stepper reading "2 2 people", and every disabled control drawing at full
opacity. Two notes for whoever runs it next — React Native Web's `TextInput`
ignores Playwright's `fill()` (use `pressSequentially`), and blocked remote
image requests are the sandbox's egress policy, not the app.

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

**Phone preview is one click away and blocked on that click.**

`.github/workflows/preview.yml` builds the app and deploys it to GitHub Pages
at `https://omarrakram.github.io/Food-App/`. The repository is public so Pages
is free, deep links and refresh work (the export is built for the subpath it is
served from, and Expo's static output writes one HTML file per route), and the
workflow refuses to publish if the bundle contains a secret-shaped string.

Every run so far has failed at one step: **GitHub Pages is not enabled.**
Creating a Pages site is not something a workflow's own `GITHUB_TOKEN` may do
(`Resource not accessible by integration`), and a PAT that could would be a far
larger credential than this warrants.

> **The one action needed:** repository **Settings → Pages → Build and
> deployment → Source: GitHub Actions**. Then re-run the "Web preview"
> workflow. Nothing else is required — no account, no key, no install.

The earlier Claude Artifact is not a substitute: artifacts are private, so a
phone browser that is not signed in to claude.ai gets a 404.

---

## Remaining work

### Credential-gated (nothing to build until these exist)
1. **GitHub Pages enabled** — one click, above. Blocks the phone preview.
2. **Supabase project** — accounts, sync and edge functions are inert without
   it. The app runs fully on local data meanwhile.
3. **`ANTHROPIC_API_KEY`** — generation is inert; local catalogue results still
   answer every screen.
4. **EAS project id** — `npx eas init`, then native builds work.
5. **Apple / Google developer accounts** — store submission.
6. **Grocery provider agreements** — commercial, not technical.

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

No known crashes. No known data-loss paths. No open security findings.

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

---

## Localisation

**Both locales are complete: 468 keys, English and Arabic.** `ar` is typed as a
total record, so a missing translation is a compile error, and seven runtime
assertions cover what types cannot — empty values, stale keys, both halves of
every plural, invented placeholders, and English left in place.

Arabic is written for an Egyptian consumer rather than transliterated. The
`_one` plural forms deliberately omit `{count}`, because Arabic lexicalises the
singular («طبق واحد»).

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
npm run smoke:web                   # export + walk the whole app in a browser

npm run fn:check                    # type-check the edge functions (Deno)
npm run fn:test                     # run their tests

npm run ingredients:import          # data/ingredients/catalogue.csv -> TS
npm run prices:import               # data/prices/eg.csv -> TS
npm run seed:generate               # regenerate supabase/seed.sql
./scripts/db-test.sh                # migrations + seed + 45 RLS assertions

npm run db:types:from-url           # regenerate Supabase types (needs Docker)
python3 scripts/generate-icons.py   # regenerate the placeholder icons
```
