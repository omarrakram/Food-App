-- The catalogue query surface.
--
-- These are not permission tests; `01_rls_test.sql` covers those. These assert
-- that the columns and indexes the recipe query layer depends on actually
-- exist and behave, because the failure mode when they do not is silent: the
-- app degrades to fetching everything and filtering in JavaScript, which looks
-- correct and is a latency cliff.

\set ON_ERROR_STOP on
\echo ''
\echo 'Catalogue query surface'

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

-- --------------------------------------------------------------------------
-- The seed is actually a catalogue
-- --------------------------------------------------------------------------

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes where is_public) >= 150,
    'the seed carries a real catalogue, not a demo');
  perform pg_temp.assert(
    (select count(*) from public.recipe_ingredients where slug is null) = 0,
    'every seeded ingredient line carries its canonical slug');
  perform pg_temp.assert(
    (select count(*) from public.recipe_ingredients ri
     left join public.ingredients i on i.id = ri.ingredient_id
     where i.id is null) = 0,
    'every ingredient line points at a real ingredient row');
  perform pg_temp.assert(
    (select count(*) from public.recipe_ingredients ri
     join public.ingredients i on i.id = ri.ingredient_id
     where i.slug is distinct from ri.slug) = 0,
    'the denormalised slug agrees with the ingredient it points at');
end
$$;

-- --------------------------------------------------------------------------
-- total_minutes is a real column the API can filter on
-- --------------------------------------------------------------------------
-- PostgREST cannot express a filter on `prep_minutes + cook_minutes`, so
-- "under 30 minutes" was being applied client-side after fetching everything.

do $$
declare
  target uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes
     where total_minutes is distinct from prep_minutes + cook_minutes) = 0,
    'total_minutes equals prep plus cook for every seeded recipe');

  select id into target from public.recipes order by id limit 1;
  update public.recipes set cook_minutes = cook_minutes + 7 where id = target;

  perform pg_temp.assert(
    (select total_minutes = prep_minutes + cook_minutes from public.recipes where id = target),
    'total_minutes is maintained by Postgres on write, not by the app');

  update public.recipes set cook_minutes = cook_minutes - 7 where id = target;
end
$$;

-- --------------------------------------------------------------------------
-- The indexes the query layer assumes
-- --------------------------------------------------------------------------
-- Every clause the planner builds rides one of these. A missing index does not
-- fail a query, it just makes it a sequential scan — invisible at 153 rows and
-- fatal at 50,000.

do $$
declare
  wanted text;
  expected text[] := array[
    'recipe_ingredients_slug_idx',
    'recipes_total_minutes_idx',
    'recipes_public_created_idx',
    'recipes_source_idx',
    'recipes_title_trgm_idx',
    'recipes_title_ar_trgm_idx',
    'recipe_tags_tag_idx',
    'recipe_diet_tags_diet_idx'
  ];
begin
  foreach wanted in array expected loop
    perform pg_temp.assert(
      exists (select 1 from pg_indexes where schemaname = 'public' and indexname = wanted),
      format('index %s exists', wanted));
  end loop;
end
$$;

-- --------------------------------------------------------------------------
-- Image provenance is enforced, not merely documented
-- --------------------------------------------------------------------------

do $$
declare
  target uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes
     where image_path is not null and (image_source is null or image_license is null)) = 0,
    'no seeded recipe carries a photograph without a licence');

  select id into target from public.recipes order by id limit 1;
  begin
    update public.recipes
      set image_path = 'stolen.jpg', image_source = null, image_license = null
      where id = target;
    raise exception 'FAILED: an unlicensed image path was accepted';
  exception
    when check_violation then
      raise notice '  ok  an image path without a licence is rejected';
  end;
end
$$;

-- --------------------------------------------------------------------------
-- The keyset pagination order is total
-- --------------------------------------------------------------------------
-- Paging is ordered by (created_at desc, id desc). If two rows can share both,
-- a cursor can skip or repeat a recipe.

do $$
begin
  perform pg_temp.assert(
    (select count(*) from (
       select created_at, id from public.recipes group by created_at, id having count(*) > 1
     ) duplicates) = 0,
    'the (created_at, id) paging key is unique across the catalogue');
end
$$;

\echo ''
\echo 'ALL QUERY TESTS PASSED'
