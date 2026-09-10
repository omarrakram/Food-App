-- ---------------------------------------------------------------------------
-- Akla — enums and extensions
--
-- These enum types mirror the unions in `src/types/domain.ts`. Changing one
-- without the other is a bug; the app treats an unknown enum value as invalid
-- input rather than trusting it.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- trigram search on ingredient names

-- --- User preference vocabulary --------------------------------------------

create type public.dietary_preference as enum (
  'none', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'keto', 'other'
);

create type public.allergen as enum (
  'nuts', 'peanuts', 'dairy', 'eggs', 'gluten', 'shellfish', 'fish', 'soy', 'sesame'
);

create type public.user_goal as enum (
  'cheaper', 'healthier', 'high_protein', 'lose_weight', 'gain_muscle',
  'cook_faster', 'good_food'
);

create type public.skill_level as enum ('beginner', 'intermediate', 'advanced');

create type public.appliance as enum (
  'stove', 'oven', 'air_fryer', 'microwave', 'grill', 'blender', 'kettle', 'other'
);

create type public.cuisine as enum (
  'egyptian', 'levantine', 'italian', 'asian', 'indian', 'mexican',
  'american', 'mediterranean', 'turkish'
);

-- --- Recipe vocabulary ------------------------------------------------------

create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack', 'dessert');

create type public.difficulty as enum ('easy', 'medium', 'hard');

create type public.recipe_source as enum ('curated', 'ai_generated', 'user');

create type public.history_kind as enum ('viewed', 'cooked', 'disliked');

-- --- Ingredient vocabulary --------------------------------------------------

create type public.ingredient_category as enum (
  'protein', 'vegetables', 'fruit', 'dairy', 'carbs', 'spices',
  'sauces', 'frozen', 'bakery', 'pantry', 'other'
);

create type public.measurement_unit as enum (
  'g', 'kg', 'ml', 'l', 'piece', 'clove', 'slice', 'bunch', 'can', 'pack',
  'tbsp', 'tsp', 'cup', 'pinch', 'to_taste'
);

-- --- Commerce ---------------------------------------------------------------

-- The distinction the whole pricing UX rests on. A row tagged 'estimate' may
-- never be presented to a user as a store price.
create type public.price_source as enum ('estimate', 'live');

create type public.availability_status as enum (
  'in_stock', 'low_stock', 'out_of_stock', 'unknown'
);

-- --- Shared helpers ---------------------------------------------------------

-- Keeps `updated_at` honest without every writer having to remember it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
