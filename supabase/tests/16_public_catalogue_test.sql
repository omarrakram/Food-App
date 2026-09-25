-- What a stranger can see, and what a stranger must never see.
--
-- The public catalogue surface exists so somebody without an account can
-- discover that there IS a shop, what it sells and what it charges. It is a
-- small set of views rather than a loosened policy, and the whole safety
-- argument is that a column absent from a view cannot leak through it.
--
-- So this suite is mostly about ABSENCE, which is the hard thing to test: it
-- asserts the exact column list of every view, so that adding one becomes a
-- visible diff in a test rather than a quiet widening. And it checks the rows
-- too — a disabled merchant, a fixture merchant, a delisted product and a
-- blocked mapping must all be invisible.

\set ON_ERROR_STOP on
\echo ''
\echo 'Public catalogue: what a guest may see'

create or replace function pg_temp.assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice '  ok  %', description;
  else
    raise exception 'FAILED: %', description;
  end if;
end;
$$;

create or replace function pg_temp.assert_rejected(statement text, description text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception
    when others then
      raise notice '  ok  % (rejected: %)', description, sqlerrm;
      return;
  end;
  raise exception 'FAILED: % — statement succeeded but should have been rejected', description;
end;
$$;

/** The columns a view actually exposes, as a sorted, comparable string. */
create or replace function pg_temp.columns_of(p_view text)
returns text language sql stable as $$
  select string_agg(column_name, ',' order by column_name)
    from information_schema.columns
   where table_schema = 'public' and table_name = p_view;
$$;

-- --- Fixtures --------------------------------------------------------------

insert into auth.users (id, email)
values ('90000000-0000-4000-8000-00000000000a', 'shopper@public.test');

insert into public.delivery_areas (key, governorate, name_en, name_ar, is_demo)
values ('public-heliopolis', 'cairo', 'Heliopolis', 'مصر الجديدة', false);

-- THREE MERCHANTS, and only one of them may ever be public.
insert into public.merchants (id, slug, name, name_ar, country, currency, fulfilment_mode,
                              commission_rate_basis_points, merchant_keeps_delivery_fee,
                              is_enabled, is_demo)
values
  -- The live partner.
  ('91000000-0000-4000-8000-000000000001', 'public-live', 'Live Shop', 'محل شغال', 'EG', 'EGP',
   'dashboard', 1250, true, true, false),
  -- Signed nothing yet.
  ('91000000-0000-4000-8000-000000000002', 'public-pending', 'Pending Shop', null, 'EG', 'EGP',
   'dashboard', 1000, true, false, false),
  -- A development fixture that somebody switched on in this database.
  ('91000000-0000-4000-8000-000000000003', 'public-fixture', 'Fixture Shop', null, 'EG', 'EGP',
   'dashboard', 1000, true, true, true);

insert into public.merchant_locations (id, merchant_id, external_id, name, name_ar, country, city,
                                       delivery_fee_minor, minimum_order_minor,
                                       is_accepting_orders)
values
  ('91000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000001',
   'live-branch-secret-key', 'Live Branch', 'الفرع', 'EG', 'Cairo', 2000, 5000, true),
  ('91000000-0000-4000-8000-00000000000b', '91000000-0000-4000-8000-000000000003',
   'fixture-branch', 'Fixture Branch', null, 'EG', 'Cairo', 2000, 5000, true);

insert into public.merchant_location_areas (merchant_location_id, area_key)
values
  ('91000000-0000-4000-8000-00000000000a', 'public-heliopolis'),
  ('91000000-0000-4000-8000-00000000000b', 'public-heliopolis');

insert into public.merchant_products (id, merchant_location_id, external_id, name, name_ar,
                                      pack_quantity, unit, price_minor, currency,
                                      availability, is_active, allergens_published)
values
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-00000000000a',
   'pub-rice', 'Rice 1kg', 'أرز', 1, 'kg', 5000, 'EGP', 'in_stock', true, true),
  -- Delisted. Not a product.
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-00000000000a',
   'pub-gone', 'Withdrawn Item', null, 1, 'kg', 5000, 'EGP', 'in_stock', false, true),
  -- No price. Cannot be bought, so must not be browsed either.
  ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-00000000000a',
   'pub-unpriced', 'Unpriced Item', null, 1, 'kg', null, 'EGP', 'in_stock', true, true),
  -- The fixture shop's shelf.
  ('92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-00000000000b',
   'fix-rice', 'Fixture Rice', null, 1, 'kg', 5000, 'EGP', 'in_stock', true, true);

insert into public.merchant_product_allergens (merchant_product_id, allergen)
values ('92000000-0000-4000-8000-000000000001', 'gluten');

insert into public.merchant_product_diets (merchant_product_id, diet, is_compatible)
values ('92000000-0000-4000-8000-000000000001', 'vegan', true);

insert into public.ingredient_product_mappings (
  ingredient_id, merchant_product_id, confidence, source, is_verified, verified_at,
  verified_by, is_blocked
)
select i.id, '92000000-0000-4000-8000-000000000001', 1.00, 'manual', true, now(),
       '90000000-0000-4000-8000-00000000000a', false
  from public.ingredients i where i.slug = 'rice';

-- A mapping a human refused. Review data about somebody's mistake.
insert into public.ingredient_product_mappings (
  ingredient_id, merchant_product_id, confidence, source, is_verified, is_blocked
)
select i.id, '92000000-0000-4000-8000-000000000003', 0.40, 'name_match', false, true
  from public.ingredients i where i.slug = 'rice';

-- ===========================================================================
-- 1. THE COLUMN LISTS
-- ===========================================================================
-- Asserted exactly. This is the test that makes widening the surface a
-- deliberate act: adding a column to a view fails here, and whoever adds it
-- has to write down that they meant to.

do $$
begin
  perform pg_temp.assert(
    pg_temp.columns_of('public_merchants') = 'country,currency,id,name,name_ar',
    'public_merchants exposes identity and nothing else');

  perform pg_temp.assert(
    pg_temp.columns_of('public_merchant_locations') =
      'city,country,delivery_fee_minor,estimated_delivery_minutes,id,is_accepting_orders,'
      || 'merchant_id,minimum_order_minor,name,name_ar',
    'public_merchant_locations carries no external_id and no timestamps');

  perform pg_temp.assert(
    pg_temp.columns_of('public_merchant_products') =
      'allergens_published,availability,brand,currency,external_id,fetched_at,id,image_url,'
      || 'is_active,merchant_location_id,name,name_ar,pack_quantity,price_minor,sku,unit',
    'public_merchant_products is the shelf, with allergens_published on it');

  perform pg_temp.assert(
    pg_temp.columns_of('public_ingredient_product_mappings') =
      'confidence,created_at,id,ingredient_id,is_blocked,is_verified,merchant_product_id,'
      || 'source,updated_at,verified_at',
    'public_ingredient_product_mappings does NOT carry verified_by');

  -- THE ONES THAT MATTER MOST, stated as absences.
  perform pg_temp.assert(
    pg_temp.columns_of('public_merchants') not like '%commission%',
    'the commission rate is not on the public surface');
  perform pg_temp.assert(
    pg_temp.columns_of('public_merchants') not like '%merchant_keeps_delivery_fee%',
    'nor is the delivery-fee term');
  perform pg_temp.assert(
    pg_temp.columns_of('public_merchants') not like '%is_demo%'
    and pg_temp.columns_of('public_merchants') not like '%is_enabled%'
    and pg_temp.columns_of('public_merchants') not like '%slug%'
    and pg_temp.columns_of('public_merchants') not like '%fulfilment_mode%',
    'nor the operational flags — they are filters here, never fields');
end;
$$;

-- ===========================================================================
-- 2. WHAT A GUEST SEES
-- ===========================================================================

set role anon;

do $$
begin
  perform pg_temp.assert(
    exists (select 1 from public.public_merchants
             where id = '91000000-0000-4000-8000-000000000001'),
    'a guest can see the live shop');

  perform pg_temp.assert(
    not exists (select 1 from public.public_merchants
                 where id = '91000000-0000-4000-8000-000000000002'),
    'but NOT one that has signed nothing');

  -- THE HEADLINE. A fixture reaching an anonymous visitor is the worst thing
  -- this surface could do, and the build-time flag cannot guard a database.
  perform pg_temp.assert(
    not exists (select 1 from public.public_merchants
                 where id = '91000000-0000-4000-8000-000000000003'),
    'and NEVER a demo catalogue, even one enabled in this database');
  perform pg_temp.assert(
    not exists (select 1 from public.public_merchant_products
                 where id = '92000000-0000-4000-8000-000000000004'),
    'nor anything on the demo shelf');

  perform pg_temp.assert(
    exists (select 1 from public.public_merchant_products
             where id = '92000000-0000-4000-8000-000000000001'),
    'a guest can see a real product');
  perform pg_temp.assert(
    not exists (select 1 from public.public_merchant_products
                 where id = '92000000-0000-4000-8000-000000000002'),
    'but not a delisted one');
  perform pg_temp.assert(
    not exists (select 1 from public.public_merchant_products
                 where id = '92000000-0000-4000-8000-000000000003'),
    'and not one with no price — it cannot be bought, so it is not browsed');

  perform pg_temp.assert(
    (select allergens_published from public.public_merchant_products
      where id = '92000000-0000-4000-8000-000000000001') = true,
    'the published-allergens flag survives to the public surface');

  perform pg_temp.assert(
    exists (select 1 from public.public_merchant_product_allergens
             where merchant_product_id = '92000000-0000-4000-8000-000000000001'),
    'and so does the allergen list itself');

  perform pg_temp.assert(
    exists (select 1 from public.public_merchant_location_areas
             where merchant_location_id = '91000000-0000-4000-8000-00000000000a'),
    'a guest can ask whether the shop reaches them');

  perform pg_temp.assert(
    exists (select 1 from public.public_ingredient_product_mappings
             where merchant_product_id = '92000000-0000-4000-8000-000000000001'),
    'and can source a recipe against the shelf');

  perform pg_temp.assert(
    not exists (select 1 from public.public_ingredient_product_mappings
                 where merchant_product_id = '92000000-0000-4000-8000-000000000003'),
    'a mapping a human refused is not published');

  perform pg_temp.assert(
    exists (select 1 from public.public_ingredients where slug = 'rice'),
    'and the canonical ingredient identity is readable');
end;
$$;

-- ===========================================================================
-- 3. WHAT A GUEST MUST NOT SEE
-- ===========================================================================

do $$
begin
  -- The raw tables are all `authenticated`-only and stay that way. RLS answers
  -- with no rows rather than an error, which is the correct shape: an error
  -- would confirm the row exists.
  perform pg_temp.assert(
    (select count(*) from public.merchants) = 0,
    'a guest reads nothing from the merchants table itself');
  perform pg_temp.assert(
    (select count(*) from public.merchant_locations) = 0,
    'nor from merchant_locations');
  perform pg_temp.assert(
    (select count(*) from public.merchant_products) = 0,
    'nor from merchant_products');
  perform pg_temp.assert(
    (select count(*) from public.ingredient_product_mappings) = 0,
    'nor from the mapping table');
  perform pg_temp.assert(
    (select count(*) from public.merchant_memberships) = 0,
    'nor any staff membership');
  perform pg_temp.assert(
    (select count(*) from public.orders) = 0,
    'nor anybody''s orders');
  perform pg_temp.assert(
    (select count(*) from public.payment_intents) = 0,
    'nor any payment attempt');
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts) = 0,
    'nor any refund');
  perform pg_temp.assert(
    (select count(*) from public.delivery_addresses) = 0,
    'nor anybody''s address');

  -- And nothing can be written through a view.
  perform pg_temp.assert_rejected(
    $q$insert into public.public_merchants (id, name, country, currency)
       values (gen_random_uuid(), 'Mine Now', 'EG', 'EGP')$q$,
    'a guest cannot insert a merchant through the view');
  perform pg_temp.assert_rejected(
    $q$update public.public_merchant_products set price_minor = 1$q$,
    'nor change a price through it');

  -- Nor reach the functions that move money or state.
  perform pg_temp.assert_rejected(
    format('select public.request_refund(%L, %L)', gen_random_uuid(), 'mine'),
    'nor request a refund');
  perform pg_temp.assert_rejected(
    format('select public.create_order_draft(1, %L, %L)', gen_random_uuid(), 'k'),
    'nor create an order draft — checkout still needs an account');
end;
$$;

reset role;

-- ===========================================================================
-- 4. A SIGNED-IN CUSTOMER LOSES NOTHING
-- ===========================================================================

set role authenticated;
set request.jwt.claim.sub = '90000000-0000-4000-8000-00000000000a';

do $$
begin
  perform pg_temp.assert(
    exists (select 1 from public.public_merchants
             where id = '91000000-0000-4000-8000-000000000001'),
    'a customer reads the same public surface');

  -- The authenticated path still reaches the tables, which is what the
  -- merchant dashboard and revalidation depend on.
  perform pg_temp.assert(
    exists (select 1 from public.merchants
             where id = '91000000-0000-4000-8000-000000000001'),
    'and still reaches the enabled merchant row itself');

  -- But an ordinary customer is not staff, and never was.
  perform pg_temp.assert(
    (select count(*) from public.merchant_memberships) = 0,
    'while still seeing no staff list');
end;
$$;

reset role;

\echo 'Public catalogue: passed'
