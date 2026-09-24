-- Checkout: addresses, deliverability, and the money.
--
-- Written as an attacker. The interesting questions are not "can Nour create
-- an order" but:
--
--   * can I read somebody else's delivery address?
--   * can I order to an address that is not mine?
--   * can I create a 1,000 EGP order for 10 EGP?
--   * can I create an order at all, without going through the function?
--   * can I order to an area this branch does not serve?
--   * can I order a basket somebody changed under me?
--   * can a double tap bill me twice?
--   * can I write an order that is already paid?
--
-- Every answer must be no, and must be no because of Postgres.

\set ON_ERROR_STOP on
\echo ''
\echo 'Checkout and order drafts'

create or replace function pg_temp.assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice '  ok  %', description;
  else
    raise exception 'FAILED: %', description;
  end if;
end;
$$;

create or replace function pg_temp.assert_rejected(statement text, description text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception
    when others then
      raise notice '  ok  % (rejected: %)', description, sqlerrm;
      return;
  end;
  raise exception 'FAILED: % — statement succeeded but should have been rejected', description;
end;
$$;

-- --- Fixtures --------------------------------------------------------------

insert into auth.users (id, email)
values
  ('a0000000-0000-4000-8000-00000000000a', 'nour@checkout.test'),
  ('a0000000-0000-4000-8000-00000000000b', 'omar@checkout.test');

insert into public.delivery_areas (key, governorate, name_en, name_ar, is_demo)
values
  ('test-maadi',  'cairo', 'Maadi',  'المعادي', true),
  ('test-nasr',   'cairo', 'Nasr City', 'مدينة نصر', true);

insert into public.merchants (id, slug, name, country, currency, fulfilment_mode,
                              commission_rate_basis_points, merchant_keeps_delivery_fee,
                              is_enabled, is_demo)
values ('a1000000-0000-4000-8000-000000000001', 'checkout-mart', 'Checkout Mart',
        'EG', 'EGP', 'dashboard', 1000, true, true, true);

insert into public.merchant_locations (id, merchant_id, external_id, name, country,
                                       delivery_fee_minor, minimum_order_minor,
                                       is_accepting_orders)
values ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'br-1', 'Maadi Branch', 'EG', 2500, 5000, true);

-- Serves Maadi. Deliberately NOT Nasr City.
insert into public.merchant_location_areas (merchant_location_id, area_key)
values ('a2000000-0000-4000-8000-000000000001', 'test-maadi');

insert into public.merchant_products (id, merchant_location_id, external_id,
                                      name, price_minor, availability, is_active)
values
  ('a3000000-0000-4000-8000-000000000001',
   'a2000000-0000-4000-8000-000000000001', 'p-rice', 'Rice 1kg', 4000, 'in_stock', true),
  ('a3000000-0000-4000-8000-000000000002',
   'a2000000-0000-4000-8000-000000000001', 'p-oil', 'Oil 1L', 3000, 'in_stock', true);

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';

-- --------------------------------------------------------------------------
-- Addresses are private, and belong to their owner
-- --------------------------------------------------------------------------

insert into public.delivery_addresses
  (user_id, label, recipient_name, phone, area_key, street, building, country)
values
  ('a0000000-0000-4000-8000-00000000000a', 'Home', 'Nour H', '+201001234567',
   'test-maadi', 'Road 9', '12', 'EG');

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$insert into public.delivery_addresses
           (user_id, recipient_name, phone, area_key, street, building)
         values ('a0000000-0000-4000-8000-00000000000b', 'Not Mine', '+201001234567',
                 'test-maadi', 'Road 9', '12')$sql$,
    'you cannot create an address for somebody else');

  perform pg_temp.assert_rejected(
    $sql$insert into public.delivery_addresses
           (user_id, recipient_name, phone, area_key, street, building)
         values ('a0000000-0000-4000-8000-00000000000a', 'Bad Phone', '01001234567',
                 'test-maadi', 'Road 9', '12')$sql$,
    'a phone that is not E.164 is refused at the database');

  perform pg_temp.assert_rejected(
    $sql$insert into public.delivery_addresses
           (user_id, recipient_name, phone, area_key, street, building)
         values ('a0000000-0000-4000-8000-00000000000a', '   ', '+201001234567',
                 'test-maadi', 'Road 9', '12')$sql$,
    'a blank recipient name is refused');

  perform pg_temp.assert_rejected(
    $sql$insert into public.delivery_addresses
           (user_id, recipient_name, phone, area_key, street, building)
         values ('a0000000-0000-4000-8000-00000000000a', 'Nour H', '+201001234567',
                 'no-such-area', 'Road 9', '12')$sql$,
    'an area that is not in the registry cannot be referenced');
end
$$;

set request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000b';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.delivery_addresses) = 0,
    'nobody else can read your delivery address');
end
$$;

-- --------------------------------------------------------------------------
-- The client cannot write an order at all
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';

do $$
begin
  -- THE ATTACK THIS PHASE CLOSED. The old policy allowed this insert and
  -- constrained only the state columns, so a modified client could name its
  -- own subtotal.
  perform pg_temp.assert_rejected(
    $sql$insert into public.orders
           (reference, user_id, merchant_id, merchant_location_id,
            items_subtotal_minor, commission_rate_basis_points,
            merchant_keeps_delivery_fee, delivery_snapshot, contact_phone)
         values ('AKL-FAKE-0001', 'a0000000-0000-4000-8000-00000000000a',
                 'a1000000-0000-4000-8000-000000000001',
                 'a2000000-0000-4000-8000-000000000001',
                 1000, 0, false, '{}'::jsonb, '+201001234567')$sql$,
    'a client cannot insert an order row directly, at any price');

  perform pg_temp.assert_rejected(
    $sql$insert into public.order_items (order_id, product_name, quantity,
                                         unit_price_minor, line_total_minor)
         values (gen_random_uuid(), 'Free Rice', 1, 0, 0)$sql$,
    'a client cannot insert order items directly');
end
$$;

-- --------------------------------------------------------------------------
-- A real draft, through the function
-- --------------------------------------------------------------------------

insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
values ('a4000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-00000000000a',
        'a1000000-0000-4000-8000-000000000001',
        'a2000000-0000-4000-8000-000000000001', 'EGP');

insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
values
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 2, 4000),
  ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 1, 3000);

do $$
declare
  v_rev   integer;
  v_addr  uuid;
  v_order uuid;
  v_again uuid;
begin
  select revision into v_rev from public.carts
   where id = 'a4000000-0000-4000-8000-000000000001';
  select id into v_addr from public.delivery_addresses
   where user_id = 'a0000000-0000-4000-8000-00000000000a';

  -- A basket somebody changed under you is not the basket you validated.
  perform pg_temp.assert_rejected(
    format($sql$select public.create_order_draft(%s, %L, 'stale-attempt')$sql$,
           v_rev - 1, v_addr),
    'a stale cart revision cannot be ordered');

  v_order := public.create_order_draft(v_rev, v_addr, 'attempt-1');

  perform pg_temp.assert(v_order is not null, 'a draft is created');

  perform pg_temp.assert(
    (select items_subtotal_minor from public.orders where id = v_order) = 11000,
    'the subtotal is computed by the server — 2x4000 + 1x3000 = 11000');

  perform pg_temp.assert(
    (select delivery_fee_minor from public.orders where id = v_order) = 2500,
    'the delivery fee comes from the branch, not the request');

  perform pg_temp.assert(
    (select commission_rate_basis_points from public.orders where id = v_order) = 1000,
    'the commission rate is copied from the merchant row');

  perform pg_temp.assert(
    (select fulfilment_state from public.orders where id = v_order) = 'draft'
    and (select payment_state from public.orders where id = v_order) = 'unpaid',
    'the draft is draft and unpaid');

  perform pg_temp.assert(
    (select payment_method from public.orders where id = v_order) is null
    and (select payment_provider from public.orders where id = v_order) is null,
    'and names no payment method, because it has none');

  perform pg_temp.assert(
    (select count(*) from public.order_items where order_id = v_order) = 2,
    'both items are written');

  perform pg_temp.assert(
    (select reference from public.orders where id = v_order) ~ '^AKL-[2-9BCDFGHJKLMNPQRTVWXYZ]{4}-[2-9BCDFGHJKLMNPQRTVWXYZ]{4}$',
    'the reference is readable, and is not a counter');

  perform pg_temp.assert(
    (select cart_revision from public.orders where id = v_order) = v_rev,
    'the order records the revision it was built from');

  -- IDEMPOTENCY. The same attempt retried finds the same draft.
  v_again := public.create_order_draft(v_rev, v_addr, 'attempt-1');
  perform pg_temp.assert(v_again = v_order,
    'a retried checkout attempt returns the same draft, not a second one');

  perform pg_temp.assert(
    (select count(*) from public.orders
      where user_id = 'a0000000-0000-4000-8000-00000000000a') = 1,
    'and only one order exists');

  -- THE CART SURVIVES. A draft is not a purchase.
  perform pg_temp.assert(
    (select count(*) from public.cart_lines
      where cart_id = 'a4000000-0000-4000-8000-000000000001') = 2,
    'the cart is not cleared by creating a draft');
end
$$;

-- --------------------------------------------------------------------------
-- The refusals
-- --------------------------------------------------------------------------

do $$
declare
  v_rev  integer;
  v_addr uuid;
  v_nasr uuid;
begin
  select revision into v_rev from public.carts
   where id = 'a4000000-0000-4000-8000-000000000001';
  select id into v_addr from public.delivery_addresses
   where user_id = 'a0000000-0000-4000-8000-00000000000a';

  -- An address in an area this branch does not serve.
  insert into public.delivery_addresses
    (user_id, recipient_name, phone, area_key, street, building)
  values ('a0000000-0000-4000-8000-00000000000a', 'Nour H', '+201001234567',
          'test-nasr', 'Street 10', '3')
  returning id into v_nasr;

  perform pg_temp.assert_rejected(
    format($sql$select public.create_order_draft(%s, %L, 'nasr-attempt')$sql$, v_rev, v_nasr),
    'an address outside the branch area cannot be ordered to');

  -- Somebody else's address.
  perform pg_temp.assert_rejected(
    format($sql$select public.create_order_draft(%s, %L, 'foreign-addr')$sql$,
           v_rev, gen_random_uuid()),
    'an address that is not yours cannot be ordered to');
end
$$;

-- A product that goes out of stock after it was added.
--
-- As `postgres`: the catalogue is a service-role write. Run as `authenticated`
-- this UPDATE is silently filtered to zero rows by RLS — no error, no change,
-- and a test that quietly asserts nothing.
set role postgres;
update public.merchant_products set availability = 'out_of_stock'
 where id = 'a3000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';

do $$
declare
  v_rev  integer;
  v_addr uuid;
begin
  select revision into v_rev from public.carts
   where id = 'a4000000-0000-4000-8000-000000000001';
  select id into v_addr from public.delivery_addresses
   where user_id = 'a0000000-0000-4000-8000-00000000000a' and area_key = 'test-maadi';

  perform pg_temp.assert_rejected(
    format($sql$select public.create_order_draft(%s, %L, 'oos-attempt')$sql$, v_rev, v_addr),
    'an out-of-stock line blocks the draft even though the cart still holds it');
end
$$;

set role postgres;
update public.merchant_products set availability = 'in_stock'
 where id = 'a3000000-0000-4000-8000-000000000001';

-- A shelf price that moved after the customer reviewed it.
update public.merchant_products set price_minor = 4500
 where id = 'a3000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';

do $$
declare
  v_rev  integer;
  v_addr uuid;
begin
  select revision into v_rev from public.carts
   where id = 'a4000000-0000-4000-8000-000000000001';
  select id into v_addr from public.delivery_addresses
   where user_id = 'a0000000-0000-4000-8000-00000000000a' and area_key = 'test-maadi';

  perform pg_temp.assert_rejected(
    format($sql$select public.create_order_draft(%s, %L, 'price-attempt')$sql$, v_rev, v_addr),
    'a price that moved since the cart snapshot blocks the draft');
end
$$;

set role postgres;
update public.merchant_products set price_minor = 4000
 where id = 'a3000000-0000-4000-8000-000000000001';

-- A branch that stops accepting orders.
update public.merchant_locations set is_accepting_orders = false
 where id = 'a2000000-0000-4000-8000-000000000001';
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-4000-8000-00000000000a';

do $$
declare
  v_rev  integer;
  v_addr uuid;
begin
  select revision into v_rev from public.carts
   where id = 'a4000000-0000-4000-8000-000000000001';
  select id into v_addr from public.delivery_addresses
   where user_id = 'a0000000-0000-4000-8000-00000000000a' and area_key = 'test-maadi';

  perform pg_temp.assert_rejected(
    format($sql$select public.create_order_draft(%s, %L, 'closed-attempt')$sql$, v_rev, v_addr),
    'a branch that is not accepting orders blocks the draft');
end
$$;

-- --------------------------------------------------------------------------
-- An order cannot claim to be paid without a payment path
-- --------------------------------------------------------------------------

set role postgres;

do $$
declare
  v_order uuid;
begin
  select id into v_order from public.orders limit 1;

  perform pg_temp.assert_rejected(
    format($sql$update public.orders set payment_state = 'captured' where id = %L$sql$, v_order),
    'an order cannot become captured with no payment method or provider');

  perform pg_temp.assert_rejected(
    format($sql$update public.orders set fulfilment_state = 'placed' where id = %L$sql$, v_order),
    'and cannot reach the merchant queue without one either');
end
$$;

\echo '  checkout tests passed'
