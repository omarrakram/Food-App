-- What a guest may see of a supermarket.
--
-- THE DECISION THIS IMPLEMENTS. Until now every merchant reference table was
-- behind RLS scoped to `authenticated`, so a signed-out visitor saw "no shop
-- delivers here yet" — which is safe and is also the wrong product. Somebody
-- deciding whether AKALT is worth an account has to be able to see that there
-- IS a shop, what it sells and what it charges.
--
-- THE SHAPE OF THE ANSWER MATTERS MORE THAN THE ANSWER. Loosening the policies
-- on `merchants` and `merchant_products` would have worked, and would have
-- published the commission rate, the fulfilment mode and every operational
-- column along with the price. So instead: a small set of VIEWS that name,
-- one by one, the columns a customer-facing screen needs — and nothing else
-- can leak through them, because nothing else is in them.
--
-- WHAT IS DELIBERATELY NOT HERE, and each of these is a column that exists on
-- a table below and does not appear in any view:
--
--   commission_rate_basis_points     the commercial terms
--   merchant_keeps_delivery_fee      likewise
--   fulfilment_mode, is_demo, slug   internal operational metadata
--   is_enabled                       a filter, never a field
--   external_id (on a branch)        the merchant's own internal key
--   everything about memberships, payments, refunds, orders, settlement and
--   staff — none of which has a view at all, in either direction.
--
-- AND WHAT THIS DOES NOT CHANGE: a guest can look. Creating an order still
-- requires a session — `create_order_draft`, `begin_payment` and every write
-- in commerce are `authenticated`-only and are untouched by this file. The
-- boundary moved for READS of a catalogue, and for nothing else.
--
-- `security_invoker = false` ON PURPOSE. These views run as their owner, which
-- is what lets them answer an anonymous caller at all — the underlying tables'
-- policies are `authenticated`-only and would return nothing. That is the
-- whole mechanism, so every view below is written as if it were a policy:
-- explicit columns, and a WHERE clause that is the row filter.

-- ===========================================================================
-- 1. The shop
-- ===========================================================================
-- ONLY ENABLED, NEVER DEMO. `is_enabled` is a signed agreement; `is_demo` is a
-- fixture. A development catalogue reaching an anonymous visitor would be the
-- worst outcome available to this file, so it is excluded here as well as in
-- the client — the flag that guards the bundle cannot guard a database.
create view public.public_merchants
with (security_invoker = false)
as
  select
    m.id,
    m.name,
    m.name_ar,
    m.country,
    m.currency
  from public.merchants m
  where m.is_enabled
    and not m.is_demo;

comment on view public.public_merchants is
  'Customer-facing merchant identity. No commission terms, no fulfilment mode, '
  'no slug, no is_demo — a column absent from a view cannot leak through it.';

create view public.public_merchant_locations
with (security_invoker = false)
as
  select
    l.id,
    l.merchant_id,
    l.name,
    l.name_ar,
    l.city,
    l.country,
    l.delivery_fee_minor,
    l.minimum_order_minor,
    l.estimated_delivery_minutes,
    l.is_accepting_orders
  from public.merchant_locations l
  join public.merchants m on m.id = l.merchant_id
  where m.is_enabled
    and not m.is_demo;

comment on view public.public_merchant_locations is
  'Branches of a live merchant. `external_id` is deliberately absent: it is '
  'the merchant''s own internal key and no customer screen needs it.';

-- Where a branch delivers. Public because "do you reach me?" is the first
-- question anybody asks, and answering it should not need an account.
create view public.public_merchant_location_areas
with (security_invoker = false)
as
  select
    a.merchant_location_id,
    a.area_key
  from public.merchant_location_areas a
  join public.merchant_locations l on l.id = a.merchant_location_id
  join public.merchants m on m.id = l.merchant_id
  where m.is_enabled
    and not m.is_demo;

-- ===========================================================================
-- 2. The shelf
-- ===========================================================================
-- ACTIVE AND PRICED ONLY. A delisted product is not a product, and one with no
-- price cannot be bought — publishing either would mean a browsing visitor
-- seeing things a signed-in customer could not put in a basket.
create view public.public_merchant_products
with (security_invoker = false)
as
  select
    p.id,
    p.merchant_location_id,
    p.external_id,
    p.sku,
    p.name,
    p.name_ar,
    p.brand,
    p.pack_quantity,
    p.unit,
    p.price_minor,
    p.currency,
    p.availability,
    p.image_url,
    p.is_active,
    -- CARRIED ON PURPOSE. Without it, a product with no allergen rows is
    -- indistinguishable from one the merchant declared free of them, and the
    -- whole "unknown is never safe" rule collapses on the public path exactly
    -- where it matters most.
    p.allergens_published,
    p.fetched_at
  from public.merchant_products p
  join public.merchant_locations l on l.id = p.merchant_location_id
  join public.merchants m on m.id = l.merchant_id
  where m.is_enabled
    and not m.is_demo
    and p.is_active
    and p.price_minor is not null;

comment on view public.public_merchant_products is
  'The shelf, as a customer sees it. Active and priced only. '
  '`allergens_published` is included because unknown must never read as safe.';

create view public.public_merchant_product_allergens
with (security_invoker = false)
as
  select
    pa.merchant_product_id,
    pa.allergen
  from public.merchant_product_allergens pa
  join public.merchant_products p on p.id = pa.merchant_product_id
  join public.merchant_locations l on l.id = p.merchant_location_id
  join public.merchants m on m.id = l.merchant_id
  where m.is_enabled
    and not m.is_demo
    and p.is_active;

create view public.public_merchant_product_diets
with (security_invoker = false)
as
  select
    pd.merchant_product_id,
    pd.diet,
    pd.is_compatible
  from public.merchant_product_diets pd
  join public.merchant_products p on p.id = pd.merchant_product_id
  join public.merchant_locations l on l.id = p.merchant_location_id
  join public.merchants m on m.id = l.merchant_id
  where m.is_enabled
    and not m.is_demo
    and p.is_active;

-- ===========================================================================
-- 3. The bridge into AKALT's own vocabulary
-- ===========================================================================
-- Sourcing needs to know which SKU is which canonical ingredient, and a guest
-- sourcing a recipe needs it as much as a customer does.
--
-- BLOCKED MAPPINGS ARE FILTERED OUT rather than published with their flag. A
-- block is a human's refusal — review data about a mistake somebody made —
-- and the outcome a client needs is simply that the mapping is not offered.
-- The column is kept so the row shape matches the authenticated path exactly;
-- it is always false here.
create view public.public_ingredient_product_mappings
with (security_invoker = false)
as
  select
    ipm.id,
    ipm.ingredient_id,
    ipm.merchant_product_id,
    ipm.confidence,
    ipm.source,
    ipm.is_verified,
    ipm.verified_at,
    ipm.is_blocked,
    ipm.created_at,
    ipm.updated_at
  from public.ingredient_product_mappings ipm
  join public.merchant_products p on p.id = ipm.merchant_product_id
  join public.merchant_locations l on l.id = p.merchant_location_id
  join public.merchants m on m.id = l.merchant_id
  where m.is_enabled
    and not m.is_demo
    and p.is_active
    and not ipm.is_blocked;

comment on view public.public_ingredient_product_mappings is
  '`verified_by` is absent: who reviewed a mapping is staff information. '
  'Blocked mappings are filtered out rather than published.';

-- The canonical ingredient identity, and only the identity. Sourcing speaks in
-- slugs and the mapping table keys on the row, so one lookup is unavoidable.
create view public.public_ingredients
with (security_invoker = false)
as
  select i.id, i.slug
  from public.ingredients i;

-- ===========================================================================
-- 4. Grants
-- ===========================================================================
-- Explicit, and SELECT only. A view cannot be written through here in any
-- case — none of them is updatable — but saying so is cheaper than relying on
-- it.
do $$
declare
  v_view text;
begin
  foreach v_view in array array[
    'public_merchants',
    'public_merchant_locations',
    'public_merchant_location_areas',
    'public_merchant_products',
    'public_merchant_product_allergens',
    'public_merchant_product_diets',
    'public_ingredient_product_mappings',
    'public_ingredients'
  ] loop
    execute format('revoke all on public.%I from public, anon, authenticated', v_view);
    execute format('grant select on public.%I to anon, authenticated', v_view);
  end loop;
end
$$;
