-- COMMERCE-4 — CART → ADDRESS → DELIVERABILITY → REVALIDATION → UNPAID DRAFT
--
-- Everything up to the moment money would move, and not one step past it.
--
-- NOT APPLIED TO HOSTED SUPABASE.

-- ===========================================================================
-- 1. Delivery areas: a canonical identity, not a string somebody typed
-- ===========================================================================
-- `merchant_locations.delivery_areas text[]` held display names — 'Maadi',
-- 'Degla' — and nothing ever read it, which was lucky: deciding whether a
-- branch serves an address by comparing free text is how "Maadi Degla" comes
-- to equal "Degla" and somebody's dinner is promised to the wrong side of the
-- city. It is replaced, not supplemented, so there is one answer.
--
-- The customer PICKS an area from this registry. They type a street, a
-- building and a landmark, and none of that is ever parsed.

create table public.delivery_areas (
  -- Stable, lowercase, hyphenated. This is the identity; the names are labels.
  key         text primary key,
  governorate text not null,
  name_en     text not null,
  name_ar     text not null,
  -- A development-only area, so a demo branch can be given somewhere to serve
  -- without inventing coverage of a real Cairo district.
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint delivery_areas_key_format check (key ~ '^[a-z0-9-]+$')
);

create trigger delivery_areas_set_updated_at
  before update on public.delivery_areas
  for each row execute function public.set_updated_at();

create index delivery_areas_governorate_idx on public.delivery_areas (governorate);

-- Which branch serves which area. A JOIN TABLE rather than an array column so
-- the reference is enforced: an area key that does not exist cannot be
-- declared as covered, and deleting an area in use fails loudly.
create table public.merchant_location_areas (
  merchant_location_id uuid not null
    references public.merchant_locations (id) on delete cascade,
  area_key             text not null
    references public.delivery_areas (key) on delete restrict,
  created_at           timestamptz not null default now(),

  primary key (merchant_location_id, area_key)
);

create index merchant_location_areas_area_idx
  on public.merchant_location_areas (area_key);

alter table public.merchant_locations drop column delivery_areas;

-- ===========================================================================
-- 2. A delivery address somebody could actually deliver to
-- ===========================================================================
-- The original was `line1 / line2 / district / city`, which is a Western
-- postal shape. An Egyptian address is a building, a floor, an apartment and
-- a landmark, and the courier phones ahead. Columns are RENAMED AND DROPPED
-- rather than added alongside, because `district` and `area_key` would be two
-- answers to one question and the wrong one would eventually be read.
--
-- No coordinates. They are not required for V1 and pretending an address is a
-- point is how the landmark — the part that actually finds the door — stops
-- being collected.

alter table public.delivery_addresses rename column line1 to street;

alter table public.delivery_addresses
  drop column line2,
  drop column district,
  drop column city;

alter table public.delivery_addresses
  -- The person at the door is often not the account holder.
  add column recipient_name text not null default '',
  -- E.164, normalised on the way in. The UI accepts what an Egyptian would
  -- type ("0100 123 4567") and stores one canonical form.
  add column phone          text not null default '',
  add column area_key       text references public.delivery_areas (key) on delete restrict,
  add column building       text not null default '',
  add column floor          text,
  add column apartment      text,
  -- Not a nicety here. "Behind the Shell station" is how the address resolves.
  add column landmark       text;

-- The defaults exist only so the columns can be added NOT NULL; a real address
-- must carry real values, which the constraints below require.
alter table public.delivery_addresses
  alter column recipient_name drop default,
  alter column phone drop default,
  alter column building drop default;

alter table public.delivery_addresses
  add constraint delivery_addresses_recipient_present
    check (length(btrim(recipient_name)) > 0),
  add constraint delivery_addresses_street_present
    check (length(btrim(street)) > 0),
  add constraint delivery_addresses_building_present
    check (length(btrim(building)) > 0),
  -- E.164: a leading + and 8–15 digits. Deliberately not Egypt-specific in the
  -- database; the client normalises Egyptian input and the column stores the
  -- canonical result, so a second country needs no migration.
  add constraint delivery_addresses_phone_e164
    check (phone ~ '^\+[1-9][0-9]{7,14}$');

comment on column public.delivery_addresses.area_key is
  'The canonical area the customer SELECTED. Deliverability compares this to '
  'merchant_location_areas — never the free-text street or landmark.';

-- ===========================================================================
-- 3. An unpaid draft has no payment method, and that is not a lie
-- ===========================================================================
-- Both columns were NOT NULL, so a draft could not be written without naming a
-- payment method it does not have. The absence of a method is not a method, so
-- no 'unselected' enum member: NULL is exactly the right shape, and the
-- constraints below say when it stops being allowed.

alter table public.orders alter column payment_method   drop not null;
alter table public.orders alter column payment_provider drop not null;

alter table public.orders
  -- A draft MAY already have a method chosen for the next step — this does not
  -- require NULL while unpaid, it requires a method once money has moved.
  add constraint orders_payment_path_once_not_unpaid check (
    payment_state = 'unpaid'
    or (payment_method is not null and payment_provider is not null)
  ),
  -- And no order reaches a state a merchant can act on without one. `draft`
  -- and `pending` are pre-queue; `cancelled` and `failed` can be reached from
  -- them without a payment path ever existing.
  add constraint orders_fulfilment_path_needs_payment check (
    fulfilment_state in ('draft', 'pending', 'cancelled', 'failed')
    or (payment_method is not null and payment_provider is not null)
  );

-- ===========================================================================
-- 4. Cart revision: the thing validation is ABOUT
-- ===========================================================================
-- Validating cart A and then ordering cart B is the bug this exists to make
-- impossible. Every mutation bumps the revision, by TRIGGER rather than by
-- convention, because a caller that forgets is exactly the caller that
-- introduces the race.

alter table public.carts add column revision integer not null default 1;

create or replace function public.bump_cart_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid := coalesce(new.cart_id, old.cart_id);
begin
  update public.carts
     set revision = revision + 1,
         updated_at = now()
   where id = target;
  return coalesce(new, old);
end;
$$;

-- A trigger function is invoked BY the trigger, never called directly. Left
-- executable it is a `security definer` entry point anybody could call to bump
-- an arbitrary cart's revision — which the platform's own security suite
-- catches, and did.
revoke all on function public.bump_cart_revision() from public, anon, authenticated;

create trigger cart_lines_bump_revision
  after insert or update or delete on public.cart_lines
  for each row execute function public.bump_cart_revision();

-- ===========================================================================
-- 5. The order remembers WHICH cart it came from, and dedupes retries
-- ===========================================================================

alter table public.orders
  add column cart_revision            integer,
  add column checkout_idempotency_key text;

-- One draft per (user, checkout attempt). A retried request finds the row it
-- already created instead of creating a second one. Partial, so historic rows
-- without a key do not collide with each other.
create unique index orders_checkout_idempotency_idx
  on public.orders (user_id, checkout_idempotency_key)
  where checkout_idempotency_key is not null;

-- ===========================================================================
-- 6. Row level security
-- ===========================================================================

alter table public.delivery_areas enable row level security;

-- Readable by anyone who can see the app: the area list is a picker, and it
-- says nothing about any customer. Writable only by the service role.
create policy "delivery_areas: readable" on public.delivery_areas
  for select to authenticated, anon using (true);

alter table public.merchant_location_areas enable row level security;

create policy "merchant_location_areas: read via enabled merchant"
  on public.merchant_location_areas for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchant_locations ml
      join public.merchants m on m.id = ml.merchant_id
      where ml.id = merchant_location_id and m.is_enabled
    )
  );

-- THE CLIENT NO LONGER CREATES ORDERS.
--
-- The policy this replaces allowed an authenticated user to INSERT an order
-- with any `items_subtotal_minor` they liked — it constrained the state
-- columns and nothing else, so a modified client could turn a 1,000 EGP basket
-- into a 10 EGP order. `order_items` had no insert policy at all, so the
-- write could not have produced a complete order anyway.
--
-- `create_order_draft` below is now the only way in, and it derives every
-- figure from the database.
drop policy if exists "orders: owner creates draft" on public.orders;

-- ===========================================================================
-- 6b. The order reference
-- ===========================================================================
-- What somebody reads down a phone line to support. Requirements, and why
-- each one rules something out:
--
--   HUMAN-READABLE       — so it is not the uuid. A uuid cannot be dictated.
--   UNAMBIGUOUS ALOUD    — so the alphabet drops O/0, I/1, S/5 and the vowels.
--                          No vowels also means no reference ever spells a
--                          word, in English or transliterated Arabic.
--   NOT A COUNTER        — a sequence tells a competitor how many orders AKALT
--                          took last week, and tells a customer they were the
--                          fourth. `AKL-7KQ4-M2XR` says nothing.
--   SERVER-GENERATED     — a client that picks its own reference can collide
--                          with one deliberately.
--   UNIQUE IN THE DB     — `orders.reference` is already `not null unique`;
--                          this retries on the vanishingly unlikely collision
--                          rather than letting the insert fail.
--
-- 8 characters from a 27-letter alphabet is ~2.8e11 combinations. The retry
-- loop exists because "unlikely" is not "impossible" and an order that fails
-- to be created is a customer who tries again.

create or replace function public.generate_order_reference()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := '23456789BCDFGHJKLMNPQRTVWXYZ';
  candidate text;
  attempt   integer := 0;
begin
  loop
    candidate := 'AKL-';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    candidate := candidate || '-';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.orders where reference = candidate);

    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'could not allocate an order reference';
    end if;
  end loop;

  return candidate;
end;
$$;

revoke all on function public.generate_order_reference() from public, anon, authenticated;

-- ===========================================================================
-- 7. Order draft creation, server-authoritative
-- ===========================================================================
-- THE CLIENT DOES NOT GET TO SAY WHAT ANYTHING COSTS.
--
-- It passes identifiers: which cart revision it validated, which address, and
-- an idempotency key for the attempt. Every figure on the resulting order —
-- unit prices, line totals, merchandise subtotal, delivery fee, the commission
-- terms — is read here from the catalogue and the merchant row. A modified
-- client can ask for a 1,000 EGP basket; it cannot ask for it at 10 EGP.
--
-- It is also the ONLY writer. The insert policy that used to let a client
-- create an order row directly is dropped above.
--
-- Everything below happens in one statement's transaction: order, items and
-- the opening event are committed together or not at all. There is no state
-- in which half an order exists.

create or replace function public.create_order_draft(
  p_cart_revision    integer,
  p_address_id       uuid,
  p_idempotency_key  text,
  p_customer_note    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       uuid := auth.uid();
  v_cart       public.carts%rowtype;
  v_merchant   public.merchants%rowtype;
  v_location   public.merchant_locations%rowtype;
  v_address    public.delivery_addresses%rowtype;
  v_order_id   uuid;
  v_existing   uuid;
  v_subtotal   integer := 0;
  v_delivery   integer := 0;
  v_reference  text;
  v_line       record;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- IDEMPOTENCY FIRST. A retried request — a double tap, a dropped response,
  -- an app resumed from the background — must find the draft it already made
  -- rather than make a second one. Returned before any other work, so a retry
  -- is also cheap.
  select id into v_existing
    from public.orders
   where user_id = v_user
     and checkout_idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  -- The cart, LOCKED for the rest of the transaction. Without this the
  -- revision could be bumped by another connection between the check below and
  -- the insert, which is the precise race the revision exists to close.
  select * into v_cart
    from public.carts
   where user_id = v_user
   for update;

  if v_cart.id is null then
    raise exception 'cart_empty' using errcode = 'P0002';
  end if;

  -- TIME-OF-CHECK / TIME-OF-USE. The client validated a specific revision; if
  -- the cart has moved since, the validation it is holding describes a
  -- different basket and must be redone.
  if v_cart.revision is distinct from p_cart_revision then
    raise exception 'stale_cart_revision' using errcode = 'P0001';
  end if;

  select * into v_merchant  from public.merchants          where id = v_cart.merchant_id;
  select * into v_location  from public.merchant_locations where id = v_cart.merchant_location_id;

  if not coalesce(v_merchant.is_enabled, false) then
    raise exception 'merchant_not_enabled' using errcode = 'P0001';
  end if;
  if not coalesce(v_location.is_accepting_orders, false) then
    raise exception 'merchant_not_accepting' using errcode = 'P0001';
  end if;

  -- The address must be THIS user's. `security definer` bypasses RLS, so the
  -- ownership check that a policy would normally make is made explicitly here.
  select * into v_address
    from public.delivery_addresses
   where id = p_address_id and user_id = v_user;

  if v_address.id is null then
    raise exception 'address_not_found' using errcode = 'P0002';
  end if;
  if v_address.area_key is null then
    raise exception 'address_incomplete' using errcode = 'P0001';
  end if;

  -- DELIVERABILITY, by key. No string comparison of anything a customer typed.
  if not exists (
    select 1 from public.merchant_location_areas
     where merchant_location_id = v_location.id
       and area_key = v_address.area_key
  ) then
    raise exception 'outside_delivery_area' using errcode = 'P0001';
  end if;

  v_reference := public.generate_order_reference();
  v_delivery  := coalesce(v_location.delivery_fee_minor, 0);

  insert into public.orders (
    reference, user_id, merchant_id, merchant_location_id,
    fulfilment_state, payment_state,
    currency, items_subtotal_minor, delivery_fee_minor,
    commission_rate_basis_points, merchant_keeps_delivery_fee,
    delivery_address_id, delivery_snapshot, contact_phone, customer_note,
    cart_revision, checkout_idempotency_key
  ) values (
    v_reference, v_user, v_cart.merchant_id, v_cart.merchant_location_id,
    'draft', 'unpaid',
    v_cart.currency, 0, v_delivery,
    -- FROM THE MERCHANT ROW, not from the request. Renegotiating a rate must
    -- never restate an order already placed, and a client must never set one.
    v_merchant.commission_rate_basis_points, v_merchant.merchant_keeps_delivery_fee,
    v_address.id,
    -- Denormalised: an address the customer later edits or deletes must not
    -- change where we said we were sending somebody's dinner.
    jsonb_build_object(
      'recipientName', v_address.recipient_name,
      'phone',         v_address.phone,
      'areaKey',       v_address.area_key,
      'street',        v_address.street,
      'building',      v_address.building,
      'floor',         v_address.floor,
      'apartment',     v_address.apartment,
      'landmark',      v_address.landmark,
      'notes',         v_address.notes,
      'country',       v_address.country
    ),
    v_address.phone, p_customer_note,
    v_cart.revision, p_idempotency_key
  )
  returning id into v_order_id;

  -- Items, priced from the CATALOGUE. The cart's snapshot price is deliberately
  -- not used: it is what the customer was last shown, and the revalidation step
  -- is what reconciles the two. By the time this runs they agree, and if they
  -- do not, the shelf wins and the mismatch check below refuses the order.
  for v_line in
    select cl.merchant_product_id,
           cl.quantity,
           cl.unit_price_minor as snapshot_price,
           cl.source_ingredient_slug,
           cl.source_recipe_id,
           mp.name, mp.name_ar, mp.sku, mp.pack_quantity, mp.unit as pack_unit,
           mp.price_minor, mp.availability, mp.is_active
      from public.cart_lines cl
      join public.merchant_products mp on mp.id = cl.merchant_product_id
     where cl.cart_id = v_cart.id
     order by cl.added_at
  loop
    if not v_line.is_active then
      raise exception 'product_delisted' using errcode = 'P0001';
    end if;
    if v_line.availability = 'out_of_stock' then
      raise exception 'product_out_of_stock' using errcode = 'P0001';
    end if;
    -- The customer reviewed a price. If the shelf has moved since the
    -- validation they are holding, they have not agreed to this total.
    if v_line.price_minor is distinct from v_line.snapshot_price then
      raise exception 'price_changed' using errcode = 'P0001';
    end if;

    insert into public.order_items (
      order_id, merchant_product_id, product_name, product_name_ar, sku,
      pack_quantity, pack_unit, quantity, unit_price_minor, line_total_minor,
      source_ingredient_slug, source_recipe_id
    ) values (
      v_order_id, v_line.merchant_product_id, v_line.name, v_line.name_ar,
      v_line.sku, v_line.pack_quantity, v_line.pack_unit, v_line.quantity,
      v_line.price_minor, v_line.price_minor * v_line.quantity,
      v_line.source_ingredient_slug, v_line.source_recipe_id
    );

    v_subtotal := v_subtotal + (v_line.price_minor * v_line.quantity);
  end loop;

  if v_subtotal = 0 then
    raise exception 'cart_empty' using errcode = 'P0002';
  end if;

  -- The branch's floor, against the GOODS. A merchant's minimum is about
  -- whether the basket is worth picking, so their own delivery fee does not
  -- help it clear.
  if v_location.minimum_order_minor is not null
     and v_subtotal < v_location.minimum_order_minor then
    raise exception 'below_minimum' using errcode = 'P0001';
  end if;

  update public.orders
     set items_subtotal_minor = v_subtotal
   where id = v_order_id;

  insert into public.order_events (order_id, kind, actor, note)
  values (v_order_id, 'note', 'customer', 'draft created');

  return v_order_id;
end;
$$;

revoke all on function public.create_order_draft(integer, uuid, text, text)
  from public, anon;
grant execute on function public.create_order_draft(integer, uuid, text, text)
  to authenticated;
