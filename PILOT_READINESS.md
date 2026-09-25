# Pilot readiness

**Question:** can AKALT run a real order, for a real customer, from a real
supermarket, tomorrow?

**Answer: no — and the reasons are specific, small in number, and none of them
is in the commerce engine.** What Commerce-4 through Commerce-7 built works:
the money, the state machines, the access control and the refunds are done and
proved. What is missing is everything between that engine and an actual shop.

This document is deliberately unkind. A readiness note that lists what works is
a sales document; the useful version lists what would go wrong on the first
day.

Written after Commerce-7, against commit history and against a browser walk of
the real screens (`npm run walk:merchant`, 45 checks).

---

## 1. Blockers — a pilot cannot start until these are done

### B1. The app cannot select a real merchant. *(the big one)*

`features/commerce/merchant-selection.ts` is static:

```ts
function enabledPartnerFor(_country: CountryCode): SelectedMerchant | null {
  if (!env.enableGroceryOrdering) return null;
  return null;                       // ← there is no other branch
}
```

Every commerce screen goes through `selectMerchant()`, and the only thing it
can return is the BUNDLED demo catalogue. A real supermarket's rows can exist
in `merchants` and `merchant_locations` — the schema, the RLS, the pricing and
the fulfilment functions all read them — and **no client code path can reach
them.**

Compounding it, `data/commerce-demo/merchant.json` ships
`isAcceptingOrders: false` and a test holds it there, so the one branch the app
CAN select refuses checkout. That is correct: it is what stops a build ever
treating the fixture as a partner. The browser walk asserts the refusal rather
than working around it.

So the customer journey `cart → checkout → pay` cannot be completed by anybody,
against anything, today.

**What it needs:** `selectMerchant` reading `merchants` + `merchant_locations`
from the database, asynchronously, with the demo snapshot as a fallback rather
than the only case. Everything downstream — sourcing, cart, revalidation,
checkout — already takes a merchant and a location as arguments, so the change
is at the top rather than throughout. Estimate: one focused phase, not a
rewrite.

### B2. There is no way to load a real catalogue

`merchant_products`, `ingredient_product_mappings` and prices are populated by
`scripts/import-commerce-demo.ts`, which reads three files in
`data/commerce-demo/`. A supermarket will hand over a feed — CSV, an API, or a
spreadsheet — in their own shape, with their own SKUs, updated daily.

Nothing ingests that, nothing refreshes stock or price, and nothing maps their
SKUs onto our canonical ingredients. Until it exists, a "real" catalogue would
have to be typed in by hand and would be wrong by the second day.

### B3. Allergen data will make most of the catalogue unbuyable

`merchant_products.allergens_published` defaults to `false`, and
`product_suits_customer()` refuses anything unpublished for a customer with an
allergy. **That is the correct rule and it must not be relaxed** — UNKNOWN MUST
NOT MEAN SAFE. But it has a consequence nobody has agreed with a supermarket
yet: if their feed carries no allergen data, every product is unsafe for every
allergic customer, and the app will look broken to them.

This is a commercial conversation before it is a technical one. The options are
(a) the supermarket publishes allergen data, (b) the pilot launches for
customers with no declared allergens, or (c) the app says plainly why a product
is unavailable. One of the three has to be chosen before launch.

### B4. Paymob has never been used in anger

The integration is built, verified against the current documentation, and
covered by 35 Deno tests — and **no real charge and no real refund has ever
been made.** Specifically outstanding:

* live secret / public / HMAC keys are unset;
* the card integration's `notification_url` and the WALLET integration's
  dashboard-configured processed-callback URL both need pointing at the
  deployed `payments-webhook` (they are configured in two different places —
  see `supabase/functions/README.md`);
* the refund endpoint's response shape is undocumented by Paymob. The code
  treats anything it cannot read as AMBIGUOUS and stops, which is the safe
  direction, but it means the first real refunds may need a human. Budget for
  that rather than being surprised by it.

### B5. Nothing is deployed

By standing instruction, hosted Supabase has had nothing applied. Before a
pilot: apply the migrations, deploy the seven functions (`payments-webhook`
with `--no-verify-jwt`), enable `pg_cron`/`pg_net`/`supabase_vault`, put the
service-role key in Vault, and fill `edge_job_endpoints` with the project's own
function URLs. The runbook is in `supabase/functions/README.md` § Scheduling.

`select * from public.job_health();` is the one command that says whether that
worked.

---

## 2. Risks — a pilot can start, with these understood

| # | Risk | Why it is survivable for one shop |
|---|---|---|
| R1 | **No settlement or payout.** AKALT holds the customer's money and owes the merchant their share. `order_refund_position` and the commission rate exist; nothing pays anybody. | One merchant, weekly, by bank transfer, reconciled by hand from `orders`. Automate at shop two. |
| R2 | **No operations screen for refunds needing review.** An `abandoned` refund with `manual_review = true` is visible only in SQL. | Low volume. `select * from refund_attempts where manual_review` is a daily habit, not a product. |
| R3 | **No email for merchant invitations.** The manager reads the token out. | Three or four staff. It is a worse answer at thirty. |
| R4 | **No monitoring.** `job_runs` records every scheduled run and nothing watches it. A scheduler that stops is invisible until an order expires late. | Check `job_health()` each morning of the pilot. |
| R5 | **Realtime on the merchant queue is unproven against hosted Supabase.** The `postgres_changes` subscription needs `orders` and `order_substitutions` in the publication. | The queue polls every 60 s regardless, so the worst case is a minute's delay, not a missed order. |
| R6 | **The two clocks are guesses.** A 30-minute draft TTL and a 20-minute substitution window have never been measured against a real shop's pace. | Both are single functions (`order_draft_ttl()`, the `p_response_window` default) and can be changed in one migration once there is evidence. |
| R7 | **`payments-reconcile` only asks about `paymob` intents.** A stuck `demo` intent is never reconciled. | Demo intents cannot exist in production: `begin_payment` derives the provider from `merchants.is_demo`, and no demo merchant is enabled there. |
| R8 | **Arabic copy for the Commerce-7 strings has not been reviewed by a native speaker.** Refund and staff wording is mine. | Read it before launch; it is 30 strings. |
| R9 | **Scale is untested.** One branch, one queue, no load test. | A pilot is one branch. Revisit before the second. |
| R10 | **Rider name and phone are free text.** No verification, no format check. | The shop types what the shop knows. Wrong is better than absent. |

---

## 3. What is actually ready

Stated because the blockers above should not be read as "the commerce engine is
unfinished". It is not.

* **Payment.** One attempt log, never overwritten. The provider's signed
  callback is the only thing that can say a payment happened, verified by an
  HMAC over twenty ordered fields before a single field of the body is read.
  Duplicate delivery is a no-op by unique constraint, not by a check somebody
  can forget. An order reaches the merchant queue only when money has moved.
* **Refunds.** The amount is derived from the capture and the adjustment
  ledger; `request_refund` takes no amount argument at all. A refund never
  exceeds `captured − refunded`, checked again at the moment it applies. The
  money moves once, whichever of the two provider routes gets there first. An
  ambiguous provider answer stops automatic retry dead. A failed refund remains
  a visible debt, because `refunded_minor` only moves on a confirmed success.
* **Fulfilment.** A state machine the merchant cannot bypass — there is no
  update policy on `orders`, so a status is not a column a client writes. READY
  is refused while a customer is still being asked about a substitution. A
  replacement may never cost more than the line it replaces, and may never be
  unsafe for that customer.
* **Access.** AKALT makes the first manager; a manager invites pickers, for
  their own shop, inside their own branch scope; an operator may do none of it.
  A branch admin cannot widen their own scope by omitting the branch. The last
  chain admin cannot be removed by anybody.
* **Scheduling.** Five SQL jobs and two HTTP ones, each idempotent, bounded and
  overlap-guarded, with every run recorded. No migration carries a hosted URL
  or a secret.
* **Proof.** 649 database assertions, 1,460 Jest tests, 35 Deno tests, and a
  45-check browser walk that drives the real dashboard against a real Postgres
  through a real PostgREST — accept, pick, substitute, ready, dispatch, deliver,
  refund, and invite, with the customer answering from the other side.

---

## 4. The shortest honest path to a pilot

1. **B1** — make `selectMerchant` read the database. Nothing else can start
   until a real merchant is selectable.
2. **B3** — agree the allergen position with the supermarket. It changes what
   B2 has to import.
3. **B2** — build the catalogue ingestion their feed actually needs.
4. **B5** — deploy, with **B4**'s credentials, and make one real 10 EGP charge
   and one real refund against it before any customer sees the app.
5. Run the pilot with R1–R4 handled by a person, daily, on purpose.
