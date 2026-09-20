-- Allergens a COMMERCIAL VERSION of an ingredient may contain.
--
-- `ingredient_allergens` means "this food intrinsically contains X". Milk is
-- dairy; it cannot not be. That meaning is load-bearing twice over: the app
-- excludes on it, and it decides vegetarian and vegan.
--
-- Generic corn flakes are made of corn, and mainstream Egyptian brands add
-- barley malt. A beef patty is beef, and commercial ones usually contain rusk.
-- Neither is intrinsic. Before this table those two were written into
-- `ingredient_allergens` anyway, because the alternative — saying nothing —
-- risks serving a coeliac user a recipe that makes them ill. That was the
-- right failure direction and the wrong model: it does not scale, because
-- every generic packaged product would inherit it and a coeliac user's
-- catalogue would shrink toward nothing while the reason stayed invisible.
--
-- A SEPARATE TABLE rather than a nullable column or a `certainty` enum on the
-- existing one, so that nothing which currently reads `ingredient_allergens`
-- can accidentally widen its meaning. A reader that does not know about this
-- table keeps behaving exactly as it did.
--
-- HOW IT IS USED, and the asymmetry is the point:
--   * allergy filtering treats it as a HARD exclusion, identical to intrinsic.
--     We do not ask someone with coeliac disease to read the label of an
--     ingredient we already knew was risky.
--   * diet semantics IGNORE it. A patty that may contain rusk is not thereby
--     non-vegetarian.
--   * it is never a recipe's own "contains" declaration.

create table public.ingredient_possible_allergens (
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  allergen      public.allergen not null,
  primary key (ingredient_id, allergen)
);

create index ingredient_possible_allergens_allergen_idx
  on public.ingredient_possible_allergens (allergen);

comment on table public.ingredient_possible_allergens is
  'Allergens a commercial version MAY contain (brand-dependent). Hard-excluded for allergy filtering, ignored by diet semantics, never a recipe''s own declaration. Contrast ingredient_allergens, which is intrinsic.';

-- An allergen cannot be both certain and uncertain for the same ingredient.
-- The two tables would otherwise be able to disagree about what a food IS, and
-- only one of them feeds diet semantics.
create or replace function public.reject_contradictory_allergen()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.ingredient_allergens a
    where a.ingredient_id = new.ingredient_id and a.allergen = new.allergen
  ) then
    raise exception
      'allergen % is already intrinsic for ingredient %', new.allergen, new.ingredient_id;
  end if;
  return new;
end;
$$;

create trigger ingredient_possible_allergens_not_intrinsic
  before insert or update on public.ingredient_possible_allergens
  for each row execute function public.reject_contradictory_allergen();

-- Reference data: readable by any authenticated user, written by nobody
-- through the API. Same posture as `ingredient_allergens`.
alter table public.ingredient_possible_allergens enable row level security;

create policy "ingredient_possible_allergens: read for authenticated"
  on public.ingredient_possible_allergens for select
  to authenticated
  using (true);
