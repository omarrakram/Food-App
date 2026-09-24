-- The merchant side, written as two attackers and one shop having a bad day.
--
--   MERCHANT B, who would like to see, and act on, merchant A's orders.
--   A CUSTOMER, who would like to move their own order along, or answer a
--   substitution on somebody else's.
--   AND THE SHOP ITSELF, which taps ACCEPT twice, runs out of things, and
--   tries to send an order out while a customer is still being asked a
--   question.
--
-- Every financial fact here has to survive the same test: does the history
-- still say what actually happened.

\set ON_ERROR_STOP on
\echo ''
\echo 'Merchant fulfilment: the queue, the transitions and the money'

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
  ('60000000-0000-4000-8000-00000000000a', 'shopper@fulfil.test'),
  ('60000000-0000-4000-8000-00000000000b', 'picker.a@fulfil.test'),
  ('60000000-0000-4000-8000-00000000000c', 'picker.b@fulfil.test');

insert into public.delivery_areas (key, governorate, name_en, name_ar, is_demo)
values ('fulfil-dokki', 'giza', 'Dokki', 'الدقي', true);

-- Two shops, so "merchant B cannot see merchant A" is a real question.
insert into public.merchants (id, slug, name, country, currency, fulfilment_mode,
                              commission_rate_basis_points, merchant_keeps_delivery_fee,
                              is_enabled, is_demo)
values
  ('61000000-0000-4000-8000-000000000001', 'shop-a', 'Shop A', 'EG', 'EGP',
   'dashboard', 1000, true, true, false),
  ('61000000-0000-4000-8000-000000000002', 'shop-b', 'Shop B', 'EG', 'EGP',
   'dashboard', 1000, true, true, false);

insert into public.merchant_locations (id, merchant_id, external_id, name, country,
                                       delivery_fee_minor, minimum_order_minor,
                                       is_accepting_orders)
values
  ('61000000-0000-4000-8000-00000000000a', '61000000-0000-4000-8000-000000000001',
   'a-branch', 'Shop A Dokki', 'EG', 2000, 1000, true),
  ('61000000-0000-4000-8000-00000000000b', '61000000-0000-4000-8000-000000000002',
   'b-branch', 'Shop B Dokki', 'EG', 2000, 1000, true);

insert into public.merchant_location_areas (merchant_location_id, area_key)
values
  ('61000000-0000-4000-8000-00000000000a', 'fulfil-dokki'),
  ('61000000-0000-4000-8000-00000000000b', 'fulfil-dokki');

-- Shop A's shelf. The prices matter: the substitute rules are about money.
insert into public.merchant_products (id, merchant_location_id, external_id, name,
                                      pack_quantity, unit, price_minor, currency,
                                      availability, is_active, allergens_published)
values
  -- The ordered items.
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a',
   'a-rice', 'Rice 1kg', 1, 'kg', 5000, 'EGP', 'in_stock', true, true),
  ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-00000000000a',
   'a-oil', 'Oil 1L', 1, 'l', 4000, 'EGP', 'in_stock', true, true),
  -- A cheaper, safe alternative to the rice.
  ('62000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-00000000000a',
   'a-rice-cheap', 'Rice 1kg (house brand)', 1, 'kg', 4000, 'EGP', 'in_stock', true, true),
  -- Dearer. Must never be offered: we hold a captured amount.
  ('62000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-00000000000a',
   'a-rice-posh', 'Rice 1kg (imported)', 1, 'kg', 9000, 'EGP', 'in_stock', true, true),
  -- Cheap, but it contains gluten and our customer is coeliac.
  ('62000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-00000000000a',
   'a-rice-mix', 'Rice and pasta mix', 1, 'kg', 3000, 'EGP', 'in_stock', true, true),
  -- Cheap and harmless-looking, but the merchant publishes NO allergen data.
  ('62000000-0000-4000-8000-000000000006', '61000000-0000-4000-8000-00000000000a',
   'a-rice-mystery', 'Rice 1kg (unlabelled)', 1, 'kg', 3500, 'EGP', 'in_stock', true, false);

insert into public.merchant_product_allergens (merchant_product_id, allergen)
values ('62000000-0000-4000-8000-000000000005', 'gluten');

-- Shop A's staff, and shop B's.
insert into public.merchant_memberships (merchant_id, user_id, merchant_location_id, role)
values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000b', null, 'admin'),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-00000000000c', null, 'admin');

-- The customer is coeliac. Every substitution decision below is made under
-- that fact.
-- A trigger creates a preferences row with every user, so this updates rather
-- than inserts.
update public.user_preferences set dietary_preference = 'none'
 where user_id = '60000000-0000-4000-8000-00000000000a';
insert into public.user_allergens (user_id, allergen)
values ('60000000-0000-4000-8000-00000000000a', 'gluten');

-- --- A paid order at shop A --------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
values ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000a',
        '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a', 'EGP');
insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
values
  ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', 2, 5000),
  ('63000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000002', 1, 4000);

insert into public.delivery_addresses (
  id, user_id, recipient_name, phone, area_key, street, building, country
) values (
  '64000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-00000000000a',
  'Salma', '+201007778888', 'fulfil-dokki', 'Tahrir St', '4', 'EG'
);

do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
begin
  v_order := public.create_order_draft(
    (select revision from public.carts where id = '63000000-0000-4000-8000-000000000001'),
    '64000000-0000-4000-8000-000000000001', 'fulfil-draft-1', null);

  v_intent := public.begin_payment(v_order, 'card', 'fulfil-pay-1');

  set role postgres;
  perform public.record_payment_event('paymob', 'transaction', 'fulfil-evt-1',
            v_intent.id, 'succeeded', v_intent.amount_minor, 'fulfil-txn-1',
            null, null, '{}'::jsonb);
  set role authenticated;

  perform pg_temp.assert(
    (select fulfilment_state from public.orders where id = v_order) = 'placed',
    'a paid order is placed, and so in the merchant queue');
  perform pg_temp.assert(
    (select captured_minor from public.orders where id = v_order) = 16000,
    'with 14000 of goods and a 2000 delivery fee captured');

  -- The paid basket goes, which is also what frees the one-cart-per-branch
  -- slot for the unpaid draft below.
  perform public.clear_paid_cart(v_order);
end;
$$;

-- --- An unpaid order, which must never appear anywhere -----------------------

insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
values ('63000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-00000000000a',
        '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a', 'EGP');
insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
values ('63000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', 1, 4000);

do $$
begin
  perform public.create_order_draft(
    (select revision from public.carts where id = '63000000-0000-4000-8000-000000000002'),
    '64000000-0000-4000-8000-000000000001', 'fulfil-draft-unpaid', null);
end;
$$;

reset role;

-- --- What shop A sees --------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000b';

do $$
declare
  v_order uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.orders) = 1,
    'the merchant sees exactly the one PAID order');

  select id into v_order from public.orders;
  perform pg_temp.assert(
    (select fulfilment_state from public.orders where id = v_order) = 'placed',
    'and it is the one in the queue');

  -- THE HEADLINE OF THIS PHASE.
  perform pg_temp.assert(
    not exists (select 1 from public.orders where fulfilment_state in ('draft', 'pending')),
    'an unpaid draft NEVER appears in the merchant queue');

  perform pg_temp.assert(
    (select count(*) from public.order_items where order_id = v_order) = 2,
    'the merchant can read what to pick');
  perform pg_temp.assert(
    (select delivery_snapshot->>'street' from public.orders where id = v_order) = 'Tahrir St',
    'and where to take it, from the snapshot frozen at placement');

  -- WHAT THEY MUST NOT HAVE.
  perform pg_temp.assert(
    (select count(*) from public.delivery_addresses) = 0,
    'but not the customer address book');
  perform pg_temp.assert(
    (select count(*) from public.payment_intents) = 0,
    'nor any payment attempt');
  perform pg_temp.assert(
    (select count(*) from public.carts) = 0,
    'nor the customer basket');
end;
$$;

-- --- What shop A cannot do ---------------------------------------------------

do $$
declare
  v_order uuid := (select id from public.orders);
begin
  -- No update policy on `orders`, so these match no rows and change nothing.
  update public.orders set payment_state = 'refunded' where id = v_order;
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'captured',
    'a merchant cannot touch the payment state');

  update public.orders set captured_minor = 1 where id = v_order;
  perform pg_temp.assert(
    (select captured_minor from public.orders where id = v_order) = 16000,
    'nor what the customer paid');

  update public.orders set commission_rate_basis_points = 0 where id = v_order;
  perform pg_temp.assert(
    (select commission_rate_basis_points from public.orders where id = v_order) = 1000,
    'nor AKALT commission');

  update public.orders set fulfilment_state = 'delivered' where id = v_order;
  perform pg_temp.assert(
    (select fulfilment_state from public.orders where id = v_order) = 'placed',
    'nor set a status by writing the column');

  -- AND THE STATE MACHINE. Delivered is five moves away from placed.
  perform pg_temp.assert_rejected(
    format($f$select public.advance_fulfilment(%L, 'delivered')$f$, v_order),
    'an order cannot jump from placed straight to delivered');
  perform pg_temp.assert_rejected(
    format($f$select public.advance_fulfilment(%L, 'picking')$f$, v_order),
    'nor be picked before it is accepted');
end;
$$;

-- --- Shop B, who would like a look -------------------------------------------

set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000c';

do $$
declare
  v_order uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.orders) = 0,
    'merchant B sees none of merchant A orders');

  set role postgres;
  select id into v_order from public.orders where fulfilment_state = 'placed';
  set role authenticated;

  perform pg_temp.assert(
    (select count(*) from public.order_items where order_id = v_order) = 0,
    'nor any of their items, even knowing the id');
  perform pg_temp.assert_rejected(
    format($f$select public.advance_fulfilment(%L, 'accepted')$f$, v_order),
    'and cannot accept an order that is not theirs');
end;
$$;

-- --- The customer, who cannot do the shop's job ------------------------------

set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

do $$
declare
  v_order uuid := (select id from public.orders where fulfilment_state = 'placed');
begin
  perform pg_temp.assert_rejected(
    format($f$select public.advance_fulfilment(%L, 'accepted')$f$, v_order),
    'the customer cannot accept their own order on the shop behalf');
  perform pg_temp.assert_rejected(
    format($f$select public.advance_fulfilment(%L, 'delivered')$f$, v_order),
    'nor mark it delivered');
end;
$$;

reset role;

-- ===========================================================================
-- The shop actually working
-- ===========================================================================

set role authenticated;
set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000b';

-- --- The happy path ----------------------------------------------------------

do $$
declare
  v_order uuid := (select id from public.orders where fulfilment_state = 'placed');
begin
  perform pg_temp.assert(public.advance_fulfilment(v_order, 'accepted') = 'accepted',
    'the shop accepts the order');

  -- TWO PICKERS, ONE BUTTON. Idempotent rather than an error somebody has to
  -- interpret while holding a crate.
  perform pg_temp.assert(public.advance_fulfilment(v_order, 'accepted') = 'accepted',
    'and accepting twice is still one accept');
  perform pg_temp.assert(
    (select count(*) from public.order_events
      where order_id = v_order and to_value = 'accepted') = 1,
    'with one event, not two');

  perform pg_temp.assert(public.advance_fulfilment(v_order, 'picking') = 'picking',
    'picking starts');
  perform pg_temp.assert(public.advance_fulfilment(v_order, 'ready') = 'ready',
    'and with nothing outstanding, the order is ready');

  perform pg_temp.assert(
    public.advance_fulfilment(v_order, 'dispatched', null, 'Ahmed', '+201009998888')
      = 'dispatched',
    'the merchant own rider takes it out');
  perform pg_temp.assert(
    (select rider_name from public.orders where id = v_order) = 'Ahmed',
    'and is named, so the customer knows who is at the door');

  perform pg_temp.assert(public.advance_fulfilment(v_order, 'delivered') = 'delivered',
    'and delivers it');
  perform pg_temp.assert(
    (select delivered_at from public.orders where id = v_order) is not null,
    'with a timestamp');

  -- THE HISTORY IS THE PRODUCT. The customer screen reads these, not an
  -- animation.
  -- Filtered to the MERCHANT'S moves: the payment webhook wrote a
  -- fulfilment event of its own when it released the order to the queue, and
  -- counting that here would make this assertion about the wrong thing.
  perform pg_temp.assert(
    (select count(*) from public.order_events
      where order_id = v_order and kind = 'fulfilment_state' and actor = 'merchant') = 5,
    'and every move left an event: accepted, picking, ready, dispatched, delivered');
  perform pg_temp.assert(
    (select bool_and(actor_id is not null)
       from public.order_events
      where order_id = v_order and kind = 'fulfilment_state' and actor = 'merchant'),
    'each one naming the operator who made it');
end;
$$;

-- --- A shop that cannot fill the order ---------------------------------------

reset role;

do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
  v_pos    record;
begin
  -- A second paid order, for the rejection.
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

  delete from public.carts where user_id = '60000000-0000-4000-8000-00000000000a';
  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values ('63000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-00000000000a',
          '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a', 'EGP');
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values ('63000000-0000-4000-8000-000000000003',
          '62000000-0000-4000-8000-000000000002', 2, 4000);

  v_order := public.create_order_draft(
    (select revision from public.carts where id = '63000000-0000-4000-8000-000000000003'),
    '64000000-0000-4000-8000-000000000001', 'fulfil-draft-2', null);
  v_intent := public.begin_payment(v_order, 'card', 'fulfil-pay-2');

  set role postgres;
  perform public.record_payment_event('paymob', 'transaction', 'fulfil-evt-2',
            v_intent.id, 'succeeded', v_intent.amount_minor, 'fulfil-txn-2',
            null, null, '{}'::jsonb);
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000b';

  perform pg_temp.assert(
    public.advance_fulfilment(v_order, 'rejected', 'shop closed unexpectedly') = 'rejected',
    'a shop that cannot fill an order rejects it');
  perform pg_temp.assert(
    (select rejected_reason from public.orders where id = v_order) = 'shop closed unexpectedly',
    'and says why');

  select * into v_pos from public.order_refund_position(v_order);

  -- THE WHOLE POINT OF §9. Calculated is not paid.
  perform pg_temp.assert(v_pos.captured_minor = 10000,
    'the captured amount is unchanged — history is not rewritten');
  perform pg_temp.assert(v_pos.fulfilled_goods_minor = 0,
    'nothing was fulfilled');
  perform pg_temp.assert(v_pos.amount_due_minor = 0,
    'so nothing is owed');
  perform pg_temp.assert(v_pos.refund_required_minor = 10000,
    'and the whole 10000 is refund REQUIRED');
  perform pg_temp.assert(v_pos.refunded_minor = 0,
    'while nothing has actually been refunded — calculating a refund is not paying one');
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'captured',
    'the payment is still captured, because no refund has been executed');
end;
$$;

-- --- An item the shop has not got --------------------------------------------

reset role;

do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
  v_rice   uuid;
  v_oil    uuid;
  v_sub    uuid;
  v_pos    record;
begin
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

  delete from public.carts where user_id = '60000000-0000-4000-8000-00000000000a';
  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values ('63000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-00000000000a',
          '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a', 'EGP');
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values
    ('63000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000001', 2, 5000),
    ('63000000-0000-4000-8000-000000000004', '62000000-0000-4000-8000-000000000002', 1, 4000);

  v_order := public.create_order_draft(
    (select revision from public.carts where id = '63000000-0000-4000-8000-000000000004'),
    '64000000-0000-4000-8000-000000000001', 'fulfil-draft-3', null);
  v_intent := public.begin_payment(v_order, 'card', 'fulfil-pay-3');

  set role postgres;
  perform public.record_payment_event('paymob', 'transaction', 'fulfil-evt-3',
            v_intent.id, 'succeeded', v_intent.amount_minor, 'fulfil-txn-3',
            null, null, '{}'::jsonb);
  -- "Contact me" is the customer rule for this one.
  update public.orders set substitution_preference = 'contact_me' where id = v_order;
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000b';

  select id into v_rice from public.order_items
   where order_id = v_order and product_name = 'Rice 1kg';
  select id into v_oil from public.order_items
   where order_id = v_order and product_name = 'Oil 1L';

  perform public.advance_fulfilment(v_order, 'accepted');
  perform public.advance_fulfilment(v_order, 'picking');

  -- --- THE UNSAFE SUBSTITUTE, which must never be offered ------------------
  v_sub := public.report_item_unavailable(v_rice, '62000000-0000-4000-8000-000000000005',
             'out of the usual rice');
  perform pg_temp.assert(
    (select decision from public.order_substitutions where id = v_sub) = 'removed',
    'a replacement containing the customer allergen is NEVER offered');
  perform pg_temp.assert(
    (select replacement_product_id from public.order_substitutions where id = v_sub) is null,
    'the line is removed instead, with no replacement recorded');
  perform pg_temp.assert(
    (select count(*) from public.order_items where id = v_rice) = 1,
    'and the original item is still on the order — nothing is hidden by deleting it');

  select * into v_pos from public.order_refund_position(v_order);
  perform pg_temp.assert(v_pos.fulfilled_goods_minor = 4000,
    'the fulfilled goods drop to the oil alone');
  perform pg_temp.assert(v_pos.refund_required_minor = 10000,
    'and the two removed rice bags become a 10000 refund requirement');

  -- --- READY IS BLOCKED while a customer is still being asked --------------
  perform pg_temp.assert(
    public.report_item_unavailable(v_oil, '62000000-0000-4000-8000-000000000003',
      'swapping the oil') is not null,
    'the picker reports the oil too');
  perform pg_temp.assert(
    (select decision from public.order_substitutions where order_item_id = v_oil)
      = 'pending_customer',
    'and because the customer said "contact me", they are asked');

  perform pg_temp.assert_rejected(
    format($f$select public.advance_fulfilment(%L, 'ready')$f$, v_order),
    'READY is refused while a customer is still waiting to be asked');
end;
$$;

-- --- The customer answers ----------------------------------------------------

set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

do $$
declare
  v_order uuid := (select id from public.orders where checkout_idempotency_key = 'fulfil-draft-3');
  v_sub   uuid;
  v_pos   record;
begin
  select id into v_sub from public.order_substitutions
   where order_id = v_order and decision = 'pending_customer';

  perform pg_temp.assert(
    (select replacement_unit_price_minor from public.order_substitutions where id = v_sub) = 4000,
    'the offered replacement costs the same as the line it replaces');

  perform pg_temp.assert(public.decide_substitution(v_sub, true) = 'approved',
    'the customer accepts it');
  -- Idempotent: the second tap of a slow button is not a mistake.
  perform pg_temp.assert(public.decide_substitution(v_sub, false) = 'approved',
    'and answering twice does not change the answer');

  select * into v_pos from public.order_refund_position(v_order);
  perform pg_temp.assert(v_pos.fulfilled_goods_minor = 4000,
    'an equal-priced swap changes nothing about what was fulfilled');
  perform pg_temp.assert(v_pos.refund_required_minor = 10000,
    'and nothing about what is owed back');
end;
$$;

-- --- A cheaper substitute ----------------------------------------------------

reset role;

do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
  v_rice   uuid;
  v_sub    uuid;
  v_pos    record;
begin
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

  delete from public.carts where user_id = '60000000-0000-4000-8000-00000000000a';
  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values ('63000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-00000000000a',
          '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a', 'EGP');
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values ('63000000-0000-4000-8000-000000000005',
          '62000000-0000-4000-8000-000000000001', 2, 5000);

  v_order := public.create_order_draft(
    (select revision from public.carts where id = '63000000-0000-4000-8000-000000000005'),
    '64000000-0000-4000-8000-000000000001', 'fulfil-draft-4', null);
  v_intent := public.begin_payment(v_order, 'card', 'fulfil-pay-4');

  set role postgres;
  perform public.record_payment_event('paymob', 'transaction', 'fulfil-evt-4',
            v_intent.id, 'succeeded', v_intent.amount_minor, 'fulfil-txn-4',
            null, null, '{}'::jsonb);
  -- This customer wants the closest option without being asked.
  update public.orders set substitution_preference = 'best_match' where id = v_order;
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000b';

  select id into v_rice from public.order_items where order_id = v_order;
  perform public.advance_fulfilment(v_order, 'accepted');
  perform public.advance_fulfilment(v_order, 'picking');

  -- --- THE DEARER ONE IS NOT AN OPTION -------------------------------------
  -- We hold a captured amount and there is no flow in this phase that could
  -- raise it, so a more expensive replacement is not "approved with a
  -- surcharge" — it simply is not a replacement.
  v_sub := public.report_item_unavailable(v_rice, '62000000-0000-4000-8000-000000000004',
             'only the imported one left');
  perform pg_temp.assert(
    (select decision from public.order_substitutions where id = v_sub) = 'removed',
    'a replacement that costs MORE is never accepted, even silently');
  perform pg_temp.assert(
    (select captured_minor from public.orders where id = v_order) = 12000,
    'and the captured total is untouched');

  select * into v_pos from public.order_refund_position(v_order);
  perform pg_temp.assert(v_pos.amount_due_minor <= v_pos.captured_minor,
    'what is owed can never exceed what was captured');
end;
$$;

-- --- A cheaper one, accepted automatically -----------------------------------

reset role;

do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
  v_rice   uuid;
  v_sub    uuid;
  v_pos    record;
begin
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

  delete from public.carts where user_id = '60000000-0000-4000-8000-00000000000a';
  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values ('63000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-00000000000a',
          '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a', 'EGP');
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values ('63000000-0000-4000-8000-000000000006',
          '62000000-0000-4000-8000-000000000001', 2, 5000);

  v_order := public.create_order_draft(
    (select revision from public.carts where id = '63000000-0000-4000-8000-000000000006'),
    '64000000-0000-4000-8000-000000000001', 'fulfil-draft-5', null);
  v_intent := public.begin_payment(v_order, 'card', 'fulfil-pay-5');

  set role postgres;
  perform public.record_payment_event('paymob', 'transaction', 'fulfil-evt-5',
            v_intent.id, 'succeeded', v_intent.amount_minor, 'fulfil-txn-5',
            null, null, '{}'::jsonb);
  update public.orders set substitution_preference = 'best_match' where id = v_order;
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000b';

  select id into v_rice from public.order_items where order_id = v_order;
  perform public.advance_fulfilment(v_order, 'accepted');
  perform public.advance_fulfilment(v_order, 'picking');

  v_sub := public.report_item_unavailable(v_rice, '62000000-0000-4000-8000-000000000003',
             'house brand instead');
  perform pg_temp.assert(
    (select decision from public.order_substitutions where id = v_sub) = 'auto_approved',
    'a safe, cheaper replacement is accepted without asking, because that is the customer rule');
  perform pg_temp.assert(
    (select replacement_product_name from public.order_substitutions where id = v_sub)
      = 'Rice 1kg (house brand)',
    'and what arrived instead is on the record');

  select * into v_pos from public.order_refund_position(v_order);
  -- 2 x 5000 ordered, 2 x 4000 supplied.
  perform pg_temp.assert(v_pos.fulfilled_goods_minor = 8000,
    'the fulfilled goods are the cheaper ones');
  perform pg_temp.assert(v_pos.refund_required_minor = 2000,
    'and the 2000 difference is owed back');
  perform pg_temp.assert(v_pos.captured_minor = 12000,
    'while the captured amount still says what was actually paid');

  -- Nothing is outstanding now, so the order can go out.
  perform pg_temp.assert(public.advance_fulfilment(v_order, 'ready') = 'ready',
    'and with every line settled, the order is ready');
end;
$$;

-- --- The unlabelled product --------------------------------------------------
--
-- Its own order, because reopening a rejected one to borrow a line is the kind
-- of test setup that eventually tests the setup.

reset role;

do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
  v_item   uuid;
  v_sub    uuid;
begin
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

  delete from public.carts where user_id = '60000000-0000-4000-8000-00000000000a';
  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values ('63000000-0000-4000-8000-000000000007', '60000000-0000-4000-8000-00000000000a',
          '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a', 'EGP');
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values ('63000000-0000-4000-8000-000000000007',
          '62000000-0000-4000-8000-000000000001', 1, 5000);

  v_order := public.create_order_draft(
    (select revision from public.carts where id = '63000000-0000-4000-8000-000000000007'),
    '64000000-0000-4000-8000-000000000001', 'fulfil-draft-6', null);
  v_intent := public.begin_payment(v_order, 'card', 'fulfil-pay-6');

  set role postgres;
  perform public.record_payment_event('paymob', 'transaction', 'fulfil-evt-6',
            v_intent.id, 'succeeded', v_intent.amount_minor, 'fulfil-txn-6',
            null, null, '{}'::jsonb);
  update public.orders set substitution_preference = 'best_match' where id = v_order;
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000b';

  select id into v_item from public.order_items where order_id = v_order;
  perform public.advance_fulfilment(v_order, 'accepted');
  perform public.advance_fulfilment(v_order, 'picking');

  -- UNKNOWN IS NOT SAFE. This product is cheaper and declares no allergens at
  -- all — which for a coeliac customer is the problem, not the reassurance.
  -- The bundled catalogue has always modelled the difference between "the
  -- merchant declared none" and "the merchant published nothing";
  -- `merchant_products.allergens_published` is what finally lets the DATABASE
  -- tell them apart.
  v_sub := public.report_item_unavailable(
    v_item, '62000000-0000-4000-8000-000000000006', 'unlabelled stock');

  perform pg_temp.assert(
    (select decision from public.order_substitutions where id = v_sub) = 'removed',
    'a product whose allergen data the merchant has not published is never offered to an allergic customer');
  perform pg_temp.assert(
    (select replacement_product_id from public.order_substitutions where id = v_sub) is null,
    'and nothing is recorded as having replaced it');
end;
$$;

-- --- Nobody answered ---------------------------------------------------------
--
-- PICKING MUST NOT HANG. A customer asleep, on a call or simply out must not
-- leave a picker holding a crate — and the fallback has to be the answer that
-- costs us the sale, not the one that keeps it.

reset role;

do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
  v_item   uuid;
  v_sub    uuid;
  v_count  integer;
  v_pos    record;
begin
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000a';

  delete from public.carts where user_id = '60000000-0000-4000-8000-00000000000a';
  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values ('63000000-0000-4000-8000-000000000008', '60000000-0000-4000-8000-00000000000a',
          '61000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-00000000000a', 'EGP');
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values ('63000000-0000-4000-8000-000000000008',
          '62000000-0000-4000-8000-000000000001', 1, 5000);

  v_order := public.create_order_draft(
    (select revision from public.carts where id = '63000000-0000-4000-8000-000000000008'),
    '64000000-0000-4000-8000-000000000001', 'fulfil-draft-7', null);
  v_intent := public.begin_payment(v_order, 'card', 'fulfil-pay-7');

  set role postgres;
  perform public.record_payment_event('paymob', 'transaction', 'fulfil-evt-7',
            v_intent.id, 'succeeded', v_intent.amount_minor, 'fulfil-txn-7',
            null, null, '{}'::jsonb);
  update public.orders set substitution_preference = 'contact_me' where id = v_order;
  set role authenticated;
  set request.jwt.claim.sub = '60000000-0000-4000-8000-00000000000b';

  select id into v_item from public.order_items where order_id = v_order;
  perform public.advance_fulfilment(v_order, 'accepted');
  perform public.advance_fulfilment(v_order, 'picking');

  v_sub := public.report_item_unavailable(
    v_item, '62000000-0000-4000-8000-000000000003', 'asking first');

  perform pg_temp.assert(
    (select decision from public.order_substitutions where id = v_sub) = 'pending_customer',
    'the customer is asked, because that is their rule');
  perform pg_temp.assert(
    (select expires_at from public.order_substitutions where id = v_sub) is not null,
    'and the question carries a deadline');

  -- Age it past the window and let the sweep answer.
  set role postgres;
  update public.order_substitutions set expires_at = now() - interval '1 minute'
   where id = v_sub;
  v_count := public.resolve_expired_substitutions();
  set role authenticated;

  perform pg_temp.assert(v_count >= 1, 'the sweep answers what nobody did');
  perform pg_temp.assert(
    (select decision from public.order_substitutions where id = v_sub) = 'removed',
    'and silence removes the item, never keeps the sale');
  perform pg_temp.assert(
    (select decided_by from public.order_substitutions where id = v_sub) is null,
    'with nobody recorded as having decided it, because nobody did');

  select * into v_pos from public.order_refund_position(v_order);
  perform pg_temp.assert(v_pos.refund_required_minor = 5000,
    'the removed line becomes a refund requirement');

  -- AND THE ORDER CAN MOVE AGAIN.
  perform pg_temp.assert(public.advance_fulfilment(v_order, 'ready') = 'ready',
    'so the shop is no longer stuck');
end;
$$;

reset role;
