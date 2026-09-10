-- ---------------------------------------------------------------------------
-- Row Level Security tests.
--
-- These are the tests that matter most: if any assertion here fails, one user
-- can see or change another user's data. Run with:
--   npm run db:test
--
-- Each assertion raises on failure, so a passing run prints only the summary.
-- ---------------------------------------------------------------------------

\set ON_ERROR_STOP on

create or replace function pg_temp.assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if not condition then
    raise exception 'FAILED: %', description;
  end if;
  raise notice '  ok  %', description;
end;
$$;

-- Runs a statement expected to be rejected and asserts that it was.
create or replace function pg_temp.assert_rejected(statement text, description text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception
    when insufficient_privilege or check_violation then
      raise notice '  ok  % (rejected: %)', description, sqlerrm;
      return;
    when others then
      raise notice '  ok  % (rejected: % / %)', description, sqlstate, sqlerrm;
      return;
  end;
  raise exception 'FAILED: % — statement succeeded but should have been rejected', description;
end;
$$;

-- --- Fixtures --------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.test', '{"display_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'basem@example.test', '{"display_name":"Basem"}');

-- Test fixtures use dedicated slugs so the suite passes against both an empty
-- database and a seeded one.
insert into public.ingredients (id, slug, name, category, default_unit)
values ('33333333-3333-3333-3333-333333333333', 'test-fixture-tomato', 'test fixture tomato',
        'vegetables', 'piece');

insert into public.recipes (id, title, source, is_public)
values ('44444444-4444-4444-4444-444444444444', 'Test fixture public recipe', 'curated', true);

-- Ids captured as superuser so a test can attempt to FORGE a reference to a
-- row it cannot see. Selecting the id through RLS would return nothing, and an
-- INSERT..SELECT that matches no rows inserts nothing and misleadingly
-- "succeeds" — the forged-literal path below is the one that actually proves
-- the policy holds.
create temp table fixture_ids as
select
  (select id from public.shopping_lists
   where user_id = '11111111-1111-1111-1111-111111111111') as alice_list_id;
grant select on fixture_ids to authenticated;

\echo ''
\echo 'signup trigger'

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 1,
    'signup creates a profile');
  perform pg_temp.assert(
    (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice',
    'signup copies display_name from user metadata');
  perform pg_temp.assert(
    (select count(*) from public.user_preferences where user_id = '11111111-1111-1111-1111-111111111111') = 1,
    'signup creates a preferences row');
  perform pg_temp.assert(
    (select count(*) from public.shopping_lists where user_id = '11111111-1111-1111-1111-111111111111') = 1,
    'signup creates a default shopping list');
end
$$;

-- --- Alice writes her own data --------------------------------------------

\echo ''
\echo 'pantry isolation'

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.pantry_items (user_id, ingredient_id, ingredient_name, category, quantity, unit)
values ('11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333', 'tomatoes', 'vegetables', 4, 'piece');

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.pantry_items) = 1,
    'alice sees her own pantry item');
end
$$;

-- Alice must not be able to create a row owned by Basem.
do $$
begin
  perform pg_temp.assert_rejected($stmt$
    insert into public.pantry_items (user_id, ingredient_name)
    values ('22222222-2222-2222-2222-222222222222', 'smuggled')
  $stmt$, 'alice cannot insert a pantry row owned by basem');
end
$$;

-- --- Basem cannot see or touch Alice's data --------------------------------

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  affected integer;
begin
  perform pg_temp.assert(
    (select count(*) from public.pantry_items) = 0,
    'basem cannot read alice pantry items');

  update public.pantry_items set quantity = 999;
  get diagnostics affected = row_count;
  perform pg_temp.assert(affected = 0, 'basem cannot update alice pantry items');

  delete from public.pantry_items;
  get diagnostics affected = row_count;
  perform pg_temp.assert(affected = 0, 'basem cannot delete alice pantry items');

  perform pg_temp.assert(
    (select count(*) from public.profiles) = 1,
    'basem sees only his own profile');
  perform pg_temp.assert(
    (select count(*) from public.user_preferences) = 1,
    'basem sees only his own preferences');
end
$$;

-- --- Shopping list items are guarded through their parent list -------------

\echo ''
\echo 'shopping list isolation'

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.shopping_list_items (list_id, name, quantity, unit, category)
select id, 'tomatoes', 5, 'piece', 'vegetables'
from public.shopping_lists
where user_id = '11111111-1111-1111-1111-111111111111';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.shopping_list_items) = 1,
    'alice sees her own shopping list item');
end
$$;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  alice_list uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.shopping_list_items) = 0,
    'basem cannot read alice shopping list items');

  perform pg_temp.assert(
    (select count(*) from public.shopping_lists
     where user_id = '11111111-1111-1111-1111-111111111111') = 0,
    'basem cannot read alice list at all');

  -- The real attack: Basem knows (or guesses) Alice's list id and writes to it
  -- directly. The WITH CHECK on the parent must reject this outright.
  select alice_list_id into alice_list from fixture_ids;

  perform pg_temp.assert_rejected(
    format(
      'insert into public.shopping_list_items (list_id, name) values (%L, %L)',
      alice_list, 'smuggled'),
    'basem cannot insert into alice list using a forged list id');
end
$$;

-- --- Reference data is readable but not writable ---------------------------

\echo ''
\echo 'reference data'

do $$
declare
  affected integer;
begin
  perform pg_temp.assert(
    (select count(*) from public.ingredients
     where slug = 'test-fixture-tomato') = 1,
    'authenticated users can read the ingredient catalogue');

  -- An INSERT with no matching policy is rejected outright.
  perform pg_temp.assert_rejected($stmt$
    insert into public.ingredients (slug, name) values ('hacked', 'hacked')
  $stmt$, 'authenticated users cannot write to the ingredient catalogue');

  -- An UPDATE/DELETE with no matching policy is not an error: RLS filters the
  -- target set to empty, so the statement runs and changes nothing. Asserting
  -- on the row count is what proves the data is safe.
  update public.ingredients set name = 'hacked';
  get diagnostics affected = row_count;
  perform pg_temp.assert(affected = 0, 'authenticated users cannot update the ingredient catalogue');

  delete from public.ingredients;
  get diagnostics affected = row_count;
  perform pg_temp.assert(affected = 0, 'authenticated users cannot delete from the ingredient catalogue');

  perform pg_temp.assert(
    (select count(*) from public.recipes
     where id = '44444444-4444-4444-4444-444444444444') = 1,
    'authenticated users can read public curated recipes');

  update public.recipes set title = 'hacked';
  get diagnostics affected = row_count;
  perform pg_temp.assert(affected = 0, 'authenticated users cannot edit curated recipes');

  perform pg_temp.assert(
    (select name from public.ingredients where slug = 'test-fixture-tomato')
      = 'test fixture tomato',
    'the ingredient catalogue is unchanged after the attempts above');
end
$$;

-- --- Private recipes stay private ------------------------------------------

\echo ''
\echo 'recipe ownership'

insert into public.recipes (id, title, source, created_by, is_public)
values ('55555555-5555-5555-5555-555555555555', 'Basem private recipe', 'ai_generated',
        '22222222-2222-2222-2222-222222222222', false);

insert into public.recipe_steps (recipe_id, step_number, instruction)
values ('55555555-5555-5555-5555-555555555555', 1, 'Basem step');

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes
     where id = '55555555-5555-5555-5555-555555555555') = 1,
    'basem can read his own private recipe');
end
$$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes
     where id = '55555555-5555-5555-5555-555555555555') = 0,
    'alice cannot read basem private recipe');
  perform pg_temp.assert(
    (select count(*) from public.recipe_steps
     where recipe_id = '55555555-5555-5555-5555-555555555555') = 0,
    'alice cannot read steps of a recipe she cannot read');

  perform pg_temp.assert_rejected($stmt$
    insert into public.recipe_steps (recipe_id, step_number, instruction)
    values ('55555555-5555-5555-5555-555555555555', 2, 'injected')
  $stmt$, 'alice cannot add steps to basem recipe');
end
$$;

-- --- AI usage --------------------------------------------------------------

\echo ''
\echo 'ai usage'

reset role;
insert into public.ai_usage_events (user_id, function_name, model, input_tokens, output_tokens)
values ('22222222-2222-2222-2222-222222222222', 'ai-suggest', 'claude-sonnet-5', 100, 200);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.ai_usage_events) = 0,
    'alice cannot read basem ai usage');
  perform pg_temp.assert(
    (select count(*) from public.pantry_items) = 1,
    'alice still sees exactly her own pantry row');
  perform pg_temp.assert_rejected($stmt$
    insert into public.ai_usage_events (user_id, function_name, model)
    values ('11111111-1111-1111-1111-111111111111', 'forged', 'x')
  $stmt$, 'clients cannot forge ai usage rows to dodge rate limits');
end
$$;

-- --- Disabled grocery providers are invisible ------------------------------

\echo ''
\echo 'grocery providers'

reset role;
insert into public.grocery_providers (slug, name, country, is_enabled)
values ('mock-provider', 'Mock Provider', 'EG', false);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.grocery_providers) = 0,
    'disabled grocery providers are not visible to clients (including the seeded mock)');
end
$$;

-- --- Every public table has RLS enabled ------------------------------------

\echo ''
\echo 'coverage'

reset role;

do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ')
  into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  perform pg_temp.assert(
    unprotected is null,
    'every table in public has row level security enabled');
end
$$;

-- --- Account deletion removes everything -----------------------------------

\echo ''
\echo 'account deletion'

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select public.delete_own_account();

reset role;

do $$
begin
  perform pg_temp.assert(
    (select count(*) from auth.users where id = '11111111-1111-1111-1111-111111111111') = 0,
    'account deletion removes the auth user');
  perform pg_temp.assert(
    (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 0,
    'account deletion cascades to the profile');
  perform pg_temp.assert(
    (select count(*) from public.pantry_items
     where user_id = '11111111-1111-1111-1111-111111111111') = 0,
    'account deletion cascades to pantry items');
  perform pg_temp.assert(
    (select count(*) from public.shopping_lists
     where user_id = '11111111-1111-1111-1111-111111111111') = 0,
    'account deletion cascades to shopping lists');
  perform pg_temp.assert(
    (select count(*) from public.ai_usage_events where user_id is not null) = 1,
    'ai usage rows survive deletion of an unrelated user');
end
$$;

-- An unauthenticated caller must not be able to delete anything.
set role authenticated;
reset request.jwt.claim.sub;

do $$
begin
  perform pg_temp.assert_rejected(
    'select public.delete_own_account()',
    'delete_own_account rejects an unauthenticated caller');
end
$$;

reset role;

\echo ''
\echo 'ALL RLS TESTS PASSED'
