# Test Plan

Testing is weighted toward the things that would hurt a real user: eating
something they are allergic to, being shown a price as if it were real, losing
their pantry, or seeing someone else's data.

---

## Layers

| Layer | Tool | Runs where |
|---|---|---|
| Database + RLS | `psql` assertions | `./scripts/db-test.sh` — **written, 37 passing** |
| Unit (pure logic) | Jest | `npm test` — **to be written** |
| Component | Jest + Testing Library | `npm test` — **to be written** |
| Static | `tsc --noEmit`, ESLint | `npm run typecheck`, `npm run lint` — **passing** |
| Bundle | `expo export` | manual / CI — **passing** |
| End-to-end | Maestro or Detox | not planned for V1 |

---

## 1. Database and Row Level Security — implemented

`supabase/tests/01_rls_test.sql`, run against a throwaway Postgres by
`./scripts/db-test.sh`. 37 assertions covering:

- the signup trigger creating profile, preferences and a default list
- a user reading only their own pantry, preferences and profile
- update and delete against another user's rows affecting **zero** rows
- inserting a row owned by another user being **rejected**
- shopping list items guarded through their parent list, including the
  forged-parent-id attack (the case that actually proves the policy)
- reference data readable but not writable through the anon key
- private recipes and their child rows invisible to other users
- clients unable to forge `ai_usage_events` rows to dodge rate limits
- disabled grocery providers invisible
- **every table in `public` having RLS enabled** — this one fails if a future
  migration adds a table and forgets the policy
- account deletion cascading to every owned table
- `delete_own_account()` rejecting an unauthenticated caller

---

## 2. Unit tests — to write

### Allergy enforcement · highest priority
`features/recipes/rank.ts`

- a recipe declaring an allergen is removed for a user with that allergy
- a recipe **not** declaring it but containing an ingredient that implies it
  (milk → dairy) is also removed
- an allergen never merely lowers the score — it removes
- an optional ingredient carrying an allergen still removes the recipe
- multiple allergies compose
- generated (`source: 'ai_generated'`) recipes go through the same filter

### Dietary restrictions
- vegan excludes meat, seafood, dairy and eggs
- vegetarian permits dairy and eggs, excludes meat and seafood
- pescatarian permits seafood, excludes meat
- keto uses the carb threshold
- halal is not assumed for an untagged AI recipe

### Expiry and food safety
`features/ingredients/freshness.ts`

- an item dated yesterday is `expired` and excluded from availability
- an item dated today is `expires_today` and still usable
- the boundary at `EXPIRING_SOON_DAYS`
- a null date is `unknown`, never treated as expired
- `buildAvailabilityIndex` records the exclusion reason so the UI can explain it
- a staple the user marked expired is not re-added by the staple assumption

### Ingredient matching
`features/ingredients/normalise.ts`, `matching.ts`

- plurals, casing and surrounding whitespace collapse
- preparation words are stripped ("finely chopped tomatoes" → "tomato")
- protected prefixes survive: "ground beef" ≠ "beef", "ground coriander" ≠
  "coriander"
- Arabic normalisation: alef variants, ta marbuta, diacritics, tatweel
- transliterations resolve ("firakh" → chicken breast)
- match percentage counts required ingredients only
- a recipe with no required ingredients scores 100, not NaN

### Budget calculations
`features/pricing/estimate.ts`, `units.ts`

- cost scales with servings
- unit conversion: 300 g against a per-kilo quote
- countable units via `gramsPerPiece`
- an unpriceable ingredient is reported in `unpricedCount`, not silently zero
- "to taste" contributes zero rather than a whole packet
- an unconvertible unit bills one whole unit and flags the line approximate
  (over-stating, never under-stating)
- integer arithmetic throughout: no float drift over a long list
- `budgetVerdict` boundaries at exactly budget and at the tolerance edge
- **`toPricedAmount` always returns `source: 'estimate'`**

### Shopping list generation
`features/shopping/repository.ts`

- 2 tomatoes + 3 tomatoes = one line of 5
- convertible units merge (500 g + 1 kg = 1.5 kg)
- unconvertible units keep the existing quantity rather than adding nonsense
- source recipe ids accumulate
- re-adding a checked item un-checks it
- the estimated total ignores checked items
- `supermarketId` / `sku` / `livePriceMinor` are null on every new item

### Structured AI output parsing (Phase 6)
- a valid response parses to a `Recipe`
- a missing required field is rejected
- an unknown enum value is rejected
- prose wrapped around JSON is recovered or cleanly rejected — never partially
  trusted
- one retry, then a deterministic fallback
- prompt-injection strings in ingredient names are neutralised by
  `sanitiseForPrompt`
- an injected instruction that survives still cannot produce a recipe violating
  the allergen filter

### Natural-language interpretation
`features/search/interpret.ts`

- "under 150 EGP" → budget; "dinner in 20 minutes" → time + meal
- "under 20 minutes" is **not** read as a 20 EGP budget
- "for four people" → 4 servings; word numerals too
- confidence is low for a query with no extractable constraint

### Money formatting
`lib/format/money.ts`

- estimates render with the `~` prefix; live prices do not
- Arabic-Indic digits parse
- separators and a trailing currency word parse
- negative and non-numeric input return null

---

## 3. Component tests — to write

- **PriceTag** renders `~` and the "Estimated" label for an estimate, and
  neither for a live price. *This is the test that keeps the product rule true.*
- **Pantry** shows an empty state, adds an item, shows the expired badge.
- **RecipeCard** shows the match badge and the missing-ingredient count.
- **Onboarding** advances, allows skipping optional steps, blocks on the name.
- **Error states** render for offline / AI unavailable / rate limited.
- **Cooking mode** moves between steps and finishes.

---

## 4. Integration — to write

Against a local Supabase or a mocked client:
- sign-up → onboarding → pantry → suggestions
- guest builds a pantry → signs in → pantry is preserved
- sign-out clears the local cache
- account deletion removes everything

---

## Rules

- **Never weaken a test to make the suite pass.** A failing allergen test means
  the filter is broken, not that the test is wrong.
- Every bug fixed gets a regression test.
- Tests that involve time inject a `now` — every date-sensitive function already
  accepts one.
- No test may depend on network access or on a real API key.
