# Commerce

The transaction layer. Everything between "I'm missing cooking cream" and
"somebody rang the doorbell".

**Status: Commerce-1 (foundation).** Types, state machines and the money
ledger, with tests. No screens, no database migration, no adapter
implementations, no payment provider. Nothing in this directory is reachable
from the running app yet.

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
`types/commerce`. `scripts/__tests__/commerce-layering.test.ts` enforces it and fails on a
single import.

This is the B2B option, written down as a test. What a Breadfast or a Rabbit
would license is the food intelligence plus a `CatalogueAdapter` against their
catalogue — their checkout, their money, their orders stay theirs. The day a
recipe engine reaches for a SKU, that stops being a configuration change and
becomes a rewrite.

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

## Ports

`ports.ts` splits what `features/grocery/provider.ts` had as one interface:

| | owns | V1 implementation |
|---|---|---|
| `CatalogueAdapter` | read: locations, products, prices, stock | Commerce-2 |
| `FulfilmentAdapter` | write: hand a paid order to whoever picks it | Commerce-7, `mode: 'dashboard'` |

The old `GroceryProvider` is **superseded and must be retired** — see below.
It was built well, for Model 1: `createCart()` had the retailer create the
cart, `checkout()` returned `{ kind: 'completed' }` documented as *"the
provider handled payment"*, and `getOrderStatus()` polled them. Under Model 2
AKALT owns the cart, the checkout, the money and the order record.

Its read half survives almost unchanged as `CatalogueAdapter`. Its write half
does not survive at all — except as `OrderSubmission.kind === 'handoff'`,
which is kept for the B2B shape and is unreachable under Model 2.

---

## Deliberately not built

**No `MerchantProductVariant`.** Every supermarket catalogue we have looked at
gives each pack size its own SKU and its own price, so "Tomatoes 500g" and
"Tomatoes 1kg" are two products. A variant layer would add a join and answer
no question we have.

**No multi-merchant cart.** One cart, one merchant. Price comparison across
stores is a later product, not a V1 constraint on the schema.

**No rider model, no GPS, no live tracking.** The merchant owns the rider.

---

## Map

| file | what |
|---|---|
| `../../types/commerce.ts` | every commerce type; imports only `./domain` |
| `fulfilment-state.ts` | goods state machine + who may move it |
| `payment-state.ts` | money state machine + who may move it |
| `ledger.ts` | adjustments, the authorisation ceiling, settlement |
| `ports.ts` | `CatalogueAdapter`, `FulfilmentAdapter`, the sourcing contract |
