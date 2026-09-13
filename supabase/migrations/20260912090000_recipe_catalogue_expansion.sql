-- Recipe catalogue expansion: image provenance and ingredient roles.
--
-- Two gaps the 14-recipe catalogue could get away with and a 150-recipe one
-- cannot.
--
-- 1. IMAGE PROVENANCE. A photograph carries obligations — who took it, under
--    what licence, and what has to be displayed. Storing a bare URL loses all
--    of that the moment someone asks. We store a PATH plus its provenance and
--    resolve the URL at render time, so moving buckets is a config change
--    rather than a data migration.
--
-- 2. INGREDIENT ROLES. "Is this recipe cookable right now?" is the product's
--    central question, and it cannot be answered from `is_optional` alone.
--    A garnish and a pinch of salt are both in the dish and neither should
--    stop someone being told they can cook it; a required ingredient should.
--    Those are three different things, so they are three columns.

-- --------------------------------------------------------------------------
-- Image provenance
-- --------------------------------------------------------------------------

create type public.recipe_image_source as enum (
  'generated',       -- rendered by us for this catalogue
  'owned',           -- photographed by or for us
  'openly_licensed', -- public domain or an open licence permitting this use
  'community'        -- uploaded with a user submission
);

alter table public.recipes add column if not exists image_path text;
alter table public.recipes add column if not exists image_source public.recipe_image_source;
alter table public.recipes add column if not exists image_creator text;
alter table public.recipes add column if not exists image_license text;
alter table public.recipes add column if not exists image_attribution text;
alter table public.recipes add column if not exists image_source_url text;

-- A path without a licence is a photograph nobody can prove we may use.
alter table public.recipes
  add constraint recipes_image_licensed
  check (image_path is null or (image_source is not null and image_license is not null));

-- --------------------------------------------------------------------------
-- Ingredient roles
-- --------------------------------------------------------------------------

-- Denormalised from ingredients.slug on purpose: exclusion, requirement and
-- pantry matching all key off the slug, and making every ingredient line a
-- join to answer "does this contain bell pepper?" would put a join in the
-- hottest query in the product.
alter table public.recipe_ingredients add column if not exists slug text;

-- A finishing touch. Never required to consider the dish cookable.
alter table public.recipe_ingredients
  add column if not exists is_garnish boolean not null default false;

-- Salt, oil, pepper. In the dish, but never the reason someone is told they
-- cannot cook it tonight.
alter table public.recipe_ingredients
  add column if not exists is_pantry_staple boolean not null default false;

alter table public.recipe_ingredients add column if not exists notes text;

alter table public.recipe_ingredients
  add constraint recipe_ingredients_notes_length
  check (notes is null or char_length(notes) <= 300);

-- The index that makes "recipes containing X" and "recipes NOT containing X"
-- an index scan rather than a sequential read of every ingredient row. Both
-- directions matter: the exclusion is the safety-critical one.
create index if not exists recipe_ingredients_slug_idx
  on public.recipe_ingredients (slug)
  where slug is not null;

-- --------------------------------------------------------------------------
-- Catalogue-scale indexes
-- --------------------------------------------------------------------------
-- At 14 recipes any query plan was fine. At 150+ — and with community
-- submissions ahead — Discover, search and the cuisine filters all need to
-- stop reading the whole table.

create index if not exists recipes_public_created_idx
  on public.recipes (created_at desc)
  where is_public;

create index if not exists recipes_source_idx on public.recipes (source);

-- Fuzzy title search without a full scan. pg_trgm is already installed by the
-- first migration.
create index if not exists recipes_title_trgm_idx
  on public.recipes using gin (title gin_trgm_ops);

create index if not exists recipes_title_ar_trgm_idx
  on public.recipes using gin (title_ar gin_trgm_ops);

comment on column public.recipe_ingredients.slug is
  'Canonical ingredient slug, denormalised from ingredients.slug so ingredient '
  'inclusion and exclusion are index scans rather than joins.';

comment on column public.recipes.image_path is
  'Path inside the recipe-images bucket. Never a URL: the host is resolved at '
  'render time so storage can move without a migration.';
