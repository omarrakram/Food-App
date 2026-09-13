-- Storage policies.
--
-- The three questions this file answers, each as an attacker:
--
--   1. Can I write into someone else's folder?
--   2. Can I read a recipe photo that is still awaiting moderation?
--   3. Can I put an image straight into the published catalogue bucket,
--      skipping review entirely?
--
-- The answer to all three must be no, enforced by Postgres. The client also
-- checks the first — but a client check only stops an honest mistake.

\set ON_ERROR_STOP on
\echo ''
\echo 'Storage policies'

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

insert into auth.users (id, email)
values
  ('11110000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('22220000-0000-4000-8000-000000000002', 'intruder@example.test');

-- --------------------------------------------------------------------------
-- The buckets themselves
-- --------------------------------------------------------------------------

do $$
begin
  perform pg_temp.assert(
    (select public from storage.buckets where id = 'avatars'),
    'avatars is a public bucket');
  perform pg_temp.assert(
    not (select public from storage.buckets where id = 'recipe-uploads'),
    'recipe-uploads is NOT public — a submission under review is not a URL');
  perform pg_temp.assert(
    (select public from storage.buckets where id = 'recipe-images'),
    'recipe-images, the published catalogue, is public');

  perform pg_temp.assert(
    (select allowed_mime_types from storage.buckets where id = 'avatars')
      = array['image/jpeg', 'image/png', 'image/webp'],
    'the server, not the client, decides which mime types are allowed');
  perform pg_temp.assert(
    (select file_size_limit from storage.buckets where id = 'avatars') = 2097152,
    'the server, not the client, caps the avatar size');
end
$$;

-- --------------------------------------------------------------------------
-- Writing into your own folder, and nobody else's
-- --------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '11110000-0000-4000-8000-000000000001';

insert into storage.objects (bucket_id, name, owner)
values ('avatars', '11110000-0000-4000-8000-000000000001/avatar.jpg',
        '11110000-0000-4000-8000-000000000001');

insert into storage.objects (bucket_id, name, owner)
values ('recipe-uploads', '11110000-0000-4000-8000-000000000001/draft.jpg',
        '11110000-0000-4000-8000-000000000001');

do $$
begin
  perform pg_temp.assert(
    (select count(*) from storage.objects where bucket_id = 'avatars') = 1,
    'a user can upload into their own folder');
end
$$;

set request.jwt.claim.sub = '22220000-0000-4000-8000-000000000002';

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$insert into storage.objects (bucket_id, name, owner)
         values ('avatars', '11110000-0000-4000-8000-000000000001/avatar.jpg',
                 '22220000-0000-4000-8000-000000000002')$sql$,
    'a user cannot write into another user''s avatar folder');

  perform pg_temp.assert_rejected(
    $sql$insert into storage.objects (bucket_id, name, owner)
         values ('recipe-uploads', '11110000-0000-4000-8000-000000000001/stolen.jpg',
                 '22220000-0000-4000-8000-000000000002')$sql$,
    'a user cannot write into another user''s upload folder');

  -- Path traversal: the first segment is what the policy reads, so a name that
  -- tries to climb out of its own folder still fails on that segment.
  perform pg_temp.assert_rejected(
    $sql$insert into storage.objects (bucket_id, name, owner)
         values ('avatars', '../11110000-0000-4000-8000-000000000001/avatar.jpg',
                 '22220000-0000-4000-8000-000000000002')$sql$,
    'a traversal-shaped path does not escape the folder rule');

  perform pg_temp.assert_rejected(
    $sql$insert into storage.objects (bucket_id, name, owner)
         values ('avatars', 'avatar.jpg', '22220000-0000-4000-8000-000000000002')$sql$,
    'an object with no user folder at all is rejected');
end
$$;

-- Deleting and renaming someone else's file. An UPDATE or DELETE that matches
-- no rows under RLS affects zero rows rather than erroring, so the proof is
-- that the row survived unchanged.
delete from storage.objects
  where name = '11110000-0000-4000-8000-000000000001/avatar.jpg';

update storage.objects
  set name = '22220000-0000-4000-8000-000000000002/taken.jpg'
  where bucket_id = 'avatars';

reset role;
reset request.jwt.claim.sub;

do $$
begin
  perform pg_temp.assert(
    (select count(*) from storage.objects
     where name = '11110000-0000-4000-8000-000000000001/avatar.jpg') = 1,
    'a user cannot delete another user''s avatar');
  perform pg_temp.assert(
    (select count(*) from storage.objects
     where name = '22220000-0000-4000-8000-000000000002/taken.jpg') = 0,
    'a user cannot move another user''s avatar into their own folder');
end
$$;

-- --------------------------------------------------------------------------
-- An unapproved submission photo is not readable
-- --------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '22220000-0000-4000-8000-000000000002';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from storage.objects where bucket_id = 'recipe-uploads') = 0,
    'a user cannot read another user''s pending submission photo');

  -- An avatar is different, and deliberately so: it exists to be shown next
  -- to a name in a friend list.
  perform pg_temp.assert(
    (select count(*) from storage.objects where bucket_id = 'avatars') = 1,
    'an avatar is readable by other users');
end
$$;

set request.jwt.claim.sub = '11110000-0000-4000-8000-000000000001';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from storage.objects where bucket_id = 'recipe-uploads') = 1,
    'the submitter can still read their own pending photo');
end
$$;

-- --------------------------------------------------------------------------
-- Nobody publishes into the catalogue bucket
-- --------------------------------------------------------------------------
-- This is the one that keeps moderation from being advisory. A user who could
-- write here could put an image in the published catalogue that the review
-- queue never saw.

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$insert into storage.objects (bucket_id, name, owner)
         values ('recipe-images', '11110000-0000-4000-8000-000000000001/sneaky.jpg',
                 '11110000-0000-4000-8000-000000000001')$sql$,
    'a user cannot write into the published catalogue bucket, even in their own folder');

  perform pg_temp.assert_rejected(
    $sql$insert into storage.objects (bucket_id, name, owner)
         values ('recipe-images', 'curated/koshari.jpg',
                 '11110000-0000-4000-8000-000000000001')$sql$,
    'a user cannot write a curated path either');
end
$$;

reset role;
reset request.jwt.claim.sub;

-- Every write policy that exists on storage.objects must be scoped to a
-- bucket. A policy that forgot its bucket_id clause would apply everywhere.
do $$
declare
  unscoped text[];
begin
  select array_agg(policyname::text)
    into unscoped
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and cmd in ('INSERT', 'UPDATE', 'DELETE')
     and coalesce(qual, '') || coalesce(with_check, '') not like '%bucket_id%';

  perform pg_temp.assert(unscoped is null, 'every write policy names the bucket it applies to');
end
$$;

\echo ''
\echo 'ALL STORAGE TESTS PASSED'
