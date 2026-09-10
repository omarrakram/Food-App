# Akla

**Know what to eat, tonight.**

A mobile app that answers *"what should I eat?"* from what is already in your
kitchen, what is in your wallet, and what your body and diet allow. Built for
Egypt first, in EGP, with the architecture to add other markets.

> **Akla** is a working name (Egyptian Arabic: *أكلة*, "a dish"). Renaming it
> touches three files — see PROJECT_STATUS.md § Renaming.

---

## Documentation

| File | Read it for |
|---|---|
| **PROJECT_STATUS.md** | **Start here.** Current state, what is next, known issues, credentials needed |
| ARCHITECTURE.md | How the system fits together and why the boundaries sit where they do |
| PRODUCT_SPEC.md | What the product does and the rules it will not break |
| DATABASE_SCHEMA.md | Tables, policies, indexes, and the reasoning |
| DEVELOPMENT_PLAN.md | The ten phases and their exit criteria |
| TEST_PLAN.md | What is tested, what is not yet, and the rules |

---

## Stack

Expo SDK 57 · React Native 0.86 · React 19.2 · Expo Router 57 · TypeScript 6
(strict) · Supabase (Postgres, Auth, Edge Functions) · TanStack Query 5 · Zod 4
· Reanimated 4 · EAS Build

---

## Local development

### Requirements
- Node 22+
- An iOS or Android device with Expo Go, or a simulator
- *(optional)* Docker + Supabase CLI for a local database
- *(optional)* Postgres client (`psql`) to run the database test suite

### Setup

```bash
git clone <repo> && cd Food-App
npm install
cp .env.example .env.local
```

`.env.local` is optional. **With no Supabase credentials the app still runs
fully** — pantry, recipes, budgeting, shopping list and cooking mode all work
on local storage, and sign-in hides itself. Fill it in when you want accounts
and sync.

### Run

```bash
npx expo start          # then press i / a, or scan the QR code
npx expo start --ios
npx expo start --android
npx expo start --web
```

> **In restricted network environments** (including Claude Code Web), prefix
> Expo CLI commands with `EXPO_OFFLINE=1`. `api.expo.dev` is commonly blocked,
> and offline mode resolves versions from the local SDK manifest instead.

### Checks

```bash
npm run typecheck     # app + build scripts
npm run lint
npm test
npm run verify        # all three

npm run format
```

---

## Database

### Against a hosted Supabase project

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push          # apply migrations
psql "$DATABASE_URL" -f supabase/seed.sql
npm run db:types         # regenerate src/lib/supabase/database.types.ts
```

### Locally

```bash
npm run db:start         # supabase start
npm run db:reset         # re-apply migrations + seed
```

### Regenerating the seed

`supabase/seed.sql` is **generated** — the app bundles the same ingredient and
recipe data for offline use, and generation is what stops the two drifting.

```bash
npm run seed:generate    # from src/features/{ingredients,recipes}
```

Edit `src/features/ingredients/catalogue.ts` or
`src/features/recipes/fixtures.ts`, regenerate, and commit both.

### Database and RLS test suite

```bash
PGHOST=/tmp PGPORT=5432 PGUSER=postgres ./scripts/db-test.sh
```

Applies every migration and the seed to a throwaway database and runs 37
assertions covering cross-user isolation, forged foreign keys, reference-data
immutability, rate-limit tamper resistance and account-deletion cascade. Plain
Postgres is enough — `supabase/tests/00_platform_shim.sql` recreates the pieces
of the Supabase platform the schema depends on.

---

## Edge functions

Secrets live only here, never in the app bundle.

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy

# locally
npm run fn:serve         # reads supabase/functions/.env (git-ignored)
```

---

## Environment variables

`.env.example` documents every variable. The rule that matters:

- `EXPO_PUBLIC_*` is **embedded in the shipped app bundle**. Only the Supabase
  URL, the anon key, feature flags and OAuth client ids belong there. The anon
  key is safe *only because RLS is enabled on every table*.
- Everything else — `ANTHROPIC_API_KEY`, the service-role key, grocery provider
  credentials — is a Supabase Function secret and must never be prefixed with
  `EXPO_PUBLIC_`.

`src/lib/config/env.ts` can only read `EXPO_PUBLIC_*` variables, so a secret
cannot be imported into client code by accident.

---

## Production builds

```bash
npm install -g eas-cli
eas login
eas init                                    # writes the project id into app.json

eas build --profile preview  --platform all      # internal distribution
eas build --profile production --platform all    # store-ready

eas submit --platform ios
eas submit --platform android
```

`eas.json` is not committed yet — see PROJECT_STATUS.md § Phase 10.

---

## Project structure

```
src/
  app/                Expo Router routes — thin, no business logic
  components/
    ui/               Design system
    recipe/ pantry/   Feature components
    navigation/
  features/
    auth/             Session, validation, error mapping
    data/             Repository wiring, guest-data migration
    ingredients/      Catalogue, normalisation, matching, freshness
    pantry/ saved/ shopping/    Repositories + query hooks
    pricing/          Units, price book, deterministic cost estimation
    recipes/          Fixtures, ranking, row mapping
    search/           Deterministic query interpretation
    preferences/
  i18n/               Typed translations (en source of truth, ar partial)
  lib/                config, errors, format, logger, storage, supabase
  theme/              Tokens + palettes
  types/              Domain vocabulary
supabase/
  migrations/         9 migrations
  functions/          Edge functions (Phase 6)
  tests/              Platform shim + RLS suite
  seed.sql            GENERATED
scripts/              Seed generation, database test runner
```

---

## Definition of done for the MVP

| | Status |
|---|---|
| App launches, navigation works | ✅ |
| Signup / login / reset / delete account | ✅ |
| Onboarding | ✅ |
| Pantry | ✅ |
| Ingredient-based meal generation | ✅ local catalogue · ⬜ AI |
| Budget-based meal generation | ✅ local catalogue · ⬜ AI |
| Recipe detail + cooking mode | ✅ |
| Shopping list | ✅ |
| Saved recipes | ✅ |
| Preferences | ✅ |
| Supabase migrations + RLS | ✅ (37 assertions passing) |
| Claude calls server-side only | ⬜ Phase 6 |
| No secrets in the client | ✅ |
| Loading / error / empty states | ✅ |
| Type checking passes | ✅ |
| Linting passes | ✅ |
| Unit tests pass | ⬜ Phase 10 |
| Production build | ✅ web verified · ⬜ native (needs EAS project) |
| EAS configuration | ⬜ Phase 10 |
| `.env.example` complete | ✅ |
| Grocery-provider architecture | ✅ schema + reserved fields · ◐ adapter module |

---

## Licence

Unpublished. All rights reserved.
