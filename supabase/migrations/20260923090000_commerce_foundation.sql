-- ---------------------------------------------------------------------------
-- AKALT — commerce foundation
--
-- Turns the Stage-B grocery scaffolding into the real ordering model. AKALT
-- owns the cart, the checkout, the money and the order; the merchant owns
-- stock, picking, packing and their own rider.
--
-- Three rules carried forward from the rest of this schema:
--   1. Money is an integer count of the currency's minor unit. No floats.
--   2. Closed vocabularies are enums, so an invalid value cannot reach a row.
--   3. RLS on every table, with the reference/owned/child patterns unchanged.
--
-- Two rules that are new here:
--   4. FULFILMENT STATE AND PAYMENT STATE ARE SEPARATE COLUMNS. Where the
--      goods are and where the money is are different questions with
--      different actors. One column cannot answer both, and the moment it
--      tries, reconciliation becomes guesswork.
--   5. AN ORDER'S FINANCIAL POSITION IS A FOLD over `order_adjustments`,
--      never a mutable total. Substitutions, removals, cancellations, waived
--      fees and goodwill are all the same kind of row, so the numbers cannot
--      drift away from the history that produced them.
-- ---------------------------------------------------------------------------

-- === Rename the Stage-B tables to what they actually are ===================
-- These held one disabled mock row and were read by nothing. Renaming now,
-- before a real catalogue exists, costs one migration; renaming later costs a
-- data migration and every query written in between.
--
-- Postgres carries policies, indexes, constraints and foreign keys across a
-- rename automatically. The index names are renamed too, only so that a
-- `\d merchant_products` does not read like an archaeology dig.

alter table public.grocery_providers      rename to merchants;
alter table public.stores                 rename to merchant_locations;
alter table public.store_products         rename to merchant_products;
alter table public.store_product_matches  rename to ingredient_product_mappings;

alter table public.merchant_locations rename column provider_id to merchant_id;
alter table public.merchant_products  rename column store_id    to merchant_location_id;
alter table public.ingredient_product_mappings
  rename column store_product_id to merchant_product_id;

alter index public.store_products_store_idx          rename to merchant_products_location_idx;
alter index public.store_products_name_trgm_idx      rename to merchant_products_name_trgm_idx;
alter index public.store_product_matches_ingredient_idx
  rename to ingredient_product_mappings_ingredient_idx;

-- === Enums =================================================================

-- WHERE THE GOODS ARE.
--
-- `pending` is the gap between "customer submitted" and "payment resolved",
-- and it exists so a merchant never sees an order that has not been paid for.
-- Picking an unpaid basket is their loss, and the queue is a better place to
-- prevent that than a dashboard filter somebody can change.
--
-- `undeliverable` exists because nobody-was-home happens constantly and is
-- neither delivered nor cancelled. Without it, operations records one of those
-- two, and both are false statements with money attached.
create type public.order_fulfilment_state as enum (
  'draft',
  'pending',
  'placed',
  'accepted',
  'picking',
  'ready',
  'dispatched',
  'delivered',
  'rejected',
  'cancelled',
  'failed',
  'undeliverable'
);

-- WHERE THE MONEY IS. Deliberately a separate axis from fulfilment.
create type public.payment_state as enum (
  'unpaid',
  'authorising',
  'authorised',
  'captured',
  'partially_refunded',
  'refunded',
  'voided',
  'failed'
);

create type public.payment_method as enum ('card', 'wallet', 'cash_on_delivery');

-- `demo` is written to the row, so a development payment can never be mistaken
-- for a production one by reading the data.
create type public.payment_provider as enum ('demo', 'paymob', 'fawry', 'cash');

create type public.commerce_actor as enum ('customer', 'merchant', 'akalt', 'system');

create type public.merchant_fulfilment_mode as enum ('dashboard', 'api');

create type public.substitution_preference as enum ('contact_me', 'best_match', 'remove');

create type public.substitution_decision as enum (
  'pending_customer',
  'approved',
  'rejected',
  'auto_approved'
);

create type public.adjustment_kind as enum (
  'substitution',
  'item_removed',
  'quantity_reduced',
  'order_cancelled',
  'fee_waived',
  'goodwill'
);

create type public.mapping_source as enum (
  'manual',
  'sku_exact',
  'name_match',
  'category_fallback'
);

create type public.order_event_kind as enum (
  'fulfilment_state',
  'payment_state',
  'adjustment',
  'substitution',
  'note'
);

-- === Merchants =============================================================

alter table public.merchants
  add column name_ar                    text,
  add column currency                   text not null default 'EGP',
  add column fulfilment_mode            public.merchant_fulfilment_mode not null default 'dashboard',
  -- Basis points: 1000 = 10.00%. An integer for the same reason money is one.
  -- Charged on NET FULFILLED MERCHANDISE only — never on fees, never on goods
  -- that were removed, substituted away or refunded. There is deliberately no
  -- "basis" column: a second option could only ever produce an invoice that
  -- disagrees with the agreement.
  add column commission_rate_basis_points integer not null default 1000,
  -- The merchant owns the rider, so normally they keep what the customer paid
  -- for delivery. A term in the agreement, not a law.
  add column merchant_keeps_delivery_fee  boolean not null default true,
  -- A development catalogue, not a supermarket. Written on the row rather than
  -- inferred from a slug, so nothing can mistake it for a partner by reading
  -- the data.
  add column is_demo                    boolean not null default false;

alter table public.merchants drop column integration;

alter table public.merchants
  add constraint merchants_currency_format check (currency ~ '^[A-Z]{3}$'),
  add constraint merchants_commission_range
    check (commission_rate_basis_points between 0 and 10000);

comment on column public.merchants.is_demo is
  'Development catalogue. A demo merchant must never be enabled in production.';

-- === Merchant locations ====================================================

alter table public.merchant_locations
  add column name_ar                    text,
  add column delivery_areas             text[] not null default '{}',
  add column delivery_fee_minor         integer,
  add column minimum_order_minor        integer,
  add column estimated_delivery_minutes integer,
  add column is_accepting_orders        boolean not null default false;

alter table public.merchant_locations
  add constraint merchant_locations_delivery_fee_non_negative
    check (delivery_fee_minor is null or delivery_fee_minor >= 0),
  add constraint merchant_locations_minimum_non_negative
    check (minimum_order_minor is null or minimum_order_minor >= 0),
  add constraint merchant_locations_eta_positive
    check (estimated_delivery_minutes is null or estimated_delivery_minutes > 0);

comment on column public.merchant_locations.delivery_areas is
  'Districts this branch delivers to. Empty means not yet configured, which is '
  'not the same as "delivers everywhere" — callers must treat it as no coverage.';

-- === Merchant products =====================================================

alter table public.merchant_products
  add column name_ar   text,
  add column is_active boolean not null default true;

create index merchant_products_active_idx
  on public.merchant_products (merchant_location_id, is_active)
  where is_active;

-- Allergens a PRODUCT carries beyond its canonical ingredient.
--
-- A canonical `chicken-breast` has no dairy in it; a merchant's marinated
-- chicken breast might. Without this table the mapping layer would silently
-- widen a user's allergen exposure, which is the one class of bug this
-- codebase treats as non-negotiable. A child table rather than an array
-- because allergen filtering has to be an index scan.
create table public.merchant_product_allergens (
  merchant_product_id uuid not null references public.merchant_products (id) on delete cascade,
  allergen            public.allergen not null,
  primary key (merchant_product_id, allergen)
);

create index merchant_product_allergens_allergen_idx
  on public.merchant_product_allergens (allergen);

-- === Ingredient → product mapping ==========================================
-- The ONLY bridge between food intelligence and a merchant catalogue. A recipe
-- references `milk`; a merchant sells "Juhayna Full Cream Milk 1L". Nothing in
-- recipes, pantry or matching may reference a SKU.

alter table public.ingredient_product_mappings
  add column source      public.mapping_source not null default 'name_match',
  add column verified_at timestamptz,
  add column verified_by uuid references auth.users (id) on delete set null,
  -- A mapping a human has REFUSED, kept rather than deleted. A matcher that
  -- re-derives its candidates will otherwise propose the same wrong product
  -- again next week, and buying somebody the wrong thing is the fastest way to
  -- lose them. Same reasoning as data/images/rejected.json.
  add column is_blocked  boolean not null default false,
  add column updated_at  timestamptz not null default now();

alter table public.ingredient_product_mappings
  add constraint ingredient_product_mappings_verified_has_timestamp
    check (not is_verified or verified_at is not null);

create trigger ingredient_product_mappings_set_updated_at
  before update on public.ingredient_product_mappings
  for each row execute function public.set_updated_at();

-- Ranking reads this index: verified first, then confidence.
create index ingredient_product_mappings_rank_idx
  on public.ingredient_product_mappings (ingredient_id, is_verified desc, confidence desc)
  where not is_blocked;

comment on table public.ingredient_product_mappings is
  'Canonical ingredient -> merchant SKU. Recipes must never reference a SKU directly.';

-- === Delivery addresses ====================================================

create table public.delivery_addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  label      text,
  line1      text not null,
  line2      text,
  district   text,
  city       text not null,
  country    text not null default 'EG',
  -- Free text, and it matters: Egyptian addresses are directions far more
  -- often than they are coordinates.
  notes      text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint delivery_addresses_country_format check (country ~ '^[A-Z]{2}$')
);

create trigger delivery_addresses_set_updated_at
  before update on public.delivery_addresses
  for each row execute function public.set_updated_at();

create index delivery_addresses_user_idx on public.delivery_addresses (user_id);

create unique index delivery_addresses_one_default_idx
  on public.delivery_addresses (user_id)
  where is_default;

-- === Cart ==================================================================
-- ONE CART, ONE MERCHANT. Cross-merchant baskets and price comparison are
-- explicitly out of scope: we are proving one complete supermarket flow.

create table public.carts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  merchant_id          uuid not null references public.merchants (id) on delete cascade,
  merchant_location_id uuid not null references public.merchant_locations (id) on delete cascade,
  currency             text not null default 'EGP',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint carts_currency_format check (currency ~ '^[A-Z]{3}$')
);

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

-- One open cart per user per branch. Switching merchants starts a new cart
-- rather than mixing two catalogues into one basket.
create unique index carts_user_location_idx
  on public.carts (user_id, merchant_location_id);

create table public.cart_lines (
  id                     uuid primary key default gen_random_uuid(),
  cart_id                uuid not null references public.carts (id) on delete cascade,
  merchant_product_id    uuid not null references public.merchant_products (id) on delete cascade,
  -- The canonical ingredient this line is here to satisfy, when it came from a
  -- recipe. This is what lets the cart say "this covers the cream you were
  -- missing" instead of listing SKUs at somebody.
  source_ingredient_slug text,
  source_recipe_id       uuid references public.recipes (id) on delete set null,
  quantity               integer not null,
  -- The unit price WHEN ADDED, not a live read. Checkout re-reads the
  -- catalogue and shows the difference rather than absorbing it: a cart that
  -- quietly re-prices itself between the shelf and the till is the most common
  -- complaint levelled at every grocery app in this market.
  unit_price_minor       integer not null,
  added_at               timestamptz not null default now(),

  unique (cart_id, merchant_product_id),
  constraint cart_lines_quantity_positive check (quantity > 0),
  constraint cart_lines_price_non_negative check (unit_price_minor >= 0)
);

create index cart_lines_cart_idx on public.cart_lines (cart_id);

-- === Orders ================================================================

create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  -- Human-facing, shown to the customer and printed on the merchant's picking
  -- list. Generated by the application, not derived from the uuid.
  reference            text not null unique,
  user_id              uuid not null references auth.users (id) on delete restrict,
  merchant_id          uuid not null references public.merchants (id) on delete restrict,
  merchant_location_id uuid not null references public.merchant_locations (id) on delete restrict,

  -- The two axes. See rule 4 at the top of this file.
  fulfilment_state     public.order_fulfilment_state not null default 'draft',
  payment_state        public.payment_state not null default 'unpaid',

  payment_method       public.payment_method not null,
  payment_provider     public.payment_provider not null,
  payment_reference    text,

  substitution_preference public.substitution_preference not null default 'contact_me',

  -- What the customer was asked to pay. The ORIGINAL figures; adjustments live
  -- in their own table and are never folded back into these.
  currency             text not null default 'EGP',
  items_subtotal_minor integer not null,
  delivery_fee_minor   integer not null default 0,
  service_fee_minor    integer not null default 0,
  discount_minor       integer not null default 0,

  -- What actually moved. Written only by the payment integration.
  captured_minor       integer not null default 0,
  refunded_minor       integer not null default 0,

  -- The commercial terms AS THEY WERE when the order was placed. Copied rather
  -- than joined, because renegotiating a rate must never restate last month's
  -- settlements.
  commission_rate_basis_points integer not null,
  merchant_keeps_delivery_fee  boolean not null,

  delivery_address_id  uuid references public.delivery_addresses (id) on delete set null,
  -- Denormalised at placement: an address the customer later edits or deletes
  -- must not change where we said we were sending somebody's dinner.
  delivery_snapshot    jsonb not null,
  contact_phone        text not null,
  customer_note        text,

  placed_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint orders_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint orders_amounts_non_negative check (
    items_subtotal_minor >= 0
    and delivery_fee_minor >= 0
    and service_fee_minor >= 0
    and discount_minor >= 0
    and captured_minor >= 0
    and refunded_minor >= 0
  ),
  constraint orders_refund_within_capture check (refunded_minor <= captured_minor),
  constraint orders_commission_range
    check (commission_rate_basis_points between 0 and 10000),
  -- A demo payment can never look production-successful: the provider is on
  -- the row, so the distinction survives in the data rather than living in a
  -- feature flag somebody can flip.
  constraint orders_placed_has_timestamp check (
    fulfilment_state in ('draft', 'pending', 'failed', 'cancelled') or placed_at is not null
  )
);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create index orders_user_idx on public.orders (user_id, created_at desc);
-- The merchant dashboard's queue query.
create index orders_merchant_queue_idx
  on public.orders (merchant_location_id, fulfilment_state, created_at);

create table public.order_items (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references public.orders (id) on delete cascade,
  merchant_product_id    uuid references public.merchant_products (id) on delete set null,
  -- Denormalised ON PURPOSE. A catalogue row can be edited, repriced or
  -- delisted; what the customer bought must still be readable in five years.
  product_name           text not null,
  product_name_ar        text,
  sku                    text,
  pack_quantity          numeric(10, 2),
  pack_unit              public.measurement_unit,
  quantity               integer not null,
  unit_price_minor       integer not null,
  line_total_minor       integer not null,
  source_ingredient_slug text,
  source_recipe_id       uuid references public.recipes (id) on delete set null,

  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_price_non_negative check (unit_price_minor >= 0),
  constraint order_items_line_total_matches
    check (line_total_minor = unit_price_minor * quantity)
);

create index order_items_order_idx on public.order_items (order_id);

-- The ledger. See rule 5 at the top of this file.
create table public.order_adjustments (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid references public.order_items (id) on delete set null,
  kind          public.adjustment_kind not null,
  -- SIGNED minor units. Negative reduces what the customer owes.
  amount_minor  integer not null,
  reason        text,
  actor         public.commerce_actor not null,
  actor_id      uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index order_adjustments_order_idx on public.order_adjustments (order_id, created_at);

comment on table public.order_adjustments is
  'Append-only. An order''s financial position is a fold over these rows, never '
  'a mutable total. Do not UPDATE or DELETE — correct a mistake with another row.';

create table public.order_substitutions (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid not null references public.orders (id) on delete cascade,
  order_item_id            uuid not null references public.order_items (id) on delete cascade,
  original_product_id      uuid references public.merchant_products (id) on delete set null,
  original_product_name    text not null,
  original_unit_price_minor integer not null,
  replacement_product_id   uuid references public.merchant_products (id) on delete set null,
  replacement_product_name text,
  replacement_unit_price_minor integer,
  -- Signed. Positive means the replacement costs more, which requires the
  -- customer's approval and a fresh authorisation — the ledger refuses any
  -- adjustment that would charge above what they agreed to.
  unit_price_delta_minor   integer not null,
  quantity                 integer not null,
  decision                 public.substitution_decision not null default 'pending_customer',
  decided_at               timestamptz,
  proposed_by              public.commerce_actor not null default 'merchant',
  created_at               timestamptz not null default now(),

  constraint order_substitutions_quantity_positive check (quantity > 0),
  constraint order_substitutions_decided_has_timestamp
    check (decision = 'pending_customer' or decided_at is not null)
);

create index order_substitutions_order_idx on public.order_substitutions (order_id);

-- The audit trail. Every status-changing action appends one, which is why
-- `orders` carries only `placed_at` and not a dozen nullable timestamps that
-- could each disagree with what actually happened.
create table public.order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  kind       public.order_event_kind not null,
  actor      public.commerce_actor not null,
  actor_id   uuid references auth.users (id) on delete set null,
  from_value text,
  to_value   text,
  note       text,
  at         timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, at);

-- === Row Level Security ====================================================
-- Reference data: read for authenticated, no write policy at all.
-- Owned rows:     auth.uid() = user_id for every verb.
-- Child rows:     guarded through the parent, so a forged id matches nothing.

alter table public.merchant_product_allergens enable row level security;

create policy "merchant_product_allergens: read via enabled merchant"
  on public.merchant_product_allergens for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchant_products mp
      join public.merchant_locations ml on ml.id = mp.merchant_location_id
      join public.merchants m on m.id = ml.merchant_id
      where mp.id = merchant_product_id and m.is_enabled
    )
  );

alter table public.delivery_addresses enable row level security;

create policy "delivery_addresses: owner reads" on public.delivery_addresses
  for select to authenticated using (auth.uid() = user_id);
create policy "delivery_addresses: owner inserts" on public.delivery_addresses
  for insert to authenticated with check (auth.uid() = user_id);
create policy "delivery_addresses: owner updates" on public.delivery_addresses
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delivery_addresses: owner deletes" on public.delivery_addresses
  for delete to authenticated using (auth.uid() = user_id);

alter table public.carts enable row level security;

create policy "carts: owner reads" on public.carts
  for select to authenticated using (auth.uid() = user_id);
create policy "carts: owner inserts" on public.carts
  for insert to authenticated with check (auth.uid() = user_id);
create policy "carts: owner updates" on public.carts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "carts: owner deletes" on public.carts
  for delete to authenticated using (auth.uid() = user_id);

alter table public.cart_lines enable row level security;

create policy "cart_lines: read via own cart" on public.cart_lines
  for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy "cart_lines: insert via own cart" on public.cart_lines
  for insert to authenticated
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy "cart_lines: update via own cart" on public.cart_lines
  for update to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy "cart_lines: delete via own cart" on public.cart_lines
  for delete to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

alter table public.orders enable row level security;

-- A customer may read their own orders and create a draft. EVERY subsequent
-- transition is a service-role write, because the state machine decides what
-- is legal and a client that could UPDATE this row could mark its own order
-- delivered, paid, or refunded.
create policy "orders: owner reads" on public.orders
  for select to authenticated using (auth.uid() = user_id);
create policy "orders: owner creates draft" on public.orders
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and fulfilment_state = 'draft'
    and payment_state = 'unpaid'
    and captured_minor = 0
    and refunded_minor = 0
  );

alter table public.order_items enable row level security;

create policy "order_items: read via own order" on public.order_items
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

alter table public.order_adjustments enable row level security;

create policy "order_adjustments: read via own order" on public.order_adjustments
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

alter table public.order_substitutions enable row level security;

create policy "order_substitutions: read via own order" on public.order_substitutions
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

alter table public.order_events enable row level security;

create policy "order_events: read via own order" on public.order_events
  for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Policies survive a table rename but keep their old names. Renaming them too
-- so `\d merchants` does not describe a table nobody can find in the codebase.
alter policy "grocery_providers: read enabled"
  on public.merchants rename to "merchants: read enabled";
alter policy "stores: read via enabled provider"
  on public.merchant_locations rename to "merchant_locations: read via enabled merchant";
alter policy "store_products: read via enabled provider"
  on public.merchant_products rename to "merchant_products: read via enabled merchant";
alter policy "store_product_matches: read for authenticated"
  on public.ingredient_product_mappings rename to "ingredient_product_mappings: read for authenticated";
