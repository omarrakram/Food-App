# Architecture

Akla is a React Native (Expo) application backed by Supabase, with all
privileged operations behind Supabase Edge Functions. This document explains
how the pieces fit and, more importantly, **why** the boundaries sit where they
do.

---

## 1. Shape of the system

```
┌──────────────────────────────────────────────────────────────────┐
│  Expo app (iOS / Android / web)                                  │
│                                                                  │
│  src/app/          Expo Router routes — thin, no business logic  │
│  src/components/   Design system + feature components            │
│  src/features/     Domain logic (matching, pricing, ranking…)    │
│  src/lib/          Cross-cutting: errors, storage, money, config │
│  src/theme/        Tokens + palettes                             │
│  src/i18n/         Typed translations, RTL                       │
└───────────┬──────────────────────────────────────────────────────┘
            │ anon key + user JWT (RLS enforced)
            ▼
┌──────────────────────────────────────────────────────────────────┐
│  Supabase                                                        │
│    Postgres  — normalised schema, Row Level Security on every    │
│                user-owned table                                  │
│    Auth      — email/password, OAuth-ready                       │
│    Edge Fns  — the ONLY place secrets exist                      │
│                • ai-suggest    recipe generation                 │
│                • ai-interpret  natural-language → structured     │
│                • account-delete                                  │
└───────────┬──────────────────────────────────────────────────────┘
            │ ANTHROPIC_API_KEY (server-side only)
            ▼
      Anthropic API
```

The client never holds a secret. It holds the Supabase URL and anon key, both
of which are safe **only because RLS is enabled on every table** — see §6.

---

## 2. Layering rules

| Layer | May import | Must not import |
|---|---|---|
| `src/app/**` (routes) | components, features, lib, theme, i18n | — |
| `src/components/**` | features, lib, theme, i18n | other components' internals |
| `src/features/**` | other features, lib, types | components, app |
| `src/lib/**` | types | features, components, app |
| `src/types/**` | nothing | everything |

The practical consequence: **every engine in `src/features` is a pure function
of its inputs and can be unit-tested without React**. Matching, pricing,
ranking and query interpretation all have zero React imports.

---

## 3. Local-first data access

Every user-owned collection is reached through a repository interface:

```ts
interface PantryRepository { list(); add(); update(); remove(); clear(); }
```

`RepositoryProvider` (`src/features/data/repositories.tsx`) picks the
implementation:

- **signed out** → `LocalPantryRepository` (AsyncStorage)
- **signed in** → `SupabasePantryRepository`

Screens call `useRepositories()` and never learn which is active. Three
consequences we wanted:

1. **The app is fully usable before an account exists.** A user can build a
   pantry, generate meals and keep a shopping list as a guest.
2. **Sign-in is a migration, not a reset.** Local rows have the same shape as
   database rows, so first sign-in copies them up.
3. **Tests do not need a database.** Local repositories are the test doubles.

Every React Query key is namespaced by `scopeKey` (`'local'` or the user id) so
signing out or switching accounts can never serve one user's cache to another.

---

## 4. What the model does and does not decide

This is the most important boundary in the product.

| Decision | Owner | Why |
|---|---|---|
| Which recipes exist | curated data + Claude | generation is a genuine language task |
| Does the user have an ingredient? | **software** (`matching.ts`) | must be reproducible and explainable |
| Ingredient match percentage | **software** | same |
| What a recipe costs | **software** (`pricing/`) | a model inventing prices is a lie |
| Is a recipe safe for this allergy? | **software** (`rank.ts`) | safety cannot be probabilistic |
| Is a pantry item expired? | **software** (`freshness.ts`) | safety, and it changes with the clock |
| Ranking order | **software** | tunable, testable, free |
| Interpreting "cheesy under 150" | software first, model as fallback | deterministic path handles most queries |

Claude is used where language is the actual problem: generating a recipe,
proposing substitutions, explaining a step, decomposing an unusual query. It is
never the arbiter of a fact the software can compute.

### AI request lifecycle

```
user input
  → sanitiseForPrompt()          strip control chars, role markers, cap length
  → edge function                auth check, rate limit, prompt assembly
  → Claude (structured output)
  → Zod schema validation        malformed → one retry → deterministic fallback
  → normalisation                canonicalise ingredient names
  → allergen re-filter           applied AGAIN client-side, post-generation
  → deterministic pricing        software computes cost, not the model
  → ranking
```

The allergen filter running twice is deliberate. A generated recipe is
untrusted output; it is re-checked against the user's hard constraints after
generation using the same code path that filters curated recipes.

### Prompt injection

User-entered ingredient names, pantry notes and search queries all reach the
model. They are treated as hostile input:

- control characters, zero-width joiners and bidi overrides are stripped
- `system:` / `assistant:` / `human:` role markers are neutralised
- delimiters (`<>{}[]\`|\\`) are removed
- every field is length-capped
- user content is passed as data in a JSON payload, never concatenated into
  the instruction text
- the response is schema-validated, so a successful injection still cannot
  produce output the app will render

`sanitiseForPrompt` exists on both the client and inside the edge function.
The server copy is the one that matters; the client copy is defence in depth.

---

## 5. Pricing and the estimate/live distinction

Money is an integer count of minor units (piastres) plus a currency code.
Nothing in the app stores a price as a float.

Every price carries provenance:

```ts
type PricedAmount = {
  money: Money;
  source: 'estimate' | 'live';   // ← the product rule
  storeName?: string;
  lastUpdated?: string;
};
```

`PriceTag` is the **only** component permitted to render a price. It prefixes
estimates with `~`, labels them "Estimated", and offers a tap-through
explainer. Routing every price through one component is what makes the rule
enforceable rather than aspirational.

`PriceBook` is an interface. V1 ships `BundledPriceBook` (typical Egyptian
supermarket prices, dated). A live grocery provider implements the same
interface and starts returning `source: 'live'` without the budget engine
changing.

---

## 6. Commerce

`features/grocery` and its `GroceryProvider` interface are **gone**, retired in
Commerce-3B. They were a placeholder written before the business model existed
and shaped around being a front end for somebody else's store: one interface
that searched a catalogue, made a cart, took a payment and reported an order
status, as if those were one system with one owner. They are not. The customer
pays AKALT; the merchant picks, packs and delivers. Two systems, two contracts.

The replacement lives in `src/features/commerce/`, which has its own README.
The parts that matter architecturally:

**One rule, enforced by a test.** `features/recipes`, `features/pantry`,
`features/ingredients` and `features/pricing` may never import
`features/commerce` or `types/commerce`.
`scripts/__tests__/commerce-layering.test.ts` fails on a single import, and
the same test keeps the commerce engines free of React so they can run in an
edge function or a merchant dashboard. `hooks.ts` is the one exemption, by
name.

**Two ports, not one.** `CatalogueAdapter` reads a merchant's shelf;
`FulfilmentAdapter` submits an order to them. They are separate because a
merchant can have one and not the other — a catalogue we scrape and orders we
send by WhatsApp is a real integration shape.

**Two state machines, not one.** Where the goods are (`fulfilment-state.ts`)
and where the money is (`payment-state.ts`) are different questions with
different actors and independent failure modes. `canEnterMerchantQueue()` is
the only place the two are joined.

**Money is a fold, never a column.** `order_adjustments` is append-only and
the financial position is computed from it, so "why is this order worth 340
rather than 400" always has an answer.

**One bridge between food and shelves.** `IngredientProductMapping`, keyed by
the canonical ingredient slug rather than an ingredient UUID, so the mapping
table can be rebuilt or handed to a partner without carrying our primary keys.

**Status.** Built to the cart and stopped there: no payment provider, no
checkout, no order row, no merchant dashboard. The only catalogue is a
quarantined development fixture in `data/commerce-demo/`, guarded four
independent ways, and the commerce migration has not been applied to hosted
Supabase.

`ShoppingListItem` still carries its reserved `supermarketId`,
`storeProductId`, `sku`, `livePriceMinor` and `availability` columns, all null.
They predate the commerce layer and are not what it uses — the cart is its own
table — but they are harmless and removing them is a migration for no gain.

---

## 7. Security

- **No secret in the client.** `src/lib/config/env.ts` can only read
  `EXPO_PUBLIC_*`, all of which are embedded in the shipped bundle. The
  Anthropic key, Supabase service-role key and any grocery credentials live
  exclusively in Supabase Function secrets.
- **RLS on every user-owned table**, with policies asserting
  `auth.uid() = user_id` for select/insert/update/delete. Reference tables
  (ingredients, recipes, price estimates) are readable by all authenticated
  users and writable by no one through the anon key.
- **Edge functions verify the caller's JWT** and derive the user id from it,
  never from the request body.
- **Rate limits** are enforced server-side per user, recorded in
  `ai_usage_events` so cost is observable.
- **Errors are normalised** into `AppError` with a translation key; a raw
  Postgres or fetch error never reaches the UI.
- **Logging redacts** emails, tokens, free text and query strings.

### Four rules the social features rest on

Each of these is enforced by the database and asserted in
`supabase/tests/`. They are written out because each one is easy to "fix" by
adding the policy somebody's client seemed to need.

1. **A role is granted out of band.** `user_roles` has read policies and NO
   write policy at all, so the only way to make somebody a moderator is a
   service-role insert. A policy that let admins grant admin would let anyone
   who reached one admin reach all of them. The client-side `useCanModerate`
   decides what to RENDER; `moderate_submission` re-checks with the caller's
   own credentials and is the boundary.

2. **Publication is a function, never a column.** `recipes.is_public` is
   unwritable by every client — moderators included — and
   `moderate_submission` is the only route to it. There is no branch in it
   that publishes on anything but an approval.

3. **A notification is written by a trigger.** `notifications` has no insert
   policy: every row comes from a definer trigger on the table where the event
   happened. A notifications table a client can write to is a spam channel
   with the product's name on it. Each row is a POINTER (kind + subject id) —
   nothing copies a message body or a recipe title, which is what lets deleted
   or unpublished content stop being advertised by a notification about it.

4. **A submission photograph is exactly as public as its recipe.** The object
   never moves between buckets. The storage policy derives readability from
   `recipes.is_public`, so unpublishing takes the photograph down in the same
   statement — a copy-on-approval design leaves the copy behind, which is the
   case moderation exists for.

`supabase/tests/09_privacy_audit_test.sql` asserts the STRUCTURE rather than
the behaviour: every table has RLS, every read policy on a private table is
scoped to `auth.uid()`, every security-definer function is revoked from `anon`
and pins its `search_path`, and `public_profiles` exposes exactly eight
columns. That is what catches the table somebody adds later and forgets to
protect.

---

## 8. Internationalisation

English is the source of truth and defines the key union. Arabic is
`Partial<Record<TranslationKey, string>>`, so an untranslated key silently
falls back to English instead of rendering a raw identifier.

Layout direction: `I18nManager.forceRTL` only takes effect after a native
reload, so the language screen states that explicitly rather than half-applying
it. Components use `isRTL` for the handful of places direction cannot be
inferred (chevrons, text alignment inside `TextInput`).

---

## 9. Performance

- React Query with a 60s stale time and reconnect-only refetch; no
  focus-refetch storms on mobile.
- Optimistic updates on every user-initiated mutation (pantry edits, shopping
  list ticks, saving a recipe) so the UI never waits on the network.
- `expo-image` with `memory-disk` caching; recipe photos recur across screens.
- The recipe catalogue is `staleTime: Infinity` — bundled data does not change
  within a session.
- Skeletons match the shape of the loaded content so there is no layout shift.
- Ranking runs on-device over a bounded catalogue; no network round trip is
  needed to answer "what can I cook?".

---

## 10. Extension points

Deliberately shaped for, but not yet implementing:

| Future feature | Where it plugs in |
|---|---|
| Barcode / receipt / photo capture | additional source in `IngredientPicker`; output is still `string[]` |
| Live store prices | a `PriceBook` implementation returning `source: 'live'` |
| Ordering | a `GroceryProvider` implementation + the reserved `ShoppingListItem` fields |
| Cooking timers | `RecipeStep.durationMinutes` already flows to cooking mode |
| Meal plans | a table referencing `recipes`; ranking already accepts date-scoped requests |
| Shared household pantry | `pantry_items.user_id` → `household_id` with an RLS membership check |
| Other markets | `CountryCode` / `CurrencyCode` unions + a price book per market |
