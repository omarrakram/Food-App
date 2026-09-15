-- ---------------------------------------------------------------------------
-- Akla — who may look at a community recipe's photograph
--
-- `20260913100000_storage_buckets.sql` left a note saying approval would COPY
-- the photo into the public catalogue bucket. Building the moderation flow
-- showed that to be the wrong design, so this replaces it rather than
-- implementing it.
--
-- Three problems with copying:
--
--   1. It needs the Storage API, so approval stops being a database function
--      and becomes a function plus an edge function plus a failure mode where
--      one succeeded and the other did not.
--   2. Unpublishing a recipe would leave the copy sitting in a public bucket.
--      That is exactly the case the whole moderation path exists for — a
--      recipe taken down for unsafe instructions whose photograph is still
--      served.
--   3. Two objects for one photograph means two places to delete it from when
--      someone deletes their account.
--
-- So the file never moves, and readability is DERIVED from the recipe's state:
-- a photo is public exactly while the recipe that references it is public.
-- Unpublishing takes the photograph down in the same statement, with no second
-- system to keep in step.
--
-- This depends on `recipes.image_url` holding the object's storage path for
-- user-submitted recipes, which is what `objectPath()` produces and what the
-- submit form writes.
-- ---------------------------------------------------------------------------

-- Anyone, including a signed-out visitor reading a shared link: a published
-- recipe's photograph is as public as the recipe.
create policy "recipe-uploads: read when the recipe is published"
  on storage.objects for select
  using (
    bucket_id = 'recipe-uploads'
    and exists (
      select 1 from public.recipes r
      where r.is_public and r.image_url = storage.objects.name
    )
  );

-- A moderator has to see the photograph to judge the submission, and a
-- submission is private until they approve it. Scoped to recipes that have
-- actually been submitted — the same scope as the recipe read policy, so a
-- moderator cannot browse private uploads nobody has sent for review.
create policy "recipe-uploads: moderators read submitted"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recipe-uploads'
    and public.is_moderator()
    and exists (
      select 1
        from public.recipes r
        join public.recipe_submissions s on s.recipe_id = r.id
       where r.image_url = storage.objects.name
         and s.status <> 'draft'
    )
  );

-- On the policy "recipe-uploads: read when the recipe is published":
-- the photograph is public exactly while its recipe is. Unpublishing takes
-- both down in one statement — there is no copy in another bucket to forget.
--
-- Also a plain comment rather than `comment on policy … on storage.objects`,
-- for the same reason as in `20260913100000_storage_buckets.sql`: commenting
-- on a policy requires ownership of the table it is attached to, and nobody
-- but `supabase_storage_admin` owns `storage.objects` on a hosted project.
-- This one had not been reached yet — it would have failed the push the
-- moment the first was fixed.
