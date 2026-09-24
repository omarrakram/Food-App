# Commerce

The transaction layer. Everything between "I'm missing cooking cream" and
"somebody rang the doorbell".

**Status: Commerce-5.** Types, state machines, the money ledger, pack maths,
the sourcing engine, the schema, an isolated development catalogue, the cart
repositories, delivery addresses, deliverability by area key, cart
revalidation, the single checkout gate, and an unpaid order draft written by a
`security definer` function. Plus the screens: the recipe detail's sourcing
panel, the cart, the address list and form, and the checkout review. All with
tests.

Plus payment: a payment-intent layer, a `begin_payment` RPC that derives the
amount from the order, the Paymob integration behind three edge functions, and
a signed webhook that is the only thing in the system able to say a payment
happened.

**No merchant dashboard, no cash on delivery, no refund operations, no rider.**
A paid order reaches `placed` and stops there, which is where the merchant
queue begins and where Commerce-6 picks up. **No Paymob credentials are
configured and the migrations have NOT been applied to hosted Supabase** — the
whole of this runs against `npm run db:local` and the simulator.

The product this serves is AKALT's own: the customer decides what to eat,
AKALT works out what they are missing, sources it from one merchant, takes the
payment, and the merchant's own rider delivers it. The experience never leaves
AKALT.

---

## The one rule

```
        FOOD INTELLIGENCE                    COMMERCE
  recipes · pantry · ingredients  ──────▶  cart · order · payment
          · pricing                              · settlement
                    ✗ never the other way ✗
```

`features/recipes`, `features/pantry`, `features/ingredients` and
`features/pricing` must never import from `features/commerce` or
`types/commerce`. `scripts/__tests__/commerce-layering.test.ts` enforces it and
fails on a single import.

The reason is AKALT's own correctness, not anybody else's integration. Food
intelligence answers "what can this person cook?" from facts about food.
Commerce answers "what will this cost and who is bringing it?" from facts
about one merchant's shelf. Those change for different reasons, at different
speeds, and a recipe engine that reaches for a SKU starts failing when a
supermarket delists a product — which is a genuinely absurd way for a recipe
to break.

The violation is always small and reasonable at the time: one import of
`MerchantProduct` into a ranking function because the price was right there.

---

## Two boundaries that do the work

### 1. Canonical ingredient ≠ merchant product

A recipe says `milk`. A merchant sells *Juhayna Full Cream Milk 1L*.

`IngredientProductMapping` is the only bridge, and it is keyed by the
**canonical slug**, not an ingredient UUID — so the mapping table can be
rebuilt, re-seeded or handed to a partner without carrying our primary keys
with it, and the food layer never learns they exist.

### 2. Fulfilment state ≠ payment state

Where the goods are and where the money is are different questions, with
different actors and independent failure modes. A delivered order can be
awaiting a refund; a captured payment can belong to an order the merchant
never accepted. One column cannot say both, and the moment it tries,
reconciliation becomes guesswork.

| | file | axis |
|---|---|---|
| Goods | `fulfilment-state.ts` | draft → pending → placed → accepted → picking → ready → dispatched → delivered |
| Money | `payment-state.ts` | unpaid → authorising → authorised → captured → (partially) refunded |

They are joined at exactly one point: `canEnterMerchantQueue()`. **A merchant
never sees an order that has not been paid for** — picking an unpaid basket is
their loss, and the queue is where that is prevented, not a dashboard filter
somebody can change.

---

## Things that are in here because they happen

**`undeliverable`.** Nobody was home. It is neither delivered nor cancelled,
and it is not terminal — most of the time it is a second attempt. Without the
state, operations records it as one of the other two, and both are false
statements with money attached.

**Cash on delivery as a first-class method.** It is the dominant method in
Egyptian grocery delivery and it **inverts the settlement direction**: the
merchant's rider takes the cash, so the merchant ends up holding our
commission instead of us holding their revenue. `settleOrder` reads
`paymentMethod` and flips the sign. A model that assumes money only flows from
AKALT to the merchant invoices the wrong party on the first COD order.

**A `demo` payment provider in the enum.** Written to the order row, so a demo
payment cannot be mistaken for a production one by reading the data. Nothing
maps `demo` onto a production-successful state.

---

## The ledger

An order's financial position is a **fold over an append-only adjustment
list**, never a set of mutable columns. Substitutions, removals,
cancellations, waived fees and goodwill are all the same kind of row.

```
amountDue      = authorisedTotal + Σ adjustments        (floored at 0)
goodsFulfilled = itemsSubtotal   + Σ goods adjustments
commission     = round(basis × rateBasisPoints / 10000)
```

Three rules worth knowing before changing anything here:

1. **The authorisation is a ceiling.** `checkAdjustment` refuses anything that
   would make the customer owe more than they agreed to. Most providers cannot
   capture above an authorisation, so such an order is not merely rude — it is
   unsettleable. A dearer substitute needs explicit customer approval and a
   fresh authorisation, or it is not handled.

   The ceiling is a **payment** constraint, not a consent one. Stopping a
   merchant quietly upgrading an item is `SubstitutionDecision`'s job: an
   unapproved swap sits at `pending_customer` and never becomes an adjustment.

2. **Goodwill and waived fees come out of AKALT's margin**, not the merchant's
   revenue. They reduce what the customer pays without reducing what the
   merchant delivered. Treating them as goods adjustments would bill the
   merchant for our apology.

3. **Commission rounds to nearest**, not down. Across thousands of orders,
   always flooring is a systematic transfer to the merchant and always ceiling
   is the reverse. Neither is defensible as an accident.

---

## Sourcing: which product to buy

`sourcing.ts`. **No model decides this.** Not because a model would guess
badly, but because a wrong SKU is a different order of trust failure from a
wrong recipe suggestion: it is somebody's money, spent on the wrong thing,
delivered to their door. The ranking is integer arithmetic over observable
facts, it explains itself through `reasons`, and it gives the same answer
twice.

### Three independent questions, answered in order

| axis | question | who settles it |
|---|---|---|
| **mapping correctness** | does this SKU represent this ingredient? | a human, via `isVerified` / `source: 'manual'` / `isBlocked` |
| **user eligibility** | may THIS user receive it? | the product's allergen data vs the user's |
| **purchasability** | can anyone buy it right now? | `isActive`, `availability` |

**A manual or verified mapping settles the FIRST axis only.** A human
confirming that Brand X Milk 1L is milk has said nothing about whether this
cook can drink it, and nothing about whether the shop has any. If verification
could override the other two, a hand-checked mapping would be a route to
handing somebody an allergen — so it overrides the confidence bar and nothing
else. Four tests hold that line, one per override it must not perform.

Only what survives all three is scored, so no combination of price, stock and
pack fit can float an ineligible product to the top. Safety is never a ranking
weight — the same rule `features/recipes/rank.ts` already follows.

**`null` allergen data is not an absence of allergens.** `[]` is a merchant
declaring none; `null` is nobody having said anything. For a cook with
allergies a `null` candidate is offered but never auto-selected, because the
day we integrate a catalogue without allergen data, treating the two alike
would make every unlabelled product silently safe for everybody. The demo
CSV refuses a blank cell for exactly this reason: `none` and `unknown` both
have to be typed.

**Then the score**, in descending order of how bad it is to get wrong:

| | weight | |
|---|---:|---|
| verified mapping | 1000 | a human checked this SKU is this ingredient |
| mapping source | 0–400 | manual pin > exact SKU > name match > category |
| confidence | 0–50 | refines within a source tier, never across one |
| availability | 0–200 | in stock > low > unknown > out |
| pack fit | 0–150 | less waste is better |
| price | 0–100 | cheapest **effective cost**, not cheapest shelf price |

Two details that matter more than they look:

**Effective cost, not shelf price.** Two 450 g packs at 50.00 is dearer than
one 1 kg pack at 90.00, and the shelf price says the opposite. The comparison
is `packs × unit price`, which needs the pack maths done first.

**A manual mapping is trusted regardless of confidence.** `confidence` is a
*matcher* score, and nothing computed one for a row a human created by
choosing the product. Gating the pin on it would mean refusing the mapping we
are surest of.

Ties break on score, then effective cost, then packs, then product id. That
last one is not decoration: without it two equal products come back in
whatever order the database chose, the list reshuffles on refresh, and the
suite passes on Tuesday and fails on Wednesday.

### Five outcomes, because "no" has four causes

| status | means |
|---|---|
| `matched` | trusted, eligible, buyable — `chosen` is set |
| `needs_confirmation` | buyable options exist; confidence is low, or eligibility is unknown |
| `no_purchasable_match` | eligible mappings exist; none can be bought right now |
| `no_eligible_match` | mappings exist; every one is ruled out for this user |
| `unmapped` | no usable mapping at this merchant |

An out-of-stock product is **never** `chosen`, whatever its mapping score.
`SourcedLine.exclusions` records what was dropped and on which axis.

## Pack maths

`pack-maths.ts`. 500 g of chicken against a 450 g pack and a 1 kg pack.
Conversion is **not** reimplemented — `features/pricing/units.ts` already
reduces everything to grams and already knows a per-bunch weight says nothing
about a clove.

When it cannot tell, it says so. There is no branch in `pack-maths.ts` that
assumes one pack: `kind: 'unknown'` means somebody upstream decides, because
guessing here spends real money.

Two callers decide differently, on purpose. An UNMEASURED requirement — "salt,
to taste" — is given one pack by `sourcing.ts`, because one pack is the
smallest thing the shop will sell rather than an estimate of an amount. A
MEASURED requirement the merchant never sized keeps `packsNeeded: null`: one
pack might be 200 g against a 500 g recipe line, so the row refuses to price
it and `addableLines()` refuses to add it.

## Ports

`ports.ts` splits what the retired `features/grocery/provider.ts` had as one
interface:

| | owns | implementation |
|---|---|---|
| `CatalogueAdapter` | read: locations, products, prices, stock | `demo-adapter.ts`, then the partner's |
| `FulfilmentAdapter` | write: hand a paid order to whoever picks it | Commerce-7, `mode: 'dashboard'` |

The split earns its keep because the two halves change for different reasons:
a catalogue is re-read constantly and cached, an order is submitted once and
must not be.

`features/grocery/` is **deleted** as of Commerce-3B. It assumed the retailer
owned the cart, the checkout and the money, which is not the model.
`isOrderingAvailable` now lives in `merchant-selection.ts` and answers the
question honestly: can we select a branch to source against?

---

## Deliberately not built

**No `MerchantProductVariant`.** Every supermarket catalogue we have looked at
gives each pack size its own SKU and its own price, so "Tomatoes 500g" and
"Tomatoes 1kg" are two products. A variant layer would add a join and answer
no question we have.

**No multi-merchant cart.** One cart, one merchant. Price comparison across
stores is a later product, not a V1 constraint on the schema.

**No rider model, no GPS, no live tracking.** The merchant owns the rider.

**No handoff checkout.** The customer is never sent to another app to pay.

**No commission "basis" setting.** Commission is charged on net fulfilled
merchandise, full stop. A second option could only ever produce an invoice
that disagrees with the agreement.

**No sourcing of the hand-written shopping list.** The recipe screen can order
because every line there is a canonical ingredient with an amount, which is
what `requirementsFor` needs. `/shopping-list` is free text somebody typed in
an aisle — "the good cheese", "2 things of yoghurt" — and matching that to
SKUs by name is the guessing the canonical layer exists to prevent. Its order
button is dead and says so.

**No deficit sourcing.** The cook is asked to buy the FULL recipe amount, not
the amount they are short. `requirements.ts` documents the five reasons the
pantry cannot yet support the subtraction; nothing structural blocks it.

**No re-pricing at the cart.** Totals come from the snapshot taken when a line
was added. A moved shelf price is shown on the line that moved and reconciled
at checkout, where `revalidateCart` re-totals from the current shelf and the
customer has to look at the new number before a draft can be built.

---

## Map

| file | what |
|---|---|
| `../../types/commerce.ts` | every commerce type; imports only `./domain` |
| `fulfilment-state.ts` | goods state machine + who may move it |
| `payment-state.ts` | money state machine + who may move it |
| `ledger.ts` | adjustments, the authorisation ceiling, settlement |
| `pack-maths.ts` | how many packs the cook actually has to buy |
| `sourcing.ts` | which product to buy, and why |
| `ports.ts` | `CatalogueAdapter`, `FulfilmentAdapter`, the sourcing contract |
| `demo-adapter.ts` | a catalogue adapter over the development fixtures, and its guard |
| `demo-catalogue.generated.ts` | generated from `data/commerce-demo/` |
| `requirements.ts` | `missingIngredients` → sourcing lines, with the amount |
| `basket.ts` | what a bulk add may put in a cart without asking |
| `merchant-selection.ts` | which merchant and which branch, or none |
| `cart-repository.ts` | the cart interface + the local implementation |
| `supabase-cart-repository.ts` | the same cart for a signed-in user |
| `cart-view.ts` | the cart joined to the catalogue and totalled |
| `display.ts` | merchant, branch and product names, per language |
| `address-repository.ts` | delivery addresses, and the area registry they pick from |
| `delivery-areas.ts` | `canDeliver`: branch coverage, compared by KEY |
| `pending-cart.ts` | the guest basket parked at sign-in |
| `migrate-guest-cart.ts` | migrate · merge · park — never discard |
| `revalidation.ts` | what is still true, immediately before an order exists |
| `checkout-readiness.ts` | the ONE gate: `canProceedToDraft`, and why not |
| `order-draft.ts` | the client side of the order RPCs, and every refusal they can give |
| `payment-intent.ts` | one attempt to pay, and what the customer is told about it |
| `hooks.ts` | the only React in here: binds the engines to cache and prefs |

Screens: `src/app/recipe/[id]/index.tsx` (the sourcing panel),
`src/app/cart.tsx`, `src/app/addresses/` (list and form),
`src/app/checkout.tsx` and `src/app/payment/`. The one shared component is
`src/components/commerce/sourced-line.tsx`.

Server-side: `supabase/functions/payments-begin`, `payments-webhook` and
`payments-simulate`, with the provider itself in `_shared/paymob.ts`.

The schema lives in `supabase/migrations/20260923090000_commerce_foundation.sql`,
`20260925090000_commerce_checkout.sql` and `20260926090000_payment.sql`. None
of them has been applied to hosted Supabase.

`npm run db:local` builds a throwaway database with all of it plus the demo
catalogue as real rows, which is the only way the RPCs can be exercised the way
the app calls them.

## Four things the payment layer will not do

**The client cannot name an amount.** `begin_payment` takes an order, a method
and an idempotency key. Everything financial is read from the order inside the
function, against a row locked `for update`.

**The client cannot say a payment happened.** `orders` has a select policy and
no update policy; `payment_intents` has neither insert nor update. The only
writer is `record_payment_event`, and only the service role may call it —
reached from the webhook, after an HMAC-SHA512 signature over twenty fields has
verified in constant time.

**A duplicate callback cannot charge twice.** `payment_events` is unique on
`(provider, kind, provider_event_id)`, and that constraint IS the guard: the
second delivery inserts nothing and the function returns `duplicate` without
touching the order. A late failure after a success returns
`ignored_out_of_order`; a settled attempt is settled.

**Which provider is read off the merchant.** A demo merchant can only ever be
settled by the simulator and a real one only by Paymob. There is no argument, no
flag and no session setting a client could use to cross that line.

### Paymob captures in one step

Worth stating because the state machine allows both. Paymob does offer
auth-then-capture, but it needs its own integration id and is card-only — it
cannot hold a wallet payment, and wallets are most of the Egyptian market. So
a verified success goes `authorising -> captured`, and nothing pretends we are
holding funds we have already taken. Voids and refunds are real operations
against a captured transaction, so nothing is lost by being honest about it.

## Three things the checkout will not do

**The client never names a price.** `create_order_draft` takes a cart revision,
an address id and an idempotency key. Everything financial — line prices, the
subtotal, the delivery fee, the commission rate — is read from the database
inside the function, against a cart row locked `for update`. A client that can
name a price can name zero.

**An acceptance belongs to one revision.** Every cart mutation bumps
`carts.revision` through a trigger. A customer's "yes, I have seen the new
prices" is recorded against the revision it produced, and the moment the basket
moves again it stops counting. An old "I accept" must never carry a change
nobody looked at.

**Deliverability is a key comparison.** An address carries an `area_key` chosen
from a registry; a branch declares the keys it covers. Nothing reads the
street, the building or the landmark, because deriving a district from typed
text is how "Maadi Degla" comes to equal "Degla" and an order is accepted that
nobody can deliver. An empty coverage list means NO coverage, never
"everywhere".

## What the screens promise

Three rules, each of which was a way the UI could quietly lie:

**Commerce is revealed, not rendered.** The recipe page is a recipe. Somebody
who opened it to cook from what they have does not scroll past a shop to reach
the method, so the products appear on the tap of one button and the default
view is unchanged.

**Every add is one the cook could have seen.** `addableLines()` admits only
`matched` lines with a pack count. A `needs_confirmation`, an out-of-stock, an
allergy exclusion and an unmapped ingredient are four different questions, and
answering any of them silently on somebody's behalf is the failure the
three-axis split exists to prevent. `packsNeeded === null` on a matched line
means the merchant never published a pack size, so one pack might be 200 g
against a 500 g requirement — the row refuses to price it and the button
refuses to add it.

**Partial fulfilment is said out loud.** "Add 8 to cart" under a list of eleven
reads as a complete answer unless the screen states the gap.

And a fourth that is about the data rather than the words: a product is paired
to the recipe row that asked for it by `SourcingLine.requestLineId`, never by
canonical slug. A recipe can want tomatoes twice — fresh and tinned — and a
slug key would put the tin under the fresh line.

---

## Keeping the demo catalogue out of production

Four independent guards, because a fixture that reaches a real customer is the
worst outcome available to this layer:

1. `env.useDemoMerchantCatalogue` requires an explicit
   `EXPO_PUBLIC_DEMO_MERCHANT` flag **and** a non-production build — the same
   shape as `env.demoMode`.
2. `assertDemoCatalogueAllowed()` runs at **every** entry point, not just the
   adapter's constructor, so no bare function skips the class. It throws
   rather than returning an empty catalogue: empty looks exactly like a
   merchant that is out of everything, which is the one failure nobody
   investigates.
3. The merchant row is `isDemo: true` and `isEnabled: false`, and says
   "development only" in both languages.
4. Nothing outside `features/commerce` may import the generated catalogue.

(2) is asserted by `__tests__/demo-guard.test.ts`, which mocks the env module
with the flag off. (3) and (4) by `scripts/__tests__/commerce-demo-isolation.test.ts`.
