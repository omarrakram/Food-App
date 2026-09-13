-- Public profiles, and what they must never leak.
--
-- Adversarial by design: every assertion is written as an attacker, not as the
-- happy path. The question is not "can Alice see her profile" — it is "what is
-- the most Basem can learn about Alice, and is any of it food-medical".

\set ON_ERROR_STOP on
\echo ''
\echo 'Profile privacy'

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

-- --- Fixtures --------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'amina@example.test', '{"display_name":"Amina"}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bishoy@example.test', '{"display_name":"Bishoy"}'),
  ('cccccccc-0000-4000-8000-000000000003', 'careem@example.test', '{"display_name":"Careem"}');

update public.profiles
  set username = 'amina.hassan', bio = 'I cook a lot of molokhia.', city = 'Cairo',
      visibility = 'public', show_city = true
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';

update public.profiles
  set username = 'bishoy', city = 'Alexandria', visibility = 'private'
  where id = 'bbbbbbbb-0000-4000-8000-000000000002';

update public.profiles
  set username = 'careem', city = 'Giza', visibility = 'public', show_city = false
  where id = 'cccccccc-0000-4000-8000-000000000003';

-- Amina is severely allergic to peanuts. This is the fact the whole file is
-- about: it must not be reachable from any other account, by any route.
insert into public.user_allergens (user_id, allergen)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'peanuts');

-- --------------------------------------------------------------------------
-- Handle uniqueness
-- --------------------------------------------------------------------------

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$update public.profiles set username = 'AMINA.HASSAN'
         where id = 'cccccccc-0000-4000-8000-000000000003'$sql$,
    'an uppercase handle is rejected outright by the format rule');

  perform pg_temp.assert_rejected(
    $sql$update public.profiles set username = 'aminahassan'
         where id = 'cccccccc-0000-4000-8000-000000000003'$sql$,
    'a handle differing only by a dot is rejected');

  perform pg_temp.assert_rejected(
    $sql$update public.profiles set username = 'amina_hassan'
         where id = 'cccccccc-0000-4000-8000-000000000003'$sql$,
    'a handle differing only by an underscore is rejected');

  perform pg_temp.assert_rejected(
    $sql$update public.profiles set username = 'Amina Hassan'
         where id = 'cccccccc-0000-4000-8000-000000000003'$sql$,
    'a handle with a space is rejected');

  perform pg_temp.assert_rejected(
    $sql$update public.profiles set username = 'ab'
         where id = 'cccccccc-0000-4000-8000-000000000003'$sql$,
    'a two-character handle is rejected');

  perform pg_temp.assert(
    (select username_key from public.profiles
     where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'aminahassan',
    'the folded key strips case and separators');
end
$$;

-- --------------------------------------------------------------------------
-- What one user can see of another
-- --------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.profiles
     where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0,
    'the profiles table itself stays own-row-only');

  perform pg_temp.assert(
    (select count(*) from public.public_profiles
     where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 1,
    'a public profile is visible through the view');

  perform pg_temp.assert(
    (select bio from public.public_profiles
     where username = 'amina.hassan') = 'I cook a lot of molokhia.',
    'the view shows the handle, name and bio');

  perform pg_temp.assert(
    (select city from public.public_profiles where username = 'amina.hassan') = 'Cairo',
    'city is shown when the owner opted in');

  perform pg_temp.assert(
    (select city from public.public_profiles where username = 'careem') is null,
    'city is withheld when the owner did not opt in');

  -- THE assertion. Everything else in this file supports it.
  perform pg_temp.assert(
    (select count(*) from public.user_allergens
     where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0,
    'another user cannot read allergens');

  perform pg_temp.assert(
    (select count(*) from public.user_preferences
     where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0,
    'another user cannot read dietary preferences, budgets or calorie targets');

  perform pg_temp.assert(
    (select count(*) from public.pantry_items
     where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 0,
    'another user cannot read a pantry');
end
$$;

-- The view must expose no column that could carry private data. Listing what
-- IS there is how a future `select *` refactor gets caught.
do $$
declare
  columns text[];
begin
  select array_agg(column_name::text order by column_name)
    into columns
    from information_schema.columns
   where table_schema = 'public' and table_name = 'public_profiles';

  perform pg_temp.assert(
    columns = array['avatar_url','bio','city','country','display_name','id','joined_at','username'],
    'the public view exposes exactly the eight agreed columns');
end
$$;

-- --------------------------------------------------------------------------
-- A private profile is private
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'cccccccc-0000-4000-8000-000000000003';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.public_profiles where username = 'bishoy') = 0,
    'a private profile is invisible to another user');

  perform pg_temp.assert(
    (select count(*) from public.public_profiles where id = 'cccccccc-0000-4000-8000-000000000003') = 1,
    'a user always sees their own profile through the view');
end
$$;

set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.public_profiles where username = 'bishoy') = 1,
    'a private profile is still visible to its owner');
end
$$;

-- --------------------------------------------------------------------------
-- Nobody can edit anybody else's identity
-- --------------------------------------------------------------------------

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$insert into public.profiles (id, username)
         values ('dddddddd-0000-4000-8000-000000000004', 'squatted')$sql$,
    'a user cannot create a profile for another id');
end
$$;

-- An UPDATE that matches no rows under RLS silently affects zero rows rather
-- than erroring, so the proof is that the value did not change.
update public.profiles set username = 'stolen', bio = 'hacked'
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';

reset role;
reset request.jwt.claim.sub;

do $$
begin
  perform pg_temp.assert(
    (select username from public.profiles
     where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'amina.hassan',
    'a user cannot rename another user');
  perform pg_temp.assert(
    (select bio from public.profiles
     where id = 'aaaaaaaa-0000-4000-8000-000000000001') = 'I cook a lot of molokhia.',
    'a user cannot rewrite another user''s bio');
end
$$;

-- --------------------------------------------------------------------------
-- Handle availability is a question, not a directory
-- --------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-4000-8000-000000000002';

do $$
begin
  perform pg_temp.assert(
    public.username_available('brand.new.handle'),
    'an unclaimed handle reports available');
  perform pg_temp.assert(
    not public.username_available('aminahassan'),
    'a handle colliding after folding reports unavailable');
  perform pg_temp.assert(
    not public.username_available('Amina.Hassan'),
    'the availability check folds case too');
  perform pg_temp.assert(
    not public.username_available('no'),
    'a malformed handle reports unavailable rather than erroring');
  perform pg_temp.assert(
    public.username_available('bishoy'),
    'your own handle does not report itself as taken');
end
$$;

reset role;
reset request.jwt.claim.sub;

-- Anonymous callers get nothing at all.
do $$
begin
  perform pg_temp.assert(
    not has_table_privilege('anon', 'public.public_profiles', 'select'),
    'signed-out callers cannot read the public profile view');
  perform pg_temp.assert(
    not has_function_privilege('anon', 'public.username_available(text)', 'execute'),
    'signed-out callers cannot probe handle availability');
end
$$;

\echo ''
\echo 'ALL PROFILE PRIVACY TESTS PASSED'
