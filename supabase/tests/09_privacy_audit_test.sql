-- The privacy audit, as assertions rather than a document.
--
-- WHY THIS FILE IS SHAPED DIFFERENTLY FROM THE OTHERS. Every other suite here
-- tests behaviour: this user does that, and the database refuses. Those catch
-- the bugs you thought of. This one tests STRUCTURE — every table has RLS,
-- every security-definer function is revoked from anon, the public view of a
-- person exposes exactly these columns and no others — so it catches the table
-- somebody adds in six months and forgets to protect.
--
-- The brief's list is explicit about what must never reach a public profile:
-- email, allergies, pantry, private preferences, private messages, moderation
-- internals. Each of those is an assertion below, written so that a NEW
-- sensitive column added to `profiles` cannot slip out — the view enumerates
-- its columns, and the count is checked.

\set ON_ERROR_STOP on
\echo ''
\echo 'Privacy and security audit'

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
-- Every table is protected
-- --------------------------------------------------------------------------

do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ') into unprotected
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  perform pg_temp.assert(
    unprotected is null,
    'every table in public has row level security enabled'
      || coalesce(' — missing on: ' || unprotected, ''));
end
$$;

-- A table with RLS and no policy at all is readable by nobody, which is safe
-- but usually a mistake. The ones that genuinely have no read policy are
-- listed here so that adding another is a deliberate act.
--
--   payment_events — the raw callback bodies the payment provider sends us.
--     Only the service role reads them, inside `record_payment_event`. They
--     are evidence, not customer-facing data, and a payload we did not write
--     is not something to expose through a policy on a guess about its
--     contents.
do $$
declare
  silent text;
begin
  select string_agg(c.relname, ', ') into silent
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and c.relname not in ('payment_events')
     and not exists (
       select 1 from pg_policies p
       where p.tablename = c.relname and p.cmd in ('SELECT', 'ALL')
     );

  perform pg_temp.assert(
    silent is null,
    'every protected table says who may read it'
      || coalesce(' — no read policy on: ' || silent, ''));
end
$$;

-- --------------------------------------------------------------------------
-- The public view of a person
-- --------------------------------------------------------------------------
-- `public_profiles` is the ONLY way one user sees another, anywhere in the
-- app. If it is right, no screen can leak a private column; if it is wrong,
-- every screen can.

do $$
declare
  exposed text[];
  forbidden text[] := array[
    'email', 'phone',
    'dietary_preference', 'skill_level', 'budget_per_meal', 'household_size',
    'goals', 'currency', 'onboarding_completed',
    'visibility', 'show_city'
  ];
  leak text;
begin
  select array_agg(column_name::text order by column_name) into exposed
    from information_schema.columns
   where table_schema = 'public' and table_name = 'public_profiles';

  perform pg_temp.assert(
    exposed @> array['id', 'username', 'display_name', 'avatar_url', 'bio',
                     'country', 'city', 'joined_at'],
    'the public profile carries the columns the app renders');

  -- The count is the guard against a future `select *`: a new sensitive
  -- column on `profiles` cannot appear here without this failing.
  perform pg_temp.assert(
    array_length(exposed, 1) = 8,
    'the public profile carries EXACTLY those columns — '
      || array_length(exposed, 1)::text || ' found: ' || array_to_string(exposed, ', '));

  foreach leak in array forbidden loop
    perform pg_temp.assert(
      not (exposed @> array[leak]),
      'the public profile does not expose ' || leak);
  end loop;
end
$$;

-- The private columns that must never become readable by anybody else. Asked
-- of the TABLE, so the assertion survives someone widening the view.
do $$
begin
  perform pg_temp.assert(
    (select count(*) from pg_policies
      where tablename = 'profiles' and cmd in ('SELECT', 'ALL')
        and qual not like '%auth.uid()%') = 0,
    'every read policy on profiles is scoped to the caller''s own row');

  perform pg_temp.assert(
    (select count(*) from pg_policies
      where tablename in ('user_preferences', 'user_allergens', 'user_cuisines',
                          'user_appliances', 'user_disliked_ingredients',
                          'pantry_items', 'shopping_lists', 'saved_recipes',
                          'recipe_history')
        and qual not like '%auth.uid()%') = 0,
    'preferences, allergens, pantry, lists and history are own-row only');
end
$$;

-- --------------------------------------------------------------------------
-- Security-definer functions
-- --------------------------------------------------------------------------
-- A definer function runs with its owner's rights, which means EXECUTE on one
-- is a grant of that power. Two things have to hold for every one of them: it
-- is not executable by `anon` (an unauthenticated visitor), and it pins
-- `search_path` (or a caller can shadow a table it references).

do $$
declare
  reachable text;
  unpinned text;
begin
  select string_agg(p.proname, ', ') into reachable
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('anon', p.oid, 'EXECUTE');

  perform pg_temp.assert(
    reachable is null,
    'no security-definer function is callable by anon'
      || coalesce(' — reachable: ' || reachable, ''));

  select string_agg(p.proname, ', ') into unpinned
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and (p.proconfig is null
          or not exists (
            select 1 from unnest(p.proconfig) c where c like 'search_path=%'
          ));

  perform pg_temp.assert(
    unpinned is null,
    'every security-definer function pins its search_path'
      || coalesce(' — unpinned: ' || unpinned, ''));
end
$$;

-- `notify` is the one definer function no client may call at all: it writes
-- into somebody else's feed by design, and that is only safe while the only
-- callers are triggers.
do $$
begin
  perform pg_temp.assert(
    not has_function_privilege('authenticated', 'public.notify(uuid, public.notification_kind, uuid, uuid)', 'EXECUTE'),
    'notify() is not callable by an authenticated client');
end
$$;

-- --------------------------------------------------------------------------
-- The tables that must have no write policy
-- --------------------------------------------------------------------------
-- Each of these is load-bearing, and each is easy to "fix" by adding the
-- policy somebody's client seemed to need.

do $$
declare
  guarded text;
  pair record;
begin
  for pair in
    select * from (values
      ('user_roles',
       'a role a user can grant themselves is not a role'),
      ('notifications',
       'a feed a client can write to is a spam channel'),
      ('moderation_events',
       'a log a moderator can edit is not a log'),
      ('conversations',
       'a preview a client can write is a preview a client can forge'),
      ('friendships',
       'accepting a request is the only route into a friendship')
    ) as t(name, why)
  loop
    perform pg_temp.assert(
      (select count(*) from pg_policies
        where tablename = pair.name and cmd in ('INSERT', 'ALL')) = 0,
      pair.name || ' has no insert policy — ' || pair.why);
  end loop;

  -- Publication is the one that matters most: `is_public` is what every
  -- Discover feed keys on, so a client write policy that does not force it
  -- false is a way to publish unreviewed content to everybody.
  select string_agg(policyname, ', ') into guarded
    from pg_policies
   where tablename = 'recipes'
     and cmd in ('INSERT', 'UPDATE')
     and coalesce(with_check, '') not like '%is_public = false%';

  perform pg_temp.assert(
    guarded is null,
    'every client write policy on recipes forces is_public false'
      || coalesce(' — not forced by: ' || guarded, ''));
end
$$;

-- --------------------------------------------------------------------------
-- Private content stays private through its whole lifecycle
-- --------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('a1000000-0000-4000-8000-00000000000a', 'owner@audit.test'),
  ('a1000000-0000-4000-8000-00000000000b', 'nosy@audit.test');

update public.profiles set username = 'auditowner', visibility = 'private'
 where id = 'a1000000-0000-4000-8000-00000000000a';

create temp table audit_ids (label text primary key, id uuid);
grant select, insert, update, delete on audit_ids to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'a1000000-0000-4000-8000-00000000000a';

do $$
declare
  dish uuid;
begin
  insert into public.recipes (title, description, source, created_by, is_public)
  values ('Private notes recipe', 'not for anybody', 'user',
          'a1000000-0000-4000-8000-00000000000a', false)
  returning id into dish;
  insert into audit_ids values ('recipe', dish);

  insert into public.pantry_items (user_id, ingredient_name, quantity)
  values ('a1000000-0000-4000-8000-00000000000a', 'saffron', 1);

  insert into public.user_allergens (user_id, allergen)
  values ('a1000000-0000-4000-8000-00000000000a', 'nuts');
end
$$;

set request.jwt.claim.sub = 'a1000000-0000-4000-8000-00000000000b';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes
      where id = (select id from audit_ids where label = 'recipe')) = 0,
    'an unpublished recipe is invisible to another user');

  perform pg_temp.assert(
    (select count(*) from public.pantry_items) = 0,
    'nobody else can read a pantry');

  perform pg_temp.assert(
    (select count(*) from public.user_allergens) = 0,
    'nobody else can read an allergy');

  -- Scoped to the OWNER's row: every account has a preferences row of its
  -- own (`handle_new_user` writes one), so a bare count would be 1 here and
  -- the assertion would be testing nothing.
  perform pg_temp.assert(
    (select count(*) from public.user_preferences
      where user_id = 'a1000000-0000-4000-8000-00000000000a') = 0,
    'nobody else can read a preference');

  -- A private profile is not merely hidden from search; it is absent from the
  -- view entirely, so a direct id lookup finds nothing either.
  perform pg_temp.assert(
    (select count(*) from public.public_profiles
      where id = 'a1000000-0000-4000-8000-00000000000a') = 0,
    'a private profile does not appear in the public view, even by id');

  perform pg_temp.assert(
    (select count(*) from public.profiles
      where id = 'a1000000-0000-4000-8000-00000000000a') = 0,
    'and the underlying table is not readable at all');
end
$$;

reset role;
reset request.jwt.claim.sub;
