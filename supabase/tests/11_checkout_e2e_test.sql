-- The whole checkout, as the app performs it, against the real catalogue.
--
-- WHY THIS EXISTS AND 10_checkout_test.sql DOES NOT REPLACE IT.
--
-- That suite hand-builds its merchant, its branch and its two products inside
-- the test. It proves the FUNCTION, and it proves it against a shape nobody
-- ships. This one loads `supabase/fixtures/commerce-demo.generated.sql` — the
-- same 31 products, the same ids, the same prices that the app bundles — and
-- then does what the client does, in the client's order, through RLS:
--
--   a cart, written by the customer
--   cart lines, written by the customer
--   an address, written by the customer
--   create_order_draft, called by the customer
--
-- Nothing here uses `set role postgres` to get past a policy. If a step needs
-- a privilege the app does not have, that is the finding.
--
-- It also pins the two things a draft must NOT do: take the basket away, and
-- reach the merchant.

\set ON_ERROR_STOP on
\echo ''
\echo 'Checkout end to end, against the real demo catalogue'

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

-- --- The catalogue, as rows ------------------------------------------------
--
-- The fixture refuses to load unless this is said explicitly and no real
-- merchant exists. Both are true of a throwaway test database.
set akalt.local_fixture = 'yes';
\i supabase/fixtures/commerce-demo.generated.sql

insert into auth.users (id, email)
values ('b0000000-0000-4000-8000-00000000000a', 'layla@e2e.test');

-- Convenience lookups, so the test reads in the merchant's own vocabulary
-- rather than in uuids nobody can check by eye.
create or replace function pg_temp.product(external text) returns uuid
language sql stable as $$
  select id from public.merchant_products where external_id = external;
$$;

create or replace function pg_temp.price(external text) returns integer
language sql stable as $$
  select price_minor from public.merchant_products where external_id = external;
$$;

create or replace function pg_temp.branch() returns uuid
language sql stable as $$
  select id from public.merchant_locations where external_id = 'demo-branch-1';
$$;

create or replace function pg_temp.shop() returns uuid
language sql stable as $$
  select merchant_id from public.merchant_locations where external_id = 'demo-branch-1';
$$;

do $$
begin
  perform pg_temp.assert(pg_temp.product('dm-rice-1000') is not null,
    'the fixture put the demo catalogue in the database');
  perform pg_temp.assert(
    (select is_enabled from public.merchants where id = pg_temp.shop()),
    'and switched the branch on, which only a throwaway database may do');
end;
$$;

-- --- From here on, we are the customer -------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-4000-8000-00000000000a';

-- 1. THE BASKET. Exactly what SupabaseCartRepository writes.
insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
values ('b1000000-0000-4000-8000-000000000001',
        'b0000000-0000-4000-8000-00000000000a',
        pg_temp.shop(), pg_temp.branch(), 'EGP');

insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor,
                               source_ingredient_slug, source_recipe_id)
values
  ('b1000000-0000-4000-8000-000000000001', pg_temp.product('dm-rice-1000'), 2,
   pg_temp.price('dm-rice-1000'), 'rice', null),
  ('b1000000-0000-4000-8000-000000000001', pg_temp.product('dm-pasta-400'), 3,
   pg_temp.price('dm-pasta-400'), 'pasta', null);

-- 2. WHERE IT GOES.
insert into public.delivery_addresses (
  id, user_id, label, recipient_name, phone, area_key, street, building, country
) values (
  'b2000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-00000000000a',
  'Home', 'Layla', '+201001234567', 'demo-maadi', 'Road 9', '12', 'EG'
);

do $$
declare
  v_revision integer;
  v_order    uuid;
  v_row      public.orders%rowtype;
  v_expected integer;
  v_fee      integer;
begin
  select revision into v_revision from public.carts
   where id = 'b1000000-0000-4000-8000-000000000001';

  -- Three lines were written (two inserts, one of them a two-row statement),
  -- so the trigger has moved the revision off its default. The client reads
  -- the same number and hands it back; a stale one is refused.
  perform pg_temp.assert(v_revision > 1, 'writing the basket moved its revision');

  -- 3. THE DRAFT, called exactly as the client calls it: a revision, an
  --    address and an idempotency key. No prices cross this boundary.
  v_order := public.create_order_draft(
    v_revision,
    'b2000000-0000-4000-8000-000000000001',
    'e2e-attempt-1',
    null
  );

  select * into v_row from public.orders where id = v_order;

  -- --- The money -----------------------------------------------------------
  --
  -- Computed here from the CATALOGUE, not from the cart's snapshots and not
  -- from anything the call supplied. If the function ever started trusting the
  -- client's numbers, this is where it would show.
  select sum(mp.price_minor * cl.quantity) into v_expected
    from public.cart_lines cl
    join public.merchant_products mp on mp.id = cl.merchant_product_id
   where cl.cart_id = 'b1000000-0000-4000-8000-000000000001';

  select delivery_fee_minor into v_fee
    from public.merchant_locations where id = pg_temp.branch();

  perform pg_temp.assert(v_row.items_subtotal_minor = v_expected,
    format('the subtotal is the shelf price times the quantity — %s', v_expected));
  perform pg_temp.assert(v_row.items_subtotal_minor = 16200,
    'and is 16200: 2 x 4500 rice + 3 x 2400 pasta');
  perform pg_temp.assert(v_row.delivery_fee_minor = v_fee,
    'the delivery fee comes from the branch row');
  perform pg_temp.assert(
    v_row.commission_rate_basis_points =
      (select commission_rate_basis_points from public.merchants where id = pg_temp.shop()),
    'the commission rate is copied from the merchant as it stands today');

  -- --- What the order IS ---------------------------------------------------
  perform pg_temp.assert(v_row.fulfilment_state = 'draft' and v_row.payment_state = 'unpaid',
    'the order is a draft and unpaid');
  perform pg_temp.assert(
    v_row.payment_method is null and v_row.payment_provider is null,
    'and names no payment path, because nobody has chosen one');
  perform pg_temp.assert(v_row.reference ~ '^AKL-[23456789BCDFGHJKLMNPQRTVWXYZ]{4}-[23456789BCDFGHJKLMNPQRTVWXYZ]{4}$',
    format('the reference is readable and not a counter — %s', v_row.reference));
  perform pg_temp.assert(v_row.cart_revision = v_revision,
    'and records the basket it was built from');

  perform pg_temp.assert(
    (select count(*) from public.order_items where order_id = v_order) = 2,
    'both lines became order items');
  perform pg_temp.assert(
    (select sum(line_total_minor) from public.order_items where order_id = v_order) = v_expected,
    'and their totals add up to the order subtotal');
  perform pg_temp.assert(
    (select bool_and(product_name is not null and pack_unit is not null)
       from public.order_items where order_id = v_order),
    'each item carries the product as it was, not a reference to a row that can change');

  -- --- A DRAFT IS NOT A PURCHASE -------------------------------------------
  perform pg_temp.assert(
    (select count(*) from public.cart_lines
      where cart_id = 'b1000000-0000-4000-8000-000000000001') = 2,
    'the basket is still there: a draft is not a purchase');
  perform pg_temp.assert(
    (select revision from public.carts where id = 'b1000000-0000-4000-8000-000000000001')
      = v_revision,
    'and has not moved, so the draft still describes it');

  -- THE MERCHANT MUST NOT SEE IT. `MERCHANT_VISIBLE_STATES` in
  -- features/commerce/fulfilment-state.ts starts at `placed`; picking an
  -- unpaid basket is the merchant's loss, and the queue is where that is
  -- prevented.
  perform pg_temp.assert(
    v_row.fulfilment_state not in ('placed', 'accepted', 'picking', 'ready',
                                   'dispatched', 'delivered', 'undeliverable'),
    'and the merchant queue has not received it');
  perform pg_temp.assert(v_row.placed_at is null,
    'nothing was placed, and the row says so');

  -- --- A second tap is the same order --------------------------------------
  perform pg_temp.assert(
    public.create_order_draft(v_revision, 'b2000000-0000-4000-8000-000000000001',
                              'e2e-attempt-1', null) = v_order,
    'a retried attempt finds the draft it already made');
  perform pg_temp.assert(
    (select count(*) from public.orders
      where user_id = 'b0000000-0000-4000-8000-00000000000a') = 1,
    'and only one order exists');
end;
$$;

reset role;
