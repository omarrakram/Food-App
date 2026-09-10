-- ---------------------------------------------------------------------------
-- Akla — pricing layer and grocery-provider scaffolding
--
-- Two rules encoded here:
--   1. Prices are integers in the currency's minor unit. No floats, ever.
--   2. Every price row declares whether it is an ESTIMATE or a LIVE store
--      price. The app renders the two differently and must never conflate them.
-- ---------------------------------------------------------------------------

create table public.ingredient_price_estimates (
  id                   uuid primary key default gen_random_uuid(),
  ingredient_id        uuid not null references public.ingredients (id) on delete cascade,
  country              text not null,
  currency             text not null,
  -- The unit and quantity the figures below are quoted for, e.g. 1 kg.
  unit                 public.measurement_unit not null,
  quantity             numeric(10, 2) not null default 1,

  estimated_low_minor  integer not null,
  estimated_avg_minor  integer not null,
  estimated_high_minor integer not null,

  -- Where the estimate came from: 'bundled_seed', a survey, a scraper run.
  origin               text not null default 'bundled_seed',
  last_updated         date not null default current_date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (ingredient_id, country, unit, quantity),
  constraint price_estimates_country_format check (country ~ '^[A-Z]{2}$'),
  constraint price_estimates_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint price_estimates_quantity_positive check (quantity > 0),
  constraint price_estimates_non_negative check (
    estimated_low_minor >= 0 and estimated_avg_minor >= 0 and estimated_high_minor >= 0
  ),
  constraint price_estimates_ordered check (
    estimated_low_minor <= estimated_avg_minor
    and estimated_avg_minor <= estimated_high_minor
  )
);

create trigger ingredient_price_estimates_set_updated_at
  before update on public.ingredient_price_estimates
  for each row execute function public.set_updated_at();

create index price_estimates_country_idx on public.ingredient_price_estimates (country);

comment on table public.ingredient_price_estimates is
  'ESTIMATES ONLY. Never render a row from this table without the estimate treatment.';

-- ---------------------------------------------------------------------------
-- Grocery providers.
--
-- No real provider is implemented in V1 and no fake endpoints exist. These
-- tables define the shape a provider integration will populate, and let the
-- mock provider round-trip through the same schema during development.
-- ---------------------------------------------------------------------------

create table public.grocery_providers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  country     text not null,
  -- Enabled only once a commercial agreement and credentials exist.
  is_enabled  boolean not null default false,
  -- 'mock' during development; 'api' | 'affiliate' | 'deeplink' in production.
  integration text not null default 'mock',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint grocery_providers_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint grocery_providers_country_format check (country ~ '^[A-Z]{2}$')
);

create trigger grocery_providers_set_updated_at
  before update on public.grocery_providers
  for each row execute function public.set_updated_at();

create table public.stores (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.grocery_providers (id) on delete cascade,
  -- The provider's own identifier for this store.
  external_id text not null,
  name        text not null,
  country     text not null,
  city        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (provider_id, external_id),
  constraint stores_country_format check (country ~ '^[A-Z]{2}$')
);

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

create table public.store_products (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores (id) on delete cascade,
  external_id   text not null,
  sku           text,
  name          text not null,
  brand         text,
  unit          public.measurement_unit,
  pack_quantity numeric(10, 2),
  -- LIVE price. Distinct from ingredient_price_estimates on purpose.
  price_minor   integer,
  currency      text not null default 'EGP',
  availability  public.availability_status not null default 'unknown',
  image_url     text,
  fetched_at    timestamptz not null default now(),

  unique (store_id, external_id),
  constraint store_products_price_positive check (price_minor is null or price_minor >= 0),
  constraint store_products_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index store_products_store_idx on public.store_products (store_id);
create index store_products_name_trgm_idx on public.store_products using gin (name gin_trgm_ops);

-- Maps a canonical ingredient onto a specific store product. `confidence` is
-- how sure the matcher is; low-confidence matches are shown to the user for
-- confirmation rather than silently substituted.
create table public.store_product_matches (
  id               uuid primary key default gen_random_uuid(),
  ingredient_id    uuid not null references public.ingredients (id) on delete cascade,
  store_product_id uuid not null references public.store_products (id) on delete cascade,
  confidence       numeric(3, 2) not null default 0.5,
  is_verified      boolean not null default false,
  created_at       timestamptz not null default now(),

  unique (ingredient_id, store_product_id),
  constraint store_product_matches_confidence_range check (confidence between 0 and 1)
);

create index store_product_matches_ingredient_idx
  on public.store_product_matches (ingredient_id, confidence desc);
