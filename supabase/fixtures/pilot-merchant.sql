-- LOCAL ONLY. A merchant that is NOT the demo catalogue.
--
-- WHY THIS EXISTS. Track A replaced the static `enabledPartnerFor()` — which
-- returned null forever — with a real read of `merchants` and
-- `merchant_locations`. Proving that read works needs something for it to
-- find, and the one merchant in the repository is the development catalogue,
-- which is deliberately `is_demo = true` and therefore deliberately invisible
-- to the new path. So: a small enabled, non-demo merchant, for the browser
-- walk to select the way it will select a real supermarket.
--
-- READ THE GUARDS BELOW BEFORE CHANGING ANYTHING HERE. This file creates an
-- ENABLED, NON-DEMO merchant — the exact shape the app treats as a live
-- partner, with no badge and no warning. Run against a real project it would
-- put a fictional supermarket in front of customers. Three things stop that:
--
--   1. `akalt.local_fixture` must be set to 'yes' by the caller.
--   2. The database must be running the TEST PLATFORM SHIM rather than
--      Supabase. Supabase's own `auth.users` carries `instance_id`; the shim's
--      does not, and that difference is not something a flag can flip.
--   3. There must be no OTHER enabled non-demo merchant — if a real
--      supermarket is configured here, this is not a throwaway database.
--
-- Nothing in this file is a real business. The name says so.
do $$
begin
  if coalesce(current_setting('akalt.local_fixture', true), '') <> 'yes' then
    raise exception
      'pilot-merchant.sql is a LOCAL fixture. Run it with '
      '`set akalt.local_fixture = ''yes''` and only against a throwaway database.';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'auth' and table_name = 'users' and column_name = 'instance_id'
  ) then
    raise exception
      'This looks like a real Supabase project (auth.users has instance_id). '
      'The pilot fixture creates an ENABLED merchant and refuses to run here.';
  end if;

  if exists (
    select 1 from public.merchants
     where is_enabled and not is_demo and slug <> 'pilot-test-supermarket'
  ) then
    raise exception
      'Another enabled merchant already exists. Refusing to add a fixture '
      'partner beside a real one.';
  end if;
end
$$;

-- Areas this branch serves. NOT `is_demo`, because a demo area is hidden from
-- the address form unless the demo flag is on — and the whole point here is a
-- configuration that works with the demo catalogue switched OFF.
insert into public.delivery_areas (key, governorate, name_en, name_ar, is_demo)
values
  ('pilot-maadi',  'cairo', 'Maadi',  'المعادي',  false),
  ('pilot-nasr',   'cairo', 'Nasr City', 'مدينة نصر', false)
on conflict (key) do nothing;

insert into public.merchants (
  id, slug, name, name_ar, country, currency, fulfilment_mode,
  commission_rate_basis_points, merchant_keeps_delivery_fee, is_enabled, is_demo
) values (
  '7e100000-0000-4000-8000-000000000001',
  'pilot-test-supermarket',
  'Pilot Test Supermarket',
  'سوبر ماركت تجربة التشغيل',
  'EG', 'EGP', 'dashboard', 1000, true, true, false
)
on conflict (id) do update set
  is_enabled = excluded.is_enabled,
  is_demo    = excluded.is_demo;

insert into public.merchant_locations (
  id, merchant_id, external_id, name, name_ar, country, city,
  delivery_fee_minor, minimum_order_minor, estimated_delivery_minutes,
  is_accepting_orders
) values (
  '7e100000-0000-4000-8000-00000000000a',
  '7e100000-0000-4000-8000-000000000001',
  'pilot-branch-1', 'Pilot Branch — Maadi', 'فرع التجربة — المعادي',
  'EG', 'Cairo', 2500, 10000, 50, true
)
on conflict (id) do update set is_accepting_orders = excluded.is_accepting_orders;

insert into public.merchant_location_areas (merchant_location_id, area_key)
values
  ('7e100000-0000-4000-8000-00000000000a', 'pilot-maadi'),
  ('7e100000-0000-4000-8000-00000000000a', 'pilot-nasr')
on conflict do nothing;

-- A small shelf. Prices are invented; this is a fixture, and the only thing
-- that matters about them is that the pack maths and the minimum order have
-- something real-shaped to work on.
--
-- `allergens_published` is TRUE on some rows and FALSE on others ON PURPOSE.
-- A catalogue where every product has published allergen data is not the
-- catalogue any supermarket will hand over, and a walk against one would never
-- exercise the rule that unpublished is never safe.
insert into public.merchant_products (
  id, merchant_location_id, external_id, sku, name, name_ar, brand,
  pack_quantity, unit, price_minor, currency, availability, is_active,
  allergens_published
) values
  ('7e200000-0000-4000-8000-000000000001', '7e100000-0000-4000-8000-00000000000a',
   'pl-rice-1000', 'PL-RICE-1KG', 'Egyptian Rice 1kg', 'أرز مصري ١ كجم', 'Pilot',
   1, 'kg', 6500, 'EGP', 'in_stock', true, true),
  ('7e200000-0000-4000-8000-000000000002', '7e100000-0000-4000-8000-00000000000a',
   'pl-pasta-500', 'PL-PASTA-500', 'Pasta Penne 500g', 'مكرونة بيني ٥٠٠ جم', 'Pilot',
   500, 'g', 3200, 'EGP', 'in_stock', true, true),
  ('7e200000-0000-4000-8000-000000000003', '7e100000-0000-4000-8000-00000000000a',
   'pl-oil-750', 'PL-OIL-750', 'Olive Oil 750ml', 'زيت زيتون ٧٥٠ مل', 'Pilot',
   750, 'ml', 18500, 'EGP', 'in_stock', true, true),
  ('7e200000-0000-4000-8000-000000000004', '7e100000-0000-4000-8000-00000000000a',
   'pl-onion-1000', 'PL-ONION-1KG', 'Onions 1kg', 'بصل ١ كجم', 'Pilot',
   1, 'kg', 2800, 'EGP', 'in_stock', true, true),
  ('7e200000-0000-4000-8000-000000000005', '7e100000-0000-4000-8000-00000000000a',
   'pl-egg-12', 'PL-EGG-12', 'Table Eggs 12 pieces', 'بيض مائدة ١٢ بيضة', 'Pilot',
   12, 'piece', 9500, 'EGP', 'in_stock', true, true),
  -- Published nothing about allergens. An allergic customer must never be
  -- handed this automatically, however well it maps.
  ('7e200000-0000-4000-8000-000000000006', '7e100000-0000-4000-8000-00000000000a',
   'pl-milk-1000', 'PL-MILK-1L', 'Full Cream Milk 1L', 'لبن كامل الدسم ١ لتر', 'Pilot',
   1, 'l', 5400, 'EGP', 'in_stock', true, false),
  -- Out of stock, so `no_purchasable_match` is reachable in a walk.
  ('7e200000-0000-4000-8000-000000000007', '7e100000-0000-4000-8000-00000000000a',
   'pl-potato-2000', 'PL-POT-2KG', 'Potatoes 2kg', 'بطاطس ٢ كجم', 'Pilot',
   2, 'kg', 4200, 'EGP', 'out_of_stock', true, true)
on conflict (id) do nothing;

insert into public.merchant_product_allergens (merchant_product_id, allergen)
values
  ('7e200000-0000-4000-8000-000000000002', 'gluten')
on conflict do nothing;

insert into public.merchant_product_diets (merchant_product_id, diet, is_compatible)
values
  ('7e200000-0000-4000-8000-000000000001', 'vegan', true),
  ('7e200000-0000-4000-8000-000000000003', 'vegan', true),
  ('7e200000-0000-4000-8000-000000000004', 'vegan', true)
on conflict do nothing;

-- The bridge into AKALT's own vocabulary. Kept SEPARATE from the merchant's
-- raw rows above, which is the rule for every catalogue: their SKUs are theirs,
-- the canonical ingredient is ours, and the mapping is a third thing that can
-- be reviewed and blocked without touching either side.
insert into public.ingredient_product_mappings (
  ingredient_id, merchant_product_id, confidence, source, is_verified, verified_at, is_blocked
)
-- `verified_at` is not decoration: a constraint requires a verified mapping to
-- say WHEN somebody verified it, because "a human checked this" with no date
-- is a claim nobody can audit.
select i.id, m.product_id, m.confidence, m.source::public.mapping_source, m.verified,
       case when m.verified then now() else null end, false
  from (values
    ('rice',            '7e200000-0000-4000-8000-000000000001'::uuid, 1.00, 'manual',    true),
    ('pasta',           '7e200000-0000-4000-8000-000000000002'::uuid, 1.00, 'manual',    true),
    ('olive-oil',       '7e200000-0000-4000-8000-000000000003'::uuid, 1.00, 'manual',    true),
    ('onions',          '7e200000-0000-4000-8000-000000000004'::uuid, 1.00, 'manual',    true),
    ('eggs',            '7e200000-0000-4000-8000-000000000005'::uuid, 1.00, 'manual',    true),
    ('milk',            '7e200000-0000-4000-8000-000000000006'::uuid, 0.85, 'name_match', false),
    ('potatoes',        '7e200000-0000-4000-8000-000000000007'::uuid, 1.00, 'manual',    true)
  ) as m(slug, product_id, confidence, source, verified)
  join public.ingredients i on i.slug = m.slug
on conflict do nothing;

select 'pilot fixture: '
    || (select count(*) from public.merchants where is_enabled and not is_demo) || ' enabled merchant(s), '
    || (select count(*) from public.merchant_products
         where merchant_location_id = '7e100000-0000-4000-8000-00000000000a') || ' products, '
    || (select count(*) from public.ingredient_product_mappings m
         join public.merchant_products p on p.id = m.merchant_product_id
        where p.merchant_location_id = '7e100000-0000-4000-8000-00000000000a') || ' mappings' as summary;
