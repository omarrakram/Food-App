-- ---------------------------------------------------------------------------
-- Akla — seed data.
--
-- GENERATED FILE. Do not edit by hand.
--   source: src/features/ingredients/catalogue.ts
--           src/features/recipes/fixtures.ts
--   regenerate: npm run seed:generate
--
-- Idempotent: every statement upserts on a natural key, so re-running it
-- against a populated database refreshes rather than duplicates.
--
-- PRICES IN THIS FILE ARE ESTIMATES, not live store prices. They reflect
-- typical EG supermarket shelf prices as reviewed on 2026-08-01
-- and must always be surfaced to users with the estimate treatment.
-- ---------------------------------------------------------------------------

begin;

-- === Ingredients ===========================================================

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('34af8120-6d67-58e6-aad4-b346bef1706a', 'almonds', 'almonds', 'لوز', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('34af8120-6d67-58e6-aad4-b346bef1706a', 'nuts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('34af8120-6d67-58e6-aad4-b346bef1706a', 'لوز') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('34af8120-6d67-58e6-aad4-b346bef1706a', 'loz') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('34af8120-6d67-58e6-aad4-b346bef1706a', 'almond') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2549f3c7-9723-5980-8f09-20a168b3baf4', 'anchovy', 'anchovies', 'أنشوجة', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('2549f3c7-9723-5980-8f09-20a168b3baf4', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2549f3c7-9723-5980-8f09-20a168b3baf4', 'anchovies') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2549f3c7-9723-5980-8f09-20a168b3baf4', 'أنشوجة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2549f3c7-9723-5980-8f09-20a168b3baf4', 'انشوفي') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('aa2037c3-ac53-5329-9284-cc261142a0ee', 'anise', 'anise', 'ينسون', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('aa2037c3-ac53-5329-9284-cc261142a0ee', 'ينسون') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aa2037c3-ac53-5329-9284-cc261142a0ee', 'yansoon') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aa2037c3-ac53-5329-9284-cc261142a0ee', 'aniseed') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('54ff24dd-09eb-5147-a951-5793844243b8', 'apples', 'apples', 'تفاح', 'fruit', 'piece', 160, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('54ff24dd-09eb-5147-a951-5793844243b8', 'apple') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('54ff24dd-09eb-5147-a951-5793844243b8', 'tofah') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('54ff24dd-09eb-5147-a951-5793844243b8', 'تفاحة') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('54ff24dd-09eb-5147-a951-5793844243b8', 'EG', 'EGP', 'kg', 1,
  5000, 7000, 10000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('3b66c48d-03bd-5ce7-a53f-85b2f96e3340', 'apricot', 'apricots', 'مشمش', 'fruit', 'piece', 40, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('3b66c48d-03bd-5ce7-a53f-85b2f96e3340', 'apricot') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3b66c48d-03bd-5ce7-a53f-85b2f96e3340', 'مشمش') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3b66c48d-03bd-5ce7-a53f-85b2f96e3340', 'meshmesh') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('6fccf69b-3b30-5549-8431-5e11973eb4cd', 'artichoke', 'artichoke', 'خرشوف', 'vegetables', 'piece', 130, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('6fccf69b-3b30-5549-8431-5e11973eb4cd', 'kharshouf') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('6fccf69b-3b30-5549-8431-5e11973eb4cd', 'خرشوف') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('6fccf69b-3b30-5549-8431-5e11973eb4cd', 'ardi shawki') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4b0a1b3b-8e54-51b8-bb03-6f12a7d506c1', 'asparagus', 'asparagus', 'هليون', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('4b0a1b3b-8e54-51b8-bb03-6f12a7d506c1', 'هليون') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4b0a1b3b-8e54-51b8-bb03-6f12a7d506c1', 'اسبراجوس') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('f3defe72-4661-5cce-8c0e-79dc298214d2', 'avocado', 'avocado', 'أفوكادو', 'vegetables', 'piece', 200, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('f3defe72-4661-5cce-8c0e-79dc298214d2', 'افوكادو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f3defe72-4661-5cce-8c0e-79dc298214d2', 'أفوكادو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f3defe72-4661-5cce-8c0e-79dc298214d2', 'avocados') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5202ca51-2df8-5cdc-9855-8512b0fbe40a', 'baba-ganoush', 'baba ganoush', 'بابا غنوج', 'sauces', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('5202ca51-2df8-5cdc-9855-8512b0fbe40a', 'sesame') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5202ca51-2df8-5cdc-9855-8512b0fbe40a', 'بابا غنوج') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5202ca51-2df8-5cdc-9855-8512b0fbe40a', 'متبل') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('41bcfb82-6c8e-559f-a765-02792252f095', 'bacon-beef', 'beef bacon', 'بيكون بقري', 'protein', 'g', 20, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('41bcfb82-6c8e-559f-a765-02792252f095', 'beef bacon') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('41bcfb82-6c8e-559f-a765-02792252f095', 'بيكون') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('07b412de-52d5-5dec-ad63-03e776cedf61', 'baguette', 'baguette', 'عيش فينو', 'bakery', 'piece', 120, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('07b412de-52d5-5dec-ad63-03e776cedf61', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('07b412de-52d5-5dec-ad63-03e776cedf61', 'fino') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('07b412de-52d5-5dec-ad63-03e776cedf61', 'عيش فينو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('07b412de-52d5-5dec-ad63-03e776cedf61', 'فينو') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('548c2efe-d095-5650-a54c-cbf1714ed238', 'baking-chocolate', 'dark chocolate', 'شوكولاتة داكنة', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('548c2efe-d095-5650-a54c-cbf1714ed238', 'soy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('548c2efe-d095-5650-a54c-cbf1714ed238', 'شوكولاتة دارك') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('548c2efe-d095-5650-a54c-cbf1714ed238', 'dark chocolate') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('965777eb-29fc-512f-9380-7eb75a4968f9', 'baking-powder', 'baking powder', 'بيكنج بودر', 'pantry', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('965777eb-29fc-512f-9380-7eb75a4968f9', 'بيكنج بودر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('965777eb-29fc-512f-9380-7eb75a4968f9', 'baking soda') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('965777eb-29fc-512f-9380-7eb75a4968f9', 'بيكربونات') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'baladi-bread', 'baladi bread', 'عيش بلدي', 'bakery', 'piece', 90, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'aish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'aish baladi') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'eish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'eish baladi') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'pita') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'flatbread') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'bread') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'عيش') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'خبز') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('e6a3d50c-1f05-5538-b3f6-addf15cdb864', 'EG', 'EGP', 'piece', 1,
  100, 150, 300, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b0c80673-dd67-5b0f-bae1-d88c90288a76', 'bananas', 'bananas', 'موز', 'fruit', 'piece', 120, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b0c80673-dd67-5b0f-bae1-d88c90288a76', 'banana') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b0c80673-dd67-5b0f-bae1-d88c90288a76', 'moz') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b0c80673-dd67-5b0f-bae1-d88c90288a76', 'موزة') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('b0c80673-dd67-5b0f-bae1-d88c90288a76', 'EG', 'EGP', 'kg', 1,
  2000, 2800, 4000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('601ce945-e968-556d-b866-619ade7340c6', 'barley', 'barley', 'شعير', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('601ce945-e968-556d-b866-619ade7340c6', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('601ce945-e968-556d-b866-619ade7340c6', 'شعير') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('601ce945-e968-556d-b866-619ade7340c6', 'shaeer') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('16a27abe-5658-5d31-91f2-45f2ef055243', 'basil', 'basil', 'ريحان', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('16a27abe-5658-5d31-91f2-45f2ef055243', 'ريحان') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('16a27abe-5658-5d31-91f2-45f2ef055243', 'rihan') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('16a27abe-5658-5d31-91f2-45f2ef055243', 'basilica') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('de2b2e4d-d63e-5611-be1a-7034f3d1cf50', 'basmati-rice', 'basmati rice', 'أرز بسمتي', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('de2b2e4d-d63e-5611-be1a-7034f3d1cf50', 'بسمتي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('de2b2e4d-d63e-5611-be1a-7034f3d1cf50', 'basmati') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e04fb4e8-8469-5ddd-8144-bf1d7f7e8a70', 'bay-leaf', 'bay leaf', 'ورق لورا', 'spices', 'piece', 1, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e04fb4e8-8469-5ddd-8144-bf1d7f7e8a70', 'laurel') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e04fb4e8-8469-5ddd-8144-bf1d7f7e8a70', 'ورق لوري') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('e04fb4e8-8469-5ddd-8144-bf1d7f7e8a70', 'EG', 'EGP', 'kg', 1,
  8000, 12000, 18000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b9983214-d2f4-5237-bbcb-f5c820a2336b', 'bbq-sauce', 'barbecue sauce', 'صوص باربكيو', 'sauces', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b9983214-d2f4-5237-bbcb-f5c820a2336b', 'باربكيو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b9983214-d2f4-5237-bbcb-f5c820a2336b', 'bbq') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('91b4a320-ff6e-5600-b87f-51be146f4889', 'beef-cubes', 'beef cubes', 'لحمة مكعبات', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('91b4a320-ff6e-5600-b87f-51be146f4889', 'stewing beef') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('91b4a320-ff6e-5600-b87f-51be146f4889', 'beef chunks') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('91b4a320-ff6e-5600-b87f-51be146f4889', 'لحمة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('91b4a320-ff6e-5600-b87f-51be146f4889', 'لحم بقري') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('91b4a320-ff6e-5600-b87f-51be146f4889', 'EG', 'EGP', 'kg', 1,
  34000, 40000, 48000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5f45f2f3-a082-5836-8f14-c6356e2ca4e2', 'beef-steak', 'beef steak', 'استيك بقري', 'protein', 'g', 250, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('5f45f2f3-a082-5836-8f14-c6356e2ca4e2', 'steak') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5f45f2f3-a082-5836-8f14-c6356e2ca4e2', 'beef steaks') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5f45f2f3-a082-5836-8f14-c6356e2ca4e2', 'entrecote') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5f45f2f3-a082-5836-8f14-c6356e2ca4e2', 'انتريكوت') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5f45f2f3-a082-5836-8f14-c6356e2ca4e2', 'استيك') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('ec17b061-2e79-5b43-b55f-dc45bae279ec', 'beetroot', 'beetroot', 'بنجر', 'vegetables', 'g', 150, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('ec17b061-2e79-5b43-b55f-dc45bae279ec', 'beets') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ec17b061-2e79-5b43-b55f-dc45bae279ec', 'beet') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ec17b061-2e79-5b43-b55f-dc45bae279ec', 'بنجر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ec17b061-2e79-5b43-b55f-dc45bae279ec', 'شمندر') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('78ef052e-515f-5357-ae04-8c6071acb1c2', 'bell-pepper', 'bell pepper', 'فلفل ألوان', 'vegetables', 'piece', 140, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('78ef052e-515f-5357-ae04-8c6071acb1c2', 'capsicum') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('78ef052e-515f-5357-ae04-8c6071acb1c2', 'sweet pepper') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('78ef052e-515f-5357-ae04-8c6071acb1c2', 'فلفل رومي') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('78ef052e-515f-5357-ae04-8c6071acb1c2', 'EG', 'EGP', 'kg', 1,
  2500, 3500, 5000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5f451f77-c114-5c6b-ba5f-295c3d3eb277', 'black-eyed-peas', 'black-eyed peas', 'لوبيا', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('5f451f77-c114-5c6b-ba5f-295c3d3eb277', 'lobia') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5f451f77-c114-5c6b-ba5f-295c3d3eb277', 'لوبيا مجففة') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('5f451f77-c114-5c6b-ba5f-295c3d3eb277', 'EG', 'EGP', 'kg', 1,
  5500, 7000, 9000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('6dd4ed68-50a0-5c64-acf5-ec0df3e1280b', 'black-pepper', 'black pepper', 'فلفل أسود', 'spices', 'tsp', 2, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('6dd4ed68-50a0-5c64-acf5-ec0df3e1280b', 'pepper') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('6dd4ed68-50a0-5c64-acf5-ec0df3e1280b', 'felfel eswed') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('6dd4ed68-50a0-5c64-acf5-ec0df3e1280b', 'فلفل اسود') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('6dd4ed68-50a0-5c64-acf5-ec0df3e1280b', 'EG', 'EGP', 'kg', 1,
  20000, 28000, 38000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('99aa380c-5bae-56ef-a4aa-1dad274fc11f', 'breadcrumbs', 'breadcrumbs', 'بقسماط', 'bakery', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('99aa380c-5bae-56ef-a4aa-1dad274fc11f', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('99aa380c-5bae-56ef-a4aa-1dad274fc11f', 'بقسماط') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('99aa380c-5bae-56ef-a4aa-1dad274fc11f', 'bosmat') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('99aa380c-5bae-56ef-a4aa-1dad274fc11f', 'rusk') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b08ffc55-817a-518c-8c67-5c9e99ca482c', 'broccoli', 'broccoli', 'بروكلي', 'vegetables', 'g', 400, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b08ffc55-817a-518c-8c67-5c9e99ca482c', 'بروكلي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b08ffc55-817a-518c-8c67-5c9e99ca482c', 'broccolli') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('acf8edd9-2ded-504a-b93e-746e0bd26497', 'brown-rice', 'brown rice', 'أرز بني', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('acf8edd9-2ded-504a-b93e-746e0bd26497', 'ارز بني') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d18cc290-549b-55df-a5f0-0a8d9f1761fc', 'brown-sugar', 'brown sugar', 'سكر بني', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d18cc290-549b-55df-a5f0-0a8d9f1761fc', 'سكر بني') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d18cc290-549b-55df-a5f0-0a8d9f1761fc', 'demerara') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4ec6c756-782a-5827-9afe-6cf7162ee36f', 'bulgur', 'bulgur', 'برغل', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('4ec6c756-782a-5827-9afe-6cf7162ee36f', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4ec6c756-782a-5827-9afe-6cf7162ee36f', 'borghol') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4ec6c756-782a-5827-9afe-6cf7162ee36f', 'cracked wheat') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4ec6c756-782a-5827-9afe-6cf7162ee36f', 'برغل ناعم') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('4ec6c756-782a-5827-9afe-6cf7162ee36f', 'EG', 'EGP', 'kg', 1,
  4000, 5200, 6800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('225dd824-7869-5423-a591-a160525db16a', 'butter', 'butter', 'زبدة', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('225dd824-7869-5423-a591-a160525db16a', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('225dd824-7869-5423-a591-a160525db16a', 'zebda') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('225dd824-7869-5423-a591-a160525db16a', 'زبده') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('225dd824-7869-5423-a591-a160525db16a', 'EG', 'EGP', 'kg', 1,
  28000, 36000, 46000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('1597b3fc-7452-5246-a91f-93c327fc9633', 'buttermilk', 'buttermilk', 'لبن رايب', 'dairy', 'ml', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('1597b3fc-7452-5246-a91f-93c327fc9633', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1597b3fc-7452-5246-a91f-93c327fc9633', 'لبن رايب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1597b3fc-7452-5246-a91f-93c327fc9633', 'rayeb') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2a5746f8-a258-559b-8bf5-67e2a1f0bdb8', 'cabbage', 'cabbage', 'كرنب', 'vegetables', 'g', 1000, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('2a5746f8-a258-559b-8bf5-67e2a1f0bdb8', 'koronb') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2a5746f8-a258-559b-8bf5-67e2a1f0bdb8', 'كرنب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2a5746f8-a258-559b-8bf5-67e2a1f0bdb8', 'ملفوف') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('51cde22a-cf3b-50b8-bd67-f36dc829d533', 'calamari', 'calamari', 'كاليماري', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('51cde22a-cf3b-50b8-bd67-f36dc829d533', 'shellfish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('51cde22a-cf3b-50b8-bd67-f36dc829d533', 'squid') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('51cde22a-cf3b-50b8-bd67-f36dc829d533', 'كاليماري') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('51cde22a-cf3b-50b8-bd67-f36dc829d533', 'حبار') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('51cde22a-cf3b-50b8-bd67-f36dc829d533', 'سبيط') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('12e1e253-f166-56b3-a64c-3f146a3a99cb', 'capers', 'capers', 'كبر', 'vegetables', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('12e1e253-f166-56b3-a64c-3f146a3a99cb', 'كبر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('12e1e253-f166-56b3-a64c-3f146a3a99cb', 'كبار') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2bb4d01d-be1e-5877-a21b-f88a01dcc713', 'caraway', 'caraway', 'كراوية', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('2bb4d01d-be1e-5877-a21b-f88a01dcc713', 'كراوية') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2bb4d01d-be1e-5877-a21b-f88a01dcc713', 'karawya') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('38932f4b-eeef-5ea6-bb8d-73ed8c6908bc', 'cardamom', 'cardamom', 'حبهان', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('38932f4b-eeef-5ea6-bb8d-73ed8c6908bc', 'حبهان') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('38932f4b-eeef-5ea6-bb8d-73ed8c6908bc', 'hab han') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('38932f4b-eeef-5ea6-bb8d-73ed8c6908bc', 'hail') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('63fa022d-0328-5eb2-8ca3-7dc727c15ad0', 'carrots', 'carrots', 'جزر', 'vegetables', 'piece', 70, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('63fa022d-0328-5eb2-8ca3-7dc727c15ad0', 'carrot') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('63fa022d-0328-5eb2-8ca3-7dc727c15ad0', 'gazar') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('63fa022d-0328-5eb2-8ca3-7dc727c15ad0', 'جزر بلدي') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('63fa022d-0328-5eb2-8ca3-7dc727c15ad0', 'EG', 'EGP', 'kg', 1,
  1400, 2000, 3000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('22f145be-2ec3-5dfa-84d4-d836c2202f99', 'cashews', 'cashews', 'كاجو', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('22f145be-2ec3-5dfa-84d4-d836c2202f99', 'nuts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('22f145be-2ec3-5dfa-84d4-d836c2202f99', 'كاجو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('22f145be-2ec3-5dfa-84d4-d836c2202f99', 'cashew') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('7b1c0cd6-49ae-50b5-9688-b61b0b8be677', 'cauliflower', 'cauliflower', 'قرنبيط', 'vegetables', 'g', 800, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('7b1c0cd6-49ae-50b5-9688-b61b0b8be677', 'arnabeet') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7b1c0cd6-49ae-50b5-9688-b61b0b8be677', 'قرنبيط') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7b1c0cd6-49ae-50b5-9688-b61b0b8be677', 'زهرة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('f25cd75f-32d4-5223-b318-7f60e5c7dbff', 'celery', 'celery', 'كرفس', 'vegetables', 'g', 50, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('f25cd75f-32d4-5223-b318-7f60e5c7dbff', 'كرفس') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f25cd75f-32d4-5223-b318-7f60e5c7dbff', 'karafs') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('06ed6ebf-3b98-5817-9972-27f4278e91c7', 'cheddar', 'cheddar cheese', 'جبنة شيدر', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('06ed6ebf-3b98-5817-9972-27f4278e91c7', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('06ed6ebf-3b98-5817-9972-27f4278e91c7', 'cheddar') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('06ed6ebf-3b98-5817-9972-27f4278e91c7', 'شيدر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('06ed6ebf-3b98-5817-9972-27f4278e91c7', 'جبنة شيدر') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('615b9251-07aa-5024-9988-45ddcafff504', 'cherry-tomato', 'cherry tomatoes', 'طماطم شيري', 'vegetables', 'piece', 15, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('615b9251-07aa-5024-9988-45ddcafff504', 'شيري') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('615b9251-07aa-5024-9988-45ddcafff504', 'طماطم شيري') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('615b9251-07aa-5024-9988-45ddcafff504', 'cherry tomatos') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('3d31d7a9-6d54-5457-92a2-d4eeb49701f5', 'chia', 'chia seeds', 'بذور الشيا', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('3d31d7a9-6d54-5457-92a2-d4eeb49701f5', 'شيا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3d31d7a9-6d54-5457-92a2-d4eeb49701f5', 'chia') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('abc19e56-a348-56a8-ab46-db49badb7ccb', 'chicken-breast', 'chicken breast', 'صدور فراخ', 'protein', 'g', 180, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('abc19e56-a348-56a8-ab46-db49badb7ccb', 'chicken') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('abc19e56-a348-56a8-ab46-db49badb7ccb', 'chicken breasts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('abc19e56-a348-56a8-ab46-db49badb7ccb', 'firakh') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('abc19e56-a348-56a8-ab46-db49badb7ccb', 'فراخ') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('abc19e56-a348-56a8-ab46-db49badb7ccb', 'صدر فراخ') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('abc19e56-a348-56a8-ab46-db49badb7ccb', 'دجاج') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('abc19e56-a348-56a8-ab46-db49badb7ccb', 'EG', 'EGP', 'kg', 1,
  16000, 19000, 23000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d7f123b4-36b9-5361-b174-449fee119108', 'chicken-liver', 'chicken livers', 'كبدة فراخ', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d7f123b4-36b9-5361-b174-449fee119108', 'kebda farakh') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d7f123b4-36b9-5361-b174-449fee119108', 'كبدة فراخ') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9e434947-7e6a-538a-a1a8-51b5b0c6355d', 'chicken-thigh', 'chicken thighs', 'أوراك فراخ', 'protein', 'g', 130, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('9e434947-7e6a-538a-a1a8-51b5b0c6355d', 'chicken thigh') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9e434947-7e6a-538a-a1a8-51b5b0c6355d', 'drumsticks') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9e434947-7e6a-538a-a1a8-51b5b0c6355d', 'أوراك') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9e434947-7e6a-538a-a1a8-51b5b0c6355d', 'وراك فراخ') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('9e434947-7e6a-538a-a1a8-51b5b0c6355d', 'EG', 'EGP', 'kg', 1,
  11000, 13500, 16000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('30cc0f54-6cd0-5a97-9484-ceb5905b301c', 'chicken-wings', 'chicken wings', 'أجنحة فراخ', 'protein', 'g', 40, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('30cc0f54-6cd0-5a97-9484-ceb5905b301c', 'wings') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('30cc0f54-6cd0-5a97-9484-ceb5905b301c', 'اجنحة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('30cc0f54-6cd0-5a97-9484-ceb5905b301c', 'جوانح') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('df1a789f-1930-5053-a908-ee94e695ed3b', 'chickpeas', 'chickpeas', 'حمص', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('df1a789f-1930-5053-a908-ee94e695ed3b', 'garbanzo') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('df1a789f-1930-5053-a908-ee94e695ed3b', 'hummus beans') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('df1a789f-1930-5053-a908-ee94e695ed3b', 'حمص حب') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('df1a789f-1930-5053-a908-ee94e695ed3b', 'EG', 'EGP', 'kg', 1,
  6000, 7500, 9500, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('79fd1023-cde1-5dbc-99bb-92034b146c5f', 'chili-flakes', 'chili flakes', 'شطة', 'spices', 'tsp', 2, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('79fd1023-cde1-5dbc-99bb-92034b146c5f', 'shatta') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('79fd1023-cde1-5dbc-99bb-92034b146c5f', 'red pepper flakes') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('79fd1023-cde1-5dbc-99bb-92034b146c5f', 'شطه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('79fd1023-cde1-5dbc-99bb-92034b146c5f', 'EG', 'EGP', 'kg', 1,
  14000, 19000, 26000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('17c794db-92ee-54f2-9083-58f18bbb3774', 'chili-pepper', 'chili pepper', 'شطة خضراء', 'vegetables', 'piece', 15, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('17c794db-92ee-54f2-9083-58f18bbb3774', 'chilli') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('17c794db-92ee-54f2-9083-58f18bbb3774', 'hot pepper') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('17c794db-92ee-54f2-9083-58f18bbb3774', 'فلفل حار') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('17c794db-92ee-54f2-9083-58f18bbb3774', 'فلفل أخضر حار') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d442863d-1403-58eb-9144-9f39fe485618', 'chili-powder', 'chili powder', 'شطة مطحونة', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d442863d-1403-58eb-9144-9f39fe485618', 'red pepper powder') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5a99cb03-83cb-5458-88a4-72a52e481bd3', 'chocolate', 'chocolate', 'شوكولاتة', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('5a99cb03-83cb-5458-88a4-72a52e481bd3', 'dairy') on conflict do nothing;
insert into public.ingredient_allergens (ingredient_id, allergen)
values ('5a99cb03-83cb-5458-88a4-72a52e481bd3', 'soy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5a99cb03-83cb-5458-88a4-72a52e481bd3', 'شوكولاتة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5a99cb03-83cb-5458-88a4-72a52e481bd3', 'شيكولاتة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5a99cb03-83cb-5458-88a4-72a52e481bd3', 'chocolate bar') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('99e02842-bcf9-53b3-a960-9c0c297a888d', 'cinnamon', 'cinnamon', 'قرفة', 'spices', 'tsp', 2, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('99e02842-bcf9-53b3-a960-9c0c297a888d', 'erfa') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('99e02842-bcf9-53b3-a960-9c0c297a888d', 'قرفه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('99e02842-bcf9-53b3-a960-9c0c297a888d', 'EG', 'EGP', 'kg', 1,
  16000, 22000, 30000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2dea4daf-5964-5570-98e1-99b9401cfc18', 'cloves', 'cloves', 'قرنفل', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('2dea4daf-5964-5570-98e1-99b9401cfc18', 'قرنفل') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2dea4daf-5964-5570-98e1-99b9401cfc18', 'عويدة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('97edb046-61e8-5aea-a36e-faa9f3e60b68', 'cocoa', 'cocoa powder', 'كاكاو', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('97edb046-61e8-5aea-a36e-faa9f3e60b68', 'كاكاو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('97edb046-61e8-5aea-a36e-faa9f3e60b68', 'cocoa') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b366b753-119a-5b61-8bee-f2571669c7de', 'coconut', 'coconut', 'جوز الهند', 'fruit', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b366b753-119a-5b61-8bee-f2571669c7de', 'جوز الهند') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b366b753-119a-5b61-8bee-f2571669c7de', 'coconut flesh') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b366b753-119a-5b61-8bee-f2571669c7de', 'كوكونت') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9403731a-5892-5950-b46f-f04c60d7cca2', 'coconut-flakes', 'desiccated coconut', 'جوز هند مبشور', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('9403731a-5892-5950-b46f-f04c60d7cca2', 'جوز هند مبشور') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9403731a-5892-5950-b46f-f04c60d7cca2', 'coconut flakes') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('a18c7b0c-1711-5f07-920f-3f7101294ac2', 'coconut-milk', 'coconut milk', 'لبن جوز الهند', 'sauces', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('a18c7b0c-1711-5f07-920f-3f7101294ac2', 'لبن جوز الهند') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a18c7b0c-1711-5f07-920f-3f7101294ac2', 'coconut cream') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b63c278c-0c81-5d06-a42e-3d8a65446f4b', 'coffee', 'coffee', 'بن', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b63c278c-0c81-5d06-a42e-3d8a65446f4b', 'قهوة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b63c278c-0c81-5d06-a42e-3d8a65446f4b', 'بن') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b63c278c-0c81-5d06-a42e-3d8a65446f4b', 'coffee beans') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e8bbe778-6e5f-5b57-9f28-2a0c62d14dc3', 'condensed-milk', 'condensed milk', 'لبن مكثف', 'dairy', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('e8bbe778-6e5f-5b57-9f28-2a0c62d14dc3', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e8bbe778-6e5f-5b57-9f28-2a0c62d14dc3', 'لبن مكثف') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e8bbe778-6e5f-5b57-9f28-2a0c62d14dc3', 'sweetened condensed milk') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('fee96739-abf8-5cca-aac6-a27423853ecb', 'coriander', 'coriander', 'كزبرة', 'vegetables', 'bunch', 50, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('fee96739-abf8-5cca-aac6-a27423853ecb', 'cilantro') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('fee96739-abf8-5cca-aac6-a27423853ecb', 'kozbara') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('fee96739-abf8-5cca-aac6-a27423853ecb', 'كزبره خضراء') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('fee96739-abf8-5cca-aac6-a27423853ecb', 'EG', 'EGP', 'bunch', 1,
  300, 500, 800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e91ff6e3-9e21-594c-ae83-0109c1289947', 'coriander-ground', 'coriander seeds', 'كزبرة ناشفة', 'spices', 'tsp', 2, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e91ff6e3-9e21-594c-ae83-0109c1289947', 'كزبره ناشفه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('e91ff6e3-9e21-594c-ae83-0109c1289947', 'EG', 'EGP', 'kg', 1,
  10000, 14000, 19000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5623f855-66df-5f6a-a9ae-2a79b4419a25', 'corn', 'sweetcorn', 'ذرة', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('5623f855-66df-5f6a-a9ae-2a79b4419a25', 'corn') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5623f855-66df-5f6a-a9ae-2a79b4419a25', 'maize') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5623f855-66df-5f6a-a9ae-2a79b4419a25', 'ذرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5623f855-66df-5f6a-a9ae-2a79b4419a25', 'درة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('f5dc2612-ffce-5d00-bd83-57d5cb7c494e', 'corn-oil', 'corn oil', 'زيت ذرة', 'pantry', 'ml', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('f5dc2612-ffce-5d00-bd83-57d5cb7c494e', 'زيت ذرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f5dc2612-ffce-5d00-bd83-57d5cb7c494e', 'زيت الذرة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4d48fd13-c813-5830-9b2a-de8eaca24741', 'corn-syrup', 'corn syrup', 'شراب الذرة', 'pantry', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('4d48fd13-c813-5830-9b2a-de8eaca24741', 'شراب ذرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4d48fd13-c813-5830-9b2a-de8eaca24741', 'glucose syrup') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('72a9dc59-00ff-56eb-a001-1a339a073985', 'cornflour', 'cornflour', 'نشا', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('72a9dc59-00ff-56eb-a001-1a339a073985', 'cornstarch') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('72a9dc59-00ff-56eb-a001-1a339a073985', 'نشا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('72a9dc59-00ff-56eb-a001-1a339a073985', 'نشاء') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d981c000-5755-5282-b0fa-82a3beec9c92', 'cornmeal', 'cornmeal', 'دقيق ذرة', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d981c000-5755-5282-b0fa-82a3beec9c92', 'دقيق ذرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d981c000-5755-5282-b0fa-82a3beec9c92', 'polenta') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('459b4571-2c39-5fe5-b0a1-104cf078db65', 'couscous', 'couscous', 'كسكسي', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('459b4571-2c39-5fe5-b0a1-104cf078db65', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('459b4571-2c39-5fe5-b0a1-104cf078db65', 'كسكسي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('459b4571-2c39-5fe5-b0a1-104cf078db65', 'kuskusi') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b67b415d-24a6-536b-9ec7-ea34c9bf16d2', 'crab', 'crab', 'كابوريا', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('b67b415d-24a6-536b-9ec7-ea34c9bf16d2', 'shellfish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b67b415d-24a6-536b-9ec7-ea34c9bf16d2', 'kabouria') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b67b415d-24a6-536b-9ec7-ea34c9bf16d2', 'كابوريا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b67b415d-24a6-536b-9ec7-ea34c9bf16d2', 'سلطعون') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c61337a3-b441-5075-9cbc-2d271dd11695', 'cream', 'cooking cream', 'كريمة طهي', 'dairy', 'ml', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('c61337a3-b441-5075-9cbc-2d271dd11695', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c61337a3-b441-5075-9cbc-2d271dd11695', 'heavy cream') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c61337a3-b441-5075-9cbc-2d271dd11695', 'double cream') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c61337a3-b441-5075-9cbc-2d271dd11695', 'krema') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c61337a3-b441-5075-9cbc-2d271dd11695', 'كريمه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('c61337a3-b441-5075-9cbc-2d271dd11695', 'EG', 'EGP', 'pack', 1,
  4500, 6000, 8000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('159aeeb4-a876-5985-9cf9-a37d3d91bfb7', 'cream-cheese', 'cream cheese', 'جبنة كريمي', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('159aeeb4-a876-5985-9cf9-a37d3d91bfb7', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('159aeeb4-a876-5985-9cf9-a37d3d91bfb7', 'جبنة كريمي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('159aeeb4-a876-5985-9cf9-a37d3d91bfb7', 'philadelphia') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('159aeeb4-a876-5985-9cf9-a37d3d91bfb7', 'كيري') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('0a1d8f8e-6a68-56ba-be24-b0f23276cb7b', 'croissant', 'croissant', 'كرواسون', 'bakery', 'piece', 60, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('0a1d8f8e-6a68-56ba-be24-b0f23276cb7b', 'gluten') on conflict do nothing;
insert into public.ingredient_allergens (ingredient_id, allergen)
values ('0a1d8f8e-6a68-56ba-be24-b0f23276cb7b', 'dairy') on conflict do nothing;
insert into public.ingredient_allergens (ingredient_id, allergen)
values ('0a1d8f8e-6a68-56ba-be24-b0f23276cb7b', 'eggs') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0a1d8f8e-6a68-56ba-be24-b0f23276cb7b', 'كرواسون') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0a1d8f8e-6a68-56ba-be24-b0f23276cb7b', 'كروسان') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('aecbcc48-c9eb-531d-ba39-fada505cee0f', 'cucumber', 'cucumber', 'خيار', 'vegetables', 'piece', 100, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('aecbcc48-c9eb-531d-ba39-fada505cee0f', 'cucumbers') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aecbcc48-c9eb-531d-ba39-fada505cee0f', 'khiar') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aecbcc48-c9eb-531d-ba39-fada505cee0f', 'خيار بلدي') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('aecbcc48-c9eb-531d-ba39-fada505cee0f', 'EG', 'EGP', 'kg', 1,
  1200, 1800, 2800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('92246389-2519-50a1-92ed-519d3cd5632d', 'cumin', 'cumin', 'كمون', 'spices', 'tsp', 2, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('92246389-2519-50a1-92ed-519d3cd5632d', 'kamoun') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('92246389-2519-50a1-92ed-519d3cd5632d', 'كمون مطحون') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('92246389-2519-50a1-92ed-519d3cd5632d', 'EG', 'EGP', 'kg', 1,
  15000, 20000, 28000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b8eef3f7-4cfd-5041-8ef6-3c5fb7ec41ae', 'curry-powder', 'curry powder', 'كاري', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b8eef3f7-4cfd-5041-8ef6-3c5fb7ec41ae', 'كاري') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b8eef3f7-4cfd-5041-8ef6-3c5fb7ec41ae', 'curry') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('259babe3-2a9d-5669-9db5-bc37193e8776', 'date-syrup', 'date syrup', 'دبس التمر', 'sauces', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('259babe3-2a9d-5669-9db5-bc37193e8776', 'دبس تمر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('259babe3-2a9d-5669-9db5-bc37193e8776', 'date molasses') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('139edfbd-7ae4-50ee-8ac1-1512637c6be5', 'dates', 'dates', 'تمر', 'fruit', 'piece', 8, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('139edfbd-7ae4-50ee-8ac1-1512637c6be5', 'balah') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('139edfbd-7ae4-50ee-8ac1-1512637c6be5', 'tamr') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('139edfbd-7ae4-50ee-8ac1-1512637c6be5', 'بلح') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('139edfbd-7ae4-50ee-8ac1-1512637c6be5', 'EG', 'EGP', 'kg', 1,
  6000, 9000, 14000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('33ebbf28-5dfb-522e-8bf9-d89af2f0969f', 'dill', 'dill', 'شبت', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('33ebbf28-5dfb-522e-8bf9-d89af2f0969f', 'shabat') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('33ebbf28-5dfb-522e-8bf9-d89af2f0969f', 'شبت') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('33ebbf28-5dfb-522e-8bf9-d89af2f0969f', 'شبنت') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('8ac6f593-c277-55f8-9f86-e8ebcf376594', 'dried-apricot', 'qamar el din', 'قمر الدين', 'fruit', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('8ac6f593-c277-55f8-9f86-e8ebcf376594', 'قمر الدين') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8ac6f593-c277-55f8-9f86-e8ebcf376594', 'مشمش مجفف') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8ac6f593-c277-55f8-9f86-e8ebcf376594', 'amar el din') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e21b1cc1-d736-50b1-8803-cbb151fe5a06', 'duck', 'duck', 'بط', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e21b1cc1-d736-50b1-8803-cbb151fe5a06', 'بطة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e21b1cc1-d736-50b1-8803-cbb151fe5a06', 'لحم بط') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('ca70e29c-bd28-5357-a658-0830ba3ae3e3', 'dukkah', 'dukkah', 'دقة', 'spices', 'tbsp', 10, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('ca70e29c-bd28-5357-a658-0830ba3ae3e3', 'nuts') on conflict do nothing;
insert into public.ingredient_allergens (ingredient_id, allergen)
values ('ca70e29c-bd28-5357-a658-0830ba3ae3e3', 'sesame') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ca70e29c-bd28-5357-a658-0830ba3ae3e3', 'duqqa') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ca70e29c-bd28-5357-a658-0830ba3ae3e3', 'دقه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('ca70e29c-bd28-5357-a658-0830ba3ae3e3', 'EG', 'EGP', 'kg', 1,
  18000, 24000, 32000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('47610a55-d80c-5dd9-9bb4-a0d9df375767', 'edamame', 'edamame', 'إدامامي', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('47610a55-d80c-5dd9-9bb4-a0d9df375767', 'soy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('47610a55-d80c-5dd9-9bb4-a0d9df375767', 'ادامامي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('47610a55-d80c-5dd9-9bb4-a0d9df375767', 'edamame beans') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('16fbfa18-f6f8-5fb1-a669-47b7084a9c80', 'egg-white', 'egg whites', 'بياض بيض', 'dairy', 'piece', 33, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('16fbfa18-f6f8-5fb1-a669-47b7084a9c80', 'eggs') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('16fbfa18-f6f8-5fb1-a669-47b7084a9c80', 'بياض البيض') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('16fbfa18-f6f8-5fb1-a669-47b7084a9c80', 'egg white') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('836d444f-b191-5935-8b0f-5f9243ac2817', 'egg-yolk', 'egg yolks', 'صفار بيض', 'dairy', 'piece', 17, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('836d444f-b191-5935-8b0f-5f9243ac2817', 'eggs') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('836d444f-b191-5935-8b0f-5f9243ac2817', 'صفار البيض') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('836d444f-b191-5935-8b0f-5f9243ac2817', 'egg yolk') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('cd49b1fa-b192-5748-87c2-1ba3433bd02e', 'eggplant', 'eggplant', 'باذنجان', 'vegetables', 'piece', 220, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('cd49b1fa-b192-5748-87c2-1ba3433bd02e', 'aubergine') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('cd49b1fa-b192-5748-87c2-1ba3433bd02e', 'betingan') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('cd49b1fa-b192-5748-87c2-1ba3433bd02e', 'بتنجان') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('cd49b1fa-b192-5748-87c2-1ba3433bd02e', 'EG', 'EGP', 'kg', 1,
  1200, 1800, 2800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d23e596f-1070-5eb8-89e2-f186f8c67253', 'eggs', 'eggs', 'بيض', 'protein', 'piece', 55, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('d23e596f-1070-5eb8-89e2-f186f8c67253', 'eggs') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d23e596f-1070-5eb8-89e2-f186f8c67253', 'egg') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d23e596f-1070-5eb8-89e2-f186f8c67253', 'beid') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d23e596f-1070-5eb8-89e2-f186f8c67253', 'بيضة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d23e596f-1070-5eb8-89e2-f186f8c67253', 'بيضه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('d23e596f-1070-5eb8-89e2-f186f8c67253', 'EG', 'EGP', 'piece', 1,
  450, 550, 700, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('fef923d6-4194-5567-ab7a-615419c7b06a', 'falafel-mix', 'falafel mix', 'دقيق طعمية', 'protein', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('fef923d6-4194-5567-ab7a-615419c7b06a', 'taameya mix') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('fef923d6-4194-5567-ab7a-615419c7b06a', 'طعمية') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('fef923d6-4194-5567-ab7a-615419c7b06a', 'دقيق الطعمية') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b42074ec-d1c0-5417-85ea-33a22cb747df', 'fava-beans', 'fava beans', 'فول', 'pantry', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b42074ec-d1c0-5417-85ea-33a22cb747df', 'foul') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b42074ec-d1c0-5417-85ea-33a22cb747df', 'ful') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b42074ec-d1c0-5417-85ea-33a22cb747df', 'ful medames') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b42074ec-d1c0-5417-85ea-33a22cb747df', 'foul medames') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b42074ec-d1c0-5417-85ea-33a22cb747df', 'فول مدمس') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('b42074ec-d1c0-5417-85ea-33a22cb747df', 'EG', 'EGP', 'kg', 1,
  3500, 4500, 6000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('896d6a28-4b42-574f-8a3b-87f06ac5da79', 'fennel-seed', 'fennel seeds', 'شمر', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('896d6a28-4b42-574f-8a3b-87f06ac5da79', 'شمر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('896d6a28-4b42-574f-8a3b-87f06ac5da79', 'fennel') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d5e56811-9207-5ba2-a85d-cd6dbc901ae3', 'fenugreek', 'fenugreek', 'حلبة', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d5e56811-9207-5ba2-a85d-cd6dbc901ae3', 'حلبة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d5e56811-9207-5ba2-a85d-cd6dbc901ae3', 'helba') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5c388250-f7b7-5c73-8f06-f8e68567024f', 'figs', 'figs', 'تين', 'fruit', 'piece', 50, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('5c388250-f7b7-5c73-8f06-f8e68567024f', 'fig') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5c388250-f7b7-5c73-8f06-f8e68567024f', 'تين') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5c388250-f7b7-5c73-8f06-f8e68567024f', 'teen') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('db0d9b1a-dc51-5267-b9ac-0a33c37ba49c', 'flaxseed', 'flaxseed', 'بذر الكتان', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('db0d9b1a-dc51-5267-b9ac-0a33c37ba49c', 'بذرة الكتان') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('db0d9b1a-dc51-5267-b9ac-0a33c37ba49c', 'linseed') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('7c337e3e-26fe-5688-93b0-2548578356ef', 'flour', 'flour', 'دقيق', 'pantry', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('7c337e3e-26fe-5688-93b0-2548578356ef', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7c337e3e-26fe-5688-93b0-2548578356ef', 'all purpose flour') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7c337e3e-26fe-5688-93b0-2548578356ef', 'plain flour') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7c337e3e-26fe-5688-93b0-2548578356ef', 'دقيق فاخر') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('7c337e3e-26fe-5688-93b0-2548578356ef', 'EG', 'EGP', 'kg', 1,
  1800, 2400, 3200, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('633de6f0-a44f-51f6-9137-2cabff8d7639', 'freekeh', 'freekeh', 'فريك', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('633de6f0-a44f-51f6-9137-2cabff8d7639', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('633de6f0-a44f-51f6-9137-2cabff8d7639', 'فريك') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('633de6f0-a44f-51f6-9137-2cabff8d7639', 'frikeh') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('633de6f0-a44f-51f6-9137-2cabff8d7639', 'farik') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c854dd08-4fa4-57f6-b7e9-71c4538c9c56', 'frozen-fries', 'frozen fries', 'بطاطس مجمدة', 'frozen', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('c854dd08-4fa4-57f6-b7e9-71c4538c9c56', 'بطاطس محمرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c854dd08-4fa4-57f6-b7e9-71c4538c9c56', 'french fries') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c854dd08-4fa4-57f6-b7e9-71c4538c9c56', 'شيبسي') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5ac2601f-223e-5618-b86b-5d173d00de5a', 'frozen-mixed-veg', 'frozen mixed vegetables', 'خضار مشكل مجمد', 'frozen', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('5ac2601f-223e-5618-b86b-5d173d00de5a', 'خضار مجمد') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5ac2601f-223e-5618-b86b-5d173d00de5a', 'mixed veg') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('1c4b93c3-e8fc-5aa0-97fe-c7496937af4b', 'garlic', 'garlic', 'ثوم', 'vegetables', 'clove', 5, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('1c4b93c3-e8fc-5aa0-97fe-c7496937af4b', 'toum') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1c4b93c3-e8fc-5aa0-97fe-c7496937af4b', 'tom') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1c4b93c3-e8fc-5aa0-97fe-c7496937af4b', 'garlic cloves') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1c4b93c3-e8fc-5aa0-97fe-c7496937af4b', 'فص ثوم') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('1c4b93c3-e8fc-5aa0-97fe-c7496937af4b', 'EG', 'EGP', 'kg', 1,
  6000, 8000, 11000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b22943f1-547a-57f8-afc4-af7cccf06371', 'garlic-powder', 'garlic powder', 'ثوم بودرة', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b22943f1-547a-57f8-afc4-af7cccf06371', 'ثوم بودرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b22943f1-547a-57f8-afc4-af7cccf06371', 'garlic granules') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4c5738b5-181a-5bae-8955-94f2cf69c060', 'gelatin', 'gelatin', 'جيلاتين', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('4c5738b5-181a-5bae-8955-94f2cf69c060', 'جيلاتين') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4c5738b5-181a-5bae-8955-94f2cf69c060', 'jelly powder') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4cf5f33f-4504-5cbc-b479-216d2a96ca55', 'ghee', 'ghee', 'سمنة', 'dairy', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('4cf5f33f-4504-5cbc-b479-216d2a96ca55', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4cf5f33f-4504-5cbc-b479-216d2a96ca55', 'samna') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4cf5f33f-4504-5cbc-b479-216d2a96ca55', 'سمنة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4cf5f33f-4504-5cbc-b479-216d2a96ca55', 'clarified butter') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4cf5f33f-4504-5cbc-b479-216d2a96ca55', 'سمن') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('249185ac-4309-576b-a64f-a6f905955158', 'ginger', 'ginger', 'زنجبيل', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('249185ac-4309-576b-a64f-a6f905955158', 'زنجبيل') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('249185ac-4309-576b-a64f-a6f905955158', 'ganzabeel') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('249185ac-4309-576b-a64f-a6f905955158', 'root ginger') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('6358fac4-de23-509c-a2e6-e9ac35ced56a', 'ginger-ground', 'ground ginger', 'زنجبيل مطحون', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('6358fac4-de23-509c-a2e6-e9ac35ced56a', 'زنجبيل مطحون') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d87eac67-7979-511e-9f64-ba2b21ea61f1', 'grapes', 'grapes', 'عنب', 'fruit', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d87eac67-7979-511e-9f64-ba2b21ea61f1', 'عنب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d87eac67-7979-511e-9f64-ba2b21ea61f1', 'enab') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d87eac67-7979-511e-9f64-ba2b21ea61f1', 'grape') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('8a5babf4-d5f6-5b1b-9c80-c2a7f282ee77', 'green-beans', 'green beans', 'فاصوليا خضراء', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('8a5babf4-d5f6-5b1b-9c80-c2a7f282ee77', 'فاصوليا خضراء') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8a5babf4-d5f6-5b1b-9c80-c2a7f282ee77', 'french beans') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('1828c1d9-8e2d-5790-b9ab-c47ef0be5514', 'green-lentils', 'green lentils', 'عدس أخضر', 'protein', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('1828c1d9-8e2d-5790-b9ab-c47ef0be5514', 'عدس اخضر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1828c1d9-8e2d-5790-b9ab-c47ef0be5514', 'brown lentils') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1828c1d9-8e2d-5790-b9ab-c47ef0be5514', 'عدس بجبة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('7bf5a425-217a-5592-a266-7b6a15ba9793', 'green-onion', 'green onion', 'بصل أخضر', 'vegetables', 'bunch', 80, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('7bf5a425-217a-5592-a266-7b6a15ba9793', 'scallion') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7bf5a425-217a-5592-a266-7b6a15ba9793', 'spring onion') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7bf5a425-217a-5592-a266-7b6a15ba9793', 'بصل اخضر') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('7bf5a425-217a-5592-a266-7b6a15ba9793', 'EG', 'EGP', 'bunch', 1,
  400, 700, 1000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('88e88f2c-7649-5b7b-9464-0a7dcaec2ea3', 'green-peas', 'green peas', 'بسلة', 'frozen', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('88e88f2c-7649-5b7b-9464-0a7dcaec2ea3', 'peas') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('88e88f2c-7649-5b7b-9464-0a7dcaec2ea3', 'besella') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('88e88f2c-7649-5b7b-9464-0a7dcaec2ea3', 'بسله') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('88e88f2c-7649-5b7b-9464-0a7dcaec2ea3', 'EG', 'EGP', 'kg', 1,
  4000, 5200, 6800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('8676cb9e-a396-5680-9b40-cf12961494d5', 'ground-beef', 'ground beef', 'لحمة مفرومة', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('8676cb9e-a396-5680-9b40-cf12961494d5', 'minced beef') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8676cb9e-a396-5680-9b40-cf12961494d5', 'mince') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8676cb9e-a396-5680-9b40-cf12961494d5', 'minced meat') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8676cb9e-a396-5680-9b40-cf12961494d5', 'kofta meat') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8676cb9e-a396-5680-9b40-cf12961494d5', 'لحمة مفرومه') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8676cb9e-a396-5680-9b40-cf12961494d5', 'مفروم') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('8676cb9e-a396-5680-9b40-cf12961494d5', 'EG', 'EGP', 'kg', 1,
  32000, 38000, 45000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('75b3eac5-c253-5a51-a9df-e2a576067327', 'guava', 'guava', 'جوافة', 'fruit', 'piece', 120, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('75b3eac5-c253-5a51-a9df-e2a576067327', 'جوافة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('75b3eac5-c253-5a51-a9df-e2a576067327', 'gawafa') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('75b3eac5-c253-5a51-a9df-e2a576067327', 'guavas') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c6df2411-2374-57c6-9d4f-354313a83828', 'halloumi', 'halloumi', 'حلومي', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('c6df2411-2374-57c6-9d4f-354313a83828', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c6df2411-2374-57c6-9d4f-354313a83828', 'حلومي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c6df2411-2374-57c6-9d4f-354313a83828', 'halloum') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('a1e5002d-8ccc-5901-bde0-a617a4940362', 'hazelnuts', 'hazelnuts', 'بندق', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('a1e5002d-8ccc-5901-bde0-a617a4940362', 'nuts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a1e5002d-8ccc-5901-bde0-a617a4940362', 'بندق') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a1e5002d-8ccc-5901-bde0-a617a4940362', 'bondok') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a1e5002d-8ccc-5901-bde0-a617a4940362', 'hazelnut') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d2d0f110-1d17-5132-b113-8a365f9c548d', 'herring', 'herring', 'رنجة', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('d2d0f110-1d17-5132-b113-8a365f9c548d', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d2d0f110-1d17-5132-b113-8a365f9c548d', 'renga') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d2d0f110-1d17-5132-b113-8a365f9c548d', 'رنجة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d2d0f110-1d17-5132-b113-8a365f9c548d', 'ringa') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('bdbe37f9-0391-571d-9b69-5bf720fb9fe7', 'hibiscus', 'hibiscus', 'كركديه', 'spices', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('bdbe37f9-0391-571d-9b69-5bf720fb9fe7', 'كركديه') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('bdbe37f9-0391-571d-9b69-5bf720fb9fe7', 'karkade') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e328adbb-b25c-5fbc-988d-611990b3c25a', 'honey', 'honey', 'عسل', 'pantry', 'tbsp', 21, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e328adbb-b25c-5fbc-988d-611990b3c25a', 'asal') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e328adbb-b25c-5fbc-988d-611990b3c25a', 'عسل نحل') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('e328adbb-b25c-5fbc-988d-611990b3c25a', 'EG', 'EGP', 'pack', 1,
  12000, 18000, 28000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5d10b182-a322-5ac8-a6c3-b53d9c58f868', 'hot-dog', 'hot dog sausage', 'هوت دوج', 'protein', 'piece', 50, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('5d10b182-a322-5ac8-a6c3-b53d9c58f868', 'hotdog') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5d10b182-a322-5ac8-a6c3-b53d9c58f868', 'frankfurter') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5d10b182-a322-5ac8-a6c3-b53d9c58f868', 'هوت دوج') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b469340f-fa3b-5b05-9b91-d37774ef9e10', 'hot-sauce', 'hot sauce', 'صوص حار', 'sauces', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b469340f-fa3b-5b05-9b91-d37774ef9e10', 'شطة سائلة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b469340f-fa3b-5b05-9b91-d37774ef9e10', 'tabasco') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b469340f-fa3b-5b05-9b91-d37774ef9e10', 'صوص حار') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('3fec395b-f2ff-50fb-a0bc-41d8ee1d9c49', 'hummus-dip', 'hummus', 'حمص بالطحينة', 'sauces', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('3fec395b-f2ff-50fb-a0bc-41d8ee1d9c49', 'sesame') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3fec395b-f2ff-50fb-a0bc-41d8ee1d9c49', 'hommos') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3fec395b-f2ff-50fb-a0bc-41d8ee1d9c49', 'حمص') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3fec395b-f2ff-50fb-a0bc-41d8ee1d9c49', 'houmous') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('20a7c32a-0627-51c6-bcba-510b8353eab5', 'ice', 'ice', 'ثلج', 'other', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('20a7c32a-0627-51c6-bcba-510b8353eab5', 'ثلج') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('20a7c32a-0627-51c6-bcba-510b8353eab5', 'ice cubes') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('5bbf87cb-d963-59e0-bb89-07bb5466fae8', 'ice-cream', 'ice cream', 'آيس كريم', 'frozen', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('5bbf87cb-d963-59e0-bb89-07bb5466fae8', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5bbf87cb-d963-59e0-bb89-07bb5466fae8', 'ايس كريم') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5bbf87cb-d963-59e0-bb89-07bb5466fae8', 'آيس كريم') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('5bbf87cb-d963-59e0-bb89-07bb5466fae8', 'gelato') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2d1315c2-59de-5a06-8819-2099d9d9775e', 'icing-sugar', 'icing sugar', 'سكر بودرة', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('2d1315c2-59de-5a06-8819-2099d9d9775e', 'سكر بودرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2d1315c2-59de-5a06-8819-2099d9d9775e', 'powdered sugar') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('92353bea-0938-5641-a4ca-d1c144fcf9c9', 'kashkaval', 'kashkaval', 'جبنة قشقوان', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('92353bea-0938-5641-a4ca-d1c144fcf9c9', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('92353bea-0938-5641-a4ca-d1c144fcf9c9', 'قشقوان') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('92353bea-0938-5641-a4ca-d1c144fcf9c9', 'kashkawan') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e884a28e-6f3d-5cf0-b6d5-9569fdf97f8d', 'ketchup', 'ketchup', 'كاتشب', 'sauces', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e884a28e-6f3d-5cf0-b6d5-9569fdf97f8d', 'كاتشب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e884a28e-6f3d-5cf0-b6d5-9569fdf97f8d', 'catsup') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e884a28e-6f3d-5cf0-b6d5-9569fdf97f8d', 'صوص طماطم') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('1bfd2e36-1e4e-584e-8a7b-8af0913707fb', 'kidney-beans', 'kidney beans', 'فاصوليا حمراء', 'protein', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('1bfd2e36-1e4e-584e-8a7b-8af0913707fb', 'red beans') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1bfd2e36-1e4e-584e-8a7b-8af0913707fb', 'فاصوليا حمراء') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1bfd2e36-1e4e-584e-8a7b-8af0913707fb', 'rajma') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('74cbb43c-96a9-5790-b467-271d04a14da7', 'kiwi', 'kiwi', 'كيوي', 'fruit', 'piece', 80, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('74cbb43c-96a9-5790-b467-271d04a14da7', 'كيوي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('74cbb43c-96a9-5790-b467-271d04a14da7', 'kiwifruit') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('618d9232-cd71-5282-b46b-b97829693029', 'kofta', 'kofta', 'كفتة', 'protein', 'g', 60, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('618d9232-cd71-5282-b46b-b97829693029', 'kufta') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('618d9232-cd71-5282-b46b-b97829693029', 'كفتة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('618d9232-cd71-5282-b46b-b97829693029', 'كفته') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('0fd7b795-27e6-535c-a6c9-ee3ec974db10', 'labneh', 'labneh', 'لبنة', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('0fd7b795-27e6-535c-a6c9-ee3ec974db10', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0fd7b795-27e6-535c-a6c9-ee3ec974db10', 'لبنة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0fd7b795-27e6-535c-a6c9-ee3ec974db10', 'labne') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('a0b111f9-f84e-5d50-8f64-f6c5d9829653', 'lamb', 'lamb', 'لحم ضاني', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('a0b111f9-f84e-5d50-8f64-f6c5d9829653', 'mutton') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a0b111f9-f84e-5d50-8f64-f6c5d9829653', 'lamb meat') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a0b111f9-f84e-5d50-8f64-f6c5d9829653', 'ضاني') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a0b111f9-f84e-5d50-8f64-f6c5d9829653', 'لحم غنم') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a0b111f9-f84e-5d50-8f64-f6c5d9829653', 'خروف') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('f17effd5-2bf5-53d5-8e43-d0947f6c76da', 'lamb-chops', 'lamb chops', 'ريش ضاني', 'protein', 'g', 90, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('f17effd5-2bf5-53d5-8e43-d0947f6c76da', 'chops') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f17effd5-2bf5-53d5-8e43-d0947f6c76da', 'riyash') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f17effd5-2bf5-53d5-8e43-d0947f6c76da', 'ريش') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f17effd5-2bf5-53d5-8e43-d0947f6c76da', 'ريش لحم') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2a02a532-0bbc-5ff2-8865-b36dd27c6890', 'lasagne-sheets', 'lasagne sheets', 'شرائح لازانيا', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('2a02a532-0bbc-5ff2-8865-b36dd27c6890', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2a02a532-0bbc-5ff2-8865-b36dd27c6890', 'lasagna') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2a02a532-0bbc-5ff2-8865-b36dd27c6890', 'لازانيا') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('ede0bfaf-e78d-5879-afee-177a0dc3c7a4', 'leek', 'leek', 'كرات', 'vegetables', 'g', 120, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('ede0bfaf-e78d-5879-afee-177a0dc3c7a4', 'كرات') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ede0bfaf-e78d-5879-afee-177a0dc3c7a4', 'korrat') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ede0bfaf-e78d-5879-afee-177a0dc3c7a4', 'leeks') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2719c6c9-4810-5b00-a255-8f3c01fadc1c', 'lemon', 'lemon', 'ليمون', 'fruit', 'piece', 60, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('2719c6c9-4810-5b00-a255-8f3c01fadc1c', 'lemons') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2719c6c9-4810-5b00-a255-8f3c01fadc1c', 'lime') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2719c6c9-4810-5b00-a255-8f3c01fadc1c', 'lamoun') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2719c6c9-4810-5b00-a255-8f3c01fadc1c', 'ليمون أخضر') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('2719c6c9-4810-5b00-a255-8f3c01fadc1c', 'EG', 'EGP', 'kg', 1,
  2000, 3000, 5000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('597ea158-b0cb-5b8e-b991-26dd71a28180', 'lemon-juice', 'lemon juice', 'عصير ليمون', 'pantry', 'ml', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('597ea158-b0cb-5b8e-b991-26dd71a28180', 'عصير الليمون') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('597ea158-b0cb-5b8e-b991-26dd71a28180', 'lime juice') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9ca996d4-9688-5782-949b-0ac53c5023a2', 'lentils', 'red lentils', 'عدس', 'pantry', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('9ca996d4-9688-5782-949b-0ac53c5023a2', 'lentil') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9ca996d4-9688-5782-949b-0ac53c5023a2', 'ads') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9ca996d4-9688-5782-949b-0ac53c5023a2', 'عدس أصفر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9ca996d4-9688-5782-949b-0ac53c5023a2', 'عدس احمر') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('9ca996d4-9688-5782-949b-0ac53c5023a2', 'EG', 'EGP', 'kg', 1,
  5000, 6500, 8500, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('8dc6119d-aee8-5c61-8c7a-d52f26e70a2d', 'lettuce', 'lettuce', 'خس', 'vegetables', 'piece', 350, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('8dc6119d-aee8-5c61-8c7a-d52f26e70a2d', 'khass') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8dc6119d-aee8-5c61-8c7a-d52f26e70a2d', 'romaine') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('8dc6119d-aee8-5c61-8c7a-d52f26e70a2d', 'خس بلدي') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('8dc6119d-aee8-5c61-8c7a-d52f26e70a2d', 'EG', 'EGP', 'piece', 1,
  1000, 1500, 2200, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c0700870-5842-5865-91e6-da53e20fce63', 'liver', 'beef liver', 'كبدة', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('c0700870-5842-5865-91e6-da53e20fce63', 'kebda') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c0700870-5842-5865-91e6-da53e20fce63', 'كبده') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c0700870-5842-5865-91e6-da53e20fce63', 'كبدة اسكندراني') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('c0700870-5842-5865-91e6-da53e20fce63', 'EG', 'EGP', 'kg', 1,
  20000, 24000, 29000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('bcf82b41-67e1-5916-84fb-62696a4ebd70', 'luncheon-meat', 'luncheon meat', 'لانشون', 'protein', 'g', 20, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('bcf82b41-67e1-5916-84fb-62696a4ebd70', 'luncheon') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('bcf82b41-67e1-5916-84fb-62696a4ebd70', 'لانشون') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('bcf82b41-67e1-5916-84fb-62696a4ebd70', 'لحم بارد') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e061d77d-fb1c-5625-9497-4ca6e3fe5948', 'mackerel', 'mackerel', 'ماكريل', 'protein', 'g', 250, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('e061d77d-fb1c-5625-9497-4ca6e3fe5948', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e061d77d-fb1c-5625-9497-4ca6e3fe5948', 'ماكريل') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e061d77d-fb1c-5625-9497-4ca6e3fe5948', 'scomber') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e061d77d-fb1c-5625-9497-4ca6e3fe5948', 'سمك ماكريل') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9ce30a89-e240-5be7-ab71-02a9fd5a2e51', 'mandarin', 'mandarins', 'يوسفي', 'fruit', 'piece', 90, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('9ce30a89-e240-5be7-ab71-02a9fd5a2e51', 'tangerine') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9ce30a89-e240-5be7-ab71-02a9fd5a2e51', 'يوسفي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9ce30a89-e240-5be7-ab71-02a9fd5a2e51', 'مندرين') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('f22a9a7d-76b2-5a91-be55-51304d813075', 'mango', 'mango', 'مانجو', 'fruit', 'piece', 250, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('f22a9a7d-76b2-5a91-be55-51304d813075', 'مانجو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f22a9a7d-76b2-5a91-be55-51304d813075', 'manga') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f22a9a7d-76b2-5a91-be55-51304d813075', 'mangoes') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('0bc711d8-dcbf-540a-b279-b696fa54361a', 'mayonnaise', 'mayonnaise', 'مايونيز', 'sauces', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('0bc711d8-dcbf-540a-b279-b696fa54361a', 'eggs') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0bc711d8-dcbf-540a-b279-b696fa54361a', 'مايونيز') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0bc711d8-dcbf-540a-b279-b696fa54361a', 'mayo') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('bb97f936-e44a-557d-8df0-260309a8a42b', 'melon', 'melon', 'شمام', 'fruit', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('bb97f936-e44a-557d-8df0-260309a8a42b', 'cantaloupe') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('bb97f936-e44a-557d-8df0-260309a8a42b', 'شمام') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('bb97f936-e44a-557d-8df0-260309a8a42b', 'كانتالوب') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('3dac1eb5-c9cb-5ad3-8054-d696f54a2826', 'milk', 'milk', 'لبن', 'dairy', 'ml', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('3dac1eb5-c9cb-5ad3-8054-d696f54a2826', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3dac1eb5-c9cb-5ad3-8054-d696f54a2826', 'laban') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3dac1eb5-c9cb-5ad3-8054-d696f54a2826', 'full cream milk') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3dac1eb5-c9cb-5ad3-8054-d696f54a2826', 'حليب') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('3dac1eb5-c9cb-5ad3-8054-d696f54a2826', 'EG', 'EGP', 'l', 1,
  3500, 4500, 5800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('70292abd-20c5-524d-a238-4b1a6e318853', 'mint', 'mint', 'نعناع', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('70292abd-20c5-524d-a238-4b1a6e318853', 'naana') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('70292abd-20c5-524d-a238-4b1a6e318853', 'نعناع') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('70292abd-20c5-524d-a238-4b1a6e318853', 'نعنع') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('91354e33-081d-56bf-8d2b-6af8074769f9', 'mixed-spice', 'mixed spice', 'بهارات مشكلة', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('91354e33-081d-56bf-8d2b-6af8074769f9', 'بهارات') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('91354e33-081d-56bf-8d2b-6af8074769f9', 'mixed spices') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('91354e33-081d-56bf-8d2b-6af8074769f9', 'seven spices') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('15a05f70-884c-5522-9a04-358625bafcca', 'molasses', 'black molasses', 'عسل أسود', 'sauces', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('15a05f70-884c-5522-9a04-358625bafcca', 'عسل اسود') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('15a05f70-884c-5522-9a04-358625bafcca', 'asal eswed') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('15a05f70-884c-5522-9a04-358625bafcca', 'treacle') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('a5743bf8-6d35-57d3-a398-e9effe63e2e9', 'molokhia', 'molokhia', 'ملوخية', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('a5743bf8-6d35-57d3-a398-e9effe63e2e9', 'mulukhiyah') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a5743bf8-6d35-57d3-a398-e9effe63e2e9', 'jute leaves') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a5743bf8-6d35-57d3-a398-e9effe63e2e9', 'ملوخيه') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a5743bf8-6d35-57d3-a398-e9effe63e2e9', 'ملوخية مفرومة') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('a5743bf8-6d35-57d3-a398-e9effe63e2e9', 'EG', 'EGP', 'pack', 1,
  2500, 3500, 4800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('65985480-861f-533c-b9a1-8d8a53af28fd', 'mozzarella', 'mozzarella', 'موتزاريلا', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('65985480-861f-533c-b9a1-8d8a53af28fd', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('65985480-861f-533c-b9a1-8d8a53af28fd', 'mozarella') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('65985480-861f-533c-b9a1-8d8a53af28fd', 'pizza cheese') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('65985480-861f-533c-b9a1-8d8a53af28fd', 'جبنة موتزاريلا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('65985480-861f-533c-b9a1-8d8a53af28fd', 'جبنه موزاريلا') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('65985480-861f-533c-b9a1-8d8a53af28fd', 'EG', 'EGP', 'kg', 1,
  18000, 23000, 29000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('563a0ba2-f5ba-581f-8be2-c85dbaa53057', 'mullet', 'mullet', 'بوري', 'protein', 'piece', 300, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('563a0ba2-f5ba-581f-8be2-c85dbaa53057', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('563a0ba2-f5ba-581f-8be2-c85dbaa53057', 'bouri') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('563a0ba2-f5ba-581f-8be2-c85dbaa53057', 'بوري') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('563a0ba2-f5ba-581f-8be2-c85dbaa53057', 'grey mullet') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('69c59795-3632-591f-a683-c285c86e5ccd', 'mushroom', 'mushrooms', 'مشروم', 'vegetables', 'g', 20, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('69c59795-3632-591f-a683-c285c86e5ccd', 'mushroom') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('69c59795-3632-591f-a683-c285c86e5ccd', 'عيش الغراب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('69c59795-3632-591f-a683-c285c86e5ccd', 'مشروم') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('69c59795-3632-591f-a683-c285c86e5ccd', 'champignon') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d20923af-9901-5b13-b1f7-bd763a0bb82e', 'mussels', 'mussels', 'بلح البحر', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('d20923af-9901-5b13-b1f7-bd763a0bb82e', 'shellfish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d20923af-9901-5b13-b1f7-bd763a0bb82e', 'بلح البحر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d20923af-9901-5b13-b1f7-bd763a0bb82e', 'mussel') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('167c646a-986c-5286-bed5-80e1c6bca1f2', 'mustard', 'mustard', 'مسطردة', 'sauces', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('167c646a-986c-5286-bed5-80e1c6bca1f2', 'مسطردة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('167c646a-986c-5286-bed5-80e1c6bca1f2', 'خردل') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('167c646a-986c-5286-bed5-80e1c6bca1f2', 'dijon') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('12106866-6ea1-5643-a1bf-e879c062588e', 'mustard-seed', 'mustard seeds', 'حب الخردل', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('12106866-6ea1-5643-a1bf-e879c062588e', 'خردل حب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('12106866-6ea1-5643-a1bf-e879c062588e', 'mustard seeds') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('98288ac2-4169-590f-bbb2-70ce8cea11cb', 'nigella', 'nigella seeds', 'حبة البركة', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('98288ac2-4169-590f-bbb2-70ce8cea11cb', 'حبة البركة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('98288ac2-4169-590f-bbb2-70ce8cea11cb', 'black seed') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('98288ac2-4169-590f-bbb2-70ce8cea11cb', 'حبة بركة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c9fad558-b367-5f02-87fe-4d654e63abb8', 'noodles', 'noodles', 'نودلز', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('c9fad558-b367-5f02-87fe-4d654e63abb8', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c9fad558-b367-5f02-87fe-4d654e63abb8', 'نودلز') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c9fad558-b367-5f02-87fe-4d654e63abb8', 'instant noodles') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c9fad558-b367-5f02-87fe-4d654e63abb8', 'indomie') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('489af5ea-b8c1-5000-bb16-3617719130fa', 'nutmeg', 'nutmeg', 'جوزة الطيب', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('489af5ea-b8c1-5000-bb16-3617719130fa', 'جوزة الطيب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('489af5ea-b8c1-5000-bb16-3617719130fa', 'جوز الطيب') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9036f0e7-e328-5f27-984d-214be30e6562', 'oats', 'oats', 'شوفان', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('9036f0e7-e328-5f27-984d-214be30e6562', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9036f0e7-e328-5f27-984d-214be30e6562', 'oatmeal') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9036f0e7-e328-5f27-984d-214be30e6562', 'rolled oats') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9036f0e7-e328-5f27-984d-214be30e6562', 'شوفان مجروش') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('9036f0e7-e328-5f27-984d-214be30e6562', 'EG', 'EGP', 'kg', 1,
  7000, 9500, 13000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('7a231039-350a-57aa-b447-18f738e0ecf7', 'okra', 'okra', 'بامية', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('7a231039-350a-57aa-b447-18f738e0ecf7', 'bamya') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7a231039-350a-57aa-b447-18f738e0ecf7', 'lady fingers') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7a231039-350a-57aa-b447-18f738e0ecf7', 'باميه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('7a231039-350a-57aa-b447-18f738e0ecf7', 'EG', 'EGP', 'kg', 1,
  3000, 4200, 5800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c87fb714-805c-5f3f-bd0f-a0a965ecf0e3', 'olive-oil', 'olive oil', 'زيت زيتون', 'sauces', 'ml', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('c87fb714-805c-5f3f-bd0f-a0a965ecf0e3', 'zeit zeitoun') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c87fb714-805c-5f3f-bd0f-a0a965ecf0e3', 'extra virgin olive oil') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c87fb714-805c-5f3f-bd0f-a0a965ecf0e3', 'زيت الزيتون') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('c87fb714-805c-5f3f-bd0f-a0a965ecf0e3', 'EG', 'EGP', 'l', 1,
  30000, 42000, 60000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('804bb65b-4972-5597-8b96-9c9d904eb0d9', 'olives', 'olives', 'زيتون', 'vegetables', 'g', 5, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('804bb65b-4972-5597-8b96-9c9d904eb0d9', 'zeitoun') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('804bb65b-4972-5597-8b96-9c9d904eb0d9', 'زيتون') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('804bb65b-4972-5597-8b96-9c9d904eb0d9', 'green olives') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('804bb65b-4972-5597-8b96-9c9d904eb0d9', 'black olives') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9cf244e0-4d4d-532b-9283-7595d8ba9228', 'onion-powder', 'onion powder', 'بصل بودرة', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('9cf244e0-4d4d-532b-9283-7595d8ba9228', 'بصل بودرة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('438a1460-58d0-5879-83c7-d5ec71c4ba7f', 'onions', 'onions', 'بصل', 'vegetables', 'piece', 110, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('438a1460-58d0-5879-83c7-d5ec71c4ba7f', 'onion') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('438a1460-58d0-5879-83c7-d5ec71c4ba7f', 'basal') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('438a1460-58d0-5879-83c7-d5ec71c4ba7f', 'بصل أحمر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('438a1460-58d0-5879-83c7-d5ec71c4ba7f', 'بصل أبيض') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('438a1460-58d0-5879-83c7-d5ec71c4ba7f', 'EG', 'EGP', 'kg', 1,
  1200, 1800, 2800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c3dfa1d6-61d0-51f7-bc41-3dd38ce4f2a8', 'orange-blossom', 'orange blossom water', 'ماء زهر', 'pantry', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('c3dfa1d6-61d0-51f7-bc41-3dd38ce4f2a8', 'ماء الزهر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c3dfa1d6-61d0-51f7-bc41-3dd38ce4f2a8', 'mazaher') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('becb77ef-523e-572f-b7a7-0e4131915c81', 'oranges', 'oranges', 'برتقال', 'fruit', 'piece', 180, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('becb77ef-523e-572f-b7a7-0e4131915c81', 'orange') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('becb77ef-523e-572f-b7a7-0e4131915c81', 'برتقال') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('becb77ef-523e-572f-b7a7-0e4131915c81', 'برتقاله') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c82dd522-2bda-5cd1-94d9-12cb6478e10a', 'oregano', 'oregano', 'أوريجانو', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('c82dd522-2bda-5cd1-94d9-12cb6478e10a', 'اوريجانو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c82dd522-2bda-5cd1-94d9-12cb6478e10a', 'زعتر بري') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('170daaf4-de33-55da-b958-5bd619406b74', 'paprika', 'paprika', 'بابريكا', 'spices', 'tsp', 2, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('170daaf4-de33-55da-b958-5bd619406b74', 'sweet paprika') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('170daaf4-de33-55da-b958-5bd619406b74', 'فلفل أحمر مطحون') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('170daaf4-de33-55da-b958-5bd619406b74', 'EG', 'EGP', 'kg', 1,
  14000, 19000, 26000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('398fa874-3c36-581d-9458-98a1557b9f98', 'parmesan', 'parmesan', 'جبنة بارميزان', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('398fa874-3c36-581d-9458-98a1557b9f98', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('398fa874-3c36-581d-9458-98a1557b9f98', 'parmigiano') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('398fa874-3c36-581d-9458-98a1557b9f98', 'بارميزان') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('398fa874-3c36-581d-9458-98a1557b9f98', 'بارمزان') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('06a6e131-e1c8-5a90-aa0f-dde5ff75009a', 'parsley', 'parsley', 'بقدونس', 'vegetables', 'bunch', 60, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('06a6e131-e1c8-5a90-aa0f-dde5ff75009a', 'ba2dounes') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('06a6e131-e1c8-5a90-aa0f-dde5ff75009a', 'بقدونس أخضر') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('06a6e131-e1c8-5a90-aa0f-dde5ff75009a', 'EG', 'EGP', 'bunch', 1,
  300, 500, 800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('84719e99-9939-50f6-81d9-c7c3234a3200', 'pasta', 'pasta', 'مكرونة', 'carbs', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('84719e99-9939-50f6-81d9-c7c3234a3200', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('84719e99-9939-50f6-81d9-c7c3234a3200', 'macaroni') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('84719e99-9939-50f6-81d9-c7c3234a3200', 'spaghetti') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('84719e99-9939-50f6-81d9-c7c3234a3200', 'penne') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('84719e99-9939-50f6-81d9-c7c3234a3200', 'makarona') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('84719e99-9939-50f6-81d9-c7c3234a3200', 'مكرونه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('84719e99-9939-50f6-81d9-c7c3234a3200', 'EG', 'EGP', 'kg', 1,
  2200, 3000, 4200, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2ccc4de4-f59b-5ece-a284-c4179344d3cb', 'pastrami', 'basterma', 'بسطرمة', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('2ccc4de4-f59b-5ece-a284-c4179344d3cb', 'basterma') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2ccc4de4-f59b-5ece-a284-c4179344d3cb', 'pastirma') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2ccc4de4-f59b-5ece-a284-c4179344d3cb', 'بسطرمه') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2ccc4de4-f59b-5ece-a284-c4179344d3cb', 'بسطرمة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('0006ef17-6463-5758-88e8-f248a21a5885', 'peach', 'peaches', 'خوخ', 'fruit', 'piece', 150, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('0006ef17-6463-5758-88e8-f248a21a5885', 'peach') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0006ef17-6463-5758-88e8-f248a21a5885', 'خوخ') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('651ea366-fa00-56e8-a0da-8dc2edfcb4d3', 'peanut-butter', 'peanut butter', 'زبدة فول سوداني', 'pantry', 'tbsp', 16, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('651ea366-fa00-56e8-a0da-8dc2edfcb4d3', 'peanuts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('651ea366-fa00-56e8-a0da-8dc2edfcb4d3', 'pb') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('651ea366-fa00-56e8-a0da-8dc2edfcb4d3', 'زبده فول سوداني') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('651ea366-fa00-56e8-a0da-8dc2edfcb4d3', 'EG', 'EGP', 'pack', 1,
  12000, 16000, 22000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d61afade-87ce-5f49-aac0-fd391ddb6a06', 'peanuts', 'peanuts', 'فول سوداني', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('d61afade-87ce-5f49-aac0-fd391ddb6a06', 'peanuts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d61afade-87ce-5f49-aac0-fd391ddb6a06', 'فول سوداني') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d61afade-87ce-5f49-aac0-fd391ddb6a06', 'sudani') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d61afade-87ce-5f49-aac0-fd391ddb6a06', 'peanut') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('40a05c2a-0fed-5da0-a858-1aaaf02aa69e', 'pear', 'pears', 'كمثرى', 'fruit', 'piece', 170, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('40a05c2a-0fed-5da0-a858-1aaaf02aa69e', 'pear') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('40a05c2a-0fed-5da0-a858-1aaaf02aa69e', 'كمثرى') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('40a05c2a-0fed-5da0-a858-1aaaf02aa69e', 'كمترى') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('f30b9211-c4bd-5f0c-9c3a-264b4d908839', 'phyllo', 'filo pastry', 'عجينة جلاش', 'bakery', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('f30b9211-c4bd-5f0c-9c3a-264b4d908839', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f30b9211-c4bd-5f0c-9c3a-264b4d908839', 'goulash') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f30b9211-c4bd-5f0c-9c3a-264b4d908839', 'جلاش') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f30b9211-c4bd-5f0c-9c3a-264b4d908839', 'filo') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f30b9211-c4bd-5f0c-9c3a-264b4d908839', 'phyllo') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('993065a0-6eaf-5913-b5c2-28e1754ceda0', 'pickles', 'pickles', 'مخلل', 'vegetables', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('993065a0-6eaf-5913-b5c2-28e1754ceda0', 'torshi') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('993065a0-6eaf-5913-b5c2-28e1754ceda0', 'مخلل') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('993065a0-6eaf-5913-b5c2-28e1754ceda0', 'طرشي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('993065a0-6eaf-5913-b5c2-28e1754ceda0', 'pickle') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('933182c4-a754-5fef-b9d4-defbd54a687b', 'pigeon', 'pigeon', 'حمام', 'protein', 'piece', 300, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('933182c4-a754-5fef-b9d4-defbd54a687b', 'hamam') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('933182c4-a754-5fef-b9d4-defbd54a687b', 'حمام') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('933182c4-a754-5fef-b9d4-defbd54a687b', 'حمامة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('60a87a1f-8328-5665-aaa8-3a292f89973e', 'pine-nuts', 'pine nuts', 'صنوبر', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('60a87a1f-8328-5665-aaa8-3a292f89973e', 'nuts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('60a87a1f-8328-5665-aaa8-3a292f89973e', 'صنوبر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('60a87a1f-8328-5665-aaa8-3a292f89973e', 'snoubar') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('aa17a5f3-3c9e-5f36-890a-fe7b9bbef6dc', 'pineapple', 'pineapple', 'أناناس', 'fruit', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('aa17a5f3-3c9e-5f36-890a-fe7b9bbef6dc', 'اناناس') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aa17a5f3-3c9e-5f36-890a-fe7b9bbef6dc', 'أناناس') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('0ee00d5a-d5c5-50cb-ad34-95ff6fb8be4b', 'pistachios', 'pistachios', 'فستق', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('0ee00d5a-d5c5-50cb-ad34-95ff6fb8be4b', 'nuts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0ee00d5a-d5c5-50cb-ad34-95ff6fb8be4b', 'فستق') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0ee00d5a-d5c5-50cb-ad34-95ff6fb8be4b', 'fostok') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0ee00d5a-d5c5-50cb-ad34-95ff6fb8be4b', 'pistachio') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('38e5db88-f285-5d22-b85d-3c6a25a39d6d', 'pita-bread', 'pita bread', 'عيش شامي', 'bakery', 'piece', 80, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('38e5db88-f285-5d22-b85d-3c6a25a39d6d', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('38e5db88-f285-5d22-b85d-3c6a25a39d6d', 'شامي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('38e5db88-f285-5d22-b85d-3c6a25a39d6d', 'عيش شامي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('38e5db88-f285-5d22-b85d-3c6a25a39d6d', 'pitta') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('19d284a1-929c-5054-95e8-e5bc0ddd4eb9', 'plum', 'plums', 'برقوق', 'fruit', 'piece', 60, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('19d284a1-929c-5054-95e8-e5bc0ddd4eb9', 'plum') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('19d284a1-929c-5054-95e8-e5bc0ddd4eb9', 'برقوق') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('276f6fd0-9024-541b-826f-8b7db611d310', 'pomegranate', 'pomegranate', 'رمان', 'fruit', 'piece', 280, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('276f6fd0-9024-541b-826f-8b7db611d310', 'رمان') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('276f6fd0-9024-541b-826f-8b7db611d310', 'romman') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('a4f1b9f0-eab6-592e-9c1d-3733618701a8', 'pomegranate-molasses', 'pomegranate molasses', 'دبس رمان', 'sauces', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('a4f1b9f0-eab6-592e-9c1d-3733618701a8', 'دبس الرمان') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a4f1b9f0-eab6-592e-9c1d-3733618701a8', 'debs romman') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e8a8e935-9ff9-5797-9bde-48bfbca72a83', 'potatoes', 'potatoes', 'بطاطس', 'vegetables', 'g', 150, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e8a8e935-9ff9-5797-9bde-48bfbca72a83', 'potato') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e8a8e935-9ff9-5797-9bde-48bfbca72a83', 'batates') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('e8a8e935-9ff9-5797-9bde-48bfbca72a83', 'EG', 'EGP', 'kg', 1,
  1200, 1800, 2600, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('ecf309ea-f8d5-52d3-9db7-535cfbf9b6f5', 'powdered-milk', 'powdered milk', 'لبن بودرة', 'dairy', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('ecf309ea-f8d5-52d3-9db7-535cfbf9b6f5', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ecf309ea-f8d5-52d3-9db7-535cfbf9b6f5', 'milk powder') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ecf309ea-f8d5-52d3-9db7-535cfbf9b6f5', 'لبن بودرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ecf309ea-f8d5-52d3-9db7-535cfbf9b6f5', 'بودرة لبن') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('ecb0b6a8-19f0-56b1-8aef-d63f5ec1ebb4', 'prunes', 'prunes', 'برقوق مجفف', 'fruit', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('ecb0b6a8-19f0-56b1-8aef-d63f5ec1ebb4', 'برقوق مجفف') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('fe59c7f5-2c14-5da3-9561-82db130cdf9a', 'puff-pastry', 'puff pastry', 'عجينة باف', 'bakery', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('fe59c7f5-2c14-5da3-9561-82db130cdf9a', 'gluten') on conflict do nothing;
insert into public.ingredient_allergens (ingredient_id, allergen)
values ('fe59c7f5-2c14-5da3-9561-82db130cdf9a', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('fe59c7f5-2c14-5da3-9561-82db130cdf9a', 'باف باستري') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('fe59c7f5-2c14-5da3-9561-82db130cdf9a', 'عجين مورق') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b6f402db-126c-5814-ae9f-5bfdec98b869', 'pumpkin', 'pumpkin', 'قرع عسلي', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b6f402db-126c-5814-ae9f-5bfdec98b869', 'قرع') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b6f402db-126c-5814-ae9f-5bfdec98b869', 'قرع عسلي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b6f402db-126c-5814-ae9f-5bfdec98b869', 'squash') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('a5a94e71-df39-5903-8b99-1d47856f5ebb', 'pumpkin-seeds', 'pumpkin seeds', 'لب أبيض', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('a5a94e71-df39-5903-8b99-1d47856f5ebb', 'لب ابيض') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a5a94e71-df39-5903-8b99-1d47856f5ebb', 'pepitas') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('41cb76ed-64f3-508e-981e-b917e9e930a5', 'quinoa', 'quinoa', 'كينوا', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('41cb76ed-64f3-508e-981e-b917e9e930a5', 'كينوا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('41cb76ed-64f3-508e-981e-b917e9e930a5', 'quinua') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4712db65-3a91-5d49-aed4-dc8aa98e7390', 'rabbit', 'rabbit', 'أرنب', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('4712db65-3a91-5d49-aed4-dc8aa98e7390', 'أرانب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4712db65-3a91-5d49-aed4-dc8aa98e7390', 'لحم أرنب') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('7cbd0857-78d7-500f-85d8-a7fff0101843', 'radish', 'radish', 'فجل', 'vegetables', 'g', 20, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('7cbd0857-78d7-500f-85d8-a7fff0101843', 'فجل') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7cbd0857-78d7-500f-85d8-a7fff0101843', 'figl') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d87c81b9-8e1d-5374-8183-b84ff0f17544', 'raisins', 'raisins', 'زبيب', 'fruit', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d87c81b9-8e1d-5374-8183-b84ff0f17544', 'zabib') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d87c81b9-8e1d-5374-8183-b84ff0f17544', 'زبيب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d87c81b9-8e1d-5374-8183-b84ff0f17544', 'sultanas') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('eafffe31-b9ee-5a22-b353-b464c2d8d32e', 'rice', 'rice', 'أرز', 'carbs', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('eafffe31-b9ee-5a22-b353-b464c2d8d32e', 'egyptian rice') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('eafffe31-b9ee-5a22-b353-b464c2d8d32e', 'white rice') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('eafffe31-b9ee-5a22-b353-b464c2d8d32e', 'roz') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('eafffe31-b9ee-5a22-b353-b464c2d8d32e', 'رز') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('eafffe31-b9ee-5a22-b353-b464c2d8d32e', 'EG', 'EGP', 'kg', 1,
  3000, 3800, 5000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('33610539-a756-5801-81a2-5811f3056d49', 'rocket', 'rocket', 'جرجير', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('33610539-a756-5801-81a2-5811f3056d49', 'arugula') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('33610539-a756-5801-81a2-5811f3056d49', 'gargeer') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('33610539-a756-5801-81a2-5811f3056d49', 'جرجير') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('0b3fe32c-136e-57da-a26f-857da4b58c47', 'rose-water', 'rose water', 'ماء ورد', 'pantry', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('0b3fe32c-136e-57da-a26f-857da4b58c47', 'ماء الورد') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0b3fe32c-136e-57da-a26f-857da4b58c47', 'maward') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('553e84b4-b96e-58a5-85f8-6080e2baee36', 'rosemary', 'rosemary', 'روزماري', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('553e84b4-b96e-58a5-85f8-6080e2baee36', 'روزماري') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('553e84b4-b96e-58a5-85f8-6080e2baee36', 'حصى البان') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('64932368-b4af-5ffb-a74d-e12869645f63', 'roumy-cheese', 'roumy cheese', 'جبنة رومي', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('64932368-b4af-5ffb-a74d-e12869645f63', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('64932368-b4af-5ffb-a74d-e12869645f63', 'romy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('64932368-b4af-5ffb-a74d-e12869645f63', 'ras cheese') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('64932368-b4af-5ffb-a74d-e12869645f63', 'جبنه رومي') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('64932368-b4af-5ffb-a74d-e12869645f63', 'EG', 'EGP', 'kg', 1,
  28000, 34000, 42000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4a89c3c2-bb8b-5353-962f-01e5647f3173', 'saffron', 'saffron', 'زعفران', 'spices', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('4a89c3c2-bb8b-5353-962f-01e5647f3173', 'زعفران') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4a89c3c2-bb8b-5353-962f-01e5647f3173', 'zaafaran') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('65cff741-7c92-5462-abf6-78f16907b2ba', 'salmon', 'salmon', 'سالمون', 'protein', 'g', 180, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('65cff741-7c92-5462-abf6-78f16907b2ba', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('65cff741-7c92-5462-abf6-78f16907b2ba', 'salmon fillet') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('65cff741-7c92-5462-abf6-78f16907b2ba', 'سلمون') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('65cff741-7c92-5462-abf6-78f16907b2ba', 'سالمون') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('65cff741-7c92-5462-abf6-78f16907b2ba', 'samak salmon') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9d122ba9-b8aa-547f-9473-838a4f54941f', 'salt', 'salt', 'ملح', 'spices', 'tsp', 6, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('9d122ba9-b8aa-547f-9473-838a4f54941f', 'malh') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9d122ba9-b8aa-547f-9473-838a4f54941f', 'table salt') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9d122ba9-b8aa-547f-9473-838a4f54941f', 'ملح طعام') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('9d122ba9-b8aa-547f-9473-838a4f54941f', 'EG', 'EGP', 'kg', 1,
  500, 800, 1200, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('3ca6eccc-25a2-5ebe-92c0-bfc7881607b3', 'salted-fish', 'fesikh', 'فسيخ', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('3ca6eccc-25a2-5ebe-92c0-bfc7881607b3', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3ca6eccc-25a2-5ebe-92c0-bfc7881607b3', 'fesikh') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3ca6eccc-25a2-5ebe-92c0-bfc7881607b3', 'فسيخ') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3ca6eccc-25a2-5ebe-92c0-bfc7881607b3', 'salted mullet') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('f8b45db5-74b1-52db-bc27-82d11f66556c', 'sardines', 'sardines', 'سردين', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('f8b45db5-74b1-52db-bc27-82d11f66556c', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f8b45db5-74b1-52db-bc27-82d11f66556c', 'sardine') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f8b45db5-74b1-52db-bc27-82d11f66556c', 'سردين') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f8b45db5-74b1-52db-bc27-82d11f66556c', 'سردينة') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('71b8319b-c9b8-5d56-9a09-25c14de89842', 'sausage', 'beef sausage', 'سجق', 'protein', 'g', 40, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('71b8319b-c9b8-5d56-9a09-25c14de89842', 'sogo2') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('71b8319b-c9b8-5d56-9a09-25c14de89842', 'sogok') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('71b8319b-c9b8-5d56-9a09-25c14de89842', 'سجق بلدي') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('71b8319b-c9b8-5d56-9a09-25c14de89842', 'EG', 'EGP', 'kg', 1,
  22000, 27000, 33000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('aed9f555-75b3-530e-b8d6-5f779fcec439', 'sea-bass', 'sea bass', 'قاروص', 'protein', 'piece', 400, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('aed9f555-75b3-530e-b8d6-5f779fcec439', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aed9f555-75b3-530e-b8d6-5f779fcec439', 'qaros') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aed9f555-75b3-530e-b8d6-5f779fcec439', 'قاروص') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aed9f555-75b3-530e-b8d6-5f779fcec439', 'وقار') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aed9f555-75b3-530e-b8d6-5f779fcec439', 'branzino') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2c9476d9-e5a4-56f7-849c-7ef90a79ab60', 'sea-bream', 'sea bream', 'دنيس', 'protein', 'piece', 350, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('2c9476d9-e5a4-56f7-849c-7ef90a79ab60', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2c9476d9-e5a4-56f7-849c-7ef90a79ab60', 'denis') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2c9476d9-e5a4-56f7-849c-7ef90a79ab60', 'دنيس') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2c9476d9-e5a4-56f7-849c-7ef90a79ab60', 'gilthead') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b92c252c-f087-505f-96d2-1909a010a426', 'semolina', 'semolina', 'سميد', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('b92c252c-f087-505f-96d2-1909a010a426', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b92c252c-f087-505f-96d2-1909a010a426', 'سميد') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b92c252c-f087-505f-96d2-1909a010a426', 'smeed') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b92c252c-f087-505f-96d2-1909a010a426', 'farina') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4c8970c1-eebd-52c7-94d0-21b38c8f50ae', 'sesame-oil', 'sesame oil', 'زيت سمسم', 'pantry', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('4c8970c1-eebd-52c7-94d0-21b38c8f50ae', 'sesame') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4c8970c1-eebd-52c7-94d0-21b38c8f50ae', 'زيت السمسم') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('4bcee270-941c-5f70-84f8-5398933e495b', 'sesame-seeds', 'sesame seeds', 'سمسم', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('4bcee270-941c-5f70-84f8-5398933e495b', 'sesame') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4bcee270-941c-5f70-84f8-5398933e495b', 'سمسم') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('4bcee270-941c-5f70-84f8-5398933e495b', 'simsim') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d77e3210-5799-5fba-b1c0-a879328f4332', 'shrimp', 'shrimp', 'جمبري', 'protein', 'g', 12, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('d77e3210-5799-5fba-b1c0-a879328f4332', 'shellfish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d77e3210-5799-5fba-b1c0-a879328f4332', 'prawns') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d77e3210-5799-5fba-b1c0-a879328f4332', 'gambari') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d77e3210-5799-5fba-b1c0-a879328f4332', 'جمبرى') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('d77e3210-5799-5fba-b1c0-a879328f4332', 'EG', 'EGP', 'kg', 1,
  32000, 42000, 55000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d2030f31-c9c5-57b5-b0a8-2e88bfeae7a3', 'soy-sauce', 'soy sauce', 'صوص الصويا', 'sauces', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('d2030f31-c9c5-57b5-b0a8-2e88bfeae7a3', 'soy') on conflict do nothing;
insert into public.ingredient_allergens (ingredient_id, allergen)
values ('d2030f31-c9c5-57b5-b0a8-2e88bfeae7a3', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d2030f31-c9c5-57b5-b0a8-2e88bfeae7a3', 'صويا صوص') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d2030f31-c9c5-57b5-b0a8-2e88bfeae7a3', 'soya sauce') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d2030f31-c9c5-57b5-b0a8-2e88bfeae7a3', 'صوص صويا') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('f47299af-3837-5992-a90b-f5e3c1253070', 'soybeans', 'soybeans', 'فول الصويا', 'protein', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('f47299af-3837-5992-a90b-f5e3c1253070', 'soy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f47299af-3837-5992-a90b-f5e3c1253070', 'soya') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f47299af-3837-5992-a90b-f5e3c1253070', 'فول صويا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('f47299af-3837-5992-a90b-f5e3c1253070', 'soy beans') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('781128dc-5989-5b4e-b363-a183808a68de', 'spinach', 'spinach', 'سبانخ', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('781128dc-5989-5b4e-b363-a183808a68de', 'sabanekh') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('781128dc-5989-5b4e-b363-a183808a68de', 'سبانخ مفرومة') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('781128dc-5989-5b4e-b363-a183808a68de', 'EG', 'EGP', 'kg', 1,
  1500, 2200, 3200, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('156215ce-a6a3-57e2-bb3c-39262bfebd0b', 'split-peas', 'split peas', 'بسلة مجروشة', 'protein', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('156215ce-a6a3-57e2-bb3c-39262bfebd0b', 'بسلة مجروشة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('156215ce-a6a3-57e2-bb3c-39262bfebd0b', 'yellow split peas') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('453f768d-9294-536f-ad8e-6c8b5f49ae3c', 'spring-garlic', 'spring garlic', 'ثوم أخضر', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('453f768d-9294-536f-ad8e-6c8b5f49ae3c', 'ثوم اخضر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('453f768d-9294-536f-ad8e-6c8b5f49ae3c', 'green garlic') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d31efc56-6ee3-58da-b81e-5e11c8e06fbe', 'stock-cube', 'stock cube', 'مكعب مرقة', 'pantry', 'piece', 10, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d31efc56-6ee3-58da-b81e-5e11c8e06fbe', 'maggi') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d31efc56-6ee3-58da-b81e-5e11c8e06fbe', 'مكعب مرقة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d31efc56-6ee3-58da-b81e-5e11c8e06fbe', 'bouillon') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d31efc56-6ee3-58da-b81e-5e11c8e06fbe', 'شوربة مكعبات') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('6b3d1bfe-2832-5820-9e49-95f14aab1728', 'strawberry', 'strawberries', 'فراولة', 'fruit', 'g', 20, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('6b3d1bfe-2832-5820-9e49-95f14aab1728', 'strawberry') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('6b3d1bfe-2832-5820-9e49-95f14aab1728', 'فراولة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('6b3d1bfe-2832-5820-9e49-95f14aab1728', 'فراوله') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('1adc1ada-479e-5b3a-bdeb-4b3f054afcc7', 'sugar', 'sugar', 'سكر', 'pantry', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('1adc1ada-479e-5b3a-bdeb-4b3f054afcc7', 'sokkar') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1adc1ada-479e-5b3a-bdeb-4b3f054afcc7', 'white sugar') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('1adc1ada-479e-5b3a-bdeb-4b3f054afcc7', 'سكر أبيض') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('1adc1ada-479e-5b3a-bdeb-4b3f054afcc7', 'EG', 'EGP', 'kg', 1,
  2800, 3400, 4200, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e14c57c0-53b0-55c2-824b-94910dda15f7', 'sumac', 'sumac', 'سماق', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e14c57c0-53b0-55c2-824b-94910dda15f7', 'سماق') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e14c57c0-53b0-55c2-824b-94910dda15f7', 'summaq') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('2d338186-fe10-5277-82f4-d8f623e6daf7', 'sun-dried-tomato', 'sun-dried tomatoes', 'طماطم مجففة', 'vegetables', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('2d338186-fe10-5277-82f4-d8f623e6daf7', 'طماطم مجففة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('2d338186-fe10-5277-82f4-d8f623e6daf7', 'sundried tomato') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e73ba4ed-484e-50aa-a8ff-90d1516c3b5c', 'sunflower-oil', 'vegetable oil', 'زيت', 'sauces', 'ml', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e73ba4ed-484e-50aa-a8ff-90d1516c3b5c', 'oil') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e73ba4ed-484e-50aa-a8ff-90d1516c3b5c', 'sunflower oil') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e73ba4ed-484e-50aa-a8ff-90d1516c3b5c', 'cooking oil') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e73ba4ed-484e-50aa-a8ff-90d1516c3b5c', 'زيت عباد الشمس') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('e73ba4ed-484e-50aa-a8ff-90d1516c3b5c', 'EG', 'EGP', 'l', 1,
  6500, 8000, 10000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b8021c1d-1d78-58d7-8e9e-113939cdb92e', 'sunflower-seeds', 'sunflower seeds', 'لب', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('b8021c1d-1d78-58d7-8e9e-113939cdb92e', 'لب') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b8021c1d-1d78-58d7-8e9e-113939cdb92e', 'seeds') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b8021c1d-1d78-58d7-8e9e-113939cdb92e', 'لب سوري') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('058432a1-fea0-5498-a6fe-bf2242554cc7', 'sweet-potato', 'sweet potato', 'بطاطا', 'vegetables', 'g', 180, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('058432a1-fea0-5498-a6fe-bf2242554cc7', 'batata') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('058432a1-fea0-5498-a6fe-bf2242554cc7', 'بطاطا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('058432a1-fea0-5498-a6fe-bf2242554cc7', 'yam') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('48afeda5-6d2e-5ad9-93b8-c4e6307a2d33', 'tahini', 'tahini', 'طحينة', 'sauces', 'tbsp', 15, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('48afeda5-6d2e-5ad9-93b8-c4e6307a2d33', 'sesame') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('48afeda5-6d2e-5ad9-93b8-c4e6307a2d33', 'tehina') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('48afeda5-6d2e-5ad9-93b8-c4e6307a2d33', 'sesame paste') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('48afeda5-6d2e-5ad9-93b8-c4e6307a2d33', 'طحينه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('48afeda5-6d2e-5ad9-93b8-c4e6307a2d33', 'EG', 'EGP', 'pack', 1,
  6000, 8000, 11000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('30527d32-8e4a-5d81-a9f4-4eb2e0fac7ad', 'tahini-salad', 'tahina salad', 'صلصة طحينة', 'sauces', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('30527d32-8e4a-5d81-a9f4-4eb2e0fac7ad', 'sesame') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('30527d32-8e4a-5d81-a9f4-4eb2e0fac7ad', 'tahina') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('a1ed1dab-0de4-5953-b7f1-b18075bf5167', 'taro', 'taro', 'قلقاس', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('a1ed1dab-0de4-5953-b7f1-b18075bf5167', 'olocas') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a1ed1dab-0de4-5953-b7f1-b18075bf5167', 'قلقاس') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('a1ed1dab-0de4-5953-b7f1-b18075bf5167', 'colocasia') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e890789c-3663-596d-8913-f38086589788', 'tea', 'tea', 'شاي', 'pantry', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e890789c-3663-596d-8913-f38086589788', 'شاي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e890789c-3663-596d-8913-f38086589788', 'shay') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e890789c-3663-596d-8913-f38086589788', 'tea leaves') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('feed5445-7974-5a39-b323-c91c932226ff', 'thyme-dried', 'thyme', 'زعتر', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('feed5445-7974-5a39-b323-c91c932226ff', 'زعتر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('feed5445-7974-5a39-b323-c91c932226ff', 'zaatar') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('feed5445-7974-5a39-b323-c91c932226ff', 'zatar') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('635f0163-e28b-57df-aa8f-748f23071b3e', 'tilapia', 'tilapia', 'بلطي', 'protein', 'g', 300, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('635f0163-e28b-57df-aa8f-748f23071b3e', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('635f0163-e28b-57df-aa8f-748f23071b3e', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('635f0163-e28b-57df-aa8f-748f23071b3e', 'bolti') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('635f0163-e28b-57df-aa8f-748f23071b3e', 'بلطى') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('635f0163-e28b-57df-aa8f-748f23071b3e', 'سمك') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('635f0163-e28b-57df-aa8f-748f23071b3e', 'EG', 'EGP', 'kg', 1,
  9000, 12000, 15000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('df40dfec-b14e-57ac-8072-14bb4cc8345d', 'toast-bread', 'toast bread', 'عيش توست', 'bakery', 'slice', 30, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('df40dfec-b14e-57ac-8072-14bb4cc8345d', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('df40dfec-b14e-57ac-8072-14bb4cc8345d', 'toast') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('df40dfec-b14e-57ac-8072-14bb4cc8345d', 'white bread') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('df40dfec-b14e-57ac-8072-14bb4cc8345d', 'sandwich bread') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('df40dfec-b14e-57ac-8072-14bb4cc8345d', 'توست') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('df40dfec-b14e-57ac-8072-14bb4cc8345d', 'EG', 'EGP', 'pack', 1,
  2500, 3500, 4500, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('833a50a8-f3f6-57b5-9d44-cfce4b211a46', 'tofu', 'tofu', 'توفو', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('833a50a8-f3f6-57b5-9d44-cfce4b211a46', 'soy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('833a50a8-f3f6-57b5-9d44-cfce4b211a46', 'توفو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('833a50a8-f3f6-57b5-9d44-cfce4b211a46', 'bean curd') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d25879ab-da91-515e-babe-3284473de9ba', 'tomato-paste', 'tomato paste', 'صلصة طماطم', 'sauces', 'tbsp', 16, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d25879ab-da91-515e-babe-3284473de9ba', 'salsa') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d25879ab-da91-515e-babe-3284473de9ba', 'tomato puree') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d25879ab-da91-515e-babe-3284473de9ba', 'صلصه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('d25879ab-da91-515e-babe-3284473de9ba', 'EG', 'EGP', 'can', 1,
  2000, 2800, 3800, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('19bc7acd-f4cd-5aa4-9934-0e3bee41439b', 'tomato-sauce', 'tomato sauce', 'صلصة طماطم', 'sauces', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('19bc7acd-f4cd-5aa4-9934-0e3bee41439b', 'passata') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('19bc7acd-f4cd-5aa4-9934-0e3bee41439b', 'صوص طماطم مطبوخ') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e40147a0-afff-5cc5-809e-690b81481ae3', 'tomatoes', 'tomatoes', 'طماطم', 'vegetables', 'piece', 120, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e40147a0-afff-5cc5-809e-690b81481ae3', 'tomato') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e40147a0-afff-5cc5-809e-690b81481ae3', 'oota') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e40147a0-afff-5cc5-809e-690b81481ae3', 'طماطم حمراء') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e40147a0-afff-5cc5-809e-690b81481ae3', 'قوطة') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('e40147a0-afff-5cc5-809e-690b81481ae3', 'EG', 'EGP', 'kg', 1,
  1000, 1600, 2600, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('b70dc41b-b703-561c-b79f-760d9dd98422', 'tortilla', 'tortilla', 'تورتيلا', 'bakery', 'piece', 60, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('b70dc41b-b703-561c-b79f-760d9dd98422', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b70dc41b-b703-561c-b79f-760d9dd98422', 'تورتيلا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b70dc41b-b703-561c-b79f-760d9dd98422', 'wrap') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('b70dc41b-b703-561c-b79f-760d9dd98422', 'خبز تورتيلا') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('67433159-103d-5d03-88e1-f62ded98b9de', 'tuna-can', 'canned tuna', 'تونة', 'protein', 'can', 140, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('67433159-103d-5d03-88e1-f62ded98b9de', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('67433159-103d-5d03-88e1-f62ded98b9de', 'tuna') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('67433159-103d-5d03-88e1-f62ded98b9de', 'tuna can') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('67433159-103d-5d03-88e1-f62ded98b9de', 'تونه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('67433159-103d-5d03-88e1-f62ded98b9de', 'EG', 'EGP', 'can', 1,
  4500, 5800, 7500, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d1a35ade-dcac-54c0-a8de-33d9b99ae748', 'turkey', 'turkey', 'ديك رومي', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d1a35ade-dcac-54c0-a8de-33d9b99ae748', 'turkey breast') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d1a35ade-dcac-54c0-a8de-33d9b99ae748', 'رومي') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d1a35ade-dcac-54c0-a8de-33d9b99ae748', 'ديك رومي') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('68401d47-3758-5402-9e21-6867ffa93d2e', 'turmeric', 'turmeric', 'كركم', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('68401d47-3758-5402-9e21-6867ffa93d2e', 'كركم') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('68401d47-3758-5402-9e21-6867ffa93d2e', 'kurkum') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('7032986c-cb41-512a-a341-9f8f5c4ee6ea', 'turnip', 'turnip', 'لفت', 'vegetables', 'g', 120, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('7032986c-cb41-512a-a341-9f8f5c4ee6ea', 'لفت') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('7032986c-cb41-512a-a341-9f8f5c4ee6ea', 'left') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('3f6b34cf-d03c-5a28-b7fb-27b77c9200f3', 'vanilla', 'vanilla', 'فانيليا', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('3f6b34cf-d03c-5a28-b7fb-27b77c9200f3', 'فانيليا') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3f6b34cf-d03c-5a28-b7fb-27b77c9200f3', 'vanilla extract') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3f6b34cf-d03c-5a28-b7fb-27b77c9200f3', 'فانيلا') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('877f0b3e-6508-5fc1-bb4c-7436974b34cc', 'veal', 'veal', 'بتلو', 'protein', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('877f0b3e-6508-5fc1-bb4c-7436974b34cc', 'bitello') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('877f0b3e-6508-5fc1-bb4c-7436974b34cc', 'بتلو') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('877f0b3e-6508-5fc1-bb4c-7436974b34cc', 'لحم بتلو') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('125df92b-d09e-5f70-ac61-291a686ef2b8', 'vermicelli', 'vermicelli', 'شعرية', 'carbs', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('125df92b-d09e-5f70-ac61-291a686ef2b8', 'gluten') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('125df92b-d09e-5f70-ac61-291a686ef2b8', 'sha3reya') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('125df92b-d09e-5f70-ac61-291a686ef2b8', 'shaareya') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('125df92b-d09e-5f70-ac61-291a686ef2b8', 'شعريه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('125df92b-d09e-5f70-ac61-291a686ef2b8', 'EG', 'EGP', 'pack', 1,
  2500, 3200, 4200, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9c4ff58a-5537-5daf-9e7e-f7b25c512ac1', 'vinegar', 'vinegar', 'خل', 'sauces', 'ml', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('9c4ff58a-5537-5daf-9e7e-f7b25c512ac1', 'khal') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9c4ff58a-5537-5daf-9e7e-f7b25c512ac1', 'white vinegar') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9c4ff58a-5537-5daf-9e7e-f7b25c512ac1', 'خل أبيض') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('9c4ff58a-5537-5daf-9e7e-f7b25c512ac1', 'EG', 'EGP', 'l', 1,
  1500, 2200, 3000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('3fe5f55e-6a71-53be-9b5f-af6cf3594773', 'vinegar-apple', 'apple cider vinegar', 'خل تفاح', 'pantry', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('3fe5f55e-6a71-53be-9b5f-af6cf3594773', 'خل التفاح') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('3fe5f55e-6a71-53be-9b5f-af6cf3594773', 'cider vinegar') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('51c5f714-4931-5e47-b5c6-28d14b1d6845', 'walnuts', 'walnuts', 'عين جمل', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('51c5f714-4931-5e47-b5c6-28d14b1d6845', 'nuts') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('51c5f714-4931-5e47-b5c6-28d14b1d6845', 'walnut') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('51c5f714-4931-5e47-b5c6-28d14b1d6845', 'ein gamal') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('51c5f714-4931-5e47-b5c6-28d14b1d6845', 'عين الجمل') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('51c5f714-4931-5e47-b5c6-28d14b1d6845', 'EG', 'EGP', 'kg', 1,
  45000, 60000, 80000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e2355076-5ef9-59ff-ab20-2293e193c87e', 'water', 'water', 'ماء', 'other', 'ml', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e2355076-5ef9-59ff-ab20-2293e193c87e', 'مياه') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e2355076-5ef9-59ff-ab20-2293e193c87e', 'ماء') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e2355076-5ef9-59ff-ab20-2293e193c87e', 'maya') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('0cc22540-2ff1-525f-9e82-e262f5a914de', 'watercress', 'watercress', 'بقدونس مائي', 'vegetables', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('0cc22540-2ff1-525f-9e82-e262f5a914de', 'cress') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0cc22540-2ff1-525f-9e82-e262f5a914de', 'حريف') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0cc22540-2ff1-525f-9e82-e262f5a914de', 'رشاد') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('e8e6bc23-c004-52a2-a331-826607620806', 'watermelon', 'watermelon', 'بطيخ', 'fruit', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('e8e6bc23-c004-52a2-a331-826607620806', 'بطيخ') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('e8e6bc23-c004-52a2-a331-826607620806', 'batikh') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('ffc46f32-2758-5d17-851f-0a8890d69dc2', 'white-beans', 'white beans', 'فاصوليا بيضاء', 'pantry', 'g', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('ffc46f32-2758-5d17-851f-0a8890d69dc2', 'fasolia') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ffc46f32-2758-5d17-851f-0a8890d69dc2', 'cannellini') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('ffc46f32-2758-5d17-851f-0a8890d69dc2', 'فاصوليا') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('ffc46f32-2758-5d17-851f-0a8890d69dc2', 'EG', 'EGP', 'kg', 1,
  5500, 7000, 9000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('9a32ad33-12e7-5d02-b6bb-6284ebe2bf64', 'white-cheese', 'white cheese', 'جبنة بيضاء', 'dairy', 'g', null, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('9a32ad33-12e7-5d02-b6bb-6284ebe2bf64', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9a32ad33-12e7-5d02-b6bb-6284ebe2bf64', 'feta') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9a32ad33-12e7-5d02-b6bb-6284ebe2bf64', 'gebna beida') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9a32ad33-12e7-5d02-b6bb-6284ebe2bf64', 'domiati') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9a32ad33-12e7-5d02-b6bb-6284ebe2bf64', 'جبنه بيضاء') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('9a32ad33-12e7-5d02-b6bb-6284ebe2bf64', 'جبنة فيتا') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('9a32ad33-12e7-5d02-b6bb-6284ebe2bf64', 'EG', 'EGP', 'kg', 1,
  9000, 12000, 16000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('50aefb00-b1a0-5140-a347-9b1cab6762b9', 'white-pepper', 'white pepper', 'فلفل أبيض', 'spices', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('50aefb00-b1a0-5140-a347-9b1cab6762b9', 'فلفل ابيض') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('aa89a89e-1449-5d2a-ae9b-cc93b44689b3', 'worcestershire', 'worcestershire sauce', 'صوص ورشستر', 'sauces', 'ml', null, false, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('aa89a89e-1449-5d2a-ae9b-cc93b44689b3', 'fish') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aa89a89e-1449-5d2a-ae9b-cc93b44689b3', 'ورشستر') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('aa89a89e-1449-5d2a-ae9b-cc93b44689b3', 'worcester') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('0582d882-4c5d-52e7-9099-6e635915100e', 'yeast', 'yeast', 'خميرة', 'pantry', 'g', null, true, false)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('0582d882-4c5d-52e7-9099-6e635915100e', 'خميرة') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0582d882-4c5d-52e7-9099-6e635915100e', 'khamira') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('0582d882-4c5d-52e7-9099-6e635915100e', 'instant yeast') on conflict do nothing;
insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('c73b0dd3-c4cf-564c-9114-079b380ba23e', 'yogurt', 'yogurt', 'زبادي', 'dairy', 'g', 105, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_allergens (ingredient_id, allergen)
values ('c73b0dd3-c4cf-564c-9114-079b380ba23e', 'dairy') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c73b0dd3-c4cf-564c-9114-079b380ba23e', 'zabady') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c73b0dd3-c4cf-564c-9114-079b380ba23e', 'plain yoghurt') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('c73b0dd3-c4cf-564c-9114-079b380ba23e', 'زبادى') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('c73b0dd3-c4cf-564c-9114-079b380ba23e', 'EG', 'EGP', 'piece', 1,
  800, 1100, 1500, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

insert into public.ingredients (id, slug, name, name_ar, category, default_unit, grams_per_piece, is_common_staple, is_perishable)
values ('d9b6af4a-dac9-5bf9-b6e3-297e2544cbfc', 'zucchini', 'zucchini', 'كوسة', 'vegetables', 'piece', 160, false, true)
on conflict (slug) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  category = excluded.category,
  default_unit = excluded.default_unit,
  grams_per_piece = excluded.grams_per_piece,
  is_common_staple = excluded.is_common_staple,
  is_perishable = excluded.is_perishable;

insert into public.ingredient_aliases (ingredient_id, alias)
values ('d9b6af4a-dac9-5bf9-b6e3-297e2544cbfc', 'courgette') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d9b6af4a-dac9-5bf9-b6e3-297e2544cbfc', 'kosa') on conflict do nothing;
insert into public.ingredient_aliases (ingredient_id, alias)
values ('d9b6af4a-dac9-5bf9-b6e3-297e2544cbfc', 'كوسه') on conflict do nothing;
insert into public.ingredient_price_estimates (
  ingredient_id, country, currency, unit, quantity,
  estimated_low_minor, estimated_avg_minor, estimated_high_minor, origin, last_updated)
values ('d9b6af4a-dac9-5bf9-b6e3-297e2544cbfc', 'EG', 'EGP', 'kg', 1,
  1400, 2000, 3000, 'bundled_seed', '2026-08-01')
on conflict (ingredient_id, country, unit, quantity) do update set
  estimated_low_minor = excluded.estimated_low_minor,
  estimated_avg_minor = excluded.estimated_avg_minor,
  estimated_high_minor = excluded.estimated_high_minor,
  last_updated = excluded.last_updated;

-- === Recipes ===============================================================

-- Koshari
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'koshari', 'Koshari', 'Egypt in a bowl: rice, lentils and pasta under spiced tomato sauce and a mountain of crisp onions.',
  null, 'curated', 'egyptian', 'medium',
  15, 40, 4,
  610, 19, 108,
  12, 11, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '1fb1aacf-2ec9-53e9-b5af-88026bbd0153';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'lunch');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'dinner');
delete from public.recipe_diet_tags where recipe_id = '1fb1aacf-2ec9-53e9-b5af-88026bbd0153';
insert into public.recipe_diet_tags (recipe_id, diet) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'vegetarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'vegan');
insert into public.recipe_diet_tags (recipe_id, diet) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'halal');
delete from public.recipe_allergens where recipe_id = '1fb1aacf-2ec9-53e9-b5af-88026bbd0153';
insert into public.recipe_allergens (recipe_id, allergen) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'gluten');
delete from public.recipe_appliances where recipe_id = '1fb1aacf-2ec9-53e9-b5af-88026bbd0153';
insert into public.recipe_appliances (recipe_id, appliance) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'stove');
delete from public.recipe_tags where recipe_id = '1fb1aacf-2ec9-53e9-b5af-88026bbd0153';
insert into public.recipe_tags (recipe_id, tag) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'egyptian');
insert into public.recipe_tags (recipe_id, tag) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'budget');
insert into public.recipe_tags (recipe_id, tag) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'comfort');
insert into public.recipe_tags (recipe_id, tag) values ('1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 'batch-cook');

delete from public.recipe_ingredients where recipe_id = '1fb1aacf-2ec9-53e9-b5af-88026bbd0153';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('4b869bf2-8566-5e52-b1ae-07a5ee9ac979', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'rice' limit 1), 'rice', 300, 'g', 'rinsed', false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('82fdf8d5-3b4f-52c8-a3c2-d1ea8dbe4bdf', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'red lentils' limit 1), 'red lentils', 200, 'g', null, false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('e97475d1-8968-5ec3-a9e6-f9e816defb56', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'pasta' limit 1), 'pasta', 150, 'g', 'small elbows', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('bdc9f788-3095-5b1d-b38e-b77ed70d5ec6', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'onions' limit 1), 'onions', 3, 'piece', 'thinly sliced', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('ee46034f-16e5-5dca-b3ff-eb8b2dbbf473', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'tomato paste' limit 1), 'tomato paste', 3, 'tbsp', null, false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('2dadf53c-0b56-5173-a259-c5b72d37ae1d', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 4, 'clove', 'crushed', false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('0275e850-097d-541d-90ca-4a0cf760e7e8', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'vinegar' limit 1), 'vinegar', 30, 'ml', null, false, 7);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('6b42a2a7-655c-5ba4-b9f2-4e29fff6a01a', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'cumin' limit 1), 'cumin', 2, 'tsp', null, false, 8);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('74a39266-0fa3-50b2-aace-5ef7932d5101', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'vegetable oil' limit 1), 'vegetable oil', 120, 'ml', 'for frying', false, 9);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('c6caa9eb-84b8-5c6d-8c76-ad44c263cac6', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'chickpeas' limit 1), 'chickpeas', 150, 'g', 'cooked', true, 10);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('902ae457-a8d6-5f20-8451-688c8e30cc62', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', (select id from public.ingredients where name = 'chili flakes' limit 1), 'chili flakes', 1, 'tsp', null, true, 11);

delete from public.recipe_steps where recipe_id = '1fb1aacf-2ec9-53e9-b5af-88026bbd0153';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('dd484155-d106-59e5-8f4c-4c8a567f6366', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 1, 'Fry the sliced onions in oil over medium heat until deep golden and crisp, about 15 minutes. Lift onto paper and keep the oil.', 15, null, '{"onions","vegetable oil"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('2eeb5362-4952-56cc-a95d-4d9c3180721a', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 2, 'Simmer the lentils in plenty of water for 15 minutes until just tender, then drain.', 15, null, '{"red lentils"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('9c8c0751-33a3-5c32-89cb-e235625c235f', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 3, 'Cook the rice with a spoon of the onion oil and a good pinch of salt until fluffy. Boil the pasta separately until al dente.', 18, null, '{"rice","pasta"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('15208706-879c-5281-bcf5-e0e7df186920', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 4, 'For the sauce, fry the garlic for 30 seconds, add tomato paste, cumin and 250ml water. Simmer 10 minutes, then stir in the vinegar.', 12, null, '{"garlic","tomato paste","cumin","vinegar"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('108a2376-b3e0-5b4c-8b7f-1c6b008b6602', '1fb1aacf-2ec9-53e9-b5af-88026bbd0153', 5, 'Layer rice, lentils and pasta in bowls. Ladle over the sauce and finish with the crisp onions and chickpeas.', 5, null, '{"chickpeas"}');

-- Tomato & Feta Shakshuka
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'shakshuka', 'Tomato & Feta Shakshuka', 'Eggs poached in a garlicky tomato sauce with crumbled white cheese. Ready before the bread is toasted.',
  null, 'curated', 'egyptian', 'easy',
  5, 15, 2,
  380, 22, 18,
  25, 4, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '87739e1b-f3cc-51cb-851f-51010ddf3583';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'breakfast');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'dinner');
delete from public.recipe_diet_tags where recipe_id = '87739e1b-f3cc-51cb-851f-51010ddf3583';
insert into public.recipe_diet_tags (recipe_id, diet) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'vegetarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'halal');
delete from public.recipe_allergens where recipe_id = '87739e1b-f3cc-51cb-851f-51010ddf3583';
insert into public.recipe_allergens (recipe_id, allergen) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'eggs');
insert into public.recipe_allergens (recipe_id, allergen) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'dairy');
delete from public.recipe_appliances where recipe_id = '87739e1b-f3cc-51cb-851f-51010ddf3583';
insert into public.recipe_appliances (recipe_id, appliance) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'stove');
delete from public.recipe_tags where recipe_id = '87739e1b-f3cc-51cb-851f-51010ddf3583';
insert into public.recipe_tags (recipe_id, tag) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'quick');
insert into public.recipe_tags (recipe_id, tag) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'breakfast');
insert into public.recipe_tags (recipe_id, tag) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'high-protein');
insert into public.recipe_tags (recipe_id, tag) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('87739e1b-f3cc-51cb-851f-51010ddf3583', 'beginner');

delete from public.recipe_ingredients where recipe_id = '87739e1b-f3cc-51cb-851f-51010ddf3583';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('89d052ce-481e-5248-b4ff-56ac5cf31595', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'eggs' limit 1), 'eggs', 4, 'piece', null, false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('440e419a-7ba0-5e01-a1ac-7ac1fd6c9ed0', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'tomatoes' limit 1), 'tomatoes', 4, 'piece', 'chopped', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('68a623b3-f3e0-55a1-9d39-b1cb8eee1b61', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'onions' limit 1), 'onions', 1, 'piece', 'diced', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('d6b96d91-27e2-592d-bc70-0a78cdb384ff', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 3, 'clove', 'sliced', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('6f261857-5dd7-502a-93f5-16ffc10cae79', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'white cheese' limit 1), 'white cheese', 80, 'g', 'crumbled', false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('017046e0-9302-51d2-90fc-2de91fa613fc', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'cumin' limit 1), 'cumin', 1, 'tsp', null, false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('f5c037b4-706c-52ae-b7ee-0155bd53affa', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'olive oil' limit 1), 'olive oil', 30, 'ml', null, false, 7);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('284275bb-2873-5838-b9f8-03b892aaf621', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'baladi bread' limit 1), 'baladi bread', 2, 'piece', 'to serve', true, 8);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('db5287e4-a0c3-5ba4-9fa8-43df57399f45', '87739e1b-f3cc-51cb-851f-51010ddf3583', (select id from public.ingredients where name = 'coriander' limit 1), 'coriander', 1, 'bunch', 'chopped', true, 9);

delete from public.recipe_steps where recipe_id = '87739e1b-f3cc-51cb-851f-51010ddf3583';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('1d38ac13-afaa-5757-963d-9b3c5155d14d', '87739e1b-f3cc-51cb-851f-51010ddf3583', 1, 'Soften the onion in olive oil for 4 minutes, then add the garlic and cumin and cook another minute.', 5, null, '{"onions","garlic","cumin","olive oil"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('9898930e-6be6-5e7f-97a1-7f99cd52be25', '87739e1b-f3cc-51cb-851f-51010ddf3583', 2, 'Add the tomatoes and a pinch of salt. Simmer 8 minutes until the sauce thickens and darkens.', 8, null, '{"tomatoes"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('b578d474-9e4c-5b2a-8d8e-aece3f5e83f1', '87739e1b-f3cc-51cb-851f-51010ddf3583', 3, 'Make four wells and crack an egg into each. Cover and cook 4–5 minutes.', 5, 'Cook eggs until the whites are completely set. Runny yolks are only safe with pasteurised eggs.', '{"eggs"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('4cd2ed9f-1e66-596d-a9f1-62d02596a48c', '87739e1b-f3cc-51cb-851f-51010ddf3583', 4, 'Scatter over the white cheese and coriander and take it straight to the table with bread.', 1, null, '{"white cheese","coriander","baladi bread"}');

-- Creamy Chicken Pasta
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'creamy-chicken-pasta', 'Creamy Chicken Pasta', 'One pan, one weeknight. Seared chicken, garlic cream, and enough hard cheese to matter.',
  null, 'curated', 'italian', 'easy',
  10, 20, 3,
  650, 48, 62,
  22, 4, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '9686e1c2-ed74-5df2-b356-f51d1102819e';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'dinner');
delete from public.recipe_diet_tags where recipe_id = '9686e1c2-ed74-5df2-b356-f51d1102819e';
insert into public.recipe_diet_tags (recipe_id, diet) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'halal');
delete from public.recipe_allergens where recipe_id = '9686e1c2-ed74-5df2-b356-f51d1102819e';
insert into public.recipe_allergens (recipe_id, allergen) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'gluten');
insert into public.recipe_allergens (recipe_id, allergen) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'dairy');
delete from public.recipe_appliances where recipe_id = '9686e1c2-ed74-5df2-b356-f51d1102819e';
insert into public.recipe_appliances (recipe_id, appliance) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'stove');
delete from public.recipe_tags where recipe_id = '9686e1c2-ed74-5df2-b356-f51d1102819e';
insert into public.recipe_tags (recipe_id, tag) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'quick');
insert into public.recipe_tags (recipe_id, tag) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'high-protein');
insert into public.recipe_tags (recipe_id, tag) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'comfort');
insert into public.recipe_tags (recipe_id, tag) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'italian');
insert into public.recipe_tags (recipe_id, tag) values ('9686e1c2-ed74-5df2-b356-f51d1102819e', 'beginner');

delete from public.recipe_ingredients where recipe_id = '9686e1c2-ed74-5df2-b356-f51d1102819e';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('466ba3e0-eebe-5816-aa5c-61098d078c03', '9686e1c2-ed74-5df2-b356-f51d1102819e', (select id from public.ingredients where name = 'chicken breast' limit 1), 'chicken breast', 450, 'g', 'cut into strips', false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('af89d387-91a3-541b-87b3-33ac02a702c2', '9686e1c2-ed74-5df2-b356-f51d1102819e', (select id from public.ingredients where name = 'pasta' limit 1), 'pasta', 300, 'g', null, false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('e28e0313-9a8c-5607-8793-af0af88e12d8', '9686e1c2-ed74-5df2-b356-f51d1102819e', (select id from public.ingredients where name = 'cooking cream' limit 1), 'cooking cream', 200, 'ml', null, false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('431c9def-4077-5d21-9d3b-285b02275852', '9686e1c2-ed74-5df2-b356-f51d1102819e', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 4, 'clove', 'minced', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('9cd36bdb-b446-5c86-9ff4-d2dc69a10f61', '9686e1c2-ed74-5df2-b356-f51d1102819e', (select id from public.ingredients where name = 'roumy cheese' limit 1), 'roumy cheese', 60, 'g', 'grated', false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('53810139-b92d-5bc7-9f1b-d2530839547b', '9686e1c2-ed74-5df2-b356-f51d1102819e', (select id from public.ingredients where name = 'butter' limit 1), 'butter', 20, 'g', null, false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('71a28905-3325-5e3a-af8b-7aeddae1a75f', '9686e1c2-ed74-5df2-b356-f51d1102819e', (select id from public.ingredients where name = 'black pepper' limit 1), 'black pepper', 1, 'tsp', null, false, 7);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('157818ce-5d3b-5c6e-bb62-d2c837d8d061', '9686e1c2-ed74-5df2-b356-f51d1102819e', (select id from public.ingredients where name = 'parsley' limit 1), 'parsley', 1, 'bunch', 'chopped', true, 8);

delete from public.recipe_steps where recipe_id = '9686e1c2-ed74-5df2-b356-f51d1102819e';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('43ce1c13-6cff-50f6-a651-df3e46b6773e', '9686e1c2-ed74-5df2-b356-f51d1102819e', 1, 'Boil the pasta in well-salted water. Reserve a cup of the water before draining.', 10, null, '{"pasta"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('7ba5ec9b-ae1b-5b95-80c8-0ed5907afb6a', '9686e1c2-ed74-5df2-b356-f51d1102819e', 2, 'Season the chicken and sear in butter over high heat until golden on both sides.', 7, 'Cook chicken until it reaches 74°C / 165°F and no pink remains. Wash hands and the board after handling raw poultry.', '{"chicken breast","butter","black pepper"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('82471a02-4b87-525e-b167-e414024093d8', '9686e1c2-ed74-5df2-b356-f51d1102819e', 3, 'Lower the heat, add the garlic for 30 seconds, then pour in the cream and let it bubble for 2 minutes.', 3, null, '{"garlic","cooking cream"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('9f33b44d-35a7-54c7-a6e6-52d175e1342a', '9686e1c2-ed74-5df2-b356-f51d1102819e', 4, 'Toss in the pasta with a splash of its water and the grated cheese until glossy. Finish with parsley.', 3, null, '{"roumy cheese","parsley"}');

-- Foul with Eggs & Olive Oil
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('21ede411-5505-5763-ba65-89cd1b643330', 'foul-with-eggs', 'Foul with Eggs & Olive Oil', 'The breakfast that runs the country. Warm fava beans, cumin, lemon and a soft-boiled egg on top.',
  null, 'curated', 'egyptian', 'easy',
  5, 10, 2,
  420, 24, 44,
  17, 14, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '21ede411-5505-5763-ba65-89cd1b643330';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('21ede411-5505-5763-ba65-89cd1b643330', 'breakfast');
delete from public.recipe_diet_tags where recipe_id = '21ede411-5505-5763-ba65-89cd1b643330';
insert into public.recipe_diet_tags (recipe_id, diet) values ('21ede411-5505-5763-ba65-89cd1b643330', 'vegetarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('21ede411-5505-5763-ba65-89cd1b643330', 'halal');
delete from public.recipe_allergens where recipe_id = '21ede411-5505-5763-ba65-89cd1b643330';
insert into public.recipe_allergens (recipe_id, allergen) values ('21ede411-5505-5763-ba65-89cd1b643330', 'eggs');
insert into public.recipe_allergens (recipe_id, allergen) values ('21ede411-5505-5763-ba65-89cd1b643330', 'gluten');
delete from public.recipe_appliances where recipe_id = '21ede411-5505-5763-ba65-89cd1b643330';
insert into public.recipe_appliances (recipe_id, appliance) values ('21ede411-5505-5763-ba65-89cd1b643330', 'stove');
delete from public.recipe_tags where recipe_id = '21ede411-5505-5763-ba65-89cd1b643330';
insert into public.recipe_tags (recipe_id, tag) values ('21ede411-5505-5763-ba65-89cd1b643330', 'egyptian');
insert into public.recipe_tags (recipe_id, tag) values ('21ede411-5505-5763-ba65-89cd1b643330', 'breakfast');
insert into public.recipe_tags (recipe_id, tag) values ('21ede411-5505-5763-ba65-89cd1b643330', 'budget');
insert into public.recipe_tags (recipe_id, tag) values ('21ede411-5505-5763-ba65-89cd1b643330', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('21ede411-5505-5763-ba65-89cd1b643330', 'high-protein');
insert into public.recipe_tags (recipe_id, tag) values ('21ede411-5505-5763-ba65-89cd1b643330', 'beginner');

delete from public.recipe_ingredients where recipe_id = '21ede411-5505-5763-ba65-89cd1b643330';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('94bc64df-d9a9-5eb8-8752-8b2ade2012c0', '21ede411-5505-5763-ba65-89cd1b643330', (select id from public.ingredients where name = 'fava beans' limit 1), 'fava beans', 400, 'g', 'cooked', false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('6ac4d9d4-dcd5-5ea1-b956-a16d00fe51cb', '21ede411-5505-5763-ba65-89cd1b643330', (select id from public.ingredients where name = 'eggs' limit 1), 'eggs', 2, 'piece', null, false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('e9be40bd-edc6-5369-a130-47cc6d24fc85', '21ede411-5505-5763-ba65-89cd1b643330', (select id from public.ingredients where name = 'olive oil' limit 1), 'olive oil', 30, 'ml', null, false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('837173ba-a964-59c4-8867-765d86637c81', '21ede411-5505-5763-ba65-89cd1b643330', (select id from public.ingredients where name = 'lemon' limit 1), 'lemon', 1, 'piece', 'juiced', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('484ed9f5-3cc9-531c-a359-f327dce64287', '21ede411-5505-5763-ba65-89cd1b643330', (select id from public.ingredients where name = 'cumin' limit 1), 'cumin', 1, 'tsp', null, false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('ea8f65d3-c1de-5e37-99e4-6dc01d03f109', '21ede411-5505-5763-ba65-89cd1b643330', (select id from public.ingredients where name = 'baladi bread' limit 1), 'baladi bread', 2, 'piece', null, false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('63b6daef-92e5-5f70-b9bd-72c0f4e046c4', '21ede411-5505-5763-ba65-89cd1b643330', (select id from public.ingredients where name = 'tomatoes' limit 1), 'tomatoes', 1, 'piece', 'diced', true, 7);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('6a5a1861-ed6c-5dbc-a31e-8a025667e12f', '21ede411-5505-5763-ba65-89cd1b643330', (select id from public.ingredients where name = 'chili flakes' limit 1), 'chili flakes', 1, 'tsp', null, true, 8);

delete from public.recipe_steps where recipe_id = '21ede411-5505-5763-ba65-89cd1b643330';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('dca76d8c-0cf2-541b-9d56-4c821ebdf400', '21ede411-5505-5763-ba65-89cd1b643330', 1, 'Warm the fava beans in a pan with a splash of their liquid, mashing about half of them.', 6, null, '{"fava beans"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('7609b514-a4d6-5734-a1a0-f75a65e0e1d5', '21ede411-5505-5763-ba65-89cd1b643330', 2, 'Boil the eggs for 7 minutes for a just-set yolk, then peel under cold water.', 7, 'Boil eggs for at least 7 minutes so the white is fully set.', '{"eggs"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('c7850d32-5c84-52a5-8f63-f57eb97e1283', '21ede411-5505-5763-ba65-89cd1b643330', 3, 'Season the foul with cumin, salt and lemon juice, then pour olive oil generously over the top.', 2, null, '{"cumin","lemon","olive oil"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('30cfcc61-9a45-5532-8f92-53afd0c7b6b9', '21ede411-5505-5763-ba65-89cd1b643330', 4, 'Halve the eggs onto the beans, scatter tomato and chilli, and scoop it all up with warm bread.', 1, null, '{"tomatoes","chili flakes","baladi bread"}');

-- Molokhia with Chicken
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'molokhia-with-chicken', 'Molokhia with Chicken', 'Silky green molokhia over rice, with poached chicken and a hit of garlic-coriander taqleya.',
  null, 'curated', 'egyptian', 'medium',
  15, 45, 4,
  540, 42, 52,
  16, 6, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '58b509eb-55b9-5a32-bd7a-29b443785ebb';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'lunch');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'dinner');
delete from public.recipe_diet_tags where recipe_id = '58b509eb-55b9-5a32-bd7a-29b443785ebb';
insert into public.recipe_diet_tags (recipe_id, diet) values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'halal');
delete from public.recipe_allergens where recipe_id = '58b509eb-55b9-5a32-bd7a-29b443785ebb';
delete from public.recipe_appliances where recipe_id = '58b509eb-55b9-5a32-bd7a-29b443785ebb';
insert into public.recipe_appliances (recipe_id, appliance) values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'stove');
delete from public.recipe_tags where recipe_id = '58b509eb-55b9-5a32-bd7a-29b443785ebb';
insert into public.recipe_tags (recipe_id, tag) values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'egyptian');
insert into public.recipe_tags (recipe_id, tag) values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'comfort');
insert into public.recipe_tags (recipe_id, tag) values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'high-protein');
insert into public.recipe_tags (recipe_id, tag) values ('58b509eb-55b9-5a32-bd7a-29b443785ebb', 'sunday-lunch');

delete from public.recipe_ingredients where recipe_id = '58b509eb-55b9-5a32-bd7a-29b443785ebb';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('b9be9f19-aca2-56fb-99f1-21d063c3a828', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'chicken thighs' limit 1), 'chicken thighs', 700, 'g', null, false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('e5666218-3682-52ca-95ed-2bce3bde87f1', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'molokhia' limit 1), 'molokhia', 400, 'g', 'frozen, chopped', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('486e62c1-482c-5f22-9938-c7246bece95a', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 8, 'clove', 'crushed', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('d4ea2121-c71c-5c36-aa9d-2029116844a8', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'ground coriander' limit 1), 'ground coriander', 2, 'tsp', null, false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('ae70fb8e-a94c-579f-abb9-0f0817ca7f49', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'rice' limit 1), 'rice', 300, 'g', null, false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('c9776f6b-b13b-50f4-90a9-a19da8b1dfb0', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'onions' limit 1), 'onions', 1, 'piece', 'halved', false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('966e96e0-a2c9-54d5-825e-b372ae210a8a', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'bay leaf' limit 1), 'bay leaf', 2, 'piece', null, false, 7);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('e13e48b7-5fe0-5979-bac2-a5914a2e5c83', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'butter' limit 1), 'butter', 30, 'g', null, false, 8);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('f9d54c34-f3d3-56db-969a-c5b351478abe', '58b509eb-55b9-5a32-bd7a-29b443785ebb', (select id from public.ingredients where name = 'lemon' limit 1), 'lemon', 1, 'piece', 'wedges to serve', true, 9);

delete from public.recipe_steps where recipe_id = '58b509eb-55b9-5a32-bd7a-29b443785ebb';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('b917eea5-fdf1-5558-b1c1-290a0b302687', '58b509eb-55b9-5a32-bd7a-29b443785ebb', 1, 'Simmer the chicken with the onion and bay leaves in 1.5L water for 35 minutes. Skim, then lift out the chicken and keep the broth.', 35, 'Poultry must reach 74°C / 165°F throughout. The juices should run clear.', '{"chicken thighs","onions","bay leaf"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('de13d378-0896-563d-87fb-225a81934a20', '58b509eb-55b9-5a32-bd7a-29b443785ebb', 2, 'Cook the rice while the chicken simmers.', 18, null, '{"rice"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('0566f528-ed8a-5e56-8843-c837e902463a', '58b509eb-55b9-5a32-bd7a-29b443785ebb', 3, 'Bring 1L of the broth to a gentle simmer and stir in the molokhia. Keep it just below the boil for 5 minutes — hard boiling splits it.', 6, null, '{"molokhia"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('29c74540-34b8-5dc1-8fdd-c6310dd1f9c3', '58b509eb-55b9-5a32-bd7a-29b443785ebb', 4, 'For the taqleya, fry the garlic and ground coriander in butter until fragrant and golden, then tip the whole lot into the molokhia. It will hiss.', 3, null, '{"garlic","ground coriander","butter"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('a24e535e-72d0-5bea-ac59-433d1a307771', '58b509eb-55b9-5a32-bd7a-29b443785ebb', 5, 'Serve the molokhia over rice with the chicken alongside and lemon to squeeze.', 2, null, '{"lemon"}');

-- Air Fryer Spiced Chicken
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'air-fryer-spiced-chicken', 'Air Fryer Spiced Chicken', 'Twenty minutes in the air fryer, and no oily pan to scrub afterwards. Crisp outside, still juicy in the middle.',
  null, 'curated', 'mediterranean', 'easy',
  8, 18, 2,
  410, 52, 6,
  19, 1, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = 'dd63a595-f6f8-5570-b92f-9cb339e3ab47';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'lunch');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'dinner');
delete from public.recipe_diet_tags where recipe_id = 'dd63a595-f6f8-5570-b92f-9cb339e3ab47';
insert into public.recipe_diet_tags (recipe_id, diet) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'halal');
insert into public.recipe_diet_tags (recipe_id, diet) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'keto');
delete from public.recipe_allergens where recipe_id = 'dd63a595-f6f8-5570-b92f-9cb339e3ab47';
delete from public.recipe_appliances where recipe_id = 'dd63a595-f6f8-5570-b92f-9cb339e3ab47';
insert into public.recipe_appliances (recipe_id, appliance) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'air_fryer');
delete from public.recipe_tags where recipe_id = 'dd63a595-f6f8-5570-b92f-9cb339e3ab47';
insert into public.recipe_tags (recipe_id, tag) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'air-fryer');
insert into public.recipe_tags (recipe_id, tag) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'high-protein');
insert into public.recipe_tags (recipe_id, tag) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'quick');
insert into public.recipe_tags (recipe_id, tag) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'healthy');
insert into public.recipe_tags (recipe_id, tag) values ('dd63a595-f6f8-5570-b92f-9cb339e3ab47', 'beginner');

delete from public.recipe_ingredients where recipe_id = 'dd63a595-f6f8-5570-b92f-9cb339e3ab47';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('71efea73-0687-58f6-9904-0f233f968741', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', (select id from public.ingredients where name = 'chicken thighs' limit 1), 'chicken thighs', 500, 'g', null, false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('ce80ccbf-1886-5cf1-85ef-ee438b0c9604', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', (select id from public.ingredients where name = 'paprika' limit 1), 'paprika', 2, 'tsp', null, false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('6917f224-38e9-5470-944d-689968250701', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', (select id from public.ingredients where name = 'cumin' limit 1), 'cumin', 1, 'tsp', null, false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('96ca5ff1-9d34-528f-960f-167da2fdc33f', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 3, 'clove', 'crushed', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('2b00a5df-96a4-5535-a74f-e01348b6372d', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', (select id from public.ingredients where name = 'olive oil' limit 1), 'olive oil', 20, 'ml', null, false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('eaac551a-19e9-58ea-b558-e9c80e69249c', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', (select id from public.ingredients where name = 'lemon' limit 1), 'lemon', 1, 'piece', 'juiced', false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('ea0272e1-dbf9-5dcc-ba4f-791e387f2282', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', (select id from public.ingredients where name = 'yogurt' limit 1), 'yogurt', 100, 'g', 'to serve', true, 7);

delete from public.recipe_steps where recipe_id = 'dd63a595-f6f8-5570-b92f-9cb339e3ab47';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('2805c2b1-620f-53f4-9e3a-106361f3d6af', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', 1, 'Toss the chicken with oil, lemon juice, garlic, paprika, cumin and salt. Leave 5 minutes if you have it.', 8, 'Marinate in the fridge, never on the counter, and discard any marinade that touched raw chicken.', '{"chicken thighs","olive oil","lemon","garlic","paprika","cumin"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('832b36e5-5649-5c81-b21e-704d1285db7a', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', 2, 'Air fry at 200°C for 18 minutes, turning once halfway.', 18, 'Check the thickest piece reaches 74°C / 165°F before serving.', '{}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('fc24eb03-03ee-5f03-912d-18ad1bd99630', 'dd63a595-f6f8-5570-b92f-9cb339e3ab47', 3, 'Rest for 3 minutes, then serve with cold yogurt.', 3, null, '{"yogurt"}');

-- Egyptian Lentil Soup
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'egyptian-lentil-soup', 'Egyptian Lentil Soup', 'Blended red lentils with cumin and a squeeze of lemon. Cheap, filling, and better than it has any right to be.',
  null, 'curated', 'egyptian', 'easy',
  8, 30, 4,
  290, 16, 44,
  6, 12, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'lunch');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'dinner');
delete from public.recipe_diet_tags where recipe_id = 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b';
insert into public.recipe_diet_tags (recipe_id, diet) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'vegetarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'vegan');
insert into public.recipe_diet_tags (recipe_id, diet) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'halal');
delete from public.recipe_allergens where recipe_id = 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b';
delete from public.recipe_appliances where recipe_id = 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b';
insert into public.recipe_appliances (recipe_id, appliance) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'stove');
insert into public.recipe_appliances (recipe_id, appliance) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'blender');
delete from public.recipe_tags where recipe_id = 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b';
insert into public.recipe_tags (recipe_id, tag) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'egyptian');
insert into public.recipe_tags (recipe_id, tag) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'budget');
insert into public.recipe_tags (recipe_id, tag) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'healthy');
insert into public.recipe_tags (recipe_id, tag) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'beginner');
insert into public.recipe_tags (recipe_id, tag) values ('d4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 'batch-cook');

delete from public.recipe_ingredients where recipe_id = 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('5ac4b9d6-49a8-5f9f-a1c3-7e5d2e4a6ee2', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', (select id from public.ingredients where name = 'red lentils' limit 1), 'red lentils', 250, 'g', 'rinsed', false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('fabaae14-6ea4-57b6-aea9-6008cde4ff6a', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', (select id from public.ingredients where name = 'onions' limit 1), 'onions', 1, 'piece', 'chopped', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('92e1f2da-9b19-550b-9bca-a1ad85a264fb', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', (select id from public.ingredients where name = 'carrots' limit 1), 'carrots', 2, 'piece', 'chopped', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('b9e9aa19-38f5-5657-9829-6e49f45c563c', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', (select id from public.ingredients where name = 'potatoes' limit 1), 'potatoes', 1, 'piece', 'diced', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('765fd093-ef39-5825-8ce8-c906070fb845', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', (select id from public.ingredients where name = 'cumin' limit 1), 'cumin', 2, 'tsp', null, false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('cd9d72cc-0466-5de5-927c-7d6772b00e55', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', (select id from public.ingredients where name = 'lemon' limit 1), 'lemon', 1, 'piece', 'wedges to serve', false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('f58b5aa6-21b1-5cba-98cb-4243bd20dbf5', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', (select id from public.ingredients where name = 'vegetable oil' limit 1), 'vegetable oil', 20, 'ml', null, false, 7);

delete from public.recipe_steps where recipe_id = 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('9078234f-3437-5677-8280-3a19ee01f146', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 1, 'Soften the onion, carrot and potato in oil for 6 minutes.', 6, null, '{"onions","carrots","potatoes","vegetable oil"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('a941b1f2-0bf1-5cd7-b74e-a473b7f987ca', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 2, 'Add the lentils, cumin and 1.2L water. Simmer 25 minutes until everything collapses.', 25, null, '{"red lentils","cumin"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('29e79ca9-8d93-51aa-a7df-e60176804a0f', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 3, 'Blend until completely smooth, loosening with hot water if needed. Season well.', 3, 'Blend hot liquid in batches with the lid vented, or it will erupt.', '{}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('c52f7794-c039-58e3-8499-0d3a2634f961', 'd4e3adc0-dfd4-5eaa-bb81-28ee3f27627b', 4, 'Serve with lemon wedges and, if you like, fried bread croutons.', 2, null, '{"lemon"}');

-- Cold Tuna Pasta Salad
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'tuna-pasta-salad', 'Cold Tuna Pasta Salad', 'Boil the pasta and nothing else needs heat. Tuna, lemon and cucumber, with enough protein to carry you to dinner.',
  null, 'curated', 'mediterranean', 'easy',
  10, 10, 2,
  480, 34, 58,
  13, 5, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '4da2bb15-01c8-5380-bca5-a81bca47d744';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'lunch');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'snack');
delete from public.recipe_diet_tags where recipe_id = '4da2bb15-01c8-5380-bca5-a81bca47d744';
insert into public.recipe_diet_tags (recipe_id, diet) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'pescatarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'halal');
delete from public.recipe_allergens where recipe_id = '4da2bb15-01c8-5380-bca5-a81bca47d744';
insert into public.recipe_allergens (recipe_id, allergen) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'gluten');
insert into public.recipe_allergens (recipe_id, allergen) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'fish');
delete from public.recipe_appliances where recipe_id = '4da2bb15-01c8-5380-bca5-a81bca47d744';
insert into public.recipe_appliances (recipe_id, appliance) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'stove');
delete from public.recipe_tags where recipe_id = '4da2bb15-01c8-5380-bca5-a81bca47d744';
insert into public.recipe_tags (recipe_id, tag) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'quick');
insert into public.recipe_tags (recipe_id, tag) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'high-protein');
insert into public.recipe_tags (recipe_id, tag) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'healthy');
insert into public.recipe_tags (recipe_id, tag) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'beginner');
insert into public.recipe_tags (recipe_id, tag) values ('4da2bb15-01c8-5380-bca5-a81bca47d744', 'no-oven');

delete from public.recipe_ingredients where recipe_id = '4da2bb15-01c8-5380-bca5-a81bca47d744';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('38d01c38-f4ff-54d5-b595-8056dcf36416', '4da2bb15-01c8-5380-bca5-a81bca47d744', (select id from public.ingredients where name = 'pasta' limit 1), 'pasta', 200, 'g', null, false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('982d128d-ba04-5c67-9b9b-522b82fc07be', '4da2bb15-01c8-5380-bca5-a81bca47d744', (select id from public.ingredients where name = 'canned tuna' limit 1), 'canned tuna', 2, 'can', 'drained', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('02e67898-2345-5957-80d0-0f9325611893', '4da2bb15-01c8-5380-bca5-a81bca47d744', (select id from public.ingredients where name = 'cucumber' limit 1), 'cucumber', 1, 'piece', 'diced', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('74ba9977-ae73-5bb2-8da6-cf6d69da7079', '4da2bb15-01c8-5380-bca5-a81bca47d744', (select id from public.ingredients where name = 'tomatoes' limit 1), 'tomatoes', 2, 'piece', 'diced', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('5786ea32-cf0e-5b33-a315-b063f3c74b2d', '4da2bb15-01c8-5380-bca5-a81bca47d744', (select id from public.ingredients where name = 'lemon' limit 1), 'lemon', 1, 'piece', 'juiced', false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('46967c9f-eb42-565e-9fb7-c42e1c04aa8d', '4da2bb15-01c8-5380-bca5-a81bca47d744', (select id from public.ingredients where name = 'olive oil' limit 1), 'olive oil', 30, 'ml', null, false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('75497d82-e4b2-5670-86d1-4e6e5317e321', '4da2bb15-01c8-5380-bca5-a81bca47d744', (select id from public.ingredients where name = 'green onion' limit 1), 'green onion', 1, 'bunch', 'sliced', true, 7);

delete from public.recipe_steps where recipe_id = '4da2bb15-01c8-5380-bca5-a81bca47d744';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('451eda01-56d8-5a9e-8327-d21234a3e179', '4da2bb15-01c8-5380-bca5-a81bca47d744', 1, 'Boil the pasta, drain and rinse under cold water so it stops cooking.', 10, null, '{"pasta"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('09f24fe6-0409-511d-8ad6-15ceadef4d58', '4da2bb15-01c8-5380-bca5-a81bca47d744', 2, 'Whisk the lemon juice with olive oil, salt and pepper.', 2, null, '{"lemon","olive oil"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('e8b8db18-e3f3-5bbc-b697-3a2b056a924a', '4da2bb15-01c8-5380-bca5-a81bca47d744', 3, 'Fold everything together and chill for 10 minutes if you can wait.', 4, 'Keep it refrigerated and eat within two days.', '{"canned tuna","cucumber","tomatoes","green onion"}');

-- Grilled Cheese & Tomato Toastie
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'egyptian-cheese-toastie', 'Grilled Cheese & Tomato Toastie', 'Four ingredients and five minutes. Dangerously good at midnight.',
  null, 'curated', 'american', 'easy',
  3, 6, 1,
  430, 19, 38,
  23, 3, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '9b2f8525-e61b-5436-9bec-5920a094aba5';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'snack');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'breakfast');
delete from public.recipe_diet_tags where recipe_id = '9b2f8525-e61b-5436-9bec-5920a094aba5';
insert into public.recipe_diet_tags (recipe_id, diet) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'vegetarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'halal');
delete from public.recipe_allergens where recipe_id = '9b2f8525-e61b-5436-9bec-5920a094aba5';
insert into public.recipe_allergens (recipe_id, allergen) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'gluten');
insert into public.recipe_allergens (recipe_id, allergen) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'dairy');
delete from public.recipe_appliances where recipe_id = '9b2f8525-e61b-5436-9bec-5920a094aba5';
insert into public.recipe_appliances (recipe_id, appliance) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'stove');
delete from public.recipe_tags where recipe_id = '9b2f8525-e61b-5436-9bec-5920a094aba5';
insert into public.recipe_tags (recipe_id, tag) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'quick');
insert into public.recipe_tags (recipe_id, tag) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'late-night');
insert into public.recipe_tags (recipe_id, tag) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'budget');
insert into public.recipe_tags (recipe_id, tag) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'beginner');
insert into public.recipe_tags (recipe_id, tag) values ('9b2f8525-e61b-5436-9bec-5920a094aba5', 'snack');

delete from public.recipe_ingredients where recipe_id = '9b2f8525-e61b-5436-9bec-5920a094aba5';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('326c211e-2bdf-505f-b245-e091bad76f68', '9b2f8525-e61b-5436-9bec-5920a094aba5', (select id from public.ingredients where name = 'sliced bread' limit 1), 'sliced bread', 2, 'slice', null, false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('90581560-012e-5535-bf3e-6601135532ea', '9b2f8525-e61b-5436-9bec-5920a094aba5', (select id from public.ingredients where name = 'mozzarella' limit 1), 'mozzarella', 60, 'g', 'grated', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('41f65484-39bd-51d6-8c7c-30634cf384e4', '9b2f8525-e61b-5436-9bec-5920a094aba5', (select id from public.ingredients where name = 'tomatoes' limit 1), 'tomatoes', 1, 'piece', 'sliced thin', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('4d10e838-7517-56f5-a9d2-a3f373711bbb', '9b2f8525-e61b-5436-9bec-5920a094aba5', (select id from public.ingredients where name = 'butter' limit 1), 'butter', 10, 'g', 'softened', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('b99a7134-2308-5766-ae04-190651c557e2', '9b2f8525-e61b-5436-9bec-5920a094aba5', (select id from public.ingredients where name = 'black pepper' limit 1), 'black pepper', 1, 'pinch', null, true, 5);

delete from public.recipe_steps where recipe_id = '9b2f8525-e61b-5436-9bec-5920a094aba5';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('b71b4dbb-c643-5468-9e8c-e6a5e9196316', '9b2f8525-e61b-5436-9bec-5920a094aba5', 1, 'Butter the outsides of both slices. Pile the cheese and tomato inside and press together.', 3, null, '{"sliced bread","butter","mozzarella","tomatoes"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('6a16d112-8470-5508-a349-c8b9db71dbcd', '9b2f8525-e61b-5436-9bec-5920a094aba5', 2, 'Cook in a dry pan over medium-low heat, 3 minutes a side, pressing down, until deep gold and molten inside.', 6, null, '{"black pepper"}');

-- Kofta in Tomato Tagine
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'kofta-tagine', 'Kofta in Tomato Tagine', 'Beef kofta baked in a thick tomato sauce with potatoes. Sunday food on a Tuesday.',
  null, 'curated', 'egyptian', 'medium',
  20, 40, 4,
  620, 38, 34,
  36, 5, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = 'fb4570db-ea7f-5a98-978c-0587afe70b00';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'dinner');
delete from public.recipe_diet_tags where recipe_id = 'fb4570db-ea7f-5a98-978c-0587afe70b00';
insert into public.recipe_diet_tags (recipe_id, diet) values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'halal');
delete from public.recipe_allergens where recipe_id = 'fb4570db-ea7f-5a98-978c-0587afe70b00';
delete from public.recipe_appliances where recipe_id = 'fb4570db-ea7f-5a98-978c-0587afe70b00';
insert into public.recipe_appliances (recipe_id, appliance) values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'oven');
insert into public.recipe_appliances (recipe_id, appliance) values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'stove');
delete from public.recipe_tags where recipe_id = 'fb4570db-ea7f-5a98-978c-0587afe70b00';
insert into public.recipe_tags (recipe_id, tag) values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'egyptian');
insert into public.recipe_tags (recipe_id, tag) values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'comfort');
insert into public.recipe_tags (recipe_id, tag) values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'high-protein');
insert into public.recipe_tags (recipe_id, tag) values ('fb4570db-ea7f-5a98-978c-0587afe70b00', 'oven');

delete from public.recipe_ingredients where recipe_id = 'fb4570db-ea7f-5a98-978c-0587afe70b00';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('f575a4ad-0791-5163-88b6-61d2f53f5f00', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'ground beef' limit 1), 'ground beef', 600, 'g', null, false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('3d57db0e-4ddc-59ea-a344-2184067336d7', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'onions' limit 1), 'onions', 2, 'piece', 'one grated, one sliced', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('0459e460-b7e0-55dc-8aa1-eea8915d7c14', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'parsley' limit 1), 'parsley', 1, 'bunch', 'finely chopped', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('2d229a72-4040-5132-b354-7cfa6b77a274', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'potatoes' limit 1), 'potatoes', 3, 'piece', 'thickly sliced', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('7c5d6ade-38cd-5b75-9a13-1563b8b6ae80', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'tomatoes' limit 1), 'tomatoes', 4, 'piece', 'blended', false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('cc45250f-a167-5c49-9052-329b2336cf5b', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'tomato paste' limit 1), 'tomato paste', 2, 'tbsp', null, false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('f8fac7f3-6ff1-51a2-b7f0-39bc26e55a28', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 4, 'clove', 'crushed', false, 7);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('24ff354c-94a2-5311-b0dc-8e167dd30287', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'cumin' limit 1), 'cumin', 2, 'tsp', null, false, 8);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('a1331dc3-971e-5791-acec-a51689a0cd2a', 'fb4570db-ea7f-5a98-978c-0587afe70b00', (select id from public.ingredients where name = 'vegetable oil' limit 1), 'vegetable oil', 40, 'ml', null, false, 9);

delete from public.recipe_steps where recipe_id = 'fb4570db-ea7f-5a98-978c-0587afe70b00';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('419d006a-a083-580d-82a0-04459c2b1a1b', 'fb4570db-ea7f-5a98-978c-0587afe70b00', 1, 'Mix the beef with grated onion, parsley, cumin, salt and pepper. Shape into fingers.', 12, 'Wash hands and surfaces after handling raw mince, and keep it away from anything eaten raw.', '{"ground beef","onions","parsley","cumin"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('e5772958-b6d2-55ed-981d-8861cb7bc597', 'fb4570db-ea7f-5a98-978c-0587afe70b00', 2, 'Brown the kofta quickly in oil, then set aside. Fry the potato slices in the same pan until golden.', 12, null, '{"vegetable oil","potatoes"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('e77a96cf-19d4-5b8c-b757-b222289827bb', 'fb4570db-ea7f-5a98-978c-0587afe70b00', 3, 'Fry the sliced onion and garlic, add tomato paste, blended tomatoes and 200ml water. Simmer 8 minutes.', 10, null, '{"garlic","tomato paste","tomatoes"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('53281d1d-d6b8-57ba-a626-57cf0a540808', 'fb4570db-ea7f-5a98-978c-0587afe70b00', 4, 'Layer potatoes and kofta in a baking dish, pour over the sauce and bake at 200°C for 25 minutes.', 25, 'Ground beef must reach 71°C / 160°F all the way through.', '{}');

-- Banana & Peanut Butter Oats
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'banana-peanut-oats', 'Banana & Peanut Butter Oats', 'Five minutes, one bowl, holds you until lunch. Sweet without adding sugar.',
  null, 'curated', 'american', 'easy',
  2, 5, 1,
  450, 17, 58,
  17, 8, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'breakfast');
delete from public.recipe_diet_tags where recipe_id = '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c';
insert into public.recipe_diet_tags (recipe_id, diet) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'vegetarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'halal');
delete from public.recipe_allergens where recipe_id = '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c';
insert into public.recipe_allergens (recipe_id, allergen) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'gluten');
insert into public.recipe_allergens (recipe_id, allergen) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'peanuts');
insert into public.recipe_allergens (recipe_id, allergen) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'dairy');
delete from public.recipe_appliances where recipe_id = '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c';
insert into public.recipe_appliances (recipe_id, appliance) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'stove');
delete from public.recipe_tags where recipe_id = '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c';
insert into public.recipe_tags (recipe_id, tag) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'quick');
insert into public.recipe_tags (recipe_id, tag) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'breakfast');
insert into public.recipe_tags (recipe_id, tag) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'budget');
insert into public.recipe_tags (recipe_id, tag) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'beginner');
insert into public.recipe_tags (recipe_id, tag) values ('2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 'healthy');

delete from public.recipe_ingredients where recipe_id = '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('e999d90b-ba1e-5b90-88b0-cf5b07ca9a74', '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', (select id from public.ingredients where name = 'oats' limit 1), 'oats', 60, 'g', null, false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('979677d2-0ec5-52f2-b95a-f2e8fb706936', '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', (select id from public.ingredients where name = 'milk' limit 1), 'milk', 250, 'ml', null, false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('beaafa5c-d870-504f-8a48-44c8498190db', '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', (select id from public.ingredients where name = 'bananas' limit 1), 'bananas', 1, 'piece', 'sliced', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('53bef008-8591-5db3-8874-a33bcb08abad', '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', (select id from public.ingredients where name = 'peanut butter' limit 1), 'peanut butter', 1, 'tbsp', null, false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('44ec4612-9a92-5be1-a10c-6543222585cd', '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', (select id from public.ingredients where name = 'cinnamon' limit 1), 'cinnamon', 1, 'pinch', null, true, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('580fac56-dbaf-58da-84e1-845f0aacb33a', '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', (select id from public.ingredients where name = 'honey' limit 1), 'honey', 1, 'tsp', null, true, 6);

delete from public.recipe_steps where recipe_id = '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('14a4a275-2a29-544a-ab3f-10aa9b39f6ac', '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 1, 'Simmer the oats in milk with a pinch of salt for 4 minutes, stirring, until creamy.', 5, null, '{"oats","milk"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('b6d41cf8-7062-5e69-a46c-ac8b67f96544', '2a0a84e2-b258-5bf9-addf-8aa1ea3b495c', 2, 'Stir in half the banana so it melts into the oats. Top with the rest, peanut butter, cinnamon and honey.', 2, null, '{"bananas","peanut butter","cinnamon","honey"}');

-- Quick Vegetable Fried Rice
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'quick-vegetable-fried-rice', 'Quick Vegetable Fried Rice', 'The best thing to do with yesterday’s rice. Fifteen minutes, one pan, whatever vegetables you have.',
  null, 'curated', 'asian', 'easy',
  8, 10, 2,
  470, 16, 68,
  14, 6, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '090dc093-13f3-579f-8d50-f69bd9c03bdd';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'lunch');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'dinner');
delete from public.recipe_diet_tags where recipe_id = '090dc093-13f3-579f-8d50-f69bd9c03bdd';
insert into public.recipe_diet_tags (recipe_id, diet) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'vegetarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'halal');
delete from public.recipe_allergens where recipe_id = '090dc093-13f3-579f-8d50-f69bd9c03bdd';
insert into public.recipe_allergens (recipe_id, allergen) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'eggs');
delete from public.recipe_appliances where recipe_id = '090dc093-13f3-579f-8d50-f69bd9c03bdd';
insert into public.recipe_appliances (recipe_id, appliance) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'stove');
delete from public.recipe_tags where recipe_id = '090dc093-13f3-579f-8d50-f69bd9c03bdd';
insert into public.recipe_tags (recipe_id, tag) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'quick');
insert into public.recipe_tags (recipe_id, tag) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'budget');
insert into public.recipe_tags (recipe_id, tag) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'asian');
insert into public.recipe_tags (recipe_id, tag) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'leftovers');
insert into public.recipe_tags (recipe_id, tag) values ('090dc093-13f3-579f-8d50-f69bd9c03bdd', 'beginner');

delete from public.recipe_ingredients where recipe_id = '090dc093-13f3-579f-8d50-f69bd9c03bdd';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('b10731c6-43c6-55cc-9d1b-f8589a26fb3f', '090dc093-13f3-579f-8d50-f69bd9c03bdd', (select id from public.ingredients where name = 'rice' limit 1), 'rice', 400, 'g', 'cooked and cooled', false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('a1655650-40e3-561a-af9b-81c6717a5a66', '090dc093-13f3-579f-8d50-f69bd9c03bdd', (select id from public.ingredients where name = 'eggs' limit 1), 'eggs', 2, 'piece', 'beaten', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('687f754e-5a61-51bc-9d59-770f6c5797a6', '090dc093-13f3-579f-8d50-f69bd9c03bdd', (select id from public.ingredients where name = 'carrots' limit 1), 'carrots', 1, 'piece', 'diced small', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('ae773215-be3d-59fc-93ef-1bdfd72658da', '090dc093-13f3-579f-8d50-f69bd9c03bdd', (select id from public.ingredients where name = 'green peas' limit 1), 'green peas', 100, 'g', null, false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('95698421-6893-5f4c-9d18-863756588261', '090dc093-13f3-579f-8d50-f69bd9c03bdd', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 3, 'clove', 'minced', false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('486e6fcd-edce-554e-9236-b592a5d53071', '090dc093-13f3-579f-8d50-f69bd9c03bdd', (select id from public.ingredients where name = 'green onion' limit 1), 'green onion', 1, 'bunch', 'sliced', false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('0a9c058d-8172-5747-ae76-1f4e220dd5dc', '090dc093-13f3-579f-8d50-f69bd9c03bdd', (select id from public.ingredients where name = 'vegetable oil' limit 1), 'vegetable oil', 30, 'ml', null, false, 7);

delete from public.recipe_steps where recipe_id = '090dc093-13f3-579f-8d50-f69bd9c03bdd';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('dcab610d-c935-5c01-96b0-ffb470a1bfbc', '090dc093-13f3-579f-8d50-f69bd9c03bdd', 1, 'Scramble the eggs quickly in hot oil and set aside.', 2, null, '{"eggs","vegetable oil"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('fccd116a-5558-57a0-a23c-e5d373e3bab0', '090dc093-13f3-579f-8d50-f69bd9c03bdd', 2, 'Stir-fry the carrot and peas for 3 minutes, then add the garlic for 30 seconds.', 4, null, '{"carrots","green peas","garlic"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('46d2eba7-1a37-56ee-ad0e-8ac946fa9b1d', '090dc093-13f3-579f-8d50-f69bd9c03bdd', 3, 'Add the cold rice, breaking up clumps, and fry hard for 4 minutes until it starts to catch.', 4, 'Only use rice that was cooled quickly and refrigerated, and reheat it once until piping hot.', '{"rice"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('16781e6e-983b-5037-abc5-e4a963e196bf', '090dc093-13f3-579f-8d50-f69bd9c03bdd', 4, 'Fold the egg back in with the green onions and season.', 1, null, '{"green onion"}');

-- Okra Stew with Beef
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'okra-stew', 'Okra Stew with Beef', 'Slow-cooked bamya in garlicky tomato, the way it should be. Serve with rice and bread.',
  null, 'curated', 'egyptian', 'medium',
  15, 75, 4,
  520, 36, 30,
  28, 8, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = 'fc8ac722-5f05-5687-af65-f7247e6a3086';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'lunch');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'dinner');
delete from public.recipe_diet_tags where recipe_id = 'fc8ac722-5f05-5687-af65-f7247e6a3086';
insert into public.recipe_diet_tags (recipe_id, diet) values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'halal');
delete from public.recipe_allergens where recipe_id = 'fc8ac722-5f05-5687-af65-f7247e6a3086';
delete from public.recipe_appliances where recipe_id = 'fc8ac722-5f05-5687-af65-f7247e6a3086';
insert into public.recipe_appliances (recipe_id, appliance) values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'stove');
delete from public.recipe_tags where recipe_id = 'fc8ac722-5f05-5687-af65-f7247e6a3086';
insert into public.recipe_tags (recipe_id, tag) values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'egyptian');
insert into public.recipe_tags (recipe_id, tag) values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'comfort');
insert into public.recipe_tags (recipe_id, tag) values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'high-protein');
insert into public.recipe_tags (recipe_id, tag) values ('fc8ac722-5f05-5687-af65-f7247e6a3086', 'slow');

delete from public.recipe_ingredients where recipe_id = 'fc8ac722-5f05-5687-af65-f7247e6a3086';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('863cf78d-4195-5309-9919-be9315ff87a6', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'beef cubes' limit 1), 'beef cubes', 600, 'g', null, false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('5dd974a4-85eb-579f-ab26-f817e5321efb', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'okra' limit 1), 'okra', 500, 'g', 'trimmed', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('751dc6d8-ba66-5597-927c-1c981a079a8e', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'tomatoes' limit 1), 'tomatoes', 4, 'piece', 'blended', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('d38982a7-a361-5176-b719-90c8f068a313', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'tomato paste' limit 1), 'tomato paste', 2, 'tbsp', null, false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('5619efaa-b11a-5e5a-8f46-f9b5b932d825', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 6, 'clove', 'crushed', false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('3d3d96fb-f889-5348-aeae-c92d0b30a9cd', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'onions' limit 1), 'onions', 1, 'piece', 'chopped', false, 6);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('febb8b23-7a65-59e3-8003-b5ec61be648f', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'coriander' limit 1), 'coriander', 1, 'bunch', 'chopped', false, 7);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('6f0e489c-0118-5091-a1e7-990f3f8dfe8a', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'vegetable oil' limit 1), 'vegetable oil', 40, 'ml', null, false, 8);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('6229b50a-e5cd-56e5-a18e-0bb613f4796b', 'fc8ac722-5f05-5687-af65-f7247e6a3086', (select id from public.ingredients where name = 'lemon' limit 1), 'lemon', 1, 'piece', 'juiced', true, 9);

delete from public.recipe_steps where recipe_id = 'fc8ac722-5f05-5687-af65-f7247e6a3086';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('8755310e-e206-5e00-80b6-06938ecaf7db', 'fc8ac722-5f05-5687-af65-f7247e6a3086', 1, 'Brown the beef hard in oil, then add the onion and cook until soft.', 10, 'Keep raw beef separate from anything served uncooked.', '{"beef cubes","vegetable oil","onions"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('e3e597ac-0ead-5248-b9d8-ed6054c2a679', 'fc8ac722-5f05-5687-af65-f7247e6a3086', 2, 'Add water to cover and simmer, covered, for 50 minutes until the beef gives way.', 50, null, '{}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('b1c7dc23-ebde-571f-9e96-3babb1d8f456', 'fc8ac722-5f05-5687-af65-f7247e6a3086', 3, 'Stir in the blended tomatoes, paste and half the garlic. Add the okra and simmer 20 minutes without stirring much.', 20, null, '{"tomatoes","tomato paste","garlic","okra"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('b239cbdb-a735-5d5f-94e8-bbf76fe8fb9f', 'fc8ac722-5f05-5687-af65-f7247e6a3086', 4, 'Fry the remaining garlic with the coriander and tip it in. Finish with lemon juice.', 3, null, '{"coriander","lemon"}');

-- Zucchini & Egg Skillet
insert into public.recipes (
  id, slug, title, description, image_url, source, cuisine, difficulty,
  prep_minutes, cook_minutes, base_servings, calories, protein_g, carbs_g, fat_g, fiber_g,
  created_by, is_public)
values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'zucchini-egg-skillet', 'Zucchini & Egg Skillet', 'Green, quick and barely any money. What to cook when the fridge is nearly empty.',
  null, 'curated', 'mediterranean', 'easy',
  5, 12, 2,
  300, 20, 12,
  20, 4, null, true)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  image_url = excluded.image_url,
  cuisine = excluded.cuisine,
  difficulty = excluded.difficulty,
  prep_minutes = excluded.prep_minutes,
  cook_minutes = excluded.cook_minutes,
  base_servings = excluded.base_servings,
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  fiber_g = excluded.fiber_g,
  is_public = excluded.is_public;

delete from public.recipe_meal_types where recipe_id = '4dd7d8f6-c800-5842-8a72-c6956ffe803c';
insert into public.recipe_meal_types (recipe_id, meal_type) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'breakfast');
insert into public.recipe_meal_types (recipe_id, meal_type) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'lunch');
delete from public.recipe_diet_tags where recipe_id = '4dd7d8f6-c800-5842-8a72-c6956ffe803c';
insert into public.recipe_diet_tags (recipe_id, diet) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'vegetarian');
insert into public.recipe_diet_tags (recipe_id, diet) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'halal');
insert into public.recipe_diet_tags (recipe_id, diet) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'keto');
delete from public.recipe_allergens where recipe_id = '4dd7d8f6-c800-5842-8a72-c6956ffe803c';
insert into public.recipe_allergens (recipe_id, allergen) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'eggs');
delete from public.recipe_appliances where recipe_id = '4dd7d8f6-c800-5842-8a72-c6956ffe803c';
insert into public.recipe_appliances (recipe_id, appliance) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'stove');
delete from public.recipe_tags where recipe_id = '4dd7d8f6-c800-5842-8a72-c6956ffe803c';
insert into public.recipe_tags (recipe_id, tag) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'quick');
insert into public.recipe_tags (recipe_id, tag) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'budget');
insert into public.recipe_tags (recipe_id, tag) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'under-100');
insert into public.recipe_tags (recipe_id, tag) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'healthy');
insert into public.recipe_tags (recipe_id, tag) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'beginner');
insert into public.recipe_tags (recipe_id, tag) values ('4dd7d8f6-c800-5842-8a72-c6956ffe803c', 'low-carb');

delete from public.recipe_ingredients where recipe_id = '4dd7d8f6-c800-5842-8a72-c6956ffe803c';
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('fa1f9cfc-e2b1-5ff1-803f-a2d66d80a2e8', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', (select id from public.ingredients where name = 'zucchini' limit 1), 'zucchini', 2, 'piece', 'sliced', false, 1);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('fb67d48a-80d6-5f5e-8498-b1aa3cfbab44', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', (select id from public.ingredients where name = 'eggs' limit 1), 'eggs', 4, 'piece', 'beaten', false, 2);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('540fe13d-3fc7-5453-8418-852a02c9d7ac', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', (select id from public.ingredients where name = 'onions' limit 1), 'onions', 1, 'piece', 'sliced', false, 3);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('4df78827-5cd8-53cb-b558-e646f1295758', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', (select id from public.ingredients where name = 'garlic' limit 1), 'garlic', 2, 'clove', 'sliced', false, 4);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('e72cb187-02d6-5982-a6b7-4c4d8d81e58e', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', (select id from public.ingredients where name = 'olive oil' limit 1), 'olive oil', 25, 'ml', null, false, 5);
insert into public.recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, unit, preparation, is_optional, sort_order)
values ('d7b89b0c-cb3a-52cb-8f27-e6cd10b56a53', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', (select id from public.ingredients where name = 'white cheese' limit 1), 'white cheese', 50, 'g', 'crumbled', true, 6);

delete from public.recipe_steps where recipe_id = '4dd7d8f6-c800-5842-8a72-c6956ffe803c';
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('98601997-0309-5077-93ce-963c52782d7e', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', 1, 'Fry the onion and zucchini in olive oil over medium-high heat for 8 minutes until browned at the edges.', 8, null, '{"onions","zucchini","olive oil"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('c0be3103-065d-5d72-bb29-05bccee678da', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', 2, 'Add the garlic for 30 seconds, then pour in the eggs and stir gently until just set.', 4, 'Cook until the eggs are set with no runny liquid.', '{"garlic","eggs"}');
insert into public.recipe_steps (id, recipe_id, step_number, instruction, duration_minutes, safety_note, ingredient_refs)
values ('32b49c7c-0042-5ba9-8db9-d59619b10002', '4dd7d8f6-c800-5842-8a72-c6956ffe803c', 3, 'Crumble the cheese over and serve straight from the pan.', 1, null, '{"white cheese"}');

-- === Grocery providers =====================================================
--
-- The mock provider exists so the adapter layer can be exercised end to end
-- in development. It is seeded DISABLED: no client can see it, and no real
-- provider is registered because none has a commercial agreement yet.
-- See PROJECT_STATUS.md § Required credentials.

insert into public.grocery_providers (id, slug, name, country, is_enabled, integration)
values ('ff86b7c3-2d99-5bc3-886c-b085fcd555e2', 'mock', 'Mock Provider (development only)', 'EG', false, 'mock')
on conflict (slug) do update set name = excluded.name, is_enabled = excluded.is_enabled;

commit;
