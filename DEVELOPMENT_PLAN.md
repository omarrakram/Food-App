# Development Plan

Ten phases, each leaving the app in a working, shippable-to-TestFlight state.
A phase is not "done" until typecheck, lint and the relevant tests pass.

Status is tracked in **PROJECT_STATUS.md**, which is the file to read first.

---

## Phase 1 — Foundation and design system ✅

Tokens, palettes, theme provider with persisted preference, i18n with typed
keys and RTL awareness, and the reusable component kit.

**Done when:** a screen can be built without writing a raw colour or a
hard-coded pixel gap. ✅

## Phase 2 — Navigation and polished UI on local data ✅

Bottom tabs, all primary screens, real interactions against the bundled
catalogue. No backend.

**Done when:** the whole product is walkable and evaluable as a design. ✅

## Phase 3 — Auth, database and RLS ✅

Migrations, RLS on every table, seed generation, Supabase repositories behind
the existing interfaces, auth screens, guest-data migration.

**Done when:** two users cannot see each other's data, proven by tests. ✅
*(37 assertions, `./scripts/db-test.sh`)*

## Phase 4 — Onboarding and preferences ✅

Progressive flow with a resumable draft; preferences editable later and used as
real constraints by the ranking engine.

**Done when:** an allergy entered at onboarding removes recipes from results. ✅

## Phase 5 — Pantry ✅

CRUD, categories, expiry, staples, optimistic updates, expiring-soon surfacing.

**Done when:** an expired item is excluded from matching and the UI says why. ✅

## Phase 6 — AI recipe generation ⬜ **next**

Edge functions calling Claude with structured output, schema validation,
bounded retries, rate limiting and usage accounting.

Steps:
1. `supabase/functions/_shared/` — CORS, JWT verification, rate limiting from
   `ai_usage_events`, prompt sanitisation, the Anthropic call wrapper.
2. `supabase/functions/ai-suggest/` — generate recipes for a `MealRequest`.
3. `supabase/functions/ai-interpret/` — decompose queries the deterministic
   parser scores below `LOW_CONFIDENCE`.
4. `src/features/ai/` — typed client, Zod schemas shared with the functions,
   graceful degradation to local results.
5. Merge generated results into `useMealSuggestions`, **through** `rankRecipes`
   so allergen and diet filters apply to generated recipes too.

**Done when:** with no `ANTHROPIC_API_KEY`, results still appear from the local
catalogue; with one, generated recipes appear alongside them, and a malformed
model response produces local results rather than an error.

## Phase 7 — Recipe detail and cooking mode ✅

Have/need split, serving scaling, step check-off, distraction-free cooking mode
with per-step ingredients and safety notes.

**Done when:** changing servings rescales every quantity and the cost. ✅

## Phase 8 — Budget engine ✅

Pricing engine, deterministic costing and the estimate/live distinction are
done.

The "grocery adapters" half of this phase was **cancelled, not completed**.
`src/features/grocery/` and its `GroceryProvider` interface were written before
the business model existed and assumed AKALT would be a front end for somebody
else's store — one interface that searched, carted, paid and tracked, as if
those were one system with one owner. The model is the opposite: the customer
pays AKALT and the merchant fulfils. Commerce-3B deleted the placeholder; the
real thing is `src/features/commerce/`, with its own README.

**Done when:** a recipe's cost is deterministic, estimates are visibly
estimates, and the price book can be swapped without touching the budget
engine. ✅

## Phase 9 — Saved recipes and shopping list ✅

Save/unsave, recently viewed, cooked history, list with duplicate merging.

**Done when:** adding the same ingredient from two recipes yields one line with
the combined quantity. ✅

## Phase 10 — Security, testing, performance, release ◐

Done: database/RLS suite, strict typecheck, zero-warning lint, verified
production bundle.

Remaining:
1. `jest.setup.ts` and the unit suite described in TEST_PLAN.md.
2. `eas.json` (development / preview / production profiles) and `eas init`.
3. Production app icon and splash.
4. CI: typecheck, lint, test, database suite, web bundle.
5. An OWASP-style review pass before release.

**Done when:** every row of the Definition of Done in README.md is ticked.

---

## Working rules

- **Never move on with a broken build.** No phase starts while the previous one
  has type errors, lint errors or failing tests.
- **Never delete working functionality because replacing it is easier.**
- **Commit at every stable milestone**, with a message that says why.
- **Credentials never block progress.** Build everything around the missing
  credential, use a clearly named placeholder, document exactly what is needed
  in PROJECT_STATUS.md, and carry on.
- **Deterministic before probabilistic.** If software can compute it, software
  computes it.
