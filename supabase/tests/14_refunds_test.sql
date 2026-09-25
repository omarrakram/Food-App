-- Refunds, written as the four ways an order ends up owing money and the five
-- ways sending it back goes wrong.
--
--   THE SHOP SAYS NO             a rejected order owes the whole capture.
--   AN ITEM IS MISSING           one line removed owes that line.
--   A CHEAPER SUBSTITUTE         the difference, and only the difference.
--   AND THEN ANOTHER ONE         two tranches, sequentially, without either
--                                overwriting the other.
--
-- And on the other side:
--
--   THE PROVIDER REFUSES         the debt stays, and the attempt retries.
--   THE PROVIDER DOES NOT ANSWER automatic retry STOPS. This is the one that
--                                pays somebody twice if it is got wrong.
--   THE CALLBACK ARRIVES TWICE   one increment, not two.
--   A REFUND WE NEVER ASKED FOR  recorded, applied to nothing, flagged.
--   SOMEBODY ELSE ASKS           refused, whoever they are.
--
-- Every assertion about money is made against `orders.refunded_minor`, which
-- only `apply_refund_success` writes.

\set ON_ERROR_STOP on
\echo ''
\echo 'Refunds: the money actually going back'

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
  ('70000000-0000-4000-8000-00000000000a', 'shopper@refund.test'),
  ('70000000-0000-4000-8000-00000000000b', 'picker@refund.test'),
  ('70000000-0000-4000-8000-00000000000c', 'stranger@refund.test'),
  ('70000000-0000-4000-8000-00000000000d', 'ops@refund.test');

-- The AKALT operator. `is_admin()` is the only human authority over refunds.
insert into public.user_roles (user_id, role)
values ('70000000-0000-4000-8000-00000000000d', 'admin');

insert into public.delivery_areas (key, governorate, name_en, name_ar, is_demo)
values ('refund-dokki', 'giza', 'Dokki', 'الدقي', true);

insert into public.merchants (id, slug, name, country, currency, fulfilment_mode,
                              commission_rate_basis_points, merchant_keeps_delivery_fee,
                              is_enabled, is_demo)
values ('71000000-0000-4000-8000-000000000001', 'refund-shop', 'Refund Shop', 'EG', 'EGP',
        'dashboard', 1000, true, true, false);

insert into public.merchant_locations (id, merchant_id, external_id, name, country,
                                       delivery_fee_minor, minimum_order_minor,
                                       is_accepting_orders)
values ('71000000-0000-4000-8000-00000000000a', '71000000-0000-4000-8000-000000000001',
        'refund-branch', 'Refund Shop Dokki', 'EG', 2000, 1000, true);

insert into public.merchant_location_areas (merchant_location_id, area_key)
values ('71000000-0000-4000-8000-00000000000a', 'refund-dokki');

insert into public.merchant_products (id, merchant_location_id, external_id, name,
                                      pack_quantity, unit, price_minor, currency,
                                      availability, is_active, allergens_published)
values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-00000000000a',
   'r-rice', 'Rice 1kg', 1, 'kg', 5000, 'EGP', 'in_stock', true, true),
  ('72000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-00000000000a',
   'r-oil', 'Oil 1L', 1, 'l', 4000, 'EGP', 'in_stock', true, true),
  -- 1000 cheaper than the rice. The substitution tranche is exactly 1000.
  ('72000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-00000000000a',
   'r-rice-house', 'Rice 1kg (house)', 1, 'kg', 4000, 'EGP', 'in_stock', true, true);

insert into public.merchant_memberships (merchant_id, user_id, merchant_location_id, role)
values ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-00000000000b',
        null, 'admin');

insert into public.delivery_addresses (
  id, user_id, recipient_name, phone, area_key, street, building, country
) values (
  '74000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-00000000000a',
  'Salma', '+201007778888', 'refund-dokki', 'Tahrir St', '4', 'EG'
);

-- One helper, so each scenario below is about the refund rather than about
-- rebuilding a paid order. Returns the order id, captured and placed.
create or replace function pg_temp.paid_order(p_tag text, p_rice integer, p_oil integer)
returns uuid language plpgsql as $$
declare
  v_cart   uuid := gen_random_uuid();
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
begin
  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000a', false);

  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values (v_cart, '70000000-0000-4000-8000-00000000000a',
          '71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-00000000000a', 'EGP');

  if p_rice > 0 then
    insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
    values (v_cart, '72000000-0000-4000-8000-000000000001', p_rice, 5000);
  end if;
  if p_oil > 0 then
    insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
    values (v_cart, '72000000-0000-4000-8000-000000000002', p_oil, 4000);
  end if;

  v_order := public.create_order_draft(
    (select revision from public.carts where id = v_cart),
    '74000000-0000-4000-8000-000000000001', 'refund-draft-' || p_tag, null);

  v_intent := public.begin_payment(v_order, 'card', 'refund-pay-' || p_tag);

  set role postgres;
  perform public.record_payment_event('paymob', 'transaction', 'refund-evt-' || p_tag,
            v_intent.id, 'succeeded', v_intent.amount_minor, 'txn-' || p_tag,
            null, null, '{}'::jsonb);

  set role authenticated;
  perform public.clear_paid_cart(v_order);
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);

  return v_order;
end;
$$;

-- ===========================================================================
-- 1. THE SHOP SAYS NO
-- ===========================================================================
-- A rejected order owes everything: goods, delivery, service. Nothing arrived.

do $$
declare
  v_order  uuid;
  v_refund uuid;
  v_pos    record;
begin
  v_order := pg_temp.paid_order('reject', 2, 1);

  perform pg_temp.assert(
    (select captured_minor from public.orders where id = v_order) = 16000,
    'the order captured 16000 — 14000 of goods plus a 2000 delivery fee');

  -- The shop rejects it.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'rejected', 'we are closed');
  reset role;

  select * into v_pos from public.refund_position_of(v_order);
  perform pg_temp.assert(v_pos.refund_required_minor = 16000,
    'a rejected order owes the whole capture back');
  perform pg_temp.assert(v_pos.refunded_minor = 0,
    'and nothing has actually gone back yet — owed is not paid');

  -- THE SCHEDULER RAISES IT. Nobody had to notice.
  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform pg_temp.assert(public.queue_due_refunds(10) >= 1,
    'queue_due_refunds picks up a rejected order with a debt');

  select id into v_refund from public.refund_attempts where order_id = v_order;
  perform pg_temp.assert(v_refund is not null, 'and creates exactly one attempt');
  perform pg_temp.assert(
    (select amount_minor from public.refund_attempts where id = v_refund) = 16000,
    'for the amount the LEDGER says, not an amount anybody passed in');
  perform pg_temp.assert(
    (select requested_by from public.refund_attempts where id = v_refund) is null,
    'attributed to the system, because no human asked for it');

  -- RUNNING IT AGAIN IS A NO-OP. The derived idempotency key is what makes it
  -- one, and a scheduler that fires twice in a minute is ordinary.
  perform public.queue_due_refunds(10);
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts where order_id = v_order) = 1,
    'a second scheduler pass creates no second attempt');

  -- The executor claims it and the provider says yes.
  perform pg_temp.assert(
    (select count(*) from public.claim_refund_attempts(10)) >= 1,
    'the executor can claim the due attempt');
  perform pg_temp.assert(
    (select state from public.refund_attempts where id = v_refund) = 'processing',
    'claiming marks it processing BEFORE the provider is called');
  perform pg_temp.assert(
    (select attempts from public.refund_attempts where id = v_refund) = 1,
    'and counts the try, so a crash cannot produce an unbounded retry');

  -- A CLAIMED ROW IS NOT CLAIMED TWICE.
  perform pg_temp.assert(
    not exists (select 1 from public.claim_refund_attempts(10) c where c.id = v_refund),
    'a second executor pass does not claim the same attempt');

  perform pg_temp.assert(
    public.record_refund_result(v_refund, 'succeeded', 'paymob-refund-1') = 'applied',
    'the provider confirms and the refund applies');

  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order) = 16000,
    'the order now says 16000 has gone back');
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'refunded',
    'and the payment state is refunded, not partially');

  select * into v_pos from public.refund_position_of(v_order);
  perform pg_temp.assert(v_pos.refund_required_minor = 0,
    'the debt is gone because the money went, not because we calculated it away');

  -- RULE 3, PROVED. The provider's callback arrives after the synchronous
  -- answer already settled it. Reached here as `postgres` because
  -- `apply_refund_success` is internal and not even the service role holds it
  -- — the real second route in is `record_payment_event`, exercised in §6.
  set role postgres;
  perform pg_temp.assert(
    public.apply_refund_success(v_refund, 'paymob-refund-1') = 'duplicate',
    'applying the same refund twice is a duplicate, not a second payment');
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order) = 16000,
    'and the amount refunded is unchanged');

  set role service_role;
  perform public.queue_due_refunds(10);
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts where order_id = v_order) = 1,
    'and the queue does not raise a second refund for a settled debt');

  reset role;
end;
$$;

-- ===========================================================================
-- 2. AN ITEM IS MISSING, THEN A SECOND TRANCHE
-- ===========================================================================
-- Two partial refunds on one order, which is the case a `refunded boolean`
-- would have made impossible.

do $$
declare
  v_order  uuid;
  v_item   uuid;
  v_sub    uuid;
  v_refund uuid;
  v_pos    record;
begin
  v_order := pg_temp.paid_order('partial', 2, 1);

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'accepted', null);
  perform public.advance_fulfilment(v_order, 'picking', null);

  -- The oil is gone, with nothing to put in its place.
  select id into v_item from public.order_items
   where order_id = v_order and merchant_product_id = '72000000-0000-4000-8000-000000000002';
  v_sub := public.report_item_unavailable(v_item, null, 'none left');
  reset role;

  select * into v_pos from public.refund_position_of(v_order);
  perform pg_temp.assert(v_pos.refund_required_minor = 4000,
    'one 4000 line removed owes exactly 4000');

  -- Nothing is refunded while the basket is still moving.
  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform public.queue_due_refunds(10);
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts where order_id = v_order) = 0,
    'a debt on an order still being picked is NOT refunded yet');
  reset role;

  -- The shop finishes and delivers.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'ready', null);
  perform public.advance_fulfilment(v_order, 'dispatched', null, 'Hany', '+201002223333');
  perform public.advance_fulfilment(v_order, 'delivered', null);
  reset role;

  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform public.queue_due_refunds(10);
  select id into v_refund from public.refund_attempts where order_id = v_order;
  perform pg_temp.assert(
    (select amount_minor from public.refund_attempts where id = v_refund) = 4000,
    'a delivered order with a removed line queues a 4000 refund');

  perform public.record_refund_result(v_refund, 'succeeded', 'paymob-refund-2');
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'partially_refunded',
    'part of the money back means partially_refunded, not refunded');
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order) = 4000,
    'and 4000 has gone back');
  reset role;

  -- A SECOND THING GOES WRONG, AFTER THE FIRST REFUND. This is the sequence a
  -- single boolean or a single amount column could not represent.
  set role postgres;
  insert into public.order_adjustments (order_id, kind, amount_minor, reason, actor)
  values (v_order, 'goodwill', -1500, 'late delivery', 'akalt');
  reset role;

  select * into v_pos from public.refund_position_of(v_order);
  perform pg_temp.assert(v_pos.refund_required_minor = 1500,
    'a later goodwill adjustment owes 1500 MORE, on top of what already went back');

  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform public.queue_due_refunds(10);
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts where order_id = v_order) = 2,
    'which becomes a SECOND attempt rather than editing the first');

  select id into v_refund from public.refund_attempts
   where order_id = v_order and state = 'pending';
  perform pg_temp.assert(
    (select amount_minor from public.refund_attempts where id = v_refund) = 1500,
    'for 1500, the new tranche only');

  perform public.record_refund_result(v_refund, 'succeeded', 'paymob-refund-3');
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order) = 5500,
    'the two refunds add up: 4000 then 1500');
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'partially_refunded',
    'and the order is still only partially refunded, because it is');
  reset role;
end;
$$;

-- ===========================================================================
-- 3. A CHEAPER SUBSTITUTE
-- ===========================================================================

do $$
declare
  v_order  uuid;
  v_item   uuid;
  v_sub    uuid;
  v_refund uuid;
  v_pos    record;
begin
  v_order := pg_temp.paid_order('subst', 1, 1);

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'accepted', null);
  perform public.advance_fulfilment(v_order, 'picking', null);

  select id into v_item from public.order_items
   where order_id = v_order and merchant_product_id = '72000000-0000-4000-8000-000000000001';
  v_sub := public.report_item_unavailable(
    v_item, '72000000-0000-4000-8000-000000000003', 'house brand instead');
  reset role;

  -- The customer takes it.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000a', false);
  perform public.decide_substitution(v_sub, true);
  reset role;

  select * into v_pos from public.refund_position_of(v_order);
  perform pg_temp.assert(v_pos.refund_required_minor = 1000,
    'a 4000 substitute for a 5000 line owes the 1000 difference and no more');

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'ready', null);
  perform public.advance_fulfilment(v_order, 'dispatched', null, 'Hany', '+201002223333');
  perform public.advance_fulfilment(v_order, 'delivered', null);
  reset role;

  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform public.queue_due_refunds(10);
  select id into v_refund from public.refund_attempts where order_id = v_order;
  perform public.record_refund_result(v_refund, 'succeeded', 'paymob-refund-4');
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order) = 1000,
    'and exactly 1000 goes back');
  reset role;
end;
$$;

-- ===========================================================================
-- 4. THE PROVIDER REFUSES, AND THEN DOES NOT ANSWER
-- ===========================================================================
-- The two failure modes that must behave differently. Getting this wrong in
-- either direction is a real loss: never retrying strands the customer's
-- money, and always retrying sends it twice.

do $$
declare
  v_order   uuid;
  v_refund  uuid;
  v_next    timestamptz;
begin
  v_order := pg_temp.paid_order('failure', 1, 0);

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'rejected', 'out of stock');
  reset role;

  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform public.queue_due_refunds(10);
  select id into v_refund from public.refund_attempts where order_id = v_order;
  perform public.claim_refund_attempts(10);

  -- A REFUSAL. Definite, and safe to try again later.
  perform pg_temp.assert(
    public.record_refund_result(v_refund, 'failed', null, 'insufficient_balance',
                                'merchant account is short') = 'failed',
    'a refusal is recorded as a failure');
  perform pg_temp.assert(
    (select state from public.refund_attempts where id = v_refund) = 'failed',
    'and the attempt is retryable');
  perform pg_temp.assert(
    (select manual_review from public.refund_attempts where id = v_refund) = false,
    'without asking a human, because the provider gave a clear answer');

  -- THE DEBT SURVIVES. This is the rule that makes failure visible without
  -- anybody having to remember to display it.
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order) = 0,
    'nothing went back');
  perform pg_temp.assert(
    (select refund_required_minor from public.refund_position_of(v_order)) > 0,
    'so the order still owes the customer — a failed refund is still a debt');
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'captured',
    'and the payment state does not pretend anything was refunded');

  -- BACKOFF. Not immediately, and not forever.
  select next_attempt_at into v_next from public.refund_attempts where id = v_refund;
  perform pg_temp.assert(v_next > now(),
    'the next try is in the future, so a failure cannot spin');
  perform pg_temp.assert(
    not exists (select 1 from public.claim_refund_attempts(10) c where c.id = v_refund),
    'and it is not claimable again until then');

  -- Time passes.
  update public.refund_attempts set next_attempt_at = now() - interval '1 minute'
   where id = v_refund;
  perform pg_temp.assert(
    exists (select 1 from public.claim_refund_attempts(10) c where c.id = v_refund),
    'once the backoff has passed it is claimable again');

  -- NOW THE PROVIDER DOES NOT ANSWER AT ALL.
  perform public.record_refund_result(v_refund, 'ambiguous', null, 'network_error', 'timed out');
  perform pg_temp.assert(
    (select state from public.refund_attempts where id = v_refund) = 'abandoned',
    'an ambiguous answer abandons the attempt');
  perform pg_temp.assert(
    (select manual_review from public.refund_attempts where id = v_refund) = true,
    'and flags it for a person');

  -- THE HEADLINE OF THIS SECTION.
  update public.refund_attempts set next_attempt_at = now() - interval '1 hour'
   where id = v_refund;
  perform pg_temp.assert(
    not exists (select 1 from public.claim_refund_attempts(10) c where c.id = v_refund),
    'an ambiguous attempt is NEVER claimed again automatically, whatever the clock says');

  -- And the scheduler does not simply queue a fresh one around it, which would
  -- be the same double payment by another route.
  perform public.queue_due_refunds(10);
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts where order_id = v_order) = 1,
    'nor does the queue raise a replacement while one is under review');

  perform pg_temp.assert(
    (select refund_required_minor from public.refund_position_of(v_order)) > 0,
    'and the debt is still on the order, visible, waiting for a person');
  reset role;
end;
$$;

-- ===========================================================================
-- 5. THE EXECUTOR DIES MID-FLIGHT
-- ===========================================================================

do $$
declare
  v_order  uuid;
  v_refund uuid;
begin
  v_order := pg_temp.paid_order('stall', 1, 0);

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'rejected', 'closed');
  reset role;

  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform public.queue_due_refunds(10);
  select id into v_refund from public.refund_attempts where order_id = v_order;
  perform public.claim_refund_attempts(10);

  -- The function never came back. Nothing recorded a result.
  update public.refund_attempts set sent_at = now() - interval '1 hour'
   where id = v_refund;

  perform pg_temp.assert(public.sweep_stalled_refunds() = 1,
    'the sweep finds an attempt the executor never answered for');
  perform pg_temp.assert(
    (select state from public.refund_attempts where id = v_refund) = 'abandoned'
    and (select manual_review from public.refund_attempts where id = v_refund),
    'and hands it to a person rather than re-sending it');
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order) = 0,
    'nothing is assumed about money that may or may not have moved');
  reset role;
end;
$$;

-- ===========================================================================
-- 6. THE CALLBACK PATH
-- ===========================================================================
-- A refund confirmed by Paymob's own callback rather than by the synchronous
-- response, through the SAME `record_payment_event` that settles payments.

do $$
declare
  v_order  uuid;
  v_intent uuid;
  v_refund uuid;
begin
  v_order := pg_temp.paid_order('callback', 1, 0);

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'rejected', 'closed');
  reset role;

  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform public.queue_due_refunds(10);
  select id into v_refund from public.refund_attempts where order_id = v_order;
  perform public.claim_refund_attempts(10);
  -- The executor wrote down the child transaction id and then the container
  -- died before it could record the result. The callback is what settles it.
  update public.refund_attempts set provider_refund_reference = 'child-txn-9'
   where id = v_refund;
  reset role;

  select id into v_intent from public.payment_intents where order_id = v_order limit 1;

  set role postgres;
  perform pg_temp.assert(
    public.record_payment_event('paymob', 'refund', 'child-txn-9', v_intent, 'succeeded',
      (select amount_minor from public.refund_attempts where id = v_refund),
      'child-txn-9', null, null, '{}'::jsonb) = 'applied',
    'a refund callback applies through record_payment_event');
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order) > 0,
    'and the money is recorded as gone back');

  -- REPLAY. Every provider delivers twice eventually.
  perform pg_temp.assert(
    public.record_payment_event('paymob', 'refund', 'child-txn-9', v_intent, 'succeeded',
      (select amount_minor from public.refund_attempts where id = v_refund),
      'child-txn-9', null, null, '{}'::jsonb) = 'duplicate',
    'the same refund callback delivered twice is a duplicate');
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order)
      = (select amount_minor from public.refund_attempts where id = v_refund),
    'and refunded_minor did NOT double');

  -- A REFUND NOBODY ASKED FOR. Somebody pressed refund in the Paymob
  -- dashboard; our books and theirs now disagree, and that has to be loud.
  perform pg_temp.assert(
    public.record_payment_event('paymob', 'refund', 'child-txn-rogue', v_intent, 'succeeded',
      500, 'child-txn-rogue', null, null, '{}'::jsonb) = 'unknown_refund',
    'a refund AKALT never requested is recorded and applied to nothing');
  perform pg_temp.assert(
    exists (select 1 from public.order_events
             where order_id = v_order and to_value = 'refund_unmatched'),
    'and leaves a visible note on the order');

  -- A VOID. AKALT never voids; one arriving means a human did it by hand.
  perform pg_temp.assert(
    public.record_payment_event('paymob', 'void', 'void-txn-1', v_intent, 'succeeded',
      null, 'void-txn-1', null, null, '{}'::jsonb) = 'unsupported_kind',
    'a void is recorded, not applied, and flagged');

  -- WRONG PROVIDER. A demo event cannot settle a Paymob refund.
  perform pg_temp.assert(
    public.record_payment_event('demo', 'refund', 'demo-refund-x', v_intent, 'succeeded',
      1000, 'demo-refund-x', null, null, '{}'::jsonb) = 'wrong_provider',
    'a refund from the wrong provider settles nothing');
  reset role;
end;
$$;

-- ===========================================================================
-- 7. WHO MAY ASK FOR A REFUND
-- ===========================================================================

do $$
declare
  v_order uuid;
begin
  v_order := pg_temp.paid_order('authz', 1, 0);

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'rejected', 'closed');
  reset role;

  -- THE CUSTOMER. It is their money, and they still cannot move it: a refund
  -- is AKALT's decision, taken against the ledger.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000a', false);
  perform pg_temp.assert_rejected(
    format('select public.request_refund(%L, %L)', v_order, 'give me my money'),
    'the customer cannot request a refund');

  -- THE MERCHANT. A shop that could trigger refunds against AKALT's captured
  -- funds is a shop that can drain the account.
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform pg_temp.assert_rejected(
    format('select public.request_refund(%L, %L)', v_order, 'sorry'),
    'the merchant cannot request a refund');

  -- A STRANGER.
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000c', false);
  perform pg_temp.assert_rejected(
    format('select public.request_refund(%L, %L)', v_order, 'hello'),
    'a stranger cannot request a refund');

  -- NOR MAY ANY OF THEM RUN THE MACHINERY.
  perform pg_temp.assert_rejected(
    'select public.queue_due_refunds(10)',
    'an ordinary account cannot run the refund queue');
  perform pg_temp.assert_rejected(
    'select public.claim_refund_attempts(10)',
    'nor claim refund attempts');
  perform pg_temp.assert_rejected(
    format('select public.record_refund_result(%L, %L)',
           gen_random_uuid(), 'succeeded'),
    'nor tell the database a refund succeeded');
  perform pg_temp.assert_rejected(
    format('select public.apply_refund_success(%L)', gen_random_uuid()),
    'nor reach the internal applier directly');
  perform pg_temp.assert_rejected(
    format('select * from public.refund_position_of(%L)', v_order),
    'nor read the unfiltered refund arithmetic for any order they like');
  reset role;

  -- THE AKALT ADMIN MAY.
  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000d', false);
  perform pg_temp.assert(
    public.request_refund(v_order, 'ops raised it') is not null,
    'an AKALT admin can request a refund');
  perform pg_temp.assert(
    (select requested_by from public.refund_attempts where order_id = v_order)
      = '70000000-0000-4000-8000-00000000000d',
    'and it is attributed to them by name');

  -- AND THE AMOUNT IS STILL NOT THEIRS TO CHOOSE. `request_refund` has three
  -- parameters and none of them is an amount; there is no overload that takes
  -- one. This asserts the shape rather than the behaviour, because the
  -- guarantee is the absence of the argument.
  perform pg_temp.assert(
    (select count(*) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'request_refund') = 1,
    'there is exactly one request_refund');
  perform pg_temp.assert(
    (select pg_get_function_identity_arguments(p.oid) from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'request_refund')
      = 'p_order_id uuid, p_reason text, p_idempotency_key text',
    'and it takes an order, a reason and a key — no amount, by construction');
  perform pg_temp.assert(
    not exists (
      select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join information_schema.role_routine_grants g
          on g.specific_name = p.proname || '_' || p.oid
       where n.nspname = 'public'
         and p.proname in ('raise_refund', 'apply_refund_success')
         and g.grantee in ('authenticated', 'anon', 'PUBLIC')
    ),
    'and the internal refund functions are granted to nobody who could call them');
  reset role;
end;
$$;

-- ===========================================================================
-- 8. WHO MAY SEE A REFUND
-- ===========================================================================

do $$
declare
  v_order uuid;
begin
  -- Pinned to THIS suite's shopper. The whole suite runs in one database
  -- alongside the others, and `queue_due_refunds` legitimately picks up any
  -- order with a debt — including one an earlier suite left behind.
  select r.order_id into v_order
    from public.refund_attempts r
    join public.orders o on o.id = r.order_id
   where o.user_id = '70000000-0000-4000-8000-00000000000a'
   order by r.created_at
   limit 1;

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000a', false);
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts) > 0,
    'the customer can see the refunds on their own orders');
  perform pg_temp.assert(
    (select count(*) from public.order_refund_status(v_order)) = 1,
    'and can read the combined status of one');

  -- THE MERCHANT SEES NONE OF IT. What AKALT refunds out of a captured payment
  -- is between AKALT and the customer.
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts) = 0,
    'the merchant cannot see refund attempts at all');
  perform pg_temp.assert(
    (select count(*) from public.order_refund_status(v_order)) = 0,
    'nor the refund status of an order they are picking');
  perform pg_temp.assert(
    (select count(*) from public.order_refund_position(v_order)) = 1,
    'but CAN still see the order''s financial position, which is their business');

  -- A STRANGER SEES NOTHING.
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000c', false);
  perform pg_temp.assert(
    (select count(*) from public.refund_attempts) = 0,
    'a stranger sees no refunds');
  perform pg_temp.assert(
    (select count(*) from public.order_refund_status(v_order)) = 0,
    'and no refund status');
  reset role;
end;
$$;

-- ===========================================================================
-- 9. THE CEILING
-- ===========================================================================
-- Rule 2, tested at the point of application rather than at request time,
-- because that is where a moving ledger can break it.

do $$
declare
  v_order  uuid;
  v_refund uuid;
begin
  v_order := pg_temp.paid_order('ceiling', 1, 0);

  set role authenticated;
  perform set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-00000000000b', false);
  perform public.advance_fulfilment(v_order, 'rejected', 'closed');
  reset role;

  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;
  perform public.queue_due_refunds(10);
  select id into v_refund from public.refund_attempts where order_id = v_order;

  -- Somebody refunded most of it out of band, so this attempt is now too big.
  update public.orders
     set refunded_minor = captured_minor - 1, payment_state = 'partially_refunded'
   where id = v_order;

  set role postgres;
  perform pg_temp.assert(
    public.apply_refund_success(v_refund, 'paymob-refund-too-big') = 'exceeds_capture',
    'a refund that would take the total past the capture is refused');
  perform pg_temp.assert(
    (select state from public.refund_attempts where id = v_refund) = 'abandoned'
    and (select manual_review from public.refund_attempts where id = v_refund),
    'and goes to a person rather than being silently clamped');
  perform pg_temp.assert(
    (select refunded_minor from public.orders where id = v_order)
      = (select captured_minor - 1 from public.orders where id = v_order),
    'the total is unchanged');
  reset role;
end;
$$;

-- ===========================================================================
-- 10. THE SCHEDULER
-- ===========================================================================

do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  set role service_role;

  perform pg_temp.assert(public.run_job('expire_stale_drafts') = 'ok',
    'run_job runs a pure-SQL job');
  perform pg_temp.assert(
    (select outcome from public.job_runs
      where job_name = 'expire_stale_drafts' order by started_at desc limit 1) = 'ok',
    'and records the run');
  perform pg_temp.assert(
    (select finished_at from public.job_runs
      where job_name = 'expire_stale_drafts' order by started_at desc limit 1) is not null,
    'with a finish time, so a job that hangs is visible as one that never ended');

  perform pg_temp.assert_rejected(
    $q$select public.run_job('drop_everything')$q$,
    'run_job refuses a job name it does not know');

  -- The HTTP jobs are configuration, and there is none in a fresh checkout.
  perform pg_temp.assert(public.dispatch_edge_job('refunds-execute') = 'not_configured',
    'an unconfigured HTTP job reports not_configured rather than failing');
  perform pg_temp.assert(
    (select detail from public.job_runs
      where job_name = 'refunds-execute' order by started_at desc limit 1) is not null,
    'and says why in the run log');

  perform pg_temp.assert(
    (select count(*) from public.edge_job_endpoints) = 0,
    'NO MIGRATION SHIPS A HOSTED URL — the endpoint table starts empty');

  perform pg_temp.assert(public.refund_backoff(0) = interval '1 minute',
    'the first retry waits a minute');
  perform pg_temp.assert(public.refund_backoff(3) = interval '1 hour',
    'and the backoff is capped at an hour, not unbounded');
  reset role;
end;
$$;

-- Ordinary accounts cannot run or read the scheduler.
set role authenticated;
set request.jwt.claim.sub = '70000000-0000-4000-8000-00000000000a';

do $$
begin
  perform pg_temp.assert_rejected(
    $q$select public.run_job('expire_stale_drafts')$q$,
    'a customer cannot run a scheduled job');
  perform pg_temp.assert_rejected(
    $q$select public.dispatch_edge_job('refunds-execute')$q$,
    'nor fire an HTTP job');
  perform pg_temp.assert(
    (select count(*) from public.job_runs) = 0,
    'nor read the run log');
  perform pg_temp.assert(
    (select count(*) from public.job_health()) = 0,
    'and job_health tells them nothing');
end;
$$;

reset role;

set role authenticated;
set request.jwt.claim.sub = '70000000-0000-4000-8000-00000000000d';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.job_health()) > 0,
    'but an AKALT admin can see whether the scheduler is alive');
end;
$$;

reset role;

\echo 'Refunds: passed'
