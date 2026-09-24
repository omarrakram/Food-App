-- Payment, written as an attacker and as an unreliable network.
--
-- Two threat models, because payment has two:
--
--   THE CLIENT. Can I say I paid? Can I pay less than I owe? Can I see, cancel
--   or pay for somebody else's order? Can I reach the merchant queue without
--   money having moved? Every answer must be no, and no because of Postgres.
--
--   THE PROVIDER'S NETWORK. It delivers twice. It delivers late. It delivers a
--   failure after a success. It delivers an event for something we have never
--   heard of. None of those may produce a second capture, an un-paid order, or
--   an exception that makes the provider retry forever.

\set ON_ERROR_STOP on
\echo ''
\echo 'Payment: intents, webhooks and the money'

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
  ('50000000-0000-4000-8000-00000000000a', 'hana@pay.test'),
  ('50000000-0000-4000-8000-00000000000b', 'karim@pay.test');

insert into public.delivery_areas (key, governorate, name_en, name_ar, is_demo)
values ('pay-zamalek', 'cairo', 'Zamalek', 'الزمالك', true);

-- A REAL merchant, not a demo one. `begin_payment` reads `is_demo` to decide
-- which provider may settle the order, so most of this file has to run against
-- the production path; the demo path gets its own block at the end.
insert into public.merchants (id, slug, name, country, currency, fulfilment_mode,
                              commission_rate_basis_points, merchant_keeps_delivery_fee,
                              is_enabled, is_demo)
values ('51000000-0000-4000-8000-000000000001', 'pay-mart', 'Pay Mart',
        'EG', 'EGP', 'dashboard', 1000, true, true, false);

insert into public.merchant_locations (id, merchant_id, external_id, name, country,
                                       delivery_fee_minor, minimum_order_minor,
                                       is_accepting_orders)
values ('51000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001',
        'pay-branch-1', 'Pay Mart Zamalek', 'EG', 2000, 5000, true);

insert into public.merchant_location_areas (merchant_location_id, area_key)
values ('51000000-0000-4000-8000-000000000002', 'pay-zamalek');

insert into public.merchant_products (id, merchant_location_id, external_id, name,
                                      pack_quantity, unit, price_minor, currency,
                                      availability, is_active)
values
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002',
   'pm-rice', 'Rice 1kg', 1, 'kg', 4000, 'EGP', 'in_stock', true),
  ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002',
   'pm-oil', 'Oil 1L', 1, 'l', 3000, 'EGP', 'in_stock', true);

-- A basket and an address for Hana, written as she would write them.
set role authenticated;
set request.jwt.claim.sub = '50000000-0000-4000-8000-00000000000a';

insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
values ('53000000-0000-4000-8000-000000000001',
        '50000000-0000-4000-8000-00000000000a',
        '51000000-0000-4000-8000-000000000001',
        '51000000-0000-4000-8000-000000000002', 'EGP');

insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
values
  ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 2, 4000),
  ('53000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 1, 3000);

insert into public.delivery_addresses (
  id, user_id, recipient_name, phone, area_key, street, building, country
) values (
  '54000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-00000000000a',
  'Hana', '+201002223333', 'pay-zamalek', '26 July', '3', 'EG'
);

-- --- The draft this phase starts from --------------------------------------

do $$
declare
  v_order uuid;
  v_row   public.orders%rowtype;
begin
  v_order := public.create_order_draft(
    (select revision from public.carts where id = '53000000-0000-4000-8000-000000000001'),
    '54000000-0000-4000-8000-000000000001', 'pay-draft-1', null);

  select * into v_row from public.orders where id = v_order;

  perform pg_temp.assert(v_row.items_subtotal_minor = 11000,
    'the draft is priced by the server — 2x4000 + 1x3000');
  -- THE CLOCK STARTS AT CREATION. Prices and stock move; a draft that stays
  -- payable forever is a promise about a shelf nobody looked at.
  perform pg_temp.assert(v_row.draft_expires_at is not null
                         and v_row.draft_expires_at > now(),
    'and it carries an expiry, set from the server clock');
end;
$$;

-- --- What a client may NOT do ----------------------------------------------

do $$
declare
  v_order uuid := (select id from public.orders
                    where user_id = '50000000-0000-4000-8000-00000000000a');
begin
  -- THE HEADLINE. If any of these change the row, nothing else in this file
  -- matters.
  --
  -- ASSERTED AS "nothing moved", not as "the statement errored". `orders` has
  -- a SELECT policy and no UPDATE policy, so an update matches no rows and
  -- succeeds having done nothing — which is the correct behaviour and a
  -- different observation from a raised exception. Testing for the exception
  -- would pass today and would keep passing if somebody added a permissive
  -- update policy tomorrow.
  update public.orders set payment_state = 'captured' where id = v_order;
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'unpaid',
    'a client cannot mark its own order paid');

  update public.orders set fulfilment_state = 'placed' where id = v_order;
  perform pg_temp.assert(
    (select fulfilment_state from public.orders where id = v_order) = 'draft',
    'nor push it into the merchant queue');

  update public.orders set items_subtotal_minor = 1 where id = v_order;
  perform pg_temp.assert(
    (select items_subtotal_minor from public.orders where id = v_order) = 11000,
    'nor change what it costs');

  perform pg_temp.assert_rejected(
    format(
      $f$insert into public.payment_intents (order_id, user_id, provider, method,
            amount_minor, state, idempotency_key)
         values (%L, %L, 'paymob', 'card', 1, 'succeeded', 'forged')$f$,
      v_order, '50000000-0000-4000-8000-00000000000a'),
    'a client cannot write itself a succeeded payment');

  perform pg_temp.assert_rejected(
    $f$insert into public.payment_events (provider, kind, provider_event_id, disposition, payload)
       values ('paymob', 'transaction', 'forged', 'applied', '{}'::jsonb)$f$,
    'nor forge a provider callback');
end;
$$;

-- Only the service role may move money. `authenticated` is not the service
-- role, and the grants are what say so rather than a check inside the body.
do $$
begin
  perform pg_temp.assert_rejected(
    $f$select public.record_payment_event('paymob', 'transaction', 'x', null,
          'succeeded', 1, 'r', null, null, '{}'::jsonb)$f$,
    'a signed-in customer cannot call record_payment_event');
  perform pg_temp.assert_rejected(
    $f$select public.attach_payment_provider(gen_random_uuid(), 'i', 'o', 's', 'u')$f$,
    'nor attach provider details to an attempt');
  perform pg_temp.assert_rejected(
    $f$select public.expire_stale_drafts()$f$,
    'nor expire drafts');
end;
$$;

-- --- Beginning a payment ---------------------------------------------------

do $$
declare
  v_order  uuid := (select id from public.orders
                     where user_id = '50000000-0000-4000-8000-00000000000a');
  v_intent public.payment_intents%rowtype;
  v_again  public.payment_intents%rowtype;
  v_row    public.orders%rowtype;
begin
  v_intent := public.begin_payment(v_order, 'card', 'pay-attempt-1');

  -- THE AMOUNT COMES FROM THE ORDER. 11000 goods + 2000 delivery.
  perform pg_temp.assert(v_intent.amount_minor = 13000,
    'the attempt is for the order total, which the client never named — 13000');
  perform pg_temp.assert(v_intent.state = 'requires_action',
    'and starts waiting for the customer to act');
  perform pg_temp.assert(v_intent.provider = 'paymob' and v_intent.method = 'card',
    'with the provider and method recorded on the attempt');

  select * into v_row from public.orders where id = v_order;
  perform pg_temp.assert(v_row.payment_state = 'authorising',
    'the order is now authorising');
  perform pg_temp.assert(v_row.fulfilment_state = 'pending',
    'and pending, which the merchant cannot see');
  perform pg_temp.assert(v_row.payment_method = 'card' and v_row.payment_provider = 'paymob',
    'and it names the payment path, which the constraint requires past unpaid');

  -- IDEMPOTENCY. A double tap is one attempt.
  v_again := public.begin_payment(v_order, 'card', 'pay-attempt-1');
  perform pg_temp.assert(v_again.id = v_intent.id,
    'a retried begin_payment returns the attempt it already made');
  perform pg_temp.assert(
    (select count(*) from public.payment_intents where order_id = v_order) = 1,
    'and no second attempt exists');

  -- A SECOND ATTEMPT WHILE ONE IS LIVE IS HOW PEOPLE GET CHARGED TWICE.
  perform pg_temp.assert_rejected(
    format($f$select public.begin_payment(%L, 'card', 'pay-attempt-2')$f$, v_order),
    'a second attempt is refused while one could still succeed');

  perform pg_temp.assert_rejected(
    format($f$select public.begin_payment(%L, 'cash_on_delivery', 'pay-cod')$f$, v_order),
    'cash on delivery is refused rather than half-implemented');
end;
$$;

-- --- Somebody else's order -------------------------------------------------

set request.jwt.claim.sub = '50000000-0000-4000-8000-00000000000b';

do $$
declare
  v_order  uuid := (select id from public.orders
                     where user_id = '50000000-0000-4000-8000-00000000000a');
  v_intent uuid := (select id from public.payment_intents
                     where user_id = '50000000-0000-4000-8000-00000000000a');
begin
  perform pg_temp.assert(
    (select count(*) from public.payment_intents) = 0,
    'another customer sees none of your payment attempts');
  perform pg_temp.assert_rejected(
    format($f$select public.begin_payment(%L, 'card', 'karim-1')$f$, v_order),
    'and cannot begin a payment on your order');
  perform pg_temp.assert_rejected(
    format($f$select public.cancel_payment_intent(%L)$f$, v_intent),
    'nor cancel your attempt');
end;
$$;

reset role;

-- --- The webhook, which is the only thing that can say a payment happened ---

do $$
declare
  v_order    uuid := (select id from public.orders
                       where user_id = '50000000-0000-4000-8000-00000000000a');
  v_intent   public.payment_intents%rowtype;
  v_result   text;
  v_row      public.orders%rowtype;
begin
  select * into v_intent from public.payment_intents where order_id = v_order;

  -- AN EVENT FOR SOMETHING WE HAVE NEVER HEARD OF is kept, not dropped. It is
  -- the only evidence that somebody may have been charged for nothing.
  v_result := public.record_payment_event('paymob', 'transaction', 'evt-stranger', null,
                'succeeded', 13000, 'txn-stranger', null, null, '{"note":"unknown"}'::jsonb);
  perform pg_temp.assert(v_result = 'unknown_intent',
    'an event for an unknown attempt is recorded and not applied');
  perform pg_temp.assert(
    (select disposition from public.payment_events where provider_event_id = 'evt-stranger')
      = 'unknown_intent',
    'and the log says what we decided about it');

  -- A PROVIDER REPORTING A DIFFERENT AMOUNT is a bug or an attack. Never
  -- applied, always kept.
  v_result := public.record_payment_event('paymob', 'transaction', 'evt-wrong-amount',
                v_intent.id, 'succeeded', 1, 'txn-wrong', null, null, '{}'::jsonb);
  perform pg_temp.assert(v_result = 'amount_mismatch',
    'an event for the wrong amount is refused');
  perform pg_temp.assert(
    (select state from public.payment_intents where id = v_intent.id) = 'requires_action',
    'and the attempt has not moved');

  -- PENDING IS NOT AN ANSWER. It is not success and it is not failure.
  v_result := public.record_payment_event('paymob', 'transaction', 'evt-pending',
                v_intent.id, 'pending', 13000, 'txn-1', null, null, '{}'::jsonb);
  perform pg_temp.assert(v_result = 'applied',
    'a pending callback is applied');
  perform pg_temp.assert(
    (select state from public.payment_intents where id = v_intent.id) = 'processing',
    'and leaves the attempt processing, neither paid nor failed');
  select * into v_row from public.orders where id = v_order;
  perform pg_temp.assert(v_row.payment_state = 'authorising',
    'the order is still authorising while the provider thinks');
  perform pg_temp.assert(v_row.fulfilment_state = 'pending',
    'and the merchant still cannot see it');

  -- SUCCESS. The only path to the merchant queue.
  v_result := public.record_payment_event('paymob', 'transaction', 'evt-success',
                v_intent.id, 'succeeded', 13000, 'txn-1', null, null,
                '{"source_data":{"type":"card"}}'::jsonb);
  perform pg_temp.assert(v_result = 'applied', 'a verified success is applied');

  select * into v_intent from public.payment_intents where id = v_intent.id;
  perform pg_temp.assert(v_intent.state = 'succeeded', 'the attempt succeeded');
  perform pg_temp.assert(v_intent.provider_reference = 'txn-1',
    'and carries the provider reference reconciliation will need');
  perform pg_temp.assert(v_intent.settled_at is not null, 'and is stamped as settled');

  select * into v_row from public.orders where id = v_order;
  perform pg_temp.assert(v_row.payment_state = 'captured',
    'the order is captured — Paymob takes the money in one step, and we do not pretend otherwise');
  perform pg_temp.assert(v_row.captured_minor = 13000,
    'for exactly what was asked for');
  perform pg_temp.assert(v_row.paid_at is not null, 'and records when');
  perform pg_temp.assert(v_row.fulfilment_state = 'placed',
    'AND ONLY NOW does the order reach the merchant queue');
  perform pg_temp.assert(v_row.placed_at is not null, 'with a placement time');
end;
$$;

-- --- The network delivers it again -----------------------------------------

do $$
declare
  v_order  uuid := (select id from public.orders
                     where user_id = '50000000-0000-4000-8000-00000000000a');
  v_intent public.payment_intents%rowtype;
  v_result text;
  v_before integer;
begin
  select * into v_intent from public.payment_intents where order_id = v_order;
  select captured_minor into v_before from public.orders where id = v_order;

  v_result := public.record_payment_event('paymob', 'transaction', 'evt-success',
                v_intent.id, 'succeeded', 13000, 'txn-1', null, null, '{}'::jsonb);
  perform pg_temp.assert(v_result = 'duplicate',
    'the same callback delivered twice is a duplicate');
  perform pg_temp.assert(
    (select captured_minor from public.orders where id = v_order) = v_before,
    'and nothing was captured a second time');
  perform pg_temp.assert(
    (select count(*) from public.payment_events where provider_event_id = 'evt-success') = 1,
    'and the log holds it once');

  -- OUT OF ORDER. A late failure must not un-pay a paid order.
  v_result := public.record_payment_event('paymob', 'transaction', 'evt-late-failure',
                v_intent.id, 'failed', 13000, 'txn-1', 'declined', 'late', '{}'::jsonb);
  perform pg_temp.assert(v_result = 'ignored_out_of_order',
    'a failure arriving after a success is ignored');
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'captured',
    'and the order is still paid');
  perform pg_temp.assert(
    (select state from public.payment_intents where id = v_intent.id) = 'succeeded',
    'and the attempt still succeeded');
end;
$$;

-- --- The basket that was paid for, and the one that was not ----------------

set role authenticated;
set request.jwt.claim.sub = '50000000-0000-4000-8000-00000000000a';

do $$
declare
  v_order uuid := (select id from public.orders
                    where user_id = '50000000-0000-4000-8000-00000000000a');
begin
  -- The customer carried on shopping while the payment was in flight, so the
  -- cart has moved past the revision the order was built from. Clearing it
  -- would throw away a basket nobody has been charged for.
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values ('53000000-0000-4000-8000-000000000001',
          '52000000-0000-4000-8000-000000000001', 5, 4000)
  on conflict (cart_id, merchant_product_id) do update set quantity = 5;

  perform pg_temp.assert(public.clear_paid_cart(v_order) = false,
    'a cart the customer has changed since is NOT cleared by a paid order');
  perform pg_temp.assert(
    (select count(*) from public.cart_lines
      where cart_id = '53000000-0000-4000-8000-000000000001') > 0,
    'and their newer basket survives');

  -- Put the cart back to the revision the order was actually built from.
  update public.carts
     set revision = (select cart_revision from public.orders where id = v_order)
   where id = '53000000-0000-4000-8000-000000000001';

  perform pg_temp.assert(public.clear_paid_cart(v_order) = true,
    'the basket that WAS paid for is cleared');
  perform pg_temp.assert(
    (select count(*) from public.carts where user_id = '50000000-0000-4000-8000-00000000000a') = 0,
    'and is gone');
end;
$$;

-- --- A payment that fails, and the retry that follows ----------------------

do $$
declare
  v_order  uuid;
  v_first  public.payment_intents%rowtype;
  v_second public.payment_intents%rowtype;
  v_result text;
begin
  -- A fresh basket and a fresh draft for Hana.
  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values ('53000000-0000-4000-8000-000000000002',
          '50000000-0000-4000-8000-00000000000a',
          '51000000-0000-4000-8000-000000000001',
          '51000000-0000-4000-8000-000000000002', 'EGP');
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values ('53000000-0000-4000-8000-000000000002',
          '52000000-0000-4000-8000-000000000001', 2, 4000);

  v_order := public.create_order_draft(
    (select revision from public.carts where id = '53000000-0000-4000-8000-000000000002'),
    '54000000-0000-4000-8000-000000000001', 'pay-draft-2', null);

  v_first := public.begin_payment(v_order, 'card', 'retry-attempt-1');
  perform pg_temp.assert(v_first.amount_minor = 10000,
    'the retry draft is 8000 of goods plus the 2000 delivery fee');

  set role postgres;
  v_result := public.record_payment_event('paymob', 'transaction', 'evt-declined',
                v_first.id, 'failed', v_first.amount_minor, 'txn-2', 'insufficient_funds',
                'Insufficient funds', '{}'::jsonb);
  set role authenticated;

  perform pg_temp.assert(v_result = 'applied', 'a decline is applied');
  perform pg_temp.assert(
    (select state from public.payment_intents where id = v_first.id) = 'failed',
    'the attempt failed');
  perform pg_temp.assert(
    (select failure_code from public.payment_intents where id = v_first.id)
      = 'insufficient_funds',
    'and says why, in the provider''s own words');
  perform pg_temp.assert(
    (select payment_state from public.orders where id = v_order) = 'failed',
    'the order is unpaid again');
  -- FULFILMENT STAYS PENDING. `failed` there is terminal and would bury an
  -- order the customer is about to pay for on the second try.
  perform pg_temp.assert(
    (select fulfilment_state from public.orders where id = v_order) = 'pending',
    'but it is not buried: fulfilment is still pending, so a retry is possible');

  -- THE RETRY.
  v_second := public.begin_payment(v_order, 'wallet', 'retry-attempt-2');
  perform pg_temp.assert(v_second.id <> v_first.id, 'a retry is a NEW attempt');
  perform pg_temp.assert(v_second.amount_minor = v_first.amount_minor,
    'for the same amount, still derived from the order');
  perform pg_temp.assert(
    (select count(*) from public.payment_intents where order_id = v_order) = 2,
    'and the failed attempt is still on the record — history is not overwritten');
  perform pg_temp.assert(
    (select state from public.payment_intents where id = v_first.id) = 'failed',
    'with its own outcome intact');

  -- The customer walks away from the second attempt.
  perform public.cancel_payment_intent(v_second.id);
  perform pg_temp.assert(
    (select state from public.payment_intents where id = v_second.id) = 'cancelled',
    'cancelling an attempt records that the customer walked away, not a decline');
  perform pg_temp.assert(
    (select failure_code from public.payment_intents where id = v_second.id)
      = 'cancelled_by_customer',
    'and says so');
  -- And the order is free for another try, which is the whole point.
  perform pg_temp.assert(
    (select id from public.begin_payment(v_order, 'card', 'retry-attempt-3')) is not null,
    'which releases the order for another attempt');
end;
$$;

-- --- The one-live-attempt rule, on its own -----------------------------------
--
-- The order's own state usually catches a second attempt first
-- (`payment_in_flight`), which leaves `attempt_in_flight` looking like dead
-- code. It is not: the two axes CAN diverge — an ops fix, a partially applied
-- callback, a future flow — and if they ever do, the attempt log is the one
-- that knows whether money might still be moving. Constructed here directly,
-- because a guard nobody can trigger is a guard nobody can trust.
do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
begin
  select id into v_order from public.orders
   where checkout_idempotency_key = 'pay-draft-2';

  set role postgres;
  -- A live attempt, with the order's coarse axis saying the opposite.
  update public.payment_intents set state = 'requires_action'
   where order_id = v_order
     and id = (select id from public.payment_intents
                where order_id = v_order order by created_at desc limit 1);
  update public.orders set payment_state = 'failed', fulfilment_state = 'pending'
   where id = v_order;
  set role authenticated;

  perform pg_temp.assert_rejected(
    format($f$select public.begin_payment(%L, 'card', 'divergent-1')$f$, v_order),
    'a live attempt blocks a new one even when the order says the payment failed');

  set role postgres;
  update public.payment_intents set state = 'cancelled'
   where order_id = v_order and state = 'requires_action';
  set role authenticated;
end;
$$;

-- --- An expired draft ------------------------------------------------------

reset role;

do $$
declare
  v_order  uuid;
  v_expired integer;
begin
  select id into v_order from public.orders
   where checkout_idempotency_key = 'pay-draft-2';

  -- Age it past its expiry. Only the service role can do this; a customer
  -- cannot buy themselves more time.
  update public.orders set draft_expires_at = now() - interval '1 minute'
   where id = v_order;
  update public.payment_intents set expires_at = now() - interval '1 minute'
   where order_id = v_order;

  set role authenticated;
  set request.jwt.claim.sub = '50000000-0000-4000-8000-00000000000a';

  -- The block above already cancelled the live attempt, so nothing is in
  -- flight and the refusal below is about the EXPIRY. A test that passes for
  -- the wrong reason is worse than one that fails, so this checks.
  perform pg_temp.assert(
    not exists (select 1 from public.payment_intents
                 where order_id = v_order
                   and state in ('requires_action', 'processing')),
    'nothing is in flight, so the next refusal can only be about the expiry');

  perform pg_temp.assert_rejected(
    format($f$select public.begin_payment(%L, 'card', 'too-late')$f$, v_order),
    'an expired draft cannot begin a payment');
  reset role;

  v_expired := public.expire_stale_drafts();
  perform pg_temp.assert(v_expired >= 1, 'the sweep cancels abandoned drafts');
  perform pg_temp.assert(
    (select fulfilment_state from public.orders where id = v_order) = 'cancelled',
    'and the order says it went nowhere');
  -- NOTHING IS DELETED. An expired order is history, and history is what a
  -- support conversation is made of.
  perform pg_temp.assert(
    (select count(*) from public.payment_intents where order_id = v_order) = 3,
    'every attempt against it is still readable');
end;
$$;

-- --- A demo merchant can only ever be paid by the simulator -----------------
--
-- The provider is read off the MERCHANT, so there is no argument to pass and
-- no flag for a client to flip. This is what keeps a simulated payment from
-- ever being mistaken for a production one by reading the order row.
insert into public.merchants (id, slug, name, country, currency, fulfilment_mode,
                              commission_rate_basis_points, merchant_keeps_delivery_fee,
                              is_enabled, is_demo)
values ('51000000-0000-4000-8000-000000000009', 'sim-mart', 'Sim Mart (development only)',
        'EG', 'EGP', 'dashboard', 1000, true, true, true);

insert into public.merchant_locations (id, merchant_id, external_id, name, country,
                                       delivery_fee_minor, minimum_order_minor,
                                       is_accepting_orders)
values ('51000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-000000000009',
        'sim-branch-1', 'Sim Mart Zamalek', 'EG', 1000, 1000, true);

insert into public.merchant_location_areas (merchant_location_id, area_key)
values ('51000000-0000-4000-8000-00000000000a', 'pay-zamalek');

insert into public.merchant_products (id, merchant_location_id, external_id, name,
                                      pack_quantity, unit, price_minor, currency,
                                      availability, is_active)
values ('52000000-0000-4000-8000-000000000009', '51000000-0000-4000-8000-00000000000a',
        'sm-tea', 'Tea 100g', 100, 'g', 2500, 'EGP', 'in_stock', true);

set role authenticated;
set request.jwt.claim.sub = '50000000-0000-4000-8000-00000000000b';

do $$
declare
  v_order  uuid;
  v_intent public.payment_intents%rowtype;
  v_result text;
begin
  insert into public.carts (id, user_id, merchant_id, merchant_location_id, currency)
  values ('53000000-0000-4000-8000-000000000009',
          '50000000-0000-4000-8000-00000000000b',
          '51000000-0000-4000-8000-000000000009',
          '51000000-0000-4000-8000-00000000000a', 'EGP');
  insert into public.cart_lines (cart_id, merchant_product_id, quantity, unit_price_minor)
  values ('53000000-0000-4000-8000-000000000009',
          '52000000-0000-4000-8000-000000000009', 1, 2500);

  insert into public.delivery_addresses (
    id, user_id, recipient_name, phone, area_key, street, building, country
  ) values (
    '54000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-00000000000b',
    'Karim', '+201005556666', 'pay-zamalek', 'Brazil St', '9', 'EG'
  );

  v_order := public.create_order_draft(
    (select revision from public.carts where id = '53000000-0000-4000-8000-000000000009'),
    '54000000-0000-4000-8000-000000000009', 'sim-draft-1', null);

  v_intent := public.begin_payment(v_order, 'card', 'sim-attempt-1');
  perform pg_temp.assert(v_intent.provider = 'demo',
    'an order from a demo merchant can only be paid by the simulator');
  perform pg_temp.assert(
    (select payment_provider from public.orders where id = v_order) = 'demo',
    'and the order row says so, so no report can confuse it with a real one');

  -- AND THE TWO CANNOT CROSS. A Paymob callback must not settle a simulated
  -- attempt, however well-formed it is.
  set role postgres;
  v_result := public.record_payment_event('paymob', 'transaction', 'evt-crossed',
                v_intent.id, 'succeeded', v_intent.amount_minor, 'txn-x', null, null,
                '{}'::jsonb);
  set role authenticated;
  perform pg_temp.assert(v_result = 'wrong_provider',
    'a Paymob callback cannot settle a simulated payment');
  perform pg_temp.assert(
    (select state from public.payment_intents where id = v_intent.id) = 'requires_action',
    'and the attempt has not moved');
end;
$$;

reset role;

-- --- Anonymous ------------------------------------------------------------

set role anon;

do $$
begin
  perform pg_temp.assert_rejected(
    $f$select public.begin_payment(gen_random_uuid(), 'card', 'anon')$f$,
    'anon cannot begin a payment');
  perform pg_temp.assert_rejected(
    $f$select public.cancel_payment_intent(gen_random_uuid())$f$,
    'anon cannot cancel an attempt');
  perform pg_temp.assert_rejected(
    $f$select public.record_payment_event('paymob', 'transaction', 'a', null,
          'succeeded', 1, 'r', null, null, '{}'::jsonb)$f$,
    'anon cannot report a payment');
  perform pg_temp.assert_rejected(
    $f$select public.clear_paid_cart(gen_random_uuid())$f$,
    'anon cannot clear a cart');
  perform pg_temp.assert(
    (select count(*) from public.payment_intents) = 0,
    'and sees no payment attempts at all');
end;
$$;

reset role;
