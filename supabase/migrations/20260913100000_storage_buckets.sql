-- Storage: avatars and community recipe photos.
--
-- Two buckets, because they answer different questions about who may look.
--
--   `avatars`         is readable by anyone. An avatar exists to be shown next
--                     to a name in a friend list or a message thread, and
--                     gating that behind a signed URL per row would mean a
--                     round trip per face on screen.
--
--   `recipe-uploads`  is NOT readable by anyone. A community recipe photo is
--                     part of a submission under review, and an unapproved
--                     submission must not be reachable by URL — otherwise
--                     moderation is advisory. Approval copies the file into
--                     the public catalogue bucket; until then only the owner
--                     and moderators can read it.
--
-- Everything below is enforced by Postgres on `storage.objects`. None of it is
-- enforced by the client, which cannot be trusted about who it is.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('recipe-uploads', 'recipe-uploads', false, 8388608,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('recipe-images', 'recipe-images', true, 8388608,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- `file_size_limit` and `allowed_mime_types` above are the ones that matter:
-- the client also checks both, but a client check only stops an honest
-- mistake. These stop a crafted upload.

-- --------------------------------------------------------------------------
-- Ownership by path
-- --------------------------------------------------------------------------
-- Every user-writable object lives under `<uid>/…`, and the policies compare
-- the first path segment to auth.uid(). That is what makes "users can only
-- modify files they own" a database rule rather than a naming convention:
-- a client that invents a path outside its own folder is rejected by Postgres,
-- not by a check it could skip.

create policy "avatars: anyone may read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: write own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: replace own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

-- --------------------------------------------------------------------------
-- Submission photos stay private until approved
-- --------------------------------------------------------------------------

create policy "recipe-uploads: read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'recipe-uploads' and owner = auth.uid());

create policy "recipe-uploads: write own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recipe-uploads: replace own"
  on storage.objects for update to authenticated
  using (bucket_id = 'recipe-uploads' and owner = auth.uid())
  with check (
    bucket_id = 'recipe-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "recipe-uploads: delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-uploads' and owner = auth.uid());

-- --------------------------------------------------------------------------
-- The published catalogue bucket
-- --------------------------------------------------------------------------
-- Readable by anyone, writable by nobody through the API. Curated images are
-- deployed out of band and approved community photos are copied in by the
-- moderation flow, which runs with the service role. There is deliberately no
-- insert, update or delete policy for `authenticated`: a user who could write
-- here could publish an image the moderation queue never saw.

create policy "recipe-images: anyone may read"
  on storage.objects for select
  using (bucket_id = 'recipe-images');

comment on table storage.objects is
  'Ownership is by path: user-writable objects live under <uid>/… and the '
  'policies compare the first segment to auth.uid(). recipe-images has read '
  'policies only — writing there would bypass moderation.';
