-- Commerce-5: payment.
--
-- The rule this file exists to enforce is one sentence: THE CLIENT CANNOT MOVE
-- MONEY. Not the amount, not the state, not the moment an order reaches the
-- merchant. Everything here follows from that.
--
--   * `payment_intents` is an ATTEMPT LOG, not a status column. An order can be
--     paid for on the third try, and the first two must still be readable
--     afterwards — a failed attempt that gets overwritten is a support call
--     nobody can answer.
--
--   * `begin_payment` derives the amount from the ORDER. The client names an
--     order, a method and an idempotency key, and nothing else.
--
--   * `record_payment_event` is the only thing that can say a payment
--     succeeded, and only the service role may call it. The customer's success
--     screen is a screen; the provider's signed callback is the fact.
--
--   * Every event the provider sends is stored once, keyed by ITS id, so a
--     duplicate delivery is a no-op rather than a second capture.
--
-- Not in this file, on purpose: refunds as an operation (the shape is here —
-- `refunded_minor` and the event log — but no function writes them yet), cash
-- on delivery, and anything the merchant can see.

-- ===========================================================================
-- 1. How far along one attempt is
-- ===========================================================================
-- Deliberately NOT the same vocabulary as `payment_state`. That one is the
-- order's answer to "where is the money"; this is one attempt's answer to
-- "what happened when we tried". An order in `failed` may have a `succeeded`
-- intent arriving thirty seconds later, and collapsing the two axes is how
-- that becomes a lost payment.
create type public.payment_intent_state as enum (
  -- Created. The customer has not finished at the provider yet.
  'requires_action',
  -- The provider has it and has not said how it went.
  'processing',
  'succeeded',
  'failed',
  -- The customer walked away. Distinct from `failed`: nothing was declined.
  'cancelled',
  -- We stopped waiting. The draft behind it is no longer priceable.
  'expired'
);

create table public.payment_intents (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references public.orders (id) on delete restrict,
  user_id                uuid not null references auth.users (id) on delete restrict,

  provider               public.payment_provider not null,
  method                 public.payment_method not null,

  -- WHAT WE ASKED FOR, copied from the order at the moment the attempt began.
  -- Copied rather than joined so a later adjustment to the order cannot
  -- retroactively change what the customer was charged.
  amount_minor           integer not null,
  currency               text not null default 'EGP',

  state                  public.payment_intent_state not null default 'requires_action',

  -- The provider's own identifiers. Three of them because Paymob has three:
  -- an intention, an order, and — only once somebody actually pays — a
  -- transaction. Reconciliation needs all three.
  provider_intention_id  text,
  provider_order_id      text,
  provider_reference     text,

  -- CLIENT-FACING BY DESIGN, and not a credential: the provider's own
  -- checkout URL carries this in a query string beside a public key. The
  -- secret key, the API key and the HMAC secret never come near this table.
  checkout_client_secret text,
  checkout_url           text,

  -- One key per ATTEMPT. A retried request — a double tap, a dropped response,
  -- an app resumed from the background — finds this attempt rather than making
  -- a second one.
  idempotency_key        text not null,

  failure_code           text,
  failure_message        text,

  -- Refunds are not built yet. The shape is here because the alternative is a
  -- migration that has to unpick a `refunded boolean`: a partial refund, then
  -- a second partial refund, is an ordinary sequence.
  refunded_minor         integer not null default 0,

  -- Provider facts worth keeping for reconciliation — the masked pan, the
  -- wallet, the 3DS outcome. NEVER a token, a key or a full pan.
  provider_metadata      jsonb not null default '{}'::jsonb,

  expires_at             timestamptz,
  settled_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint payment_intents_amount_positive check (amount_minor > 0),
  constraint payment_intents_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payment_intents_refund_within_amount
    check (refunded_minor >= 0 and refunded_minor <= amount_minor),
  -- A succeeded attempt has a provider reference; an attempt with no reference
  -- has nothing to reconcile against and must not read as paid.
  constraint payment_intents_succeeded_has_reference
    check (state <> 'succeeded' or provider_reference is not null),
  constraint payment_intents_settled_when_succeeded
    check (state <> 'succeeded' or settled_at is not null),
  -- One attempt per key per person. This is the idempotency guarantee, held by
  -- the database rather than by a check somebody can forget to write.
  constraint payment_intents_idempotent unique (user_id, idempotency_key)
);

create index payment_intents_order_idx
  on public.payment_intents (order_id, created_at desc);
create index payment_intents_user_idx
  on public.payment_intents (user_id, created_at desc);
-- The lookup the webhook does: provider reference -> attempt.
create index payment_intents_provider_reference_idx
  on public.payment_intents (provider, provider_reference)
  where provider_reference is not null;
-- The one `begin_payment` runs to refuse a second concurrent attempt.
create index payment_intents_in_flight_idx
  on public.payment_intents (order_id)
  where state in ('requires_action', 'processing');

create trigger payment_intents_set_updated_at
  before update on public.payment_intents
  for each row execute function public.set_updated_at();

comment on table public.payment_intents is
  'One attempt to pay for one order. An order may have several; none is ever '
  'overwritten by a later one.';
comment on column public.payment_intents.checkout_client_secret is
  'Client-facing by design — the provider''s checkout URL carries it. Not a '
  'credential: the secret key and HMAC secret never reach this database.';

-- ===========================================================================
-- 2. Everything the provider ever told us
-- ===========================================================================
-- APPEND-ONLY, and the idempotency boundary for the webhook. A provider that
-- delivers the same callback twice — which every provider does — must produce
-- one financial effect, and the unique constraint below is what guarantees it
-- rather than a check in the handler.
--
-- `payment_intent_id` is NULLABLE on purpose: an event for a reference we do
-- not recognise is still worth keeping. Dropping it loses the only evidence
-- that somebody was charged for something we cannot find.
create table public.payment_events (
  id                uuid primary key default gen_random_uuid(),
  payment_intent_id uuid references public.payment_intents (id) on delete set null,
  provider          public.payment_provider not null,
  -- 'transaction', 'refund', 'void' — the provider's own event family.
  kind              text not null,
  -- THE PROVIDER'S ID FOR THIS EVENT. The duplicate guard.
  provider_event_id text not null,
  -- What we did with it: 'applied', 'duplicate', 'unknown_intent',
  -- 'amount_mismatch', 'ignored_out_of_order'. Stored so a reconciliation can
  -- ask "what did we decide, and why" without re-deriving it.
  disposition       text not null,
  payload           jsonb not null,
  received_at       timestamptz not null default now(),

  constraint payment_events_unique_per_provider unique (provider, kind, provider_event_id)
);

create index payment_events_intent_idx
  on public.payment_events (payment_intent_id, received_at desc);

comment on table public.payment_events is
  'Append-only log of provider callbacks. The unique constraint is the '
  'duplicate-delivery guard: one event, one financial effect.';

-- ===========================================================================
-- 3. An unpaid draft does not stay priceable forever
-- ===========================================================================
-- Prices move, stock moves, branches close. A draft that can still be paid for
-- a week later is a promise about a shelf nobody looked at.
--
-- One function rather than a literal, because the client reads the resulting
-- timestamp off the ORDER rather than recomputing the rule — two copies of a
-- duration is two answers to "has this expired".
create or replace function public.order_draft_ttl()
returns interval
language sql
immutable
as $$ select interval '30 minutes' $$;

comment on function public.order_draft_ttl() is
  'How long an unpaid draft may still begin payment. Read off orders.draft_expires_at by the client.';

alter table public.orders
  add column draft_expires_at timestamptz,
  add column paid_at          timestamptz;

comment on column public.orders.draft_expires_at is
  'After this, begin_payment refuses and the customer returns to review.';

-- ===========================================================================
-- 4. Row level security
-- ===========================================================================
alter table public.payment_intents enable row level security;

-- READ ONLY, AND ONLY YOUR OWN. There is deliberately no insert, update or
-- delete policy: every write goes through a definer function, so a client that
-- could reach this table directly still could not say it had paid.
create policy "payment_intents: owner reads" on public.payment_intents
  for select to authenticated using (user_id = auth.uid());

alter table public.payment_events enable row level security;
-- NO POLICY AT ALL. The service role bypasses RLS; nothing else may read the
-- log, because it holds raw provider payloads.

-- ===========================================================================
-- 5. Beginning a payment
-- ===========================================================================
-- The client says: this order, this method, this attempt. It does not say how
-- much, and it could not be believed if it did.
--
-- Everything the checkout screen concluded is re-derived here against LOCKED
-- rows, because the gap between "the screen said it was fine" and "we took the
-- money" is exactly where a delisted product or a closed branch lands.
create or replace function public.begin_payment(
  p_order_id        uuid,
  p_method          public.payment_method,
  p_idempotency_key text
)
returns public.payment_intents
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_order    public.orders%rowtype;
  v_merchant public.merchants%rowtype;
  v_location public.merchant_locations%rowtype;
  v_intent   public.payment_intents%rowtype;
  v_amount   integer;
  v_provider public.payment_provider;
  v_item     record;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- CASH ON DELIVERY IS NOT BUILT. It inverts settlement direction — the
  -- merchant's rider collects, so they end up holding our commission — and
  -- half of it is a merchant feature. Refusing here is better than a prepaid
  -- path quietly accepting a method it does not implement.
  if p_method = 'cash_on_delivery' then
    raise exception 'method_not_supported' using errcode = 'P0001';
  end if;

  -- IDEMPOTENCY FIRST, before any lock or any work. A retry is the common
  -- case, not the exceptional one.
  select * into v_intent
    from public.payment_intents
   where user_id = v_user and idempotency_key = p_idempotency_key;
  if v_intent.id is not null then
    if v_intent.order_id <> p_order_id then
      -- The same key for a different order is a client bug, and returning the
      -- other order's attempt would be the worst possible answer.
      raise exception 'idempotency_key_reused' using errcode = 'P0001';
    end if;
    return v_intent;
  end if;

  -- The order, LOCKED for the rest of the transaction. Two taps racing must
  -- not produce two attempts.
  select * into v_order from public.orders
   where id = p_order_id and user_id = v_user
     for update;

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  -- --- Is this order still payable? ----------------------------------------
  if v_order.payment_state in ('authorised', 'captured', 'partially_refunded', 'refunded') then
    raise exception 'already_paid' using errcode = 'P0001';
  end if;
  -- `unpaid` is a fresh draft; `failed` is a retry, which is ordinary — cards
  -- get declined for reasons that stop being true thirty seconds later.
  if v_order.payment_state not in ('unpaid', 'failed') then
    raise exception 'payment_in_flight' using errcode = 'P0001';
  end if;
  if v_order.fulfilment_state not in ('draft', 'pending') then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if v_order.draft_expires_at is not null and v_order.draft_expires_at <= now() then
    raise exception 'draft_expired' using errcode = 'P0001';
  end if;

  -- ONE ATTEMPT AT A TIME. An attempt that could still succeed must not be
  -- joined by a second one: that is how a customer is charged twice for the
  -- same basket. The cancel path is how a stuck attempt is released.
  if exists (
    select 1 from public.payment_intents
     where order_id = v_order.id
       and state in ('requires_action', 'processing')
  ) then
    raise exception 'attempt_in_flight' using errcode = 'P0001';
  end if;

  -- --- Is it still true? ---------------------------------------------------
  -- The draft was priced when it was created. A draft is NOT a stock
  -- reservation, so all of this can have changed since, and charging first and
  -- explaining afterwards is not an option.
  select * into v_merchant from public.merchants          where id = v_order.merchant_id;
  select * into v_location from public.merchant_locations where id = v_order.merchant_location_id;

  if not coalesce(v_merchant.is_enabled, false) then
    raise exception 'merchant_not_enabled' using errcode = 'P0001';
  end if;
  if not coalesce(v_location.is_accepting_orders, false) then
    raise exception 'merchant_not_accepting' using errcode = 'P0001';
  end if;

  for v_item in
    select oi.merchant_product_id, oi.quantity, oi.unit_price_minor,
           mp.price_minor, mp.availability, mp.is_active
      from public.order_items oi
      left join public.merchant_products mp on mp.id = oi.merchant_product_id
     where oi.order_id = v_order.id
  loop
    if v_item.is_active is null or not v_item.is_active then
      raise exception 'product_delisted' using errcode = 'P0001';
    end if;
    if v_item.availability = 'out_of_stock' then
      raise exception 'product_out_of_stock' using errcode = 'P0001';
    end if;
    -- THE PRICE THE CUSTOMER AGREED TO. If the shelf has moved, the order in
    -- front of them is no longer the one they reviewed, and the honest answer
    -- is to send them back rather than to silently re-price it.
    if v_item.price_minor is distinct from v_item.unit_price_minor then
      raise exception 'price_changed' using errcode = 'P0001';
    end if;
  end loop;

  -- --- The amount, FROM THE ORDER ------------------------------------------
  v_amount := v_order.items_subtotal_minor
            + v_order.delivery_fee_minor
            + v_order.service_fee_minor
            - v_order.discount_minor;

  if v_amount <= 0 then
    raise exception 'amount_not_payable' using errcode = 'P0001';
  end if;

  /*
    WHICH PROVIDER, DECIDED BY THE MERCHANT — never by the client.

    A demo merchant can only ever be paid through the simulator, and a real
    merchant can only ever be paid through Paymob. Reading `is_demo` off the
    merchant row makes that unfakeable: there is no argument to pass, no flag
    to flip and no session setting to spoof. It also keeps the promise the
    schema already made about `payment_provider = 'demo'` — a simulated
    payment can never be mistaken for a production one by reading the order.
  */
  v_provider := case when v_merchant.is_demo then 'demo' else 'paymob' end;

  insert into public.payment_intents (
    order_id, user_id, provider, method, amount_minor, currency,
    state, idempotency_key, expires_at
  ) values (
    v_order.id, v_user, v_provider, p_method, v_amount, v_order.currency,
    'requires_action', p_idempotency_key, v_order.draft_expires_at
  )
  returning * into v_intent;

  -- The order follows the attempt. `pending` is "waiting on the provider" —
  -- see MERCHANT_VISIBLE_STATES: it is deliberately not a state the merchant
  -- can see, because nobody has paid yet.
  update public.orders
     set payment_state    = 'authorising',
         payment_method   = p_method,
         payment_provider = v_provider,
         fulfilment_state = 'pending'
   where id = v_order.id;

  insert into public.order_events (order_id, kind, actor, from_value, to_value, note)
  values (v_order.id, 'payment_state', 'customer', v_order.payment_state::text,
          'authorising', 'payment attempt started');

  return v_intent;
end;
$$;

revoke all on function public.begin_payment(uuid, public.payment_method, text)
  from public, anon;
grant execute on function public.begin_payment(uuid, public.payment_method, text)
  to authenticated;

-- ===========================================================================
-- 6. The provider's half of the attempt
-- ===========================================================================
-- Written by the edge function after it has created the provider-side
-- intention, because doing that needs a secret key and a secret key must never
-- be anywhere a client can reach.
create or replace function public.attach_payment_provider(
  p_intent_id             uuid,
  p_provider_intention_id text,
  p_provider_order_id     text,
  p_client_secret         text,
  p_checkout_url          text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.payment_intents
     set provider_intention_id  = p_provider_intention_id,
         provider_order_id      = p_provider_order_id,
         checkout_client_secret = p_client_secret,
         checkout_url           = p_checkout_url
   where id = p_intent_id
     and state = 'requires_action';

  if not found then
    raise exception 'intent_not_awaiting_provider' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.attach_payment_provider(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_payment_provider(uuid, text, text, text, text)
  to service_role;

-- ===========================================================================
-- 7. The webhook, which is the only thing that can say a payment happened
-- ===========================================================================
-- Returns what it decided, as text, so the handler can log it and the event
-- row can record it:
--
--   applied              the state moved
--   duplicate            we have seen this exact event before; nothing done
--   unknown_intent       no attempt matches; the event is kept for evidence
--   amount_mismatch      the provider charged something else; nothing applied
--   wrong_provider       the event came from a provider that does not own this
--                        attempt; nothing applied
--   ignored_out_of_order a late event that would undo a settled outcome
--
-- It NEVER raises on a duplicate. A provider that gets a 500 retries, and
-- retrying a duplicate forever is a self-inflicted outage.
create or replace function public.record_payment_event(
  p_provider          public.payment_provider,
  p_kind              text,
  p_provider_event_id text,
  p_intent_id         uuid,
  p_outcome           text,
  p_amount_minor      integer,
  p_provider_reference text,
  p_failure_code      text,
  p_failure_message   text,
  p_payload           jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_intent      public.payment_intents%rowtype;
  v_order       public.orders%rowtype;
  v_disposition text;
  v_stored      uuid;
begin
  if p_outcome not in ('succeeded', 'failed', 'pending') then
    raise exception 'unknown_outcome' using errcode = 'P0001';
  end if;

  -- THE DUPLICATE GUARD, held by the unique constraint rather than by a check.
  -- Two concurrent deliveries of the same event cannot both get past this.
  insert into public.payment_events (
    payment_intent_id, provider, kind, provider_event_id, disposition, payload
  ) values (
    p_intent_id, p_provider, p_kind, p_provider_event_id, 'pending', p_payload
  )
  on conflict (provider, kind, provider_event_id) do nothing
  returning id into v_stored;

  if v_stored is null then
    return 'duplicate';
  end if;

  if p_intent_id is null then
    update public.payment_events set disposition = 'unknown_intent' where id = v_stored;
    return 'unknown_intent';
  end if;

  select * into v_intent from public.payment_intents
   where id = p_intent_id
     for update;

  if v_intent.id is null then
    update public.payment_events set disposition = 'unknown_intent' where id = v_stored;
    return 'unknown_intent';
  end if;

  -- THE PROVIDER MUST BE THE ONE THAT OWNS THIS ATTEMPT. A simulated payment
  -- cannot settle a Paymob attempt, and Paymob cannot settle a simulated one.
  if p_provider <> v_intent.provider then
    update public.payment_events set disposition = 'wrong_provider' where id = v_stored;
    return 'wrong_provider';
  end if;

  -- THE AMOUNT MUST BE THE ONE WE ASKED FOR. A provider reporting a different
  -- figure is either a bug or an attack, and applying it would make the order
  -- disagree with the money.
  if p_amount_minor is not null and p_amount_minor <> v_intent.amount_minor then
    update public.payment_events set disposition = 'amount_mismatch' where id = v_stored;
    return 'amount_mismatch';
  end if;

  -- OUT OF ORDER. A settled attempt is settled: a late `failed` must not undo
  -- a success, and a late `pending` must not reopen either outcome.
  if v_intent.state in ('succeeded', 'failed', 'cancelled', 'expired') then
    if v_intent.state = 'succeeded' and p_outcome = 'succeeded' then
      v_disposition := 'duplicate';
    else
      v_disposition := 'ignored_out_of_order';
    end if;
    update public.payment_events set disposition = v_disposition where id = v_stored;
    return v_disposition;
  end if;

  select * into v_order from public.orders where id = v_intent.order_id for update;

  if p_outcome = 'pending' then
    update public.payment_intents
       set state = 'processing',
           provider_reference = coalesce(p_provider_reference, provider_reference)
     where id = v_intent.id;

  elsif p_outcome = 'succeeded' then
    update public.payment_intents
       set state = 'succeeded',
           provider_reference = coalesce(p_provider_reference, provider_reference, p_provider_event_id),
           settled_at = now(),
           failure_code = null,
           failure_message = null
     where id = v_intent.id;

    -- PAYMOB CAPTURES IMMEDIATELY on the integrations we use, so the order
    -- goes straight to `captured`. `authorising -> captured` is a legal move in
    -- features/commerce/payment-state.ts precisely because some providers do
    -- not hold funds first, and pretending we had an authorisation we never
    -- took would make every later void and refund a lie.
    update public.orders
       set payment_state    = 'captured',
           captured_minor   = v_intent.amount_minor,
           paid_at          = now(),
           -- AND ONLY NOW does the merchant see it.
           fulfilment_state = 'placed',
           placed_at        = now()
     where id = v_order.id;

    insert into public.order_events (order_id, kind, actor, from_value, to_value, note)
    values (v_order.id, 'payment_state', 'system', v_order.payment_state::text, 'captured',
            'payment verified by provider callback');
    insert into public.order_events (order_id, kind, actor, from_value, to_value, note)
    values (v_order.id, 'fulfilment_state', 'system', v_order.fulfilment_state::text, 'placed',
            'paid, released to the merchant queue');

  else
    update public.payment_intents
       set state = 'failed',
           provider_reference = coalesce(p_provider_reference, provider_reference),
           failure_code = p_failure_code,
           failure_message = p_failure_message
     where id = v_intent.id;

    -- THE ORDER STAYS RETRYABLE. `payment_state` goes to `failed`, from which
    -- `authorising` is legal; `fulfilment_state` stays at `pending`, because
    -- `failed` there is terminal and would bury an order the customer is about
    -- to pay for on the second try.
    update public.orders
       set payment_state = 'failed'
     where id = v_order.id;

    insert into public.order_events (order_id, kind, actor, from_value, to_value, note)
    values (v_order.id, 'payment_state', 'system', v_order.payment_state::text, 'failed',
            coalesce(p_failure_code, 'payment declined'));
  end if;

  update public.payment_events set disposition = 'applied' where id = v_stored;
  return 'applied';
end;
$$;

revoke all on function public.record_payment_event(
  public.payment_provider, text, text, uuid, text, integer, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_payment_event(
  public.payment_provider, text, text, uuid, text, integer, text, text, text, jsonb
) to service_role;

-- ===========================================================================
-- 8. Walking away
-- ===========================================================================
-- The customer closed the provider's page. Releasing the attempt is what lets
-- them try again — without it, `attempt_in_flight` would lock them out of
-- their own order until it expired.
--
-- Only from `requires_action`: an attempt the provider has already taken
-- charge of might still succeed, and cancelling our record of it while the
-- money moves is how a paid order ends up looking unpaid.
create or replace function public.cancel_payment_intent(p_intent_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_intent public.payment_intents%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_intent from public.payment_intents
   where id = p_intent_id and user_id = v_user
     for update;

  if v_intent.id is null then
    raise exception 'intent_not_found' using errcode = 'P0002';
  end if;
  if v_intent.state <> 'requires_action' then
    raise exception 'intent_not_cancellable' using errcode = 'P0001';
  end if;

  update public.payment_intents
     set state = 'cancelled',
         failure_code = 'cancelled_by_customer'
   where id = v_intent.id;

  -- The ORDER's coarse axis says `failed`, which is accurate — no payment
  -- happened — and is the state a retry is allowed to leave. The nuance that
  -- nothing was declined lives on the intent, which is what the two levels are
  -- for.
  update public.orders
     set payment_state = 'failed'
   where id = v_intent.order_id
     and payment_state = 'authorising';

  insert into public.order_events (order_id, kind, actor, from_value, to_value, note)
  values (v_intent.order_id, 'payment_state', 'customer', 'authorising', 'failed',
          'customer cancelled the payment');
end;
$$;

revoke all on function public.cancel_payment_intent(uuid) from public, anon;
grant execute on function public.cancel_payment_intent(uuid) to authenticated;

-- ===========================================================================
-- 9. Drafts that nobody paid for
-- ===========================================================================
-- Callable rather than scheduled: there is no scheduler in this repo yet, and
-- `begin_payment` already refuses an expired draft, which is the guard that
-- matters. This is the tidy-up, so an abandoned order does not sit in the
-- customer's history looking like it is still going somewhere.
--
-- NOTHING IS DELETED. An expired order is history, and history is what a
-- support conversation is made of.
create or replace function public.expire_stale_drafts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  -- ONLY `requires_action`. An attempt the provider has already taken charge
  -- of — `processing` — might still succeed, and expiring it would turn
  -- uncertainty into failure while the money moves. Those are left for
  -- reconciliation against the provider, and the customer is shown "payment
  -- being confirmed" rather than a wrong answer.
  update public.payment_intents
     set state = 'expired'
   where state = 'requires_action'
     and expires_at is not null
     and expires_at <= now();

  -- An order left `authorising` with nothing live behind it is an attempt the
  -- customer abandoned before reaching the provider. `failed` is where a retry
  -- is allowed to start from, so this is what unsticks it.
  update public.orders o
     set payment_state = 'failed'
   where o.payment_state = 'authorising'
     and not exists (
       select 1 from public.payment_intents pi
        where pi.order_id = o.id
          and pi.state in ('requires_action', 'processing')
     );

  with expired as (
    update public.orders
       set fulfilment_state = 'cancelled'
     where fulfilment_state in ('draft', 'pending')
       and payment_state in ('unpaid', 'failed')
       and draft_expires_at is not null
       and draft_expires_at <= now()
    returning id, fulfilment_state
  )
  insert into public.order_events (order_id, kind, actor, to_value, note)
  select id, 'fulfilment_state', 'system', 'cancelled', 'unpaid draft expired'
    from expired;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_drafts() from public, anon, authenticated;
grant execute on function public.expire_stale_drafts() to service_role;

-- ===========================================================================
-- 10. Drafts get an expiry from the moment they are created
-- ===========================================================================
-- `create_order_draft` is replaced wholesale rather than patched: a function
-- body is not a diff, and a migration that recreates it is the only honest way
-- to show what it now does.
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

  select id into v_existing
    from public.orders
   where user_id = v_user
     and checkout_idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_cart
    from public.carts
   where user_id = v_user
   for update;

  if v_cart.id is null then
    raise exception 'cart_empty' using errcode = 'P0002';
  end if;

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

  select * into v_address
    from public.delivery_addresses
   where id = p_address_id and user_id = v_user;

  if v_address.id is null then
    raise exception 'address_not_found' using errcode = 'P0002';
  end if;
  if v_address.area_key is null then
    raise exception 'address_incomplete' using errcode = 'P0001';
  end if;

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
    cart_revision, checkout_idempotency_key, draft_expires_at
  ) values (
    v_reference, v_user, v_cart.merchant_id, v_cart.merchant_location_id,
    'draft', 'unpaid',
    v_cart.currency, 0, v_delivery,
    v_merchant.commission_rate_basis_points, v_merchant.merchant_keeps_delivery_fee,
    v_address.id,
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
    v_cart.revision, p_idempotency_key,
    -- THE CLOCK STARTS HERE. Everything in this row was true at this instant
    -- and nothing holds it true afterwards.
    now() + public.order_draft_ttl()
  )
  returning id into v_order_id;

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

-- ===========================================================================
-- 11. Clearing the basket that was actually paid for
-- ===========================================================================
-- A customer can carry on shopping while a payment is in flight. Clearing "the
-- cart" on success would then throw away a basket they built afterwards and
-- have never been charged for.
--
-- So clearing is tied to the REVISION the order was built from: if the cart
-- has moved on, it is a different basket and it stays.
create or replace function public.clear_paid_cart(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_order public.orders%rowtype;
  v_cart  public.carts%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_order from public.orders
   where id = p_order_id and user_id = v_user;

  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  -- ONLY FOR AN ORDER THAT WAS ACTUALLY PAID. Otherwise this would be a way
  -- for a client to empty its own cart by naming any order, which is harmless
  -- but is not what this function is for.
  if v_order.payment_state not in ('captured', 'authorised') then
    return false;
  end if;

  select * into v_cart from public.carts where user_id = v_user for update;
  if v_cart.id is null then
    return false;
  end if;

  -- THE EDGE CASE. A newer basket is not this order's basket.
  if v_cart.revision is distinct from v_order.cart_revision then
    return false;
  end if;

  delete from public.cart_lines where cart_id = v_cart.id;
  delete from public.carts where id = v_cart.id;
  return true;
end;
$$;

revoke all on function public.clear_paid_cart(uuid) from public, anon;
grant execute on function public.clear_paid_cart(uuid) to authenticated;
