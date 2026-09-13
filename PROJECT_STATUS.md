# Project Status

**Read this first.** Written so another session can continue without any of the
previous session's context.

| | |
|---|---|
| **Last updated** | 2026-09-13 |
| **Current phase** | Product build-out. Phases A–H and P complete; **I–K (friends, messaging, sharing) is the next task**. See "Build-out progress". |
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
| C | `RecipeConstraints` with genuine hard filtering | **done** — one model, hard filters, honest relaxations |
| D | Database-backed recipe search | **done** — query plan, keyset paging, indexes |
| E–G | Auth hardening, profiles, storage uploads | **done** — guest choice, expiry, handles, avatars |
| H, P | Drawer navigation and information architecture | **done** — drawer wraps the tabs |
| I–K | Friends, 1-to-1 messaging, recipe sharing | **NEXT** — not started |
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

### Phase C — one constraint model, and it actually removes things

`src/features/recipes/constraints.ts` is the single shape every surface builds:
Cook, Budget, Discover, natural-language search and the saved preferences all
produce a `RecipeConstraints`, and `toConstraints(request)` is the only bridge
from the UI-level `MealRequest`. Five filters honouring slightly different
subsets of the user's requirements is exactly how "no bell pepper" returns a
recipe with bell pepper in it.

**HARD constraints remove; SOFT preferences only re-order.** `filter.ts` scores
nothing. `rank.ts` cannot resurrect anything the filter removed. Safety checks
run first so the reason shown for an empty result is the most important one.

Three severities, and the difference is load-bearing:

| Severity | Garnishes and optionals | Overridable |
|---|---|---|
| `allergy` | checked | never |
| `hard_avoid` | checked | never |
| `dislike` | not checked | yes, by the user |

An allergy does not care that the peanuts were a topping, and "leave it off" is
not a decision an app may make for someone. A dislike is a preference, so a
disliked garnish is tolerable once the user says so.

Exclusion is by canonical slug, so "bell pepper" also excludes capsicum, red
pepper, green pepper and «فلفل ألوان». Required ingredients genuinely constrain
rather than boost. `pantryMode: 'strict'` answers "what can I cook right now"
against essentials only — not optional, not garnish, not a background staple —
and an expired pantry item is not available.

When nothing matches, `suggestRelaxations` offers specific non-safety
constraints to drop with an honest per-constraint count ("drop the 20-minute
limit → 34 recipes"). `without()` has **no case** for a safety reason, so a
caller that asks for one gets the constraints back unchanged and the option
never appears.

### Phase D — the database does the narrowing

`query.ts` turns constraints into a `QueryPlan`: the subset a SQL query can
answer over an index. `RecipeRepository.search(plan)` returns one page.
`SupabaseRecipeRepository` pushes the plan into PostgREST;
`LocalRecipeRepository` runs the identical plan over the bundle, and a
property test asserts the plan is **never stricter than the constraints** — a
plan that wrongly drops a recipe silently denies a valid result and nothing
downstream would notice. That test is what caught the vegan/meat bug below.

**The client-side safety filter re-runs on every page.** Deliberate
duplication: the offline fallback has no SQL, an AI-generated recipe never
passes through SQL, and a query is a thing that can be got wrong. The database
narrows; it does not protect.

Only ABSOLUTE restrictions become SQL exclusions — a dislike stays client-side
so changing your mind costs no round trip.

Paging is keyset (`created_at|id`), not offset: an offset re-reads and re-skips
rows every page and shifts under the user when a recipe is approved mid-scroll.
`DEFAULT_PAGE_SIZE` 24, `MAX_PAGE_SIZE` 60 as a hard ceiling.

Two PostgREST limitations shaped the SQL:

- it cannot filter on an expression, so `recipes.total_minutes` is a **stored
  generated column** rather than an index on `prep_minutes + cook_minutes`;
- it cannot express "no child row matches", so exclusions resolve the offending
  recipe ids first and then `not.in` against them. Two round trips beats
  reading the whole table.

Discover and search both paginate now. Discover pushes the collection tag into
the query (`constraints.tags`) rather than filtering a fetched page — filtering
after the fact is how a page of 24 becomes 3 visible cards. Search uses
`useMealSuggestions(request, 20, { source: 'query' })`; the full catalogue is
fetched on that path **only** when a search comes back empty, to count honest
relaxation options.

Two real bugs this phase found:

- **`MEAT_SLUGS` was six hard-coded slugs** written when the catalogue had 14
  recipes. Beef steak, lamb, veal, turkey and duck were added to the ingredient
  catalogue later and were silently vegan as far as the diet check was
  concerned — a vegan user was shown a beef stir-fry. Both meat and seafood
  sets are derived from `INGREDIENT_CATALOGUE` now, with a named regression
  test.
- **Every generated ingredient line carried `ingredientId: 'undefined'`** — the
  importer emitted `entry.id` and catalogue entries have no `id`. Nothing read
  it, so nothing failed; the first symptom would have been saving a recipe,
  where it is written into a `uuid` column. It is now the same
  `uuidv5('ingredient:<slug>')` the seed generator uses, so the bundle and
  Postgres agree on identity.

The importer also formats its output with the repo's Prettier now, because
`npm run format` and `recipes:import --check` were otherwise able to contradict
each other with no change to the data behind either.

### Phases E–G — accounts, identity and photographs

**Phase E fixed three conflations**, each of which had a visible symptom.

*Signed out* vs *chose to stay signed out.* A signed-out launch fell through
the routing gate into onboarding, so nobody ever answered the welcome screen —
the silent bypass the brief names. `features/auth/guest-mode.ts` records the
choice and it survives a relaunch; the gate now shows the welcome screen
exactly once, and a guest is never asked again until they sign in.

*Signed out* vs *expired.* Supabase emits `SIGNED_OUT` whether the user pressed
a button or a refresh token was rejected. `AuthProvider` keeps a
`deliberateSignOut` ref so it can tell them apart, and exposes
`signedOutReason: 'never' | 'guest' | 'signed_out' | 'expired'`. An expired
session is not a wall — local data keeps working — but the profile screen says
what happened instead of "Sign in to sync your pantry".

*Cooked history* vs *nothing to migrate.* `migrateGuestData` looked at the
pantry, saved recipes and shopping list and returned early when all three were
empty, so a guest who had cooked a dozen recipes and saved none signed up to
two empty Saved tabs. Cooked and viewed history migrate now. Dislikes
deliberately do not: they feed ranking rather than a screen, and carrying a
wrong one across quietly suppresses recipes.

**Phase F is a public half of a profile that cannot leak the private half.**

`profiles` stays own-row-only — no RLS policy was loosened. What another user
sees is `public_profiles`, a view whose columns are **written out one at a
time**, so the complete set of things you can learn about somebody is
reviewable in ten seconds and a sensitive column added to `profiles` later
cannot leak through a `select *`. A database test asserts the exact eight
columns; it fails if anyone widens it.

The handle's uniqueness key folds case AND strips dots and underscores.
`omar.hassan`, `omar_hassan` and `omarhassan` are otherwise three registrations
that let one person be mistaken for another in a friend request, and the person
impersonated has no way to notice. The typed form is what gets displayed.
`username_available()` is a security-definer function returning a boolean for
one exact handle and never a row, so it cannot be turned into a directory.

Visibility is `public | friends | private`; `friends` currently resolves
strictly narrower than `public` (the friendship table does not exist yet),
which is the safe direction to be wrong in. City is opt-in separately, being
the one field that narrows down where a person actually is.

**Phase G: uploads that never trust the client.**

Three buckets. `avatars` is public — a face next to a name in a friend list
should not cost a signed URL per row. `recipe-uploads` is **not** public,
because a submission under review must not be reachable by URL or moderation
is advisory. `recipe-images` is public and has read policies **only**: a user
who could write there could publish an image the review queue never saw.

Ownership is by path. Every user-writable object lives under `<uid>/…` and the
policies compare the first segment to `auth.uid()`, so a client that invents a
path outside its own folder is rejected by Postgres rather than by a check it
could skip. 20 database assertions cover it, including traversal-shaped paths.

Client-side, `features/storage/images.ts` holds every rule as a pure function
and `upload.ts` is a shell with no decisions in it. The order matters: validate
the ORIGINAL (so a 40MB panorama is rejected before three seconds of
re-encoding, and so a file cannot sneak past by compressing well), re-encode to
a bounded JPEG, then upload to a path we generated.

**The user's filename is never used** — not sanitised, not slugified. It is
attacker-controlled text that would end up in a URL, a Content-Disposition
header, and a path a storage policy parses to decide ownership; generating the
whole name removes the class of question. Re-encoding is also what strips EXIF,
and an avatar is the most likely thing in this app to be published with
someone's home address attached.

SDK 57 notes for whoever touches this next: `manipulateAsync` is **deprecated**
— the current API is `ImageManipulator.manipulate(uri)` → `.resize()` →
`.renderAsync()` → `.saveAsync()`. `ImagePicker.MediaTypeOptions` is deprecated
too; pass `mediaTypes: ['images']`. `new File(uri).bytes()` returns a
**Promise**, and the supabase upload signature is loose enough to accept an
unawaited one and upload nothing useful.

---

### Phases H and P — a drawer around the tabs

`app/(drawer)/(tabs)/` — the drawer wraps the tab group rather than replacing
it. Both are route GROUPS, so every URL is unchanged and the deep links still
resolve. The drawer contains exactly one route, the tab group, because it is a
way of REACHING screens rather than a second place for them to live; its rows
push onto the root stack.

The information-architecture decision (P) is the reason it exists. Five bottom
tabs is the right size for the core food experience, and the moment Friends,
Messages, Submit a Recipe and Admin Review need a home the tempting move is a
sixth tab and then a seventh — which is how "What should I eat?" stops being
the obvious thing on screen. The tabs keep the food; everything secondary,
social or account-shaped goes in the drawer.

Rows appear only when their destination exists. `SOCIAL_ROWS` is an empty array
today: a greyed-out "Friends" that does nothing teaches the user the app is
unfinished, while an absent one teaches nothing, which is correct until Phase I
lands. Adding them is one array literal.

Two things worth not re-deriving:

**`drawerPosition` is deliberately not set.** React Navigation already flips
the drawer to the right when `I18nManager.isRTL`, so `isRTL ? 'right' : 'left'`
double-flips it — and on web that did not merely mirror the drawer, it
displaced the entire content pane off the viewport. A 390pt-wide screen
rendered its pantry-editor close button at x=653, so every control on every
screen became unclickable in Arabic while nothing looked broken in a
screenshot. The smoke suite now asserts the content pane stays on screen.

**A closed drawer is off-screen, not hidden.** React Navigation keeps it
mounted and slides it away with a transform, so it is in the DOM and in the
accessibility tree the whole time. `AppDrawerContent` sets `aria-hidden` /
`accessibilityElementsHidden` when `useDrawerStatus()` is not `open`; without
that a screen-reader user anywhere in the app could swipe into "Home, Discover,
Pantry, Log out" with no drawer visible. It is also why the smoke suite
asserts the drawer's POSITION rather than its visibility — a visibility
assertion passes whatever the drawer is doing.

`/settings/about` came with the drawer's Help row, and it does something the
brief's Phase T also wants: it reports which capabilities are actually live —
accounts, sync, AI — reading what `env` resolved rather than what someone
intended. A status screen that lies is worse than none.

---

## Last known passing state

Verified on `claude/expo-rn-setup-mom5gw` (also the repository's default
branch):

| Check | Command | Result |
|---|---|---|
| App typecheck | `npx tsc --noEmit` | **pass**, 0 errors |
| Script typecheck | `npx tsc --noEmit -p scripts/tsconfig.json` | **pass**, 0 errors |
| Lint | `npx eslint . --max-warnings=0` | **pass**, 0 errors, 0 warnings |
| Unit + component tests | `npm test` | **pass**, 539/539 across 31 suites, 2 projects |
| Database + RLS suite | `./scripts/db-test.sh` | **pass**, 108 assertions across four files |
| Edge function types | `npm run fn:check` | **pass** |
| Edge function tests | `npm run fn:test` | **pass**, 5/5 |
| Catalogue / price / recipe / type drift | `ingredients:import --check`, `prices:import --check`, `recipes:import --check`, `db:types:check` | **pass** |
| Web production bundle | `npx expo export --platform web` | **pass** |
| Whole-app browser walk | `npm run smoke:web` | **pass**, 66 interaction checks, no page errors |
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
tabs, opening and clearing filters, saving a shopping-list item, opening the
drawer and navigating from it, switching language and reading the rendered
Arabic back, and a deep link surviving a reload.

It needs a browser driver, deliberately not a dependency of the app:

```bash
npm i -D playwright-core && npx playwright install chromium
npm run smoke:web
```

`CHROMIUM_PATH` and `PLAYWRIGHT_CORE` override discovery when a browser already
exists (which is how it runs in this sandbox).

**It has caught nine bugs no unit test would have.** Most recently: a drawer
`drawerPosition` that double-flipped under RTL and pushed every screen off the
viewport in Arabic, the pantry add sheet crashing into the error boundary, and
`Alert.alert` silently doing nothing on web so every confirmation in the app
was dead.

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
seven settings screens; auth screens; edit-profile (`/settings/profile`) and
another user's public profile (`/u/[username]`).

### Domain engines — pure, offline, unit-tested
| Module | Responsibility |
|---|---|
| `ingredients/normalise.ts` | Arabic-aware canonicalisation, prompt sanitisation |
| `ingredients/matching.ts` | Alias resolution, availability index, match percentage |
| `ingredients/freshness.ts` | Expiry buckets; expired items never counted |
| `pricing/units.ts` | Unit conversion, serving scaling, kitchen fractions |
| `pricing/price-book.ts` | `PriceBook` interface, country support, staleness |
| `pricing/estimate.ts` | Deterministic costing, completeness, budget verdicts |
| `recipes/constraints.ts` | The one constraint model every surface builds |
| `recipes/filter.ts` | Hard filtering only. Removes; never scores |
| `recipes/safety.ts` | Allergen, diet and appliance predicates, derived from the catalogue |
| `recipes/rank.ts` | Ranking on the survivors. Cannot resurrect anything |
| `recipes/query.ts` | Constraints → query plan, keyset paging |
| `profile/handle.ts` | Handle folding and validation, mirroring the DB constraints |
| `storage/images.ts` | Upload rules, resize targets, generated object paths |
| `search/interpret.ts` | Deterministic constraint extraction, incl. exclusions |
| `grocery/` | `GroceryProvider` adapter + registry + mock |
| `ai/schema.ts` | The model contract; generates its own JSON Schema |

### Data, and where it lives
Everything a person edits is a data file, not code:

| Data | Source | Generated into | Command |
|---|---|---|---|
| Ingredients (257) | `data/ingredients/catalogue.csv` | `catalogue.generated.ts` | `npm run ingredients:import` |
| Prices (69) | `data/prices/eg.csv` | `pricing/price-data.ts` | `npm run prices:import` |
| Recipes (153) | `data/recipes/*.json` | `recipes/catalogue.generated.ts` | `npm run recipes:import` |
| Database seed | the three above | `supabase/seed.sql` | `npm run seed:generate` |

Each importer validates and refuses bad input, and CI fails on drift. **257
ingredients recognised, 69 priced** — recognition and pricing are deliberately
separate concerns, and an unpriced ingredient is a supported state.

### Release
`eas.json`, `EAS.md`, CI (typecheck, lint, tests, Deno check + tests, four
drift checks, bundle, database suite, database-type drift), a GitHub Pages
preview workflow, and `SECURITY_REVIEW.md`.

The database suite is four files now — `01_rls_test.sql`, `02_query_test.sql`,
`03_profile_privacy_test.sql`, `04_storage_test.sql` — and `db-test.sh` runs
every `supabase/tests/0[1-9]*.sql` in order, so adding a fifth needs no script
change. `00_platform_shim.sql` recreates the `auth` AND `storage` schemas so
the policies can be exercised against a plain Postgres in CI; it is never
applied to a real Supabase project.

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

## Where this session stopped

**Latest commit on `claude/expo-rn-setup-mom5gw`: see `git log -1`.** Phases A
through G are complete and verified. Everything below is where a new session
picks up.

### THE SINGLE NEXT ACTION

**Phase I — friends.** It unblocks J (messaging), K (sharing to a friend) and
the `friends` visibility setting that already exists but currently resolves
strictly narrower than `public`.

What it needs:

1. `friend_requests` and `friendships` as normalised tables, plus `blocks`.
   Store a friendship once, not twice — a `(least(a,b), greatest(a,b))` unique
   key is the usual way, and it makes "are these two friends?" a single lookup.
2. Constraints that make the impossible states impossible in Postgres rather
   than in the client: no self-request, no duplicate pending request in either
   direction, no duplicate friendship, no request between blocked users.
3. RLS: a user reads only requests they sent or received, and only their own
   friendships. **Never client-side.** Adversarial tests in a new
   `supabase/tests/05_friends_test.sql`, in the style of the existing four.
4. Search by handle — `SupabaseProfileRepository.search()` already exists and
   paginates.
5. Send / accept / decline / cancel / unfriend, and block / unblock. Three
   lists: Friends, Incoming, Sent.
6. Then widen the `friends` branch in the `public_profiles` view. That is one
   line and it is deliberately the LAST step, not the first.
7. Add the `Friends` row to `SOCIAL_ROWS` in `drawer-content.tsx`.

### What is NOT done, and is deliberately waiting

- **Roles.** The drawer's `Admin Review` row needs a server-authoritative role
  (USER / MODERATOR / ADMIN). That is Phase N and the brief is explicit it must
  not be a client-side boolean. `SOCIAL_ROWS` in `drawer-content.tsx` is empty
  precisely so no row appears before its destination and its permission do.
- **`visibility = 'friends'`** resolves strictly narrower than `public` in the
  `public_profiles` view, because there is no friendship table yet. Widening
  that line is a deliberate part of Phase I.
- **Recipe photographs.** The image architecture, provenance columns and
  buckets are all in place and every recipe carries licensed metadata, but no
  actual image files have been produced. `RecipeImage` is the single seam.
- **Avatars in the preview.** `EXPO_PUBLIC_DEMO_MODE` exists in `env.ts` but no
  seeded demo users use it yet; that is Phase T.

### Credentials this needs and does not have

Nothing built so far is blocked, but three things are inert without config:

| What | Needs | Behaviour without it |
|---|---|---|
| Accounts, profiles, handles, uploads | A Supabase project (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) | `isEnabled` is false; the app runs fully on local data and the UI says so rather than pretending |
| AI recipe generation | `ANTHROPIC_API_KEY` on the edge functions | Local catalogue answers every screen |
| Recipe image CDN | `EXPO_PUBLIC_RECIPE_IMAGE_BASE_URL`, or the Supabase Storage host | `resolveRecipeImageUrl` returns null and the branded fallback renders |

### CI

Green as of the last push. Two earlier commits (`c9a3063`, `d7b0fed`) failed on
a single error — `scripts/import-recipes.ts(466,48): Property 'id' does not
exist on type 'CatalogueIngredient'` — fixed in `a22d001`. The typecheck step
runs `tsc --noEmit && tsc --noEmit -p scripts/tsconfig.json` and every later
step is skipped when it fails, so **run `npm run typecheck`, not `npx tsc
--noEmit`**: the latter does not cover `scripts/`.

### Things left undone on purpose

- **Cook and Budget rank the whole catalogue** rather than paging. Their
  requests barely narrow anything and the ordering is the product, so
  `useMealSuggestions` defaults to `source: 'catalogue'`. Revisit past a few
  thousand recipes.
- **`results.relaxCollection`** is wired through `RELAXATION_LABEL` but no
  screen reaches it: Discover recovers from an empty collection with its own
  "Clear filters" action. The label exists because the reason has to exhaust a
  `Record<RejectionReason, …>` and mapping it to `null` would mean "safety,
  never offered", which is untrue of a collection tag.
- **`npm run format:check` fails on 88 files** and did before this work began.
  It is not in CI.

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
