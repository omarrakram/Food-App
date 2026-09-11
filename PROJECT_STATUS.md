# Project Status

**Read this first.** Written so another session can continue without any of the
previous session's context.

| | |
|---|---|
| **Last updated** | 2026-09-11 |
| **Current phase** | All 10 phases implemented. Remaining work is credential-gated or polish. |
| **App name** | Akla (working name — see "Renaming") |
| **Stack** | Expo SDK 57 · React Native 0.86 · React 19.2 · Expo Router 57 · TypeScript 6 (strict) · Supabase · TanStack Query 5 · Zod 4 · Anthropic (Claude) via Edge Functions |
| **Launch market** | Egypt · EGP · English UI with partial Arabic |

---

## Last known passing state

Verified at commit `9d72f4d` (HEAD of `claude/expo-rn-setup-mom5gw`):

| Check | Command | Result |
|---|---|---|
| App typecheck | `npx tsc --noEmit` | **pass**, 0 errors |
| Script typecheck | `npx tsc --noEmit -p scripts/tsconfig.json` | **pass**, 0 errors |
| Lint | `npx eslint . --max-warnings=0` | **pass**, 0 errors, 0 warnings |
| Unit + component tests | `npm test` | **pass**, 239/239 across 16 suites |
| Database + RLS suite | `./scripts/db-test.sh` | **pass**, 40/40 assertions |
| Web production bundle | `EXPO_OFFLINE=1 npx expo export --platform web` | **pass** |
| Full flow walked in a browser | `npm run smoke:web` | **pass** — 14 screens, no page errors |
| `npm run verify` | typecheck + lint + test | **pass** |
| Native production build | `eas build` | **not run** — needs an EAS project id |

### Environment note (Claude Code Web)

`api.expo.dev` and `docs.expo.dev` are blocked by this environment's egress
proxy. **Prefix every Expo CLI command with `EXPO_OFFLINE=1`** — it resolves
versions from `node_modules/expo/bundledNativeModules.json` instead. `WebSearch`
works; the npm registry is reachable; `WebFetch` to `platform.claude.com` works.

Deno is not installed here, so the edge functions are **type-checked only by
the shared schema module they import** (`src/features/ai/schema.ts`, covered by
27 tests). Run `supabase functions serve` locally before relying on them.

---

## End-to-end verification

The Jest suite renders components; it never renders the app. `npm run smoke:web`
does: it exports the web bundle, serves it, and walks a headless browser from
onboarding through cooking mode, the budget flow and every tab, capturing 14
screenshots and failing on any page error.

It needs a browser driver, deliberately **not** a dependency of the app:

```bash
npm i -D playwright-core && npx playwright install chromium
npm run smoke:web            # add --keep to leave dist/ in place
```

`CHROMIUM_PATH` and `PLAYWRIGHT_CORE` override discovery when a browser is
already on the machine (which is how it runs in this sandbox).

**It has paid for itself four times.** None of these were visible to a unit
test; all are fixed:

1. Every disabled control rendered at full opacity — `PressScale`'s animated
   style is applied after the static one, so the wrapper's
   `opacity: disabled ? 0.45 : 1` was overwritten each frame. Disabled opacity
   now lives inside `PressScale` (`disabledOpacity`) and composes with the
   press dim in the worklet.
2. Finishing onboarding bounced back to step one — `(onboarding)/index.tsx` and
   `(tabs)/index.tsx` both resolve to `/`. The onboarding screen is now
   **`(onboarding)/onboarding.tsx`** and the gate in `src/app/_layout.tsx`
   replaces to `/onboarding`. *Route groups may not both contain an `index`.*
3. Estimates read "~142.04 EGP", claiming piastre precision for a survey figure
   scaled by a serving count. `formatPricedAmount` now rounds estimates to
   whole units; live prices keep their piastres. Amounts under one unit keep
   decimals, so a 50-piastre pinch of salt is not doubled to "~1 EGP".
4. Every text field drew two focus rings on web — react-native-web's DOM
   `<input>` outline inside the component's own focused border. Reset on web
   only.

Two notes for whoever runs this next. React Native Web's `TextInput` ignores
Playwright's `fill()` — use `pressSequentially()`, which is what a user does
anyway. And blocked `images.unsplash.com` requests are this environment's
egress proxy, not the app; the script filters them out.

---

## What is built

### Foundation
Design tokens, semantic light/dark palettes, persisted theme preference; typed
i18n (English source of truth, partial Arabic with English fallback, plurals,
RTL detection); a full UI kit (Text, Button, Card, Chip, Badge, Input, Stepper,
SegmentedControl, ListRow, Sheet, Toast, Skeleton, empty/error states, Screen
containers).

### Screens
Bottom tabs (Home, Discover, Pantry, Saved, Profile) with a custom animated tab
bar; cook-with-what-I-have and eat-within-my-budget flows with a shared sortable
results view; recipe detail with have/need split, serving scaling and step
check-off; distraction-free cooking mode; natural-language search; shopping
list; 11-step resumable onboarding; seven settings screens; auth screens.

### Domain engines — pure, offline, unit-tested
| Module | Responsibility |
|---|---|
| `ingredients/normalise.ts` | Arabic-aware canonicalisation, prompt sanitisation |
| `ingredients/matching.ts` | Alias resolution, availability index, match percentage |
| `ingredients/freshness.ts` | Expiry buckets; expired items never counted |
| `pricing/units.ts` | Unit conversion, serving scaling, kitchen rounding |
| `pricing/price-book.ts` | `PriceBook` interface + bundled Egyptian estimates |
| `pricing/estimate.ts` | Deterministic costing, budget verdicts |
| `recipes/rank.ts` | Hard filters (allergens, diet, appliances) + weighted ranking |
| `search/interpret.ts` | Deterministic constraint extraction from free text |
| `grocery/` | `GroceryProvider` adapter + registry + mock |
| `ai/schema.ts` | The model contract; generates its own JSON Schema |

### Data
10 migrations; RLS on every table with a test that fails if a new table arrives
without it; `supabase/seed.sql` **generated** from the TypeScript catalogues
(69 ingredients, 14 recipes); local and Supabase repositories behind one
interface per collection; guest→account migration on first sign-in.

### Auth
Email signup with confirmation, sign-in, password reset, password update,
resend confirmation, sign-out, permanent account deletion.

### AI
`ai-suggest` and `ai-interpret` edge functions calling Claude with a JSON Schema
constraint, Zod validation, one informed retry, then fallback to local results.
Rate-limited and accounted per user. The key exists only server-side.

### Release
`eas.json` (development / preview / production), `EAS.md`, CI running
typecheck + lint + tests + bundle + a seed-drift check + the database suite on
a real Postgres, and `SECURITY_REVIEW.md`.

---

## Remaining work

### Credential-gated (nothing to build until these exist)
1. **Supabase project** — accounts, sync and edge functions are inert without
   it. The app runs fully on local data meanwhile.
2. **`ANTHROPIC_API_KEY`** — generation is inert without it; local catalogue
   results still answer every screen.
3. **EAS project id** — `npx eas init`, then native builds work.
4. **Apple / Google developer accounts** — store submission.
5. **Grocery provider agreements** — a commercial blocker, not a technical one.

### Buildable now
| Item | Notes |
|---|---|
| Component tests for Pantry, RecipeCard, Onboarding, Cooking mode | Harness and conventions are in place; see TEST_PLAN.md § 3 for the two RNTL v14 traps |
| Integration tests against a local Supabase | Sign-up → onboarding → pantry → suggestions; guest→account migration |
| Arabic translation completion | ~40% covered; untranslated keys fall back to English |
| Recipe imagery | Unsplash URLs need replacing with owned/licensed assets on a CDN |
| Designed app icon | Current mark is generated by `scripts/generate-icons.py` — intentional-looking, but placeholder |
| Apple / Google sign-in | Scaffolded; `socialAuthAvailability()` returns false without client ids |
| Price survey | Estimates are illustrative, dated 2026-08-01 |

---

## Known issues

| # | Issue | Impact |
|---|---|---|
| 1 | Recipe images are hot-linked Unsplash URLs | Fine for development; licence review needed before launch |
| 2 | Arabic covers ~40% of keys | Falls back to English; nothing breaks |
| 3 | RTL needs an app restart | Stated in the UI; `I18nManager.forceRTL` cannot apply live |
| 4 | `database.types.ts` is hand-maintained | Drift is a runtime error TypeScript cannot catch. `npm run db:types` once a project exists |
| 5 | Price estimates are illustrative | Always rendered as estimates, so honest — but needs a real survey |
| 6 | Guest-saved AI recipes do not migrate on sign-in | They have no server row to reference; catalogue recipes do migrate |
| 7 | Edge functions are not executed in CI | No Deno in this environment. Their shared schema module is unit-tested; run `supabase functions serve` before trusting a change |
| 8 | Rate-limit counters fail open | Deliberate — see SECURITY_REVIEW.md finding 2 |

No known crashes. No known data-loss paths. One security finding was found and
fixed during review (SECURITY_REVIEW.md finding 1).

---

## Architectural decisions worth not re-litigating

1. **Local-first behind one interface per collection.** The app works fully
   signed out; sign-in is a migration, not a reset; no screen knows whether it
   reads AsyncStorage or Postgres.
2. **The model never decides a fact software can compute.** Availability, match
   percentage, cost, allergen safety and expiry are deterministic code. Claude
   generates and interprets; it does not price or adjudicate safety.
3. **`PriceTag` is the only price renderer.** That is what makes
   "estimated ≠ live" enforceable rather than a convention. Displayed
   precision is part of that claim: estimates render to whole units, live
   prices to the piastre.
4. **Money is an integer count of minor units.** No floats.
5. **Allergens filter, never rank** — and are applied twice, once to the
   catalogue and again after AI generation, through the same code path.
6. **RLS is the entire client-side security boundary**, so it is tested like
   one: 40 assertions including forged foreign keys and a coverage check.
7. **Seed data is generated from TypeScript**, and CI fails if it drifts.
8. **Recipe ids are deterministic UUIDv5**, so a recipe saved offline is the
   same row after sign-in.
9. **The budget reaches the model as a band, never an amount** — a model shown
   prices starts quoting them.

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
npm run seed:generate               # regenerate supabase/seed.sql from TS
./scripts/db-test.sh                # migrations + seed + 40 RLS assertions
python3 scripts/generate-icons.py   # regenerate the placeholder icons
npm run smoke:web                   # export + walk the whole app in a browser
EXPO_OFFLINE=1 npx expo export --platform web
```

The database suite needs a Postgres reachable via `PGHOST`/`PGPORT`;
`supabase/tests/00_platform_shim.sql` recreates `auth.users`, `auth.uid()` and
the Supabase roles, so plain Postgres is enough.
