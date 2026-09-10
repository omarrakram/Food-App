-- ---------------------------------------------------------------------------
-- Akla — recipes
--
-- Curated recipes are public reference data. AI-generated and user recipes are
-- owned rows (`created_by`), private unless explicitly published. The split is
-- enforced by RLS in 20260910120700_row_level_security.sql.
-- ---------------------------------------------------------------------------

create table public.recipes (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique,
  title          text not null,
  description    text not null default '',
  image_url      text,
  source         public.recipe_source not null default 'curated',
  cuisine        public.cuisine,
  difficulty     public.difficulty not null default 'easy',
  prep_minutes   smallint not null default 0,
  cook_minutes   smallint not null default 0,
  -- Servings the quantities in recipe_ingredients are written for.
  base_servings  smallint not null default 2,

  -- Nutrition is per serving and nullable: an AI-generated recipe may not
  -- have reliable figures, and showing '—' is better than showing a guess.
  calories       integer,
  protein_g      numeric(6, 1),
  carbs_g        numeric(6, 1),
  fat_g          numeric(6, 1),
  fiber_g        numeric(6, 1),

  created_by     uuid references public.profiles (id) on delete cascade,
  is_public      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint recipes_title_length check (char_length(title) between 1 and 200),
  constraint recipes_description_length check (char_length(description) <= 2000),
  constraint recipes_prep_range check (prep_minutes between 0 and 1440),
  constraint recipes_cook_range check (cook_minutes between 0 and 1440),
  constraint recipes_servings_range check (base_servings between 1 and 50),
  constraint recipes_calories_range check (calories is null or calories between 0 and 20000),
  -- Curated recipes are public and unowned; owned recipes must have an owner.
  constraint recipes_ownership check (
    (source = 'curated' and created_by is null)
    or (source <> 'curated' and created_by is not null)
  )
);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create index recipes_public_idx on public.recipes (is_public) where is_public;
create index recipes_created_by_idx on public.recipes (created_by);
create index recipes_cuisine_idx on public.recipes (cuisine);
create index recipes_difficulty_idx on public.recipes (difficulty);
-- Discover feeds and "quick meals" filter on total time constantly.
create index recipes_total_time_idx on public.recipes ((prep_minutes + cook_minutes));

-- ---------------------------------------------------------------------------
-- Recipe facets. Separate tables (not arrays) so they can be joined and
-- indexed — allergen filtering in particular must be an index scan.
-- ---------------------------------------------------------------------------

create table public.recipe_meal_types (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  meal_type public.meal_type not null,
  primary key (recipe_id, meal_type)
);
create index recipe_meal_types_meal_idx on public.recipe_meal_types (meal_type);

create table public.recipe_diet_tags (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  diet      public.dietary_preference not null,
  primary key (recipe_id, diet)
);
create index recipe_diet_tags_diet_idx on public.recipe_diet_tags (diet);

-- SAFETY-CRITICAL: drives the hard allergen exclusion.
create table public.recipe_allergens (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  allergen  public.allergen not null,
  primary key (recipe_id, allergen)
);
create index recipe_allergens_allergen_idx on public.recipe_allergens (allergen);

create table public.recipe_appliances (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  appliance public.appliance not null,
  primary key (recipe_id, appliance)
);

-- Free-form tags backing the Discover collections.
create table public.recipe_tags (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  tag       text not null,
  primary key (recipe_id, tag),
  constraint recipe_tags_format check (tag ~ '^[a-z0-9-]+$')
);
create index recipe_tags_tag_idx on public.recipe_tags (tag);

-- ---------------------------------------------------------------------------

create table public.recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes (id) on delete cascade,
  -- Null when the model proposed an ingredient we have not canonicalised.
  ingredient_id uuid references public.ingredients (id) on delete set null,
  name          text not null,
  quantity      numeric(10, 2),
  unit          public.measurement_unit,
  preparation   text,
  -- Optional ingredients do not count toward the match percentage and are not
  -- added to the shopping list by default.
  is_optional   boolean not null default false,
  sort_order    smallint not null default 0,

  constraint recipe_ingredients_name_length check (char_length(name) between 1 and 120),
  constraint recipe_ingredients_quantity_positive check (quantity is null or quantity >= 0),
  constraint recipe_ingredients_preparation_length check (
    preparation is null or char_length(preparation) <= 200
  )
);

create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, sort_order);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

-- ---------------------------------------------------------------------------

create table public.recipe_steps (
  id               uuid primary key default gen_random_uuid(),
  recipe_id        uuid not null references public.recipes (id) on delete cascade,
  step_number      smallint not null,
  instruction      text not null,
  -- Already modelled so cooking timers are a UI-only addition later.
  duration_minutes smallint,
  -- Temperature / handling guidance shown inline in cooking mode.
  safety_note      text,
  -- Ingredient names relevant to this step, surfaced beside the instruction.
  ingredient_refs  text[] not null default '{}',

  unique (recipe_id, step_number),
  constraint recipe_steps_instruction_length check (char_length(instruction) between 1 and 2000),
  constraint recipe_steps_number_positive check (step_number > 0),
  constraint recipe_steps_duration_range check (
    duration_minutes is null or duration_minutes between 0 and 1440
  )
);

create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, step_number);
