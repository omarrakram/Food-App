-- ---------------------------------------------------------------------------
-- Akla — user-owned collections: pantry, saved recipes, history, shopping list
--
-- Every table here is per-user and protected by RLS. The column shapes match
-- the local (AsyncStorage) representations exactly, so migrating a guest's
-- data on first sign-in is a straight insert.
-- ---------------------------------------------------------------------------

create table public.pantry_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  ingredient_id   uuid references public.ingredients (id) on delete set null,
  -- Denormalised so a pantry row survives an ingredient being recatalogued,
  -- and so users can add things we do not know about.
  ingredient_name text not null,
  category        public.ingredient_category not null default 'other',
  quantity        numeric(10, 2),
  unit            public.measurement_unit,
  -- Date only. FOOD SAFETY: an item past this date is excluded from matching.
  expires_on      date,
  is_staple       boolean not null default false,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint pantry_items_name_length check (char_length(ingredient_name) between 1 and 120),
  constraint pantry_items_quantity_positive check (quantity is null or quantity >= 0),
  constraint pantry_items_note_length check (note is null or char_length(note) <= 500)
);

create trigger pantry_items_set_updated_at
  before update on public.pantry_items
  for each row execute function public.set_updated_at();

-- One row per ingredient per user: adding tomatoes twice updates, not duplicates.
create unique index pantry_items_user_ingredient_idx
  on public.pantry_items (user_id, lower(ingredient_name));
create index pantry_items_user_idx on public.pantry_items (user_id);
-- Powers the "use these soon" nudge without scanning the whole pantry.
create index pantry_items_expiry_idx on public.pantry_items (user_id, expires_on)
  where expires_on is not null;

-- ---------------------------------------------------------------------------

create table public.saved_recipes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  recipe_id  uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),

  unique (user_id, recipe_id)
);

create index saved_recipes_user_idx on public.saved_recipes (user_id, created_at desc);

-- ---------------------------------------------------------------------------

-- Interaction signals. Written ONLY while user_preferences.personalisation_enabled
-- is true; the privacy screen clears this table for the user in one call.
create table public.recipe_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  kind        public.history_kind not null,
  occurred_at timestamptz not null default now(),

  -- Repeat views collapse into a single most-recent row.
  unique (user_id, recipe_id, kind)
);

create index recipe_history_user_kind_idx
  on public.recipe_history (user_id, kind, occurred_at desc);

-- ---------------------------------------------------------------------------

create table public.shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null default 'My list',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shopping_lists_name_length check (char_length(name) between 1 and 120)
);

create trigger shopping_lists_set_updated_at
  before update on public.shopping_lists
  for each row execute function public.set_updated_at();

-- Exactly one default list per user; extra named lists are a future feature.
create unique index shopping_lists_one_default_idx
  on public.shopping_lists (user_id) where is_default;

-- ---------------------------------------------------------------------------

create table public.shopping_list_items (
  id                uuid primary key default gen_random_uuid(),
  list_id           uuid not null references public.shopping_lists (id) on delete cascade,
  ingredient_id     uuid references public.ingredients (id) on delete set null,
  name              text not null,
  quantity          numeric(10, 2),
  unit              public.measurement_unit,
  category          public.ingredient_category not null default 'other',
  is_checked        boolean not null default false,
  -- Which recipes contributed this line, so "why is this here?" is answerable.
  source_recipe_ids uuid[] not null default '{}',

  -- ---- Reserved for grocery-provider integration. All null in V1. ----
  -- Present now so enabling ordering is not a schema migration. See
  -- ARCHITECTURE.md § Grocery provider architecture.
  supermarket_id    uuid,
  store_product_id  uuid,
  sku               text,
  live_price_minor  integer,
  availability      public.availability_status,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint shopping_list_items_name_length check (char_length(name) between 1 and 120),
  constraint shopping_list_items_quantity_positive check (quantity is null or quantity >= 0),
  constraint shopping_list_items_price_positive check (
    live_price_minor is null or live_price_minor >= 0
  )
);

create trigger shopping_list_items_set_updated_at
  before update on public.shopping_list_items
  for each row execute function public.set_updated_at();

-- One line per ingredient per list: adding tomatoes from two recipes merges.
create unique index shopping_list_items_unique_idx
  on public.shopping_list_items (list_id, lower(name));
create index shopping_list_items_list_idx on public.shopping_list_items (list_id, is_checked);
