-- ---------------------------------------------------------------------------
-- Akla — ingredient catalogue
--
-- Reference data: readable by every authenticated user, writable only by the
-- service role (seeds and admin jobs). `slug` is the natural key shared with
-- the bundled TypeScript catalogue in src/features/ingredients/catalogue.ts.
-- ---------------------------------------------------------------------------

create table public.ingredients (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  name_ar           text,
  category          public.ingredient_category not null default 'other',
  default_unit      public.measurement_unit not null default 'g',
  -- Grams in one `piece`. Null when the ingredient is not countable; the
  -- pricing engine falls back to a per-unit quote in that case.
  grams_per_piece   numeric(10, 2),
  -- Assumed present in most kitchens unless the user says otherwise.
  is_common_staple  boolean not null default false,
  -- Spoils quickly; expiry dates are enforced strictly for these.
  is_perishable     boolean not null default false,
  image_url         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint ingredients_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint ingredients_name_length check (char_length(name) between 1 and 120),
  constraint ingredients_grams_positive check (grams_per_piece is null or grams_per_piece > 0)
);

create trigger ingredients_set_updated_at
  before update on public.ingredients
  for each row execute function public.set_updated_at();

create index ingredients_category_idx on public.ingredients (category);
create index ingredients_staple_idx on public.ingredients (is_common_staple) where is_common_staple;
-- Trigram index powers server-side autocomplete once the catalogue outgrows
-- the bundled copy.
create index ingredients_name_trgm_idx on public.ingredients using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------

-- Allergens inherent to an ingredient (milk -> dairy). Recipe-level allergens
-- are derived from these plus any explicitly declared on the recipe.
create table public.ingredient_allergens (
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  allergen      public.allergen not null,
  primary key (ingredient_id, allergen)
);

create index ingredient_allergens_allergen_idx on public.ingredient_allergens (allergen);

-- ---------------------------------------------------------------------------

-- Alternative spellings, transliterations and regional names. This is what
-- lets "firakh", "فراخ" and "chicken" all resolve to the same ingredient.
create table public.ingredient_aliases (
  id            uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  alias         text not null,
  locale        text,
  created_at    timestamptz not null default now(),

  constraint ingredient_aliases_alias_length check (char_length(alias) between 1 and 120)
);

create unique index ingredient_aliases_unique_idx
  on public.ingredient_aliases (ingredient_id, lower(alias));
create index ingredient_aliases_lookup_idx on public.ingredient_aliases (lower(alias));
create index ingredient_aliases_trgm_idx
  on public.ingredient_aliases using gin (alias gin_trgm_ops);
