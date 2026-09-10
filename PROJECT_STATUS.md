# Project Status

**Read this first.** It is written so another session can pick the work up
without any of the previous session's context.

| | |
|---|---|
| **Last updated** | 2026-09-10 |
| **Current phase** | Phase 3 complete → Phase 6 (AI edge functions) next |
| **App name** | Akla (working name — see "Renaming" below) |
| **Stack** | Expo SDK 57 · React Native 0.86 · React 19.2 · Expo Router 57 · TypeScript 6 (strict) · Supabase · TanStack Query 5 · Zod 4 |
| **Launch market** | Egypt · EGP · English UI with partial Arabic |

---

## Last known passing state

Verified at commit `65b12f5`:

| Check | Command | Result |
|---|---|---|
| App typecheck | `npx tsc --noEmit` | **pass**, 0 errors |
| Script typecheck | `npx tsc --noEmit -p scripts/tsconfig.json` | **pass**, 0 errors |
| Lint | `npx eslint . --max-warnings=0` | **pass**, 0 errors, 0 warnings |
| Web production bundle | `EXPO_OFFLINE=1 npx expo export --platform web` | **pass**, 32 routes exported |
| Database + RLS suite | `./scripts/db-test.sh` | **pass**, 37/37 assertions |
| Jest unit tests | `npm test` | **NOT YET WRITTEN** — Phase 10 |

`npm run verify` runs typecheck + lint + jest. It will fail today only because
no Jest tests exist yet (Jest exits non-zero with no test files).

### Environment note (Claude Code Web)

`npx expo install` and `npx expo export` reach `api.expo.dev`, which is blocked
by this environment's egress proxy. **Prefix every Expo CLI command with
`EXPO_OFFLINE=1`.** It resolves compatible versions from
`node_modules/expo/bundledNativeModules.json` instead. `docs.expo.dev` is also
blocked; `WebSearch` works and the npm registry is reachable.

---

## What is built and working

### Foundation (Phase 1) — complete
- Design tokens (`src/theme/tokens.ts`), semantic light + dark palettes, a
  `ThemeProvider` with a persisted system/light/dark preference.
- i18n from the first commit: typed keys, English as the source of truth,
  partial Arabic with automatic English fallback, plural resolution, RTL
  detection, locale-aware number and date formatting.
- UI kit in `src/components/ui/`: Text, Button, IconButton, Card, Chip, Badge,
  Input, Stepper, SegmentedControl, ListRow/ListGroup, Sheet, Toast, Skeleton
  (with card/row variants), EmptyState, ErrorState, Screen containers, Section,
  Divider, PressScale.

### Navigation and screens (Phase 2) — complete
Bottom tabs (Home, Discover, Pantry, Saved, Profile) with a custom animated tab
bar, plus: cook flow + results, budget flow + results, recipe detail, cooking
mode, search, shopping list, onboarding, and seven settings screens.

### Domain engines — complete, all pure and offline
| Module | Responsibility |
|---|---|
| `features/ingredients/normalise.ts` | Arabic-aware canonicalisation, prompt sanitisation |
| `features/ingredients/matching.ts` | Alias resolution, availability index, match percentage |
| `features/ingredients/freshness.ts` | Expiry buckets; expired items are never counted |
| `features/pricing/units.ts` | Unit conversion, serving scaling, kitchen-friendly rounding |
| `features/pricing/price-book.ts` | `PriceBook` interface + bundled Egyptian estimates |
| `features/pricing/estimate.ts` | Deterministic recipe costing, budget verdicts |
| `features/recipes/rank.ts` | Hard filters (allergens, diet, appliances) + weighted ranking |
| `features/search/interpret.ts` | Deterministic natural-language constraint extraction |

### Data (Phase 3) — complete
- 9 migrations in `supabase/migrations/`: enums, profiles + preferences,
  ingredients, recipes, pantry/saved/shopping, pricing + grocery scaffolding,
  AI usage, RLS, account lifecycle.
- RLS on every table, verified by a test that fails if a new table is added
  without it.
- `supabase/seed.sql` is **generated** from the TypeScript catalogues
  (`npm run seed:generate`) — 69 ingredients, 14 recipes. Never edit it by hand.
- Local and Supabase repositories behind one interface per collection;
  `RepositoryProvider` picks between them.
- Guest → account data migration on first sign-in.

### Auth (Phase 3) — complete
Email signup with confirmation, sign-in, password reset, password update,
resend confirmation, sign-out, permanent account deletion.

### Onboarding and preferences (Phase 4) — complete
11-step progressive flow with a resumable draft; everything after the name is
skippable; all answers editable later in Profile.

### Pantry (Phase 5) — complete
CRUD, categories, expiry with expired/expiring-soon surfacing, staples,
autocomplete against the catalogue, optimistic updates, cook-from-pantry.

### Saved and shopping list (Phase 9) — complete
Save/unsave, recently viewed, cooked history, shopping list with automatic
duplicate merging (2 tomatoes + 3 tomatoes = 5 tomatoes), check-off, estimated
total, and the store-mapping fields a grocery provider will need.

---

## In progress / not started

### Phase 6 — AI edge functions · **NOT STARTED** ← next
Recipe suggestions currently come from the local catalogue only
(`useMealSuggestions` in `src/features/recipes/hooks.ts` wraps
`useLocalSuggestions` and is the single place AI results need to merge in).

To build:
1. `supabase/functions/ai-suggest/` — recipe generation. Must: verify the JWT,
   rate-limit from `ai_usage_events`, sanitise user text, request structured
   output, validate with Zod, retry once on malformed output, fall back to
   local results, write a usage row.
2. `supabase/functions/ai-interpret/` — natural-language fallback for queries
   `interpretQuery` scores below `LOW_CONFIDENCE` (0.34).
3. Client: `src/features/ai/client.ts` calling `supabase.functions.invoke`,
   plus schema definitions shared with the functions.
4. **Re-apply the allergen filter after generation** — `rankRecipes` already
   does this; route generated recipes through it rather than around it.

### Phase 8 — grocery provider adapters · **PARTIAL**
The database scaffolding, the reserved `ShoppingListItem` fields and the UI
("Order ingredients" explains it is not live) all exist. Still to write:
`src/features/grocery/` with the `GroceryProvider` interface and
`MockGroceryProvider`. No real provider — see Required credentials.

### Phase 10 — testing, hardening, release · **PARTIAL**
Done: the 37-assertion database/RLS suite, strict typecheck, zero-warning lint,
a verified production web bundle.

Not done:
- **Jest unit tests.** Jest and Testing Library are installed and configured in
  `package.json`, but `jest.setup.ts` does not exist yet and no test files are
  written. See TEST_PLAN.md for the intended coverage.
- `eas.json` and EAS project id (`app.json` has a placeholder).
- App icon and splash are still the Expo template art.
- CI workflow.

---

## Known issues and limitations

| # | Issue | Impact | Where |
|---|---|---|---|
| 1 | No Jest tests exist, so `npm run verify` fails at the test step | Blocks the definition of done | Phase 10 |
| 2 | Recipe images are hot-linked Unsplash URLs | Fine for development; needs a CDN bucket and licence review before launch | `src/features/recipes/fixtures.ts` |
| 3 | Arabic covers ~40% of keys | Untranslated keys fall back to English, so nothing breaks | `src/i18n/locales/ar.ts` |
| 4 | RTL needs an app restart to take effect | Stated in the UI (`language.restartNotice`); `I18nManager.forceRTL` cannot apply live | `src/i18n/index.tsx` |
| 5 | `database.types.ts` is hand-maintained | Drift from the migrations is a runtime error TypeScript will not catch. Run `npm run db:types` once a project exists | `src/lib/supabase/database.types.ts` |
| 6 | Price estimates are illustrative, dated 2026-08-01 | Always rendered as estimates, so it is honest — but they need a real survey before launch | `src/features/ingredients/catalogue.ts` |
| 7 | Guest AI-generated saved recipes do not migrate on sign-in | They have no server row to reference; catalogue recipes do migrate | `features/data/migrate-guest-data.ts` |
| 8 | Apple/Google sign-in is scaffolded but not implemented | `socialAuthAvailability()` returns false without client ids | `features/auth/auth-provider.tsx` |
| 9 | The web build is a development/preview target | Session tokens fall back to `localStorage` there; mobile uses the keychain | `lib/supabase/secure-storage.ts` |

No known crashes. No known data-loss paths.

---

## Required credentials and external setup

Nothing below blocks development — every one of them has a working local
substitute today.

| What | Needed for | Status | How to obtain |
|---|---|---|---|
| **Supabase project** | Accounts, sync, edge functions | Not created | supabase.com → new project → Settings → API. Put the URL and anon key in `.env.local`. Without it the app runs on local data with sign-in hidden. |
| **`ANTHROPIC_API_KEY`** | AI recipe generation | Not set | console.anthropic.com. **Server-side only** — `supabase secrets set ANTHROPIC_API_KEY=…`. Never as `EXPO_PUBLIC_*`. |
| **EAS project id** | Native builds | Placeholder in `app.json` | `npx eas init` |
| **Apple Developer** ($99/yr) | iOS TestFlight and App Store | Not set up | developer.apple.com |
| **Google Play Developer** ($25 once) | Android release | Not set up | play.google.com/console |
| **Google / Apple OAuth client ids** | Social sign-in | Not set up | Optional. Leave blank and the buttons stay hidden. |
| **Grocery provider agreements** | Ordering, live prices | **Commercial blocker** | Carrefour Egypt, Talabat Mart, Breadfast, Instashop each need a partnership before any API credential exists. This cannot be solved in code, which is why V1 ships the adapter layer and a disabled mock. |
| **Recipe image licensing** | Production images | Not resolved | Replace the Unsplash URLs with owned or licensed assets in a CDN bucket. |

---

## Important architectural decisions

1. **Local-first, with the same interface for both backends.** Repository
   interfaces let the app work fully signed out and make sign-in a migration
   rather than a reset. No screen knows whether it is reading AsyncStorage or
   Postgres.
2. **The model never decides a fact software can compute.** Availability,
   match percentage, cost, allergen safety and expiry are all deterministic
   code. Claude generates recipes and interprets language; it does not price
   them or decide whether they are safe.
3. **`PriceTag` is the only price renderer.** It is what makes
   "estimated ≠ live" enforceable rather than a convention someone forgets.
4. **Money is an integer count of minor units.** No floats anywhere.
5. **Allergens are a filter, never a ranking weight**, and are applied twice —
   once to the catalogue, once again after AI generation.
6. **RLS is the entire security boundary** for the client, so it is tested
   like one: 37 assertions including forged foreign keys and a check that
   fails if any table is added without RLS enabled.
7. **Seed data is generated from TypeScript**, so the app's offline catalogue
   and the database cannot drift.
8. **Recipe ids are deterministic UUIDv5**, so a recipe saved offline from the
   bundled fixtures is the same row after sign-in.
9. **Custom tab bar over the platform default**, so the active-tab treatment
   and theme tokens are exactly what the design calls for.

---

## Renaming the app

Three places: `app.json` (`name`, `slug`, `scheme`, bundle identifiers), the
`common.appName` key in `src/i18n/locales/{en,ar}.ts`, and the `name` field in
`package.json`. Nothing else hard-codes it.

---

## Commands

```bash
npm install
cp .env.example .env.local          # fill in if you have a Supabase project

EXPO_OFFLINE=1 npx expo start       # dev server (EXPO_OFFLINE only needed here)
npm run typecheck                   # app + scripts
npm run lint
npm test
npm run verify                      # typecheck + lint + test

npm run seed:generate               # regenerate supabase/seed.sql from TS
./scripts/db-test.sh                # migrations + seed + 37 RLS assertions
EXPO_OFFLINE=1 npx expo export --platform web    # production bundle check
```

Running the database suite needs a Postgres reachable via `PGHOST`/`PGPORT`;
`supabase/tests/00_platform_shim.sql` recreates `auth.users`, `auth.uid()` and
the Supabase roles so plain Postgres is enough.
