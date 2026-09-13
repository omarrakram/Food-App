-- Public identity: usernames, bios, avatars and a visibility choice.
--
-- Until now a profile was private by construction: RLS allowed a user to read
-- exactly their own row and nothing else. That is the right default and it is
-- kept — but friends, sharing, community recipes and messaging all need one
-- person to be able to find and look at another, and none of them may become
-- the reason someone's allergies leak.
--
-- The shape here is deliberate:
--
--   * `public.profiles` stays own-row-only. No policy is loosened.
--   * `public.public_profiles` is a VIEW that selects a small, hand-listed set
--     of columns and applies the owner's visibility choice in its WHERE.
--
-- A view rather than a column-level grant because RLS is row-level: it cannot
-- say "this row, but not the allergy column". Enumerating the safe columns in
-- one place that is easy to read is the only version of this that can be
-- audited at a glance — and adding a sensitive column to `profiles` later
-- cannot silently publish it, because the view does not use `*`.

-- --------------------------------------------------------------------------
-- Handles
-- --------------------------------------------------------------------------

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9][a-z0-9._]{2,29}$');

alter table public.profiles
  add constraint profiles_bio_length
  check (bio is null or char_length(bio) <= 300);

-- The uniqueness key, not the display form.
--
-- Case is folded because `Omar` and `omar` are the same handle to every human
-- who reads them. Dots and underscores are STRIPPED because they are not:
-- `omar.hassan`, `omar_hassan` and `omarhassan` are three registrations that
-- let one person impersonate another in a friend request, and the person being
-- impersonated has no way to notice. The typed form is preserved in `username`
-- and shown everywhere; only collision detection uses this.
alter table public.profiles
  add column if not exists username_key text
  generated always as (
    case when username is null then null
         else regexp_replace(lower(username), '[._]', '', 'g')
    end
  ) stored;

create unique index if not exists profiles_username_key_uniq
  on public.profiles (username_key)
  where username_key is not null;

-- Handle search. Prefix matching over an index rather than a scan, because
-- friend search runs on every keystroke.
create index if not exists profiles_username_key_prefix_idx
  on public.profiles (username_key text_pattern_ops)
  where username_key is not null;

-- --------------------------------------------------------------------------
-- Visibility
-- --------------------------------------------------------------------------

create type public.profile_visibility as enum (
  'public',   -- discoverable and viewable by any signed-in user
  'friends',  -- viewable by accepted friends only
  'private'   -- nobody but the owner
);

-- `public` is the default because a profile with a handle exists to be found;
-- a user who does not want that has two stricter settings and no data of
-- consequence is exposed at any of them.
alter table public.profiles
  add column if not exists visibility public.profile_visibility not null default 'public';

-- City is opt-in separately from the profile as a whole. It is the one field
-- here that narrows down where somebody actually is.
alter table public.profiles
  add column if not exists show_city boolean not null default false;

comment on column public.profiles.username_key is
  'Case- and separator-folded handle. Uniqueness and lookup key; never shown.';
comment on column public.profiles.visibility is
  'Who may see this profile through public_profiles. Never widens what columns are visible.';

-- --------------------------------------------------------------------------
-- The public view
-- --------------------------------------------------------------------------
-- Columns are listed one by one. That is the point: this is the complete set
-- of things another user can learn about someone, and it is reviewable in ten
-- seconds. There is deliberately no email (it is not in this table at all), no
-- allergen, no dietary preference, no pantry, no calorie or budget target.
--
-- `security_invoker = false` is what lets the view read past the own-row RLS
-- on the base table. The visibility rule below is therefore the ONLY thing
-- standing between a private profile and a reader, so it lives here rather
-- than in application code.

create view public.public_profiles
with (security_invoker = false) as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.country,
  case when p.show_city then p.city else null end as city,
  p.created_at as joined_at
from public.profiles p
where p.username is not null
  and (
    -- Always your own, whatever you set.
    p.id = auth.uid()
    or p.visibility = 'public'
    -- 'friends' resolves once the friendship table exists; until then it is
    -- strictly narrower than 'public', which is the safe direction to be
    -- wrong in. Widening it later is a deliberate change to this line.
  );

comment on view public.public_profiles is
  'The complete set of profile fields another user may see. Enumerated, not '
  'select *, so a sensitive column added to profiles cannot leak through it.';

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

-- --------------------------------------------------------------------------
-- Claiming a handle
-- --------------------------------------------------------------------------
-- Availability has to be answerable BEFORE the row is written, and a client
-- cannot be allowed to read the profiles table to find out. A definer function
-- answers the one question and nothing else: it returns a boolean, never a
-- row, so it cannot be turned into a way to enumerate who exists — the caller
-- already had to know the exact handle to ask.

create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    candidate ~ '^[a-z0-9][a-z0-9._]{2,29}$'
    and not exists (
      select 1 from public.profiles p
      where p.username_key = regexp_replace(lower(candidate), '[._]', '', 'g')
        and p.id is distinct from auth.uid()
    );
$$;

revoke all on function public.username_available(text) from public, anon;
grant execute on function public.username_available(text) to authenticated;

comment on function public.username_available is
  'True when the caller could claim this handle. Answers one exact handle at '
  'a time and returns no rows, so it is not a directory.';
