-- PRODUCT-LEVEL DIETARY COMPATIBILITY
--
-- A canonical ingredient and a packaged SKU are not the same question.
-- `tomatoes` is vegan; a particular tin of them may carry a flavouring that is
-- not. `bread` is vegetarian; a bakery's loaf may be brushed with an animal
-- fat nobody would guess from the name. Only the merchant can answer for the
-- product, so this table stores what they SAID and nothing we inferred.
--
-- THREE STATES, and the third is why this is a table rather than a boolean:
--
--   row present, is_compatible true    the merchant says it is fine
--   row present, is_compatible false   the merchant says it is not
--   NO ROW                             they did not say
--
-- No row is UNKNOWN, and unknown is not compatible — it is unlabelled. The
-- sourcing engine refuses to auto-select an unlabelled product for a cook who
-- keeps that diet, exactly as it already does for unpublished allergens.
--
-- NOT APPLIED TO HOSTED SUPABASE.

-- No `diet_compatibility` enum. One was written here and never used — the
-- column below is a boolean, which is what a two-valued verdict is, and the
-- third state is the ABSENCE of a row rather than a third value. An enum would
-- have been a second way to say the same thing, and dead schema outlives
-- whoever wrote it. The TypeScript side keeps its string union
-- (`DietCompatibility`) because a union reads better at a call site than
-- `true`; the mapping happens where the row is read, as it does for every
-- other boolean column here.
create table public.merchant_product_diets (
  merchant_product_id uuid not null references public.merchant_products (id) on delete cascade,
  -- Reuses `public.dietary_preference`, the SAME enum the app's recipes and
  -- user preferences use. A commerce-only copy would drift the first time a
  -- diet was added, and a product's diet and a user's diet must be the same
  -- word for the comparison to mean anything.
  diet                public.dietary_preference not null,
  is_compatible       boolean not null,
  -- Where the claim came from: a pack photograph, a supplier feed, a
  -- certificate. Free text, because it is evidence for a human, not a key.
  source_note         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (merchant_product_id, diet),
  -- `none` and `other` are not claims a product can satisfy or violate, so
  -- they must never appear here. Without this a row saying "this tin is
  -- compatible with none" type-checks and means nothing.
  constraint merchant_product_diets_real_diet check (diet not in ('none', 'other'))
);

create index merchant_product_diets_diet_idx
  on public.merchant_product_diets (diet);

create trigger merchant_product_diets_set_updated_at
  before update on public.merchant_product_diets
  for each row execute function public.set_updated_at();

alter table public.merchant_product_diets enable row level security;

-- Same visibility rule as the allergen table: readable only through a merchant
-- the platform has enabled, and never writable from a client. A dietary claim
-- a customer could edit is not a claim.
-- Exactly the shape of `merchant_product_allergens`' policy, join included:
-- a product belongs to a LOCATION and the location to the merchant. Writing a
-- near-copy that differs is how two tables end up with two visibility rules
-- nobody meant.
create policy "merchant_product_diets: read via enabled merchant"
  on public.merchant_product_diets for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchant_products mp
      join public.merchant_locations ml on ml.id = mp.merchant_location_id
      join public.merchants m on m.id = ml.merchant_id
      where mp.id = merchant_product_id and m.is_enabled
    )
  );
