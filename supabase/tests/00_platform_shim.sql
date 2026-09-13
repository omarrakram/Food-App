-- ---------------------------------------------------------------------------
-- TEST-ONLY shim.
--
-- Recreates the parts of the Supabase platform our migrations depend on
-- (the `auth` schema, `auth.users`, `auth.uid()`, the `storage` schema, and
-- the anon/authenticated/service_role roles) so the schema and its RLS
-- policies can be applied and exercised against a plain Postgres instance
-- in CI.
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

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
-- Enough of `storage.buckets`, `storage.objects` and `storage.foldername()` to
-- apply and TEST the bucket policies. The column set is the subset the
-- migrations touch, not the platform's full schema — a test that passes here
-- proves the policy logic, not that the columns are byte-identical to
-- Supabase's.

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text not null references storage.buckets (id),
  name        text not null,
  owner       uuid references auth.users (id),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

-- Splits an object name into path segments, exactly as the platform's version
-- does. The policies use `(storage.foldername(name))[1]` to read the owning
-- user id out of the path.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
grant all on storage.objects to service_role;
