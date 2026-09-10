-- ---------------------------------------------------------------------------
-- Akla — profiles and preferences
--
-- One row per user in `profiles`, created automatically by a trigger on
-- auth.users. Multi-valued preferences (allergens, cuisines, appliances,
-- dislikes) are separate tables rather than arrays so they can be indexed,
-- constrained by enum, and joined against recipes.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  country       text not null default 'EG',
  city          text,
  locale        text not null default 'en',
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 80
  ),
  constraint profiles_country_format check (country ~ '^[A-Z]{2}$'),
  constraint profiles_city_length check (city is null or char_length(city) <= 120)
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is
  'Public-facing user record. Never stores an email — that lives in auth.users.';

-- ---------------------------------------------------------------------------

create table public.user_preferences (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  household_size          smallint not null default 2,
  dietary_preference      public.dietary_preference not null default 'none',
  primary_goal            public.user_goal not null default 'good_food',
  skill_level             public.skill_level not null default 'intermediate',
  currency                text not null default 'EGP',
  daily_calorie_target    integer,
  daily_protein_target    integer,
  typical_budget_minor    integer,
  -- When false, no interaction signal is recorded for this user at all.
  personalisation_enabled boolean not null default true,
  onboarding_completed    boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint user_preferences_household_range check (household_size between 1 and 20),
  constraint user_preferences_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint user_preferences_calorie_range check (
    daily_calorie_target is null or daily_calorie_target between 800 and 8000
  ),
  constraint user_preferences_protein_range check (
    daily_protein_target is null or daily_protein_target between 10 and 500
  ),
  constraint user_preferences_budget_positive check (
    typical_budget_minor is null or typical_budget_minor >= 0
  )
);

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Multi-valued preferences.
-- ---------------------------------------------------------------------------

-- SAFETY-CRITICAL: rows here are hard exclusions applied to every suggestion.
create table public.user_allergens (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  allergen   public.allergen not null,
  created_at timestamptz not null default now(),
  primary key (user_id, allergen)
);

comment on table public.user_allergens is
  'Hard constraints. A recipe containing any of these is removed from results, never ranked down.';

create table public.user_cuisines (
  user_id uuid not null references public.profiles (id) on delete cascade,
  cuisine public.cuisine not null,
  primary key (user_id, cuisine)
);

create table public.user_appliances (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  appliance public.appliance not null,
  primary key (user_id, appliance)
);

-- Soft preference. Free text because users dislike things we have never
-- catalogued; `ingredient_id` is filled in when we can resolve it.
create table public.user_disliked_ingredients (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  ingredient_name text not null,
  ingredient_id   uuid,
  created_at      timestamptz not null default now(),
  primary key (user_id, ingredient_name),

  constraint user_disliked_name_length check (char_length(ingredient_name) between 1 and 80)
);
