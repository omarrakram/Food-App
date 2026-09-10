-- ---------------------------------------------------------------------------
-- Akla — prevent clients from publishing recipes
--
-- Found in the pre-release security review.
--
-- The original `recipes` policies let an owner set `is_public = true` on their
-- own row. The app has no publishing feature, but a crafted client could have
-- used it to push arbitrary content — including unsafe cooking instructions —
-- into every other user's Discover feed, since `is_public` is exactly what the
-- read policy keys on.
--
-- User-authored and AI-generated recipes are now forced private at the policy
-- level. Curated rows are inserted by the service role, which bypasses RLS, so
-- seeding is unaffected. When recipe sharing ships it gets a moderated path,
-- not a boolean the client controls.
-- ---------------------------------------------------------------------------

drop policy if exists "recipes: insert own" on public.recipes;
drop policy if exists "recipes: update own" on public.recipes;

create policy "recipes: insert own private"
  on public.recipes for insert
  to authenticated
  with check (created_by = auth.uid() and is_public = false);

create policy "recipes: update own private"
  on public.recipes for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and is_public = false);

comment on column public.recipes.is_public is
  'Only the service role can set this. Clients are restricted to private rows by RLS.';
