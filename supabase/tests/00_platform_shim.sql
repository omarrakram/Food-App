-- ---------------------------------------------------------------------------
-- TEST-ONLY shim.
--
-- Recreates the parts of the Supabase platform our migrations depend on
-- (the `auth` schema, `auth.users`, `auth.uid()`, and the anon/authenticated/
-- service_role roles) so the schema and its RLS policies can be applied and
-- exercised against a plain Postgres instance in CI.
--
-- This file is NEVER applied to a real Supabase project — the platform
-- provides all of it. It lives outside supabase/migrations/ for that reason.
-- ---------------------------------------------------------------------------

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  encrypted_password  text,
  email_confirmed_at  timestamptz,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Supabase derives the caller from the request JWT. In tests we set the same
-- GUC by hand: `set local request.jwt.claim.sub = '<uuid>'`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant select on auth.users to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant all on tables to service_role;
