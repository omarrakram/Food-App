-- ---------------------------------------------------------------------------
-- Akla — Row Level Security
--
-- The client ships with the anon key, so RLS is the ONLY thing standing
-- between one user's data and another's. Rules applied here:
--
--   * RLS is enabled on every table in `public`, with no exceptions.
--   * User-owned tables: policies assert auth.uid() = user_id for all four
--     verbs. There is no permissive "read all" anywhere.
--   * Reference tables (ingredients, curated recipes, price estimates):
--     readable by authenticated users, writable by nobody through the anon
--     key. Seeds and admin jobs use the service role, which bypasses RLS.
--   * Child tables are guarded through their parent (a shopping list item is
--     visible iff its list is), so a forged parent id cannot leak rows.
-- ---------------------------------------------------------------------------

-- === Identity ==============================================================

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: delete own"
  on public.profiles for delete
  using (auth.uid() = id);

-- === Preferences ===========================================================

alter table public.user_preferences enable row level security;

create policy "user_preferences: own rows"
  on public.user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.user_allergens enable row level security;

create policy "user_allergens: own rows"
  on public.user_allergens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.user_cuisines enable row level security;

create policy "user_cuisines: own rows"
  on public.user_cuisines for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.user_appliances enable row level security;

create policy "user_appliances: own rows"
  on public.user_appliances for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.user_disliked_ingredients enable row level security;

create policy "user_disliked_ingredients: own rows"
  on public.user_disliked_ingredients for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- === Ingredient catalogue (reference data) =================================
-- Readable by any signed-in user. No insert/update/delete policy exists, so
-- the anon key cannot write regardless of what the client sends.

alter table public.ingredients enable row level security;

create policy "ingredients: read for authenticated"
  on public.ingredients for select
  to authenticated
  using (true);

alter table public.ingredient_allergens enable row level security;

create policy "ingredient_allergens: read for authenticated"
  on public.ingredient_allergens for select
  to authenticated
  using (true);

alter table public.ingredient_aliases enable row level security;

create policy "ingredient_aliases: read for authenticated"
  on public.ingredient_aliases for select
  to authenticated
  using (true);

-- === Recipes ===============================================================
-- A recipe is visible if it is public (curated or published) or owned by the
-- caller. Writes are restricted to rows the caller owns; curated rows have
-- created_by = null and therefore match no write policy.

alter table public.recipes enable row level security;

create policy "recipes: read public or own"
  on public.recipes for select
  to authenticated
  using (is_public or created_by = auth.uid());

create policy "recipes: insert own"
  on public.recipes for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "recipes: update own"
  on public.recipes for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "recipes: delete own"
  on public.recipes for delete
  to authenticated
  using (created_by = auth.uid());

-- Recipe children inherit visibility from the parent recipe. Written as a
-- helper so the eight child tables cannot drift apart.
create or replace function public.can_read_recipe(target uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = target and (r.is_public or r.created_by = auth.uid())
  );
$$;

create or replace function public.owns_recipe(target uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = target and r.created_by = auth.uid()
  );
$$;

create policy "recipe_meal_types: read via recipe"
  on public.recipe_meal_types for select to authenticated
  using (public.can_read_recipe(recipe_id));
create policy "recipe_meal_types: write own recipe"
  on public.recipe_meal_types for all to authenticated
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

create policy "recipe_diet_tags: read via recipe"
  on public.recipe_diet_tags for select to authenticated
  using (public.can_read_recipe(recipe_id));
create policy "recipe_diet_tags: write own recipe"
  on public.recipe_diet_tags for all to authenticated
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

create policy "recipe_allergens: read via recipe"
  on public.recipe_allergens for select to authenticated
  using (public.can_read_recipe(recipe_id));
create policy "recipe_allergens: write own recipe"
  on public.recipe_allergens for all to authenticated
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

create policy "recipe_appliances: read via recipe"
  on public.recipe_appliances for select to authenticated
  using (public.can_read_recipe(recipe_id));
create policy "recipe_appliances: write own recipe"
  on public.recipe_appliances for all to authenticated
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

create policy "recipe_tags: read via recipe"
  on public.recipe_tags for select to authenticated
  using (public.can_read_recipe(recipe_id));
create policy "recipe_tags: write own recipe"
  on public.recipe_tags for all to authenticated
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

alter table public.recipe_meal_types enable row level security;
alter table public.recipe_diet_tags enable row level security;
alter table public.recipe_allergens enable row level security;
alter table public.recipe_appliances enable row level security;
alter table public.recipe_tags enable row level security;

alter table public.recipe_ingredients enable row level security;

create policy "recipe_ingredients: read via recipe"
  on public.recipe_ingredients for select to authenticated
  using (public.can_read_recipe(recipe_id));
create policy "recipe_ingredients: write own recipe"
  on public.recipe_ingredients for all to authenticated
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

alter table public.recipe_steps enable row level security;

create policy "recipe_steps: read via recipe"
  on public.recipe_steps for select to authenticated
  using (public.can_read_recipe(recipe_id));
create policy "recipe_steps: write own recipe"
  on public.recipe_steps for all to authenticated
  using (public.owns_recipe(recipe_id))
  with check (public.owns_recipe(recipe_id));

-- === Pantry ================================================================

alter table public.pantry_items enable row level security;

create policy "pantry_items: own rows"
  on public.pantry_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- === Saved / history =======================================================

alter table public.saved_recipes enable row level security;

create policy "saved_recipes: own rows"
  on public.saved_recipes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.recipe_history enable row level security;

create policy "recipe_history: own rows"
  on public.recipe_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- === Shopping ==============================================================

alter table public.shopping_lists enable row level security;

create policy "shopping_lists: own rows"
  on public.shopping_lists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.shopping_list_items enable row level security;

-- Guarded through the parent list: a forged list_id matches nothing.
create policy "shopping_list_items: via own list"
  on public.shopping_list_items for all
  using (
    exists (
      select 1 from public.shopping_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shopping_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );

-- === Pricing and grocery (reference data) ==================================

alter table public.ingredient_price_estimates enable row level security;

create policy "price_estimates: read for authenticated"
  on public.ingredient_price_estimates for select
  to authenticated
  using (true);

alter table public.grocery_providers enable row level security;

-- Only enabled providers are visible; an unreleased integration stays hidden.
create policy "grocery_providers: read enabled"
  on public.grocery_providers for select
  to authenticated
  using (is_enabled);

alter table public.stores enable row level security;

create policy "stores: read via enabled provider"
  on public.stores for select
  to authenticated
  using (
    exists (
      select 1 from public.grocery_providers p
      where p.id = provider_id and p.is_enabled
    )
  );

alter table public.store_products enable row level security;

create policy "store_products: read via enabled provider"
  on public.store_products for select
  to authenticated
  using (
    exists (
      select 1
      from public.stores s
      join public.grocery_providers p on p.id = s.provider_id
      where s.id = store_id and p.is_enabled
    )
  );

alter table public.store_product_matches enable row level security;

create policy "store_product_matches: read for authenticated"
  on public.store_product_matches for select
  to authenticated
  using (true);

-- === AI usage ==============================================================
-- Users may read their own usage (for a future "AI usage" screen). Writes come
-- exclusively from edge functions using the service role, which bypasses RLS —
-- so a client cannot forge or erase usage records to dodge rate limits.

alter table public.ai_usage_events enable row level security;

create policy "ai_usage_events: read own"
  on public.ai_usage_events for select
  using (auth.uid() = user_id);
