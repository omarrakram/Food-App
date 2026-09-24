-- GENERATED FILE — do not edit.
--
-- Source: data/commerce-demo/  ·  Regenerate: npm run commerce:demo
--
-- THE DEVELOPMENT CATALOGUE, AS REAL ROWS. Not a supermarket: no company named
-- here exists, no agreement stands behind it and no price is real. Every
-- merchant row carries `is_demo = true`.
--
-- LOCAL AND THROWAWAY DATABASES ONLY. Loading this into a database that serves
-- real customers would put a fixture in front of them, so the guard below
-- refuses unless somebody has explicitly said this is a development database
-- AND no real merchant already exists in it.

\set ON_ERROR_STOP on

do $guard$
begin
  if coalesce(current_setting('akalt.local_fixture', true), '') <> 'yes' then
    raise exception
      'refusing to load the demo catalogue: this is development-only data. '
      'Run "set akalt.local_fixture = ''yes'';" first, and only against a '
      'throwaway database.';
  end if;

  -- The second line of defence, and deliberately narrow: an ENABLED merchant
  -- that is not a demo is a live partner, which only a database serving real
  -- orders has. A broader test ("any non-demo merchant") fires on ordinary
  -- test fixtures, and a gate that cries wolf is a gate somebody deletes.
  if exists (select 1 from public.merchants where is_enabled and not is_demo) then
    raise exception
      'refusing to load the demo catalogue: this database has a live merchant '
      'in it, so it is not a development database.';
  end if;
end
$guard$;

-- --- The areas the branch covers -------------------------------------------
insert into public.delivery_areas (key, governorate, name_en, name_ar, is_demo)
values
  ('demo-maadi', 'cairo', 'Maadi', 'المعادي', true),
  ('demo-degla', 'cairo', 'Degla', 'دجلة', true),
  ('demo-sarayat', 'cairo', 'Sarayat El Maadi', 'سرايات المعادي', true),
  ('demo-nasr-city', 'cairo', 'Nasr City', 'مدينة نصر', true)
on conflict (key) do update set
  governorate = excluded.governorate,
  name_en     = excluded.name_en,
  name_ar     = excluded.name_ar,
  is_demo     = excluded.is_demo;

-- --- The merchant ----------------------------------------------------------
--
-- `is_enabled` is TRUE here and FALSE in the bundled TypeScript, on purpose.
-- See the note in scripts/import-commerce-demo.ts.
insert into public.merchants (
  id, slug, name, name_ar, country, currency, fulfilment_mode,
  commission_rate_basis_points, merchant_keeps_delivery_fee, is_enabled, is_demo
) values (
  '8e5bc3cb-60a2-ada1-af40-28c97aab6675', 'akalt-demo-market', 'AKALT Demo Market (development only)', 'سوق أكلت التجريبي (للتطوير فقط)',
  'EG', 'EGP',
  'dashboard'::public.merchant_fulfilment_mode,
  1000, true, true, true
)
on conflict (id) do update set
  name        = excluded.name,
  is_enabled  = excluded.is_enabled,
  is_demo     = true;

insert into public.merchant_locations (
  id, merchant_id, external_id, name, name_ar, country, city,
  delivery_fee_minor, minimum_order_minor, estimated_delivery_minutes,
  is_accepting_orders
) values (
  '263a2817-7406-2a71-3dd4-56ec4505fd38', '8e5bc3cb-60a2-ada1-af40-28c97aab6675', 'demo-branch-1',
  'Demo Branch — Maadi', 'فرع التجربة — المعادي', 'EG',
  'Cairo', 2500, 10000,
  55, true
)
on conflict (id) do update set
  delivery_fee_minor  = excluded.delivery_fee_minor,
  minimum_order_minor = excluded.minimum_order_minor,
  is_accepting_orders = excluded.is_accepting_orders;

insert into public.merchant_location_areas (merchant_location_id, area_key)
select '263a2817-7406-2a71-3dd4-56ec4505fd38', key
  from public.delivery_areas
 where key in ('demo-maadi', 'demo-degla', 'demo-sarayat')
on conflict do nothing;

-- --- What it "sells" -------------------------------------------------------
insert into public.merchant_products (
  id, merchant_location_id, external_id, sku, name, name_ar, brand,
  pack_quantity, unit, price_minor, currency, availability, is_active,
  allergens_published
)
select v.id::uuid, '263a2817-7406-2a71-3dd4-56ec4505fd38'::uuid, v.external_id, v.sku, v.name, v.name_ar, v.brand,
       v.pack_quantity, v.unit, v.price_minor, 'EGP', v.availability,
       v.is_active, v.allergens_published
  from (values
  ('1924a0d5-3a34-ec00-d85d-d6de769c2b9a', 'dm-chk-500', 'DM-CHK-500', 'Fresh Chicken Breast 500g', 'صدور فراخ طازة ٥٠٠ جم', 'Demo Farms', 500, 'g'::public.measurement_unit, 9000, 'in_stock'::public.availability_status, true, true),
  ('e0b50df4-7458-6d37-f524-4a313f54a894', 'dm-chk-1000', 'DM-CHK-1000', 'Fresh Chicken Breast 1kg', 'صدور فراخ طازة ١ كجم', 'Demo Farms', 1, 'kg'::public.measurement_unit, 17000, 'in_stock'::public.availability_status, true, true),
  ('9018c228-8aeb-a097-be2a-0b89a3982e58', 'dm-chk-mar-500', 'DM-CHK-MAR-500', 'Marinated Chicken Breast 500g', 'صدور فراخ متبلة ٥٠٠ جم', 'Demo Farms', 500, 'g'::public.measurement_unit, 10500, 'in_stock'::public.availability_status, true, true),
  ('9881326b-4e7b-2816-bfa0-3f30ff8cb94c', 'dm-rice-1000', 'DM-RICE-1000', 'Egyptian Short Grain Rice 1kg', 'رز مصري ١ كجم', 'Demo Mills', 1, 'kg'::public.measurement_unit, 4500, 'in_stock'::public.availability_status, true, true),
  ('3c2a149a-4ec1-4cae-bb7d-e0bde0f425e4', 'dm-rice-5000', 'DM-RICE-5000', 'Egyptian Short Grain Rice 5kg', 'رز مصري ٥ كجم', 'Demo Mills', 5, 'kg'::public.measurement_unit, 21000, 'in_stock'::public.availability_status, true, true),
  ('c94c1607-7b01-58c6-c7e0-5d3dbeb7e220', 'dm-tom-1000', 'DM-TOM-1000', 'Fresh Tomatoes 1kg', 'طماطم طازة ١ كجم', null, 1, 'kg'::public.measurement_unit, 2200, 'in_stock'::public.availability_status, true, true),
  ('e28f568c-6bb9-ed9a-3520-98075bacbb16', 'dm-tom-500', 'DM-TOM-500', 'Fresh Tomatoes 500g', 'طماطم طازة ٥٠٠ جم', null, 500, 'g'::public.measurement_unit, 1300, 'low_stock'::public.availability_status, true, true),
  ('f2b53ada-7c34-e5ba-2b76-73f7ca605c67', 'dm-oni-1000', 'DM-ONI-1000', 'Yellow Onions 1kg', 'بصل أصفر ١ كجم', null, 1, 'kg'::public.measurement_unit, 1800, 'in_stock'::public.availability_status, true, true),
  ('54723f6b-f88e-3314-6070-cf7f16676141', 'dm-milk-1000', 'DM-MILK-1000', 'Full Cream Milk 1L', 'لبن كامل الدسم ١ لتر', 'Demo Dairy', 1, 'l'::public.measurement_unit, 4000, 'in_stock'::public.availability_status, true, true),
  ('c12ab8f1-e946-68e3-501e-2fef9c2c6eb0', 'dm-milk-250', 'DM-MILK-250', 'Full Cream Milk 250ml', 'لبن كامل الدسم ٢٥٠ مل', 'Demo Dairy', 250, 'ml'::public.measurement_unit, 1400, 'in_stock'::public.availability_status, true, true),
  ('28cf61e9-3e9f-1a9c-1896-4a0147944c5b', 'dm-egg-12', 'DM-EGG-12', 'Table Eggs 12 pieces', 'بيض مائدة ١٢ بيضة', 'Demo Farms', 12, 'piece'::public.measurement_unit, 9000, 'in_stock'::public.availability_status, true, true),
  ('aab5fcd5-3393-7e2e-8120-cb340f622a83', 'dm-egg-30', 'DM-EGG-30', 'Table Eggs 30 pieces', 'بيض مائدة ٣٠ بيضة', 'Demo Farms', 30, 'piece'::public.measurement_unit, 20500, 'in_stock'::public.availability_status, true, true),
  ('32281c88-e426-1abc-7803-21c2ed068f28', 'dm-flour-1000', 'DM-FLOUR-1000', 'All Purpose Flour 1kg', 'دقيق فاخر ١ كجم', 'Demo Mills', 1, 'kg'::public.measurement_unit, 3200, 'in_stock'::public.availability_status, true, true),
  ('c34e0be5-6f72-4cb8-1bda-ffea33f09161', 'dm-sunoil-1000', 'DM-SUNOIL-1000', 'Sunflower Oil 1L', 'زيت عباد الشمس ١ لتر', 'Demo Oils', 1, 'l'::public.measurement_unit, 8500, 'in_stock'::public.availability_status, true, true),
  ('c6247433-6d5a-0db4-e263-eb5dec908235', 'dm-sunoil-2700', 'DM-SUNOIL-2700', 'Sunflower Oil 2.7L', 'زيت عباد الشمس ٢.٧ لتر', 'Demo Oils', 2.7, 'l'::public.measurement_unit, 21500, 'in_stock'::public.availability_status, true, true),
  ('f37a99d2-a3de-c134-4c0b-60d822da3d27', 'dm-olive-500', 'DM-OLIVE-500', 'Extra Virgin Olive Oil 500ml', 'زيت زيتون بكر ٥٠٠ مل', 'Demo Groves', 500, 'ml'::public.measurement_unit, 19000, 'in_stock'::public.availability_status, true, true),
  ('2aa70494-9dbe-c72e-3093-920c0b225ce9', 'dm-pasta-400', 'DM-PASTA-400', 'Spaghetti 400g', 'مكرونة اسباجتي ٤٠٠ جم', 'Demo Pasta', 400, 'g'::public.measurement_unit, 2400, 'in_stock'::public.availability_status, true, true),
  ('93595e98-5f4f-dc33-7763-98d23e5ba0df', 'dm-cream-200', 'DM-CREAM-200', 'Cooking Cream 200ml', 'كريمة طهي ٢٠٠ مل', 'Demo Dairy', 200, 'ml'::public.measurement_unit, 5500, 'in_stock'::public.availability_status, true, true),
  ('fb95fae6-7a3e-dfbf-a295-9df38d2ec8fb', 'dm-cream-500', 'DM-CREAM-500', 'Cooking Cream 500ml', 'كريمة طهي ٥٠٠ مل', 'Demo Dairy', 500, 'ml'::public.measurement_unit, 12000, 'out_of_stock'::public.availability_status, true, true),
  ('7b2c80bc-4ece-f02c-cb21-9daf5e93d32a', 'dm-parm-100', 'DM-PARM-100', 'Grated Parmesan 100g', 'جبنة بارميزان مبشورة ١٠٠ جم', 'Demo Dairy', 100, 'g'::public.measurement_unit, 14000, 'in_stock'::public.availability_status, true, true),
  ('bb1b2397-a5c6-fb4a-a645-3a6b18c1c22b', 'dm-lentil-500', 'DM-LENTIL-500', 'Red Lentils 500g', 'عدس أحمر ٥٠٠ جم', 'Demo Mills', 500, 'g'::public.measurement_unit, 3800, 'in_stock'::public.availability_status, true, true),
  ('353e62cb-0e53-4abe-5118-436c5d2fec1e', 'dm-garlic-200', 'DM-GARLIC-200', 'Garlic 200g', 'توم ٢٠٠ جم', null, 200, 'g'::public.measurement_unit, 2600, 'in_stock'::public.availability_status, true, true),
  ('385e5fc6-ec3b-d3f2-69bd-1d9e3173c0bc', 'dm-pot-2000', 'DM-POT-2000', 'Potatoes 2kg', 'بطاطس ٢ كجم', null, 2, 'kg'::public.measurement_unit, 3400, 'out_of_stock'::public.availability_status, true, true),
  ('eeac8474-f695-191d-e2de-c7d2154f9790', 'dm-yog-1000', 'DM-YOG-1000', 'Plain Yoghurt 1kg', 'زبادي سادة ١ كجم', 'Demo Dairy', 1, 'kg'::public.measurement_unit, 6000, 'in_stock'::public.availability_status, true, true),
  ('dd71d9c9-f4d1-50c1-bcac-635a4ad3d55d', 'dm-butter-200', 'DM-BUTTER-200', 'Butter 200g', 'زبدة ٢٠٠ جم', 'Demo Dairy', 200, 'g'::public.measurement_unit, 11000, 'in_stock'::public.availability_status, true, true),
  ('81cba757-c565-67ab-66c3-0a14c3a60330', 'dm-moz-250', 'DM-MOZ-250', 'Mozzarella 250g', 'موتزاريلا ٢٥٠ جم', 'Demo Dairy', 250, 'g'::public.measurement_unit, 9500, 'in_stock'::public.availability_status, true, true),
  ('1ed6459a-389c-06fd-90d0-f7419f26f09c', 'dm-cumin-100', 'DM-CUMIN-100', 'Ground Cumin 100g', 'كمون مطحون ١٠٠ جم', 'Demo Spices', 100, 'g'::public.measurement_unit, 2800, 'in_stock'::public.availability_status, true, true),
  ('66870ac1-fd86-2cf5-a370-3a195c734b29', 'dm-chick-400', 'DM-CHICK-400', 'Canned Chickpeas 400g', 'حمص معلب ٤٠٠ جم', 'Demo Cans', 400, 'g'::public.measurement_unit, 2900, 'in_stock'::public.availability_status, true, true),
  ('9c8717f1-0001-3b50-9a19-b022abb935e7', 'dm-sugar-1000', 'DM-SUGAR-1000', 'White Sugar 1kg', 'سكر أبيض ١ كجم', 'Demo Mills', 1, 'kg'::public.measurement_unit, 3600, 'in_stock'::public.availability_status, true, true),
  ('5fd0c841-d400-e859-6440-a3946c346788', 'dm-legacy-chk', 'DM-LEGACY-CHK', 'Discontinued Chicken Pack', 'عبوة فراخ موقوفة', 'Demo Farms', 500, 'g'::public.measurement_unit, 7000, 'unknown'::public.availability_status, false, true),
  ('5d6e70ce-18e8-0b64-38c0-786263fd4b4f', 'dm-bakery-baladi', 'DM-BAK-BALADI', 'Baladi Bread 5 loaves', 'عيش بلدي ٥ أرغفة', null, 5, 'piece'::public.measurement_unit, 1500, 'in_stock'::public.availability_status, true, false)
  ) as v (id, external_id, sku, name, name_ar, brand, pack_quantity, unit,
          price_minor, availability, is_active, allergens_published)
on conflict (id) do update set
  price_minor         = excluded.price_minor,
  availability        = excluded.availability,
  is_active           = excluded.is_active,
  allergens_published = excluded.allergens_published;

-- --- Safety metadata -------------------------------------------------------
--
-- NO ROW MEANS THE MERCHANT PUBLISHED NOTHING, which is not the same as "free
-- of it". Unknown is never safe; see features/commerce/sourcing.ts.
delete from public.merchant_product_allergens
 where merchant_product_id in (select id from public.merchant_products
                                where merchant_location_id = '263a2817-7406-2a71-3dd4-56ec4505fd38');
insert into public.merchant_product_allergens (merchant_product_id, allergen)
values
  ('9018c228-8aeb-a097-be2a-0b89a3982e58'::uuid, 'dairy'::public.allergen),
  ('54723f6b-f88e-3314-6070-cf7f16676141'::uuid, 'dairy'::public.allergen),
  ('c12ab8f1-e946-68e3-501e-2fef9c2c6eb0'::uuid, 'dairy'::public.allergen),
  ('28cf61e9-3e9f-1a9c-1896-4a0147944c5b'::uuid, 'eggs'::public.allergen),
  ('aab5fcd5-3393-7e2e-8120-cb340f622a83'::uuid, 'eggs'::public.allergen),
  ('32281c88-e426-1abc-7803-21c2ed068f28'::uuid, 'gluten'::public.allergen),
  ('2aa70494-9dbe-c72e-3093-920c0b225ce9'::uuid, 'gluten'::public.allergen),
  ('93595e98-5f4f-dc33-7763-98d23e5ba0df'::uuid, 'dairy'::public.allergen),
  ('fb95fae6-7a3e-dfbf-a295-9df38d2ec8fb'::uuid, 'dairy'::public.allergen),
  ('7b2c80bc-4ece-f02c-cb21-9daf5e93d32a'::uuid, 'dairy'::public.allergen),
  ('eeac8474-f695-191d-e2de-c7d2154f9790'::uuid, 'dairy'::public.allergen),
  ('dd71d9c9-f4d1-50c1-bcac-635a4ad3d55d'::uuid, 'dairy'::public.allergen),
  ('81cba757-c565-67ab-66c3-0a14c3a60330'::uuid, 'dairy'::public.allergen);

delete from public.merchant_product_diets
 where merchant_product_id in (select id from public.merchant_products
                                where merchant_location_id = '263a2817-7406-2a71-3dd4-56ec4505fd38');
insert into public.merchant_product_diets (merchant_product_id, diet, is_compatible)
values
  ('1924a0d5-3a34-ec00-d85d-d6de769c2b9a'::uuid, 'vegetarian'::public.dietary_preference, false),
  ('1924a0d5-3a34-ec00-d85d-d6de769c2b9a'::uuid, 'vegan'::public.dietary_preference, false),
  ('1924a0d5-3a34-ec00-d85d-d6de769c2b9a'::uuid, 'pescatarian'::public.dietary_preference, false),
  ('1924a0d5-3a34-ec00-d85d-d6de769c2b9a'::uuid, 'halal'::public.dietary_preference, true),
  ('e0b50df4-7458-6d37-f524-4a313f54a894'::uuid, 'vegetarian'::public.dietary_preference, false),
  ('e0b50df4-7458-6d37-f524-4a313f54a894'::uuid, 'vegan'::public.dietary_preference, false),
  ('e0b50df4-7458-6d37-f524-4a313f54a894'::uuid, 'pescatarian'::public.dietary_preference, false),
  ('e0b50df4-7458-6d37-f524-4a313f54a894'::uuid, 'halal'::public.dietary_preference, true),
  ('9018c228-8aeb-a097-be2a-0b89a3982e58'::uuid, 'vegetarian'::public.dietary_preference, false),
  ('9018c228-8aeb-a097-be2a-0b89a3982e58'::uuid, 'vegan'::public.dietary_preference, false),
  ('9018c228-8aeb-a097-be2a-0b89a3982e58'::uuid, 'pescatarian'::public.dietary_preference, false),
  ('9018c228-8aeb-a097-be2a-0b89a3982e58'::uuid, 'halal'::public.dietary_preference, true),
  ('9881326b-4e7b-2816-bfa0-3f30ff8cb94c'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('9881326b-4e7b-2816-bfa0-3f30ff8cb94c'::uuid, 'vegan'::public.dietary_preference, true),
  ('9881326b-4e7b-2816-bfa0-3f30ff8cb94c'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('9881326b-4e7b-2816-bfa0-3f30ff8cb94c'::uuid, 'halal'::public.dietary_preference, true),
  ('3c2a149a-4ec1-4cae-bb7d-e0bde0f425e4'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('3c2a149a-4ec1-4cae-bb7d-e0bde0f425e4'::uuid, 'vegan'::public.dietary_preference, true),
  ('3c2a149a-4ec1-4cae-bb7d-e0bde0f425e4'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('3c2a149a-4ec1-4cae-bb7d-e0bde0f425e4'::uuid, 'halal'::public.dietary_preference, true),
  ('c94c1607-7b01-58c6-c7e0-5d3dbeb7e220'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('c94c1607-7b01-58c6-c7e0-5d3dbeb7e220'::uuid, 'vegan'::public.dietary_preference, true),
  ('c94c1607-7b01-58c6-c7e0-5d3dbeb7e220'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('c94c1607-7b01-58c6-c7e0-5d3dbeb7e220'::uuid, 'halal'::public.dietary_preference, true),
  ('f2b53ada-7c34-e5ba-2b76-73f7ca605c67'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('f2b53ada-7c34-e5ba-2b76-73f7ca605c67'::uuid, 'vegan'::public.dietary_preference, true),
  ('f2b53ada-7c34-e5ba-2b76-73f7ca605c67'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('f2b53ada-7c34-e5ba-2b76-73f7ca605c67'::uuid, 'halal'::public.dietary_preference, true),
  ('54723f6b-f88e-3314-6070-cf7f16676141'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('54723f6b-f88e-3314-6070-cf7f16676141'::uuid, 'vegan'::public.dietary_preference, false),
  ('54723f6b-f88e-3314-6070-cf7f16676141'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('54723f6b-f88e-3314-6070-cf7f16676141'::uuid, 'halal'::public.dietary_preference, true),
  ('32281c88-e426-1abc-7803-21c2ed068f28'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('32281c88-e426-1abc-7803-21c2ed068f28'::uuid, 'vegan'::public.dietary_preference, true),
  ('2aa70494-9dbe-c72e-3093-920c0b225ce9'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('2aa70494-9dbe-c72e-3093-920c0b225ce9'::uuid, 'vegan'::public.dietary_preference, true),
  ('93595e98-5f4f-dc33-7763-98d23e5ba0df'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('93595e98-5f4f-dc33-7763-98d23e5ba0df'::uuid, 'vegan'::public.dietary_preference, false),
  ('93595e98-5f4f-dc33-7763-98d23e5ba0df'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('93595e98-5f4f-dc33-7763-98d23e5ba0df'::uuid, 'halal'::public.dietary_preference, true),
  ('bb1b2397-a5c6-fb4a-a645-3a6b18c1c22b'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('bb1b2397-a5c6-fb4a-a645-3a6b18c1c22b'::uuid, 'vegan'::public.dietary_preference, true),
  ('bb1b2397-a5c6-fb4a-a645-3a6b18c1c22b'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('bb1b2397-a5c6-fb4a-a645-3a6b18c1c22b'::uuid, 'halal'::public.dietary_preference, true),
  ('353e62cb-0e53-4abe-5118-436c5d2fec1e'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('353e62cb-0e53-4abe-5118-436c5d2fec1e'::uuid, 'vegan'::public.dietary_preference, true),
  ('353e62cb-0e53-4abe-5118-436c5d2fec1e'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('353e62cb-0e53-4abe-5118-436c5d2fec1e'::uuid, 'halal'::public.dietary_preference, true),
  ('dd71d9c9-f4d1-50c1-bcac-635a4ad3d55d'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('dd71d9c9-f4d1-50c1-bcac-635a4ad3d55d'::uuid, 'vegan'::public.dietary_preference, false),
  ('dd71d9c9-f4d1-50c1-bcac-635a4ad3d55d'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('dd71d9c9-f4d1-50c1-bcac-635a4ad3d55d'::uuid, 'halal'::public.dietary_preference, true),
  ('1ed6459a-389c-06fd-90d0-f7419f26f09c'::uuid, 'vegetarian'::public.dietary_preference, true),
  ('1ed6459a-389c-06fd-90d0-f7419f26f09c'::uuid, 'vegan'::public.dietary_preference, true),
  ('1ed6459a-389c-06fd-90d0-f7419f26f09c'::uuid, 'pescatarian'::public.dietary_preference, true),
  ('1ed6459a-389c-06fd-90d0-f7419f26f09c'::uuid, 'halal'::public.dietary_preference, true);

-- --- Canonical ingredient → product ----------------------------------------
--
-- Joined to `ingredients` by SLUG. A mapping whose ingredient is not in the
-- seed is silently skipped rather than failing the load: the importer already
-- refuses a mapping to an unknown slug, so a miss here means the seed has not
-- been applied, and that is the seed's problem to report.
insert into public.ingredient_product_mappings (
  ingredient_id, merchant_product_id, source, confidence, is_verified, verified_at, is_blocked
)
select i.id, v.product_id::uuid, v.source, v.confidence, v.is_verified,
       case when v.is_verified then now() else null end, v.is_blocked
  from (values
  ('chicken-breast', '1924a0d5-3a34-ec00-d85d-d6de769c2b9a', 'manual'::public.mapping_source, 1, true, false),
  ('chicken-breast', 'e0b50df4-7458-6d37-f524-4a313f54a894', 'manual'::public.mapping_source, 1, true, false),
  ('chicken-breast', '9018c228-8aeb-a097-be2a-0b89a3982e58', 'name_match'::public.mapping_source, 0.8, false, false),
  ('chicken-breast', '5fd0c841-d400-e859-6440-a3946c346788', 'name_match'::public.mapping_source, 0.7, false, false),
  ('rice', '9881326b-4e7b-2816-bfa0-3f30ff8cb94c', 'manual'::public.mapping_source, 1, true, false),
  ('rice', '3c2a149a-4ec1-4cae-bb7d-e0bde0f425e4', 'manual'::public.mapping_source, 1, false, false),
  ('tomatoes', 'c94c1607-7b01-58c6-c7e0-5d3dbeb7e220', 'manual'::public.mapping_source, 1, true, false),
  ('tomatoes', 'e28f568c-6bb9-ed9a-3520-98075bacbb16', 'manual'::public.mapping_source, 1, false, false),
  ('onions', 'f2b53ada-7c34-e5ba-2b76-73f7ca605c67', 'manual'::public.mapping_source, 1, true, false),
  ('milk', '54723f6b-f88e-3314-6070-cf7f16676141', 'manual'::public.mapping_source, 1, true, false),
  ('milk', 'c12ab8f1-e946-68e3-501e-2fef9c2c6eb0', 'manual'::public.mapping_source, 1, false, false),
  ('eggs', '28cf61e9-3e9f-1a9c-1896-4a0147944c5b', 'manual'::public.mapping_source, 1, true, false),
  ('eggs', 'aab5fcd5-3393-7e2e-8120-cb340f622a83', 'manual'::public.mapping_source, 1, false, false),
  ('flour', '32281c88-e426-1abc-7803-21c2ed068f28', 'manual'::public.mapping_source, 1, true, false),
  ('sunflower-oil', 'c34e0be5-6f72-4cb8-1bda-ffea33f09161', 'manual'::public.mapping_source, 1, true, false),
  ('sunflower-oil', 'c6247433-6d5a-0db4-e263-eb5dec908235', 'manual'::public.mapping_source, 1, false, false),
  ('olive-oil', 'f37a99d2-a3de-c134-4c0b-60d822da3d27', 'manual'::public.mapping_source, 1, true, false),
  ('pasta', '2aa70494-9dbe-c72e-3093-920c0b225ce9', 'manual'::public.mapping_source, 1, true, false),
  ('cream', '93595e98-5f4f-dc33-7763-98d23e5ba0df', 'manual'::public.mapping_source, 1, true, false),
  ('cream', 'fb95fae6-7a3e-dfbf-a295-9df38d2ec8fb', 'manual'::public.mapping_source, 1, false, false),
  ('parmesan', '7b2c80bc-4ece-f02c-cb21-9daf5e93d32a', 'manual'::public.mapping_source, 1, true, false),
  ('lentils', 'bb1b2397-a5c6-fb4a-a645-3a6b18c1c22b', 'manual'::public.mapping_source, 1, true, false),
  ('garlic', '353e62cb-0e53-4abe-5118-436c5d2fec1e', 'manual'::public.mapping_source, 1, true, false),
  ('potatoes', '385e5fc6-ec3b-d3f2-69bd-1d9e3173c0bc', 'manual'::public.mapping_source, 1, true, false),
  ('yogurt', 'eeac8474-f695-191d-e2de-c7d2154f9790', 'manual'::public.mapping_source, 1, true, false),
  ('butter', 'dd71d9c9-f4d1-50c1-bcac-635a4ad3d55d', 'manual'::public.mapping_source, 1, true, false),
  ('mozzarella', '81cba757-c565-67ab-66c3-0a14c3a60330', 'manual'::public.mapping_source, 1, true, false),
  ('cumin', '1ed6459a-389c-06fd-90d0-f7419f26f09c', 'manual'::public.mapping_source, 1, true, false),
  ('chickpeas', '66870ac1-fd86-2cf5-a370-3a195c734b29', 'manual'::public.mapping_source, 1, true, false),
  ('sugar', '9c8717f1-0001-3b50-9a19-b022abb935e7', 'manual'::public.mapping_source, 1, true, false),
  ('butter', 'f37a99d2-a3de-c134-4c0b-60d822da3d27', 'category_fallback'::public.mapping_source, 0.3, false, true),
  ('baladi-bread', '5d6e70ce-18e8-0b64-38c0-786263fd4b4f', 'manual'::public.mapping_source, 1, true, false)
  ) as v (slug, product_id, source, confidence, is_verified, is_blocked)
  join public.ingredients i on i.slug = v.slug
on conflict (ingredient_id, merchant_product_id) do update set
  confidence  = excluded.confidence,
  is_verified = excluded.is_verified,
  is_blocked  = excluded.is_blocked;
