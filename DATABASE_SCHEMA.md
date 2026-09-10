# Database Schema

Postgres via Supabase. Source of truth is `supabase/migrations/`; this document
explains the shape and the reasoning. Enum types mirror the unions in
`src/types/domain.ts` — changing one without the other is a bug.

---

## Conventions

- **UUID primary keys** (`gen_random_uuid()`), except join tables which use a
  composite key.
- **`timestamptz` everywhere**, with `created_at` / `updated_at` and a shared
  `set_updated_at()` trigger so writers cannot forget.
- **Money is an integer count of minor units** (piastres for EGP). No numeric,
  no float, no currency-scaled ambiguity.
- **Enums, not check constraints, for closed vocabularies** — an invalid value
  cannot reach the table at all.
- **Multi-valued attributes are child tables, not arrays**, so they can be
  indexed and joined. Allergen filtering in particular has to be an index scan.
- **RLS on every table**, tested by an assertion that fails if a new table
  arrives without it.

---

## Migrations

| File | Contents |
|---|---|
| `…120000_enums_and_extensions.sql` | pgcrypto, pg_trgm, all enums, `set_updated_at()` |
| `…120100_identity_and_preferences.sql` | `profiles`, `user_preferences`, allergens/cuisines/appliances/dislikes |
| `…120200_ingredients.sql` | `ingredients`, `ingredient_allergens`, `ingredient_aliases` |
| `…120300_recipes.sql` | `recipes` + 5 facet tables, `recipe_ingredients`, `recipe_steps` |
| `…120400_pantry_saved_shopping.sql` | `pantry_items`, `saved_recipes`, `recipe_history`, `shopping_lists`, `shopping_list_items` |
| `…120500_pricing_and_grocery.sql` | `ingredient_price_estimates`, provider/store/product/match tables |
| `…120600_ai_usage.sql` | `ai_usage_events`, `ai_call_count()` |
| `…120700_row_level_security.sql` | Every policy |
| `…120800_account_lifecycle.sql` | Signup trigger, `delete_own_account()`, `clear_own_history()` |

---

## Entities

### Identity

**`profiles`** — one row per `auth.users`, created by the signup trigger.
Deliberately holds **no email**; that stays in `auth.users`.

**`user_preferences`** — household size, diet, goal, skill, currency, optional
nutrition targets, typical budget, `personalisation_enabled`,
`onboarding_completed`. Range constraints on every numeric column.

**`user_allergens`** *(user_id, allergen)* — **safety-critical.** Rows here are
hard exclusions applied to every suggestion, never ranking weights.

**`user_cuisines`**, **`user_appliances`**, **`user_disliked_ingredients`** —
soft preferences. Dislikes are free text because users dislike things we have
never catalogued.

### Ingredients

**`ingredients`** — canonical catalogue keyed by `slug`, which is the same slug
the bundled TypeScript catalogue uses. Carries `default_unit`,
`grams_per_piece` (null when not countable), `is_common_staple`,
`is_perishable`. Trigram index on `name` for server-side autocomplete later.

**`ingredient_allergens`** — allergens inherent to an ingredient (milk → dairy).
This is what catches a mis-tagged recipe.

**`ingredient_aliases`** — transliterations, Arabic spellings, regional names.
Unique on `(ingredient_id, lower(alias))`, with a lookup index on `lower(alias)`
and a trigram index for fuzzy search.

### Recipes

**`recipes`** — curated rows are public and unowned (`created_by is null`);
AI-generated and user rows are owned and private by default. A check constraint
enforces exactly that pairing, so a client cannot create a "curated" recipe.

Nutrition columns are nullable on purpose: a generated recipe may not have
reliable figures, and rendering `—` is better than rendering a guess.

**Facet tables** — `recipe_meal_types`, `recipe_diet_tags`, `recipe_allergens`,
`recipe_appliances`, `recipe_tags`. Each indexed on its value column.

**`recipe_ingredients`** — `ingredient_id` is nullable, because the model can
propose an ingredient we have not canonicalised; `name` always carries the
human string. `is_optional` keeps garnishes out of the match denominator.

**`recipe_steps`** — `duration_minutes` and `safety_note` are modelled now so
cooking timers and inline safety guidance are UI-only work.
`ingredient_refs text[]` drives the per-step ingredient list in cooking mode.

### User collections

**`pantry_items`** — `ingredient_name` is denormalised so a row survives an
ingredient being recatalogued and users can add things we do not know about.
Unique on `(user_id, lower(ingredient_name))`, which makes "add tomatoes twice"
an update rather than a duplicate. `expires_on` is a **date**; anything past it
is excluded from matching. Partial index on `(user_id, expires_on)` powers the
"use these soon" nudge without scanning the pantry.

**`saved_recipes`** — unique on `(user_id, recipe_id)`.

**`recipe_history`** — unique on `(user_id, recipe_id, kind)` so repeat views
collapse into one most-recent row. Written only while
`personalisation_enabled` is true.

**`shopping_lists`** — a partial unique index enforces exactly one default list
per user; named lists are a future feature that needs no migration.

**`shopping_list_items`** — unique on `(list_id, lower(name))`, which is what
makes duplicate merging a database invariant rather than a client convention.
Carries the **reserved** grocery columns — `supermarket_id`,
`store_product_id`, `sku`, `live_price_minor`, `availability` — all null in V1.

### Pricing

**`ingredient_price_estimates`** — low / average / high in minor units, per
country, per unit, with `origin` and `last_updated` so staleness is visible. A
check constraint keeps low ≤ average ≤ high. The table comment says plainly
that these are estimates and must never be rendered as store prices.

### Grocery providers

**`grocery_providers`** → **`stores`** → **`store_products`**, plus
**`store_product_matches`** mapping a canonical ingredient to a store product
with a `confidence` score (low-confidence matches are confirmed by the user, not
silently substituted).

Only **enabled** providers are visible through RLS, and the seed registers a
single **disabled** mock. No real provider exists, and no fake endpoints do
either — each needs a commercial agreement first.

### AI accounting

**`ai_usage_events`** — one row per edge-function call: function, model, token
counts, latency, status, retry count. **No prompt text and no user content is
ever stored.** Indexed for the rate-limit query. `ai_call_count()` is
`SECURITY DEFINER`, granted to `service_role` only.

---

## Row Level Security

Three patterns, applied without exception:

**Owned rows** — `auth.uid() = user_id` in both `USING` and `WITH CHECK`, for
all four verbs.

**Child rows** — guarded through the parent:

```sql
using (exists (
  select 1 from public.shopping_lists l
  where l.id = list_id and l.user_id = auth.uid()
))
```

A forged `list_id` matches nothing. This is tested directly with a known-but-
unowned id, because an `INSERT … SELECT` from an RLS-filtered table inserts
zero rows and misleadingly "succeeds".

**Reference data** — a `SELECT` policy for `authenticated` and *no* write
policy at all. An `INSERT` is rejected outright; an `UPDATE`/`DELETE` matches
zero rows. Both are asserted.

Recipe children share two helper functions, `can_read_recipe()` and
`owns_recipe()`, so eight tables cannot drift apart.

---

## Functions and triggers

| Function | Security | Purpose |
|---|---|---|
| `set_updated_at()` | trigger | Keeps `updated_at` honest |
| `handle_new_user()` | definer | Creates profile, preferences and default list inside the signup transaction |
| `delete_own_account()` | definer | Deletes `auth.users` for `auth.uid()`; everything cascades. Derives the user from the JWT, **never** a parameter |
| `clear_own_history()` | invoker | Clears history, scoped by RLS |
| `ai_call_count()` | definer, service_role only | Rate-limit window count |
| `can_read_recipe()` / `owns_recipe()` | invoker | Shared recipe-child policy predicates |

---

## Indexes worth knowing

| Index | Why |
|---|---|
| `pantry_items_user_ingredient_idx` | Makes duplicate-merge an invariant |
| `pantry_items_expiry_idx` (partial) | The expiring-soon nudge |
| `shopping_list_items_unique_idx` | Makes list merging an invariant |
| `recipes_total_time_idx` (expression) | "Quick meals" filters on prep + cook |
| `recipe_allergens_allergen_idx` | Allergen filtering must be an index scan |
| `ingredients_name_trgm_idx` | Fuzzy ingredient search |
| `ai_usage_user_time_idx` | The rate-limit window query |

---

## Seeding

`supabase/seed.sql` is **generated** by `npm run seed:generate` from
`src/features/ingredients/catalogue.ts` and `src/features/recipes/fixtures.ts`.
Do not edit it by hand — the app bundles the same data for offline use, and
generation is what stops the two drifting.

Every statement upserts on a natural key, so re-running it refreshes rather
than duplicates.

---

## Testing

```bash
./scripts/db-test.sh
```

Applies every migration and the seed to a throwaway database and runs 37
assertions. `supabase/tests/00_platform_shim.sql` recreates `auth.users`,
`auth.uid()` and the Supabase roles so plain Postgres is enough in CI; it is
never applied to a real Supabase project.
