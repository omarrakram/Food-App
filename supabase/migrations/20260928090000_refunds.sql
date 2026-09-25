-- Commerce-7: money that actually goes back.
--
-- Commerce-6 could work out that a refund was OWED. It could not pay one. The
-- gap mattered: `order_refund_position` would happily report a debt of 4 500
-- piastres against a delivered order forever, and nothing in the system would
-- ever move it. A pilot cannot ship like that — the first removed item is a
-- customer waiting for money nobody sent.
--
-- FIVE RULES, and everything in this file follows from them.
--
--   1. THE AMOUNT IS DERIVED, NEVER SUPPLIED. Not by the customer, not by the
--      merchant, not by an AKALT admin. `request_refund` takes no amount
--      argument at all, because an argument that exists is an argument
--      somebody eventually passes.
--
--   2. A REFUND IS NEVER LARGER THAN WHAT IS LEFT. `captured - refunded` is a
--      hard ceiling, held by a table constraint as well as by the function, so
--      the ceiling survives a future caller that forgets it.
--
--   3. THE MONEY MOVES ONCE. The provider confirms a refund twice — the
--      synchronous response and then the callback — and both routes end in the
--      same internal applier, which refuses the second one.
--
--   4. AN AMBIGUOUS RESULT IS NOT A RETRY. A refund request that timed out may
--      have succeeded. Re-sending it is how a customer is paid twice, so an
--      attempt with no clear answer goes to a human instead of back in the
--      queue. This is also Paymob's own instruction.
--
--   5. A FAILED REFUND IS STILL A DEBT. `refunded_minor` only moves on a real
--      success, so `refund_required_minor` stays positive until the money
--      actually goes back. Failure is visible by construction rather than by
--      somebody remembering to show it.
--
-- WHAT THIS FILE DOES NOT DO: settlement with the supermarket, payouts,
-- goodwill credits, or refunding to anything other than the original payment
-- method. A refund here is the reversal of a specific captured transaction.

-- ===========================================================================
-- 1. The position, without the access check
-- ===========================================================================
-- `order_refund_position` is the CUSTOMER'S and the MERCHANT'S view: it filters
-- to rows the caller may see, which is right for a screen and useless for a
-- background job, where `auth.uid()` is null and every order looks like
-- somebody else's.
--
-- So the arithmetic moves here, with no grants at all, and the public function
-- below becomes an access check wrapped around it. One formula, two callers —
-- rather than a second copy that drifts the first time the fee rules change.
create or replace function public.refund_position_of(p_order_id uuid)
returns table (
  currency                text,
  captured_minor          integer,
  items_subtotal_minor    integer,
  fulfilled_goods_minor   integer,
  amount_due_minor        integer,
  refunded_minor          integer,
  refund_required_minor   integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with o as (
    select * from public.orders where id = p_order_id
  ),
  adj as (
    select
      coalesce(sum(a.amount_minor), 0) as total,
      coalesce(sum(a.amount_minor) filter (
        where a.kind in ('substitution', 'item_removed', 'quantity_reduced', 'order_cancelled')
      ), 0) as goods
    from public.order_adjustments a
    join o on o.id = a.order_id
  )
  select
    o.currency,
    o.captured_minor,
    o.items_subtotal_minor,
    greatest(0, o.items_subtotal_minor + adj.goods)::integer,
    greatest(
      0,
      o.items_subtotal_minor + o.delivery_fee_minor + o.service_fee_minor
        - o.discount_minor + adj.total
    )::integer,
    o.refunded_minor,
    greatest(
      0,
      o.captured_minor - o.refunded_minor
        - greatest(
            0,
            o.items_subtotal_minor + o.delivery_fee_minor + o.service_fee_minor
              - o.discount_minor + adj.total
          )
    )::integer
  from o, adj;
$$;

-- NO CLIENT GRANTS. This is the unfiltered arithmetic; the access check lives
-- in the function below, and handing this one out would be handing out every
-- order's financial position. The service role has it because the service role
-- is the backend and bypasses RLS anyway — withholding it there would buy
-- nothing and make an operations query impossible.
revoke all on function public.refund_position_of(uuid) from public, anon, authenticated;
grant execute on function public.refund_position_of(uuid) to service_role;

comment on function public.refund_position_of(uuid) is
  'Unfiltered refund arithmetic for one order. Internal: no grants. Callers '
  'must do their own access check — public.order_refund_position does.';

-- The public view, now a thin access check over the same formula.
create or replace function public.order_refund_position(p_order_id uuid)
returns table (
  currency                text,
  captured_minor          integer,
  items_subtotal_minor    integer,
  fulfilled_goods_minor   integer,
  amount_due_minor        integer,
  refunded_minor          integer,
  refund_required_minor   integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.*
    from public.orders o
    join lateral public.refund_position_of(o.id) p on true
   where o.id = p_order_id
     and (o.user_id = auth.uid()
          or public.is_merchant_member(o.merchant_id, o.merchant_location_id));
$$;

revoke all on function public.order_refund_position(uuid) from public, anon;
grant execute on function public.order_refund_position(uuid) to authenticated;

-- ===========================================================================
-- 2. One attempt to send money back
-- ===========================================================================
create type public.refund_attempt_state as enum (
  -- Queued. Nothing has been said to the provider yet.
  'pending',
  -- Sent. Either waiting for the synchronous answer or for the callback.
  'processing',
  'succeeded',
  -- The provider refused, and said why. Retryable.
  'failed',
  -- Retries are spent, or the result was ambiguous. A person has to look.
  'abandoned'
);

create table public.refund_attempts (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null references public.orders (id) on delete restrict,
  -- The SUCCEEDED attempt the money arrived on. A refund reverses a specific
  -- transaction; it is not a transfer from a pool.
  payment_intent_id         uuid not null references public.payment_intents (id) on delete restrict,
  provider                  public.payment_provider not null,

  -- The provider's id for the ORIGINAL transaction, copied from the intent at
  -- request time so a later edit cannot redirect a refund somewhere else.
  provider_transaction_id   text,
  -- The provider's id for the REFUND — for Paymob, a child transaction of the
  -- original. Written from the synchronous response, matched by the callback.
  provider_refund_reference text,

  amount_minor              integer not null,
  currency                  text not null,

  state                     public.refund_attempt_state not null default 'pending',
  reason                    text not null,

  -- NULL means AKALT's own scheduler raised it. A uuid means a named admin
  -- did, and that distinction is the first thing anybody asks afterwards.
  requested_by              uuid references auth.users (id) on delete set null,

  -- The idempotency guarantee, held by the database. The automatic queue
  -- derives this from the order and the amount already refunded, so re-running
  -- it cannot produce a second refund for the same tranche.
  idempotency_key           text not null,

  attempts                  integer not null default 0,
  next_attempt_at           timestamptz not null default now(),
  -- WHEN THE PROVIDER WAS LAST ASKED. Distinct from `updated_at`, which moves
  -- for reasons that have nothing to do with a request being in flight —
  -- writing down a reference, recording an error. The stalled sweep keys on
  -- this one, because "we asked an hour ago and heard nothing" is the question
  -- it is asking.
  sent_at                   timestamptz,
  -- TRUE means: do not touch this again automatically. Set when the provider's
  -- answer did not tell us whether the money moved.
  manual_review             boolean not null default false,

  last_error_code           text,
  last_error_message        text,

  settled_at                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint refund_attempts_amount_positive check (amount_minor > 0),
  constraint refund_attempts_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint refund_attempts_attempts_sane check (attempts >= 0 and attempts <= 50),
  constraint refund_attempts_settled_when_succeeded
    check (state <> 'succeeded' or settled_at is not null),
  -- A success we cannot point at in the provider's dashboard is not evidence
  -- of anything. The demo provider writes its own synthetic reference.
  constraint refund_attempts_succeeded_has_reference
    check (state <> 'succeeded' or provider_refund_reference is not null),
  constraint refund_attempts_idempotent unique (idempotency_key)
);

-- ONE LIVE REFUND PER ORDER. Two concurrent attempts against the same captured
-- transaction is the exact shape of a double refund, and this is what stops it
-- rather than a check in application code.
create unique index refund_attempts_live_idx
  on public.refund_attempts (order_id)
  where state in ('pending', 'processing');

create index refund_attempts_order_idx
  on public.refund_attempts (order_id, created_at desc);
create index refund_attempts_due_idx
  on public.refund_attempts (next_attempt_at)
  where state in ('pending', 'failed') and not manual_review;
create index refund_attempts_reference_idx
  on public.refund_attempts (provider, provider_refund_reference)
  where provider_refund_reference is not null;

create trigger refund_attempts_set_updated_at
  before update on public.refund_attempts
  for each row execute function public.set_updated_at();

comment on table public.refund_attempts is
  'One attempt to send money back for one order. Never deleted, never '
  'overwritten by a later attempt: a refund that failed twice and worked on '
  'the third try is three rows.';
comment on column public.refund_attempts.manual_review is
  'The provider''s answer did not say whether the money moved. Automatic '
  'retry is off for this row — re-sending could pay the customer twice.';

alter table public.refund_attempts enable row level security;

-- The customer sees what is happening to their own money, and nothing else.
-- The MERCHANT deliberately gets no policy here: what AKALT refunds a customer
-- out of a captured payment is between AKALT and the customer, and the shop's
-- own position is already answerable through `order_refund_position`.
create policy "refund_attempts: customer reads own" on public.refund_attempts
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
       where o.id = refund_attempts.order_id
         and o.user_id = auth.uid()
    )
  );

-- AKALT admins see all of them. This is the operations view.
create policy "refund_attempts: admin reads all" on public.refund_attempts
  for select to authenticated using (public.is_admin());

-- There is deliberately NO insert, update or delete policy. Every write goes
-- through a security-definer function below.

-- ===========================================================================
-- 3. How long to wait before trying again
-- ===========================================================================
-- Separate function rather than a literal so the schedule is one fact, and so
-- a test can assert the shape of it without re-deriving the arithmetic.
--
-- 1 minute, 4, 16, 64, then capped at an hour. Aggressive at the start because
-- most failures are transient, slow afterwards because the ones that are not
-- will not become true by being asked faster.
create or replace function public.refund_backoff(p_attempts integer)
returns interval
language sql
immutable
as $$
  select least(
    interval '1 hour',
    interval '1 minute' * power(4, greatest(0, least(p_attempts, 6)))
  );
$$;

/** How many times a refund may be re-sent before a person has to look. */
create or replace function public.refund_max_attempts()
returns integer
language sql
immutable
as $$ select 6 $$;

-- ===========================================================================
-- 4. Asking for a refund
-- ===========================================================================
-- THE AMOUNT IS NOT A PARAMETER. It is read from the ledger, clamped to what
-- is actually left of the capture, and written to the attempt — so the only
-- thing a caller can decide is WHETHER, never HOW MUCH.
--
-- Who may call it: an AKALT admin, or the service role (the scheduler). Not a
-- customer, and explicitly not a merchant — a shop that could trigger refunds
-- against AKALT's captured funds is a shop that can drain the account.
create or replace function public.raise_refund(
  p_order_id     uuid,
  p_reason       text,
  p_requested_by uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order      public.orders%rowtype;
  v_intent     public.payment_intents%rowtype;
  v_position   record;
  v_amount     integer;
  v_key        text;
  v_id         uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.payment_state not in ('captured', 'partially_refunded') then
    raise exception 'nothing_captured' using errcode = 'P0001';
  end if;

  -- The transaction the money came in on. There can be several succeeded
  -- attempts in pathological cases; the most recent one is the one that
  -- captured, because `record_payment_event` refuses to settle a second.
  select * into v_intent
    from public.payment_intents
   where order_id = v_order.id
     and state = 'succeeded'
   order by settled_at desc nulls last
   limit 1;

  if v_intent.id is null then
    raise exception 'no_settled_payment' using errcode = 'P0001';
  end if;

  select * into v_position from public.refund_position_of(v_order.id);

  -- RULE 1 AND RULE 2 IN ONE LINE. The ledger says what is owed; the capture
  -- says what is left; the smaller of the two is the only defensible answer.
  v_amount := least(
    coalesce(v_position.refund_required_minor, 0),
    greatest(0, v_order.captured_minor - v_order.refunded_minor)
  );

  if v_amount <= 0 then
    raise exception 'nothing_to_refund' using errcode = 'P0001';
  end if;

  -- The default key is derived rather than random, so the same tranche cannot
  -- be queued twice — by a second admin, a retried request, or the scheduler
  -- running while somebody clicks.
  v_key := coalesce(
    nullif(trim(p_idempotency_key), ''),
    format('order:%s:after:%s', v_order.id, v_order.refunded_minor)
  );

  insert into public.refund_attempts (
    order_id, payment_intent_id, provider,
    provider_transaction_id, amount_minor, currency,
    reason, requested_by, idempotency_key
  ) values (
    v_order.id, v_intent.id, v_intent.provider,
    v_intent.provider_reference, v_amount, v_order.currency,
    coalesce(nullif(trim(p_reason), ''), 'refund due on the order ledger'),
    p_requested_by, v_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- Already queued. Returning the existing row is what makes a retried
    -- request a no-op rather than an error the caller has to interpret.
    select id into v_id from public.refund_attempts where idempotency_key = v_key;
    return v_id;
  end if;

  insert into public.order_events (order_id, kind, actor, actor_id, to_value, note)
  values (
    v_order.id, 'payment_state',
    case when p_requested_by is null then 'system' else 'akalt' end::public.commerce_actor,
    p_requested_by, 'refund_requested',
    format('refund of %s %s queued', v_amount, v_order.currency)
  );

  return v_id;
exception
  -- A second caller won the unique index between our check and our insert.
  -- The live-attempt index is doing its job; report the row that exists.
  when unique_violation then
    select id into v_id from public.refund_attempts
     where order_id = p_order_id and state in ('pending', 'processing')
     order by created_at desc limit 1;
    if v_id is null then raise; end if;
    return v_id;
end;
$$;

-- INTERNAL. No grants: the authorisation lives in the wrapper below, and a
-- caller who could reach this directly would be a caller who skipped it.
revoke all on function public.raise_refund(uuid, text, uuid, text)
  from public, anon, authenticated;

comment on function public.raise_refund(uuid, text, uuid, text) is
  'Queues a refund for the amount the ledger says. Internal: no grants, no '
  'access check. Callers must authorise — public.request_refund does.';

/**
 * The authorised entry point.
 *
 * Split from the work above so the SCHEDULER does not have to look like a
 * privileged user to run. `queue_due_refunds` calls `raise_refund` directly
 * with a null requester; a person calls this, and this is where the check is.
 *
 * `auth.uid() is null` means the service role, which reaches Postgres with no
 * JWT at all. Anybody presenting one must be an AKALT admin.
 */
create or replace function public.request_refund(
  p_order_id        uuid,
  p_reason          text,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  return public.raise_refund(p_order_id, p_reason, auth.uid(), p_idempotency_key);
end;
$$;

revoke all on function public.request_refund(uuid, text, text) from public, anon;
grant execute on function public.request_refund(uuid, text, text) to authenticated, service_role;

-- ===========================================================================
-- 5. Raising the refunds nobody asked for out loud
-- ===========================================================================
-- The automatic path. A rejected order, a removed item, a cheaper substitute:
-- the ledger already knows, and waiting for a human to notice is how a pilot
-- earns its first complaint.
--
-- ONLY ON A FINAL BASKET. While an order is being picked the ledger moves with
-- every decision, and refunding each movement separately would send four small
-- refunds where one belongs. Terminal fulfilment states only.
--
-- BOUNDED AND IDEMPOTENT. It takes a limit, it skips orders that already have
-- a live attempt, and the derived idempotency key means running it twice in
-- the same minute produces the same rows.
create or replace function public.queue_due_refunds(p_limit integer default 25)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order  record;
  v_count  integer := 0;
begin
  for v_order in
    select o.id
      from public.orders o
     where o.payment_state in ('captured', 'partially_refunded')
       and o.fulfilment_state in ('rejected', 'cancelled', 'delivered', 'undeliverable')
       and (select p.refund_required_minor from public.refund_position_of(o.id) p) > 0
       -- Nothing in flight, and nothing waiting on a person.
       and not exists (
         select 1 from public.refund_attempts r
          where r.order_id = o.id
            and (r.state in ('pending', 'processing')
                 or (r.state in ('failed', 'abandoned') and r.manual_review))
       )
     order by o.updated_at
     limit greatest(1, least(coalesce(p_limit, 25), 200))
  loop
    begin
      perform public.raise_refund(
        v_order.id, 'automatic: the order ledger owes the customer', null);
      v_count := v_count + 1;
    exception
      -- One unrefundable order must not stop the batch. `nothing_to_refund`
      -- and `no_settled_payment` are both ordinary here: the ledger can move
      -- between the scan and the insert.
      when others then
        null;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.queue_due_refunds(integer) from public, anon, authenticated;
grant execute on function public.queue_due_refunds(integer) to service_role;

-- ===========================================================================
-- 6. Handing work to the executor
-- ===========================================================================
-- `for update skip locked` is the whole overlap story: two schedulers running
-- at once take different rows rather than the same row twice.
--
-- Claiming MARKS THE ROW BEFORE the provider is called, and bumps the attempt
-- counter at the same moment. A crash between the claim and the answer leaves
-- a `processing` row that the sweeper below sends to a human — which is the
-- correct outcome, because we do not know whether the money moved.
create or replace function public.claim_refund_attempts(p_limit integer default 10)
returns table (
  id                      uuid,
  order_id                uuid,
  provider                public.payment_provider,
  provider_transaction_id text,
  amount_minor            integer,
  currency                text,
  attempts                integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select r.id
      from public.refund_attempts r
     where r.state in ('pending', 'failed')
       and not r.manual_review
       and r.next_attempt_at <= now()
       and r.attempts < public.refund_max_attempts()
     order by r.next_attempt_at
     limit greatest(1, least(coalesce(p_limit, 10), 50))
     for update skip locked
  )
  update public.refund_attempts r
     set state           = 'processing',
         attempts        = r.attempts + 1,
         sent_at         = now(),
         next_attempt_at = now() + public.refund_backoff(r.attempts + 1)
    from due
   where r.id = due.id
  returning r.id, r.order_id, r.provider, r.provider_transaction_id,
            r.amount_minor, r.currency, r.attempts;
end;
$$;

revoke all on function public.claim_refund_attempts(integer) from public, anon, authenticated;
grant execute on function public.claim_refund_attempts(integer) to service_role;

-- ===========================================================================
-- 7. The money actually moving
-- ===========================================================================
-- THE ONLY PLACE `orders.refunded_minor` GOES UP. Both routes into it — the
-- synchronous response from the provider and the callback that follows —
-- arrive here, and the first one to get the lock wins. The second gets
-- `duplicate` and changes nothing.
--
-- Internal: no grants. It has no access check of its own because its callers
-- are the ones that do.
create or replace function public.apply_refund_success(
  p_refund_id uuid,
  p_reference text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_refund   public.refund_attempts%rowtype;
  v_order    public.orders%rowtype;
  v_new      integer;
  v_to       public.payment_state;
begin
  select * into v_refund from public.refund_attempts where id = p_refund_id for update;
  if v_refund.id is null then
    return 'unknown_refund';
  end if;

  -- RULE 3. The money moves once.
  if v_refund.state = 'succeeded' then
    return 'duplicate';
  end if;

  select * into v_order from public.orders where id = v_refund.order_id for update;

  v_new := v_order.refunded_minor + v_refund.amount_minor;

  -- RULE 2, checked again at the moment of application rather than only at
  -- request time: the ledger may have moved since, and a refund that would now
  -- exceed the capture is a fact for a person, not an arithmetic error to
  -- swallow.
  if v_new > v_order.captured_minor then
    update public.refund_attempts
       set state              = 'abandoned',
           manual_review      = true,
           last_error_code    = 'exceeds_capture',
           last_error_message = format(
             'refunding %s would take the total past the captured %s',
             v_refund.amount_minor, v_order.captured_minor
           )
     where id = v_refund.id;
    return 'exceeds_capture';
  end if;

  v_to := case when v_new >= v_order.captured_minor
               then 'refunded' else 'partially_refunded' end;

  update public.orders
     set refunded_minor = v_new,
         payment_state  = v_to
   where id = v_order.id;

  -- The attempt's own tally, so a reconciliation can compare our two records
  -- of the same money without joining through the order.
  update public.payment_intents
     set refunded_minor = least(amount_minor, refunded_minor + v_refund.amount_minor)
   where id = v_refund.payment_intent_id;

  update public.refund_attempts
     set state                     = 'succeeded',
         settled_at                = now(),
         manual_review             = false,
         last_error_code           = null,
         last_error_message        = null,
         provider_refund_reference = coalesce(p_reference, provider_refund_reference,
                                              'internal:' || v_refund.id::text)
   where id = v_refund.id;

  insert into public.order_events (order_id, kind, actor, from_value, to_value, note)
  values (v_order.id, 'payment_state', 'system',
          v_order.payment_state::text, v_to::text,
          format('refunded %s %s', v_refund.amount_minor, v_refund.currency));

  return 'applied';
end;
$$;

revoke all on function public.apply_refund_success(uuid, text) from public, anon, authenticated;

comment on function public.apply_refund_success(uuid, text) is
  'The only writer of orders.refunded_minor. Internal: no grants. Idempotent — '
  'a second call for the same attempt returns duplicate and changes nothing.';

-- ===========================================================================
-- 8. What the executor reports back
-- ===========================================================================
-- Three answers, and the third is the one that matters:
--
--   succeeded   the provider confirmed the refund transaction. Money moved.
--   failed      the provider refused, and said why. Retry on the backoff.
--   ambiguous   a timeout, a torn connection, a response we cannot read. RULE
--               4: this does NOT go back in the queue. It goes to a person.
create or replace function public.record_refund_result(
  p_refund_id     uuid,
  p_outcome       text,
  p_reference     text default null,
  p_error_code    text default null,
  p_error_message text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_refund public.refund_attempts%rowtype;
begin
  if p_outcome not in ('succeeded', 'failed', 'ambiguous') then
    raise exception 'unknown_outcome' using errcode = 'P0001';
  end if;

  select * into v_refund from public.refund_attempts where id = p_refund_id for update;
  if v_refund.id is null then
    raise exception 'refund_not_found' using errcode = 'P0002';
  end if;

  if p_outcome = 'succeeded' then
    return public.apply_refund_success(p_refund_id, p_reference);
  end if;

  if v_refund.state = 'succeeded' then
    -- A late failure report against a refund the callback already settled.
    -- The settled answer wins; nothing is undone.
    return 'ignored_out_of_order';
  end if;

  update public.refund_attempts
     set state = (case
                   when p_outcome = 'ambiguous' then 'abandoned'
                   when v_refund.attempts >= public.refund_max_attempts() then 'abandoned'
                   else 'failed'
                 end)::public.refund_attempt_state,
         manual_review = (p_outcome = 'ambiguous'),
         provider_refund_reference = coalesce(p_reference, provider_refund_reference),
         last_error_code = coalesce(nullif(trim(p_error_code), ''),
                                    case when p_outcome = 'ambiguous'
                                         then 'provider_no_answer' else 'refund_failed' end),
         last_error_message = nullif(trim(p_error_message), '')
   where id = v_refund.id;

  return p_outcome;
end;
$$;

revoke all on function public.record_refund_result(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_refund_result(uuid, text, text, text, text)
  to service_role;

-- ===========================================================================
-- 9. Attempts the executor never came back from
-- ===========================================================================
-- A `processing` row older than the threshold means the function died, the
-- container was recycled, or the provider never answered. RULE 4 applies: we
-- do not know whether the money moved, so nobody re-sends it automatically.
create or replace function public.sweep_stalled_refunds(p_older_than interval default interval '15 minutes')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  with stalled as (
    update public.refund_attempts
       set state              = 'abandoned',
           manual_review      = true,
           last_error_code    = 'provider_no_answer',
           last_error_message = 'the refund request was sent and never answered; '
                                'check the provider before re-sending'
     where state = 'processing'
       and coalesce(sent_at, created_at) < now() - coalesce(p_older_than, interval '15 minutes')
    returning order_id
  )
  insert into public.order_events (order_id, kind, actor, to_value, note)
  select order_id, 'payment_state', 'system', 'refund_needs_review',
         'a refund was sent and the provider did not answer'
    from stalled;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.sweep_stalled_refunds(interval)
  from public, anon, authenticated;
grant execute on function public.sweep_stalled_refunds(interval) to service_role;

-- ===========================================================================
-- 10. The callback path, which is the same path as before
-- ===========================================================================
-- `record_payment_event` is rewritten rather than joined by a second function,
-- because the duplicate guard — one event id, one financial effect — has to
-- cover refunds too. A refund callback delivered twice must increment
-- `refunded_minor` once, and the only way to be sure of that is for both kinds
-- of event to go through the same unique constraint.
--
-- WHAT CHANGED from Commerce-5:
--   * `p_kind` is now meaningful: 'transaction', 'refund' or 'void'.
--   * The refund branch runs BEFORE the settled-attempt check, because every
--     refund arrives against an attempt that is already `succeeded` — under
--     the old order every one of them would have been read as a late duplicate
--     and thrown away.
--   * 'void' is recorded and deliberately not applied. AKALT never voids in
--     V1, so a void can only have come from somebody in the Paymob dashboard,
--     and guessing at the accounting for it would be worse than flagging it.
--
-- Dispositions added: 'unknown_refund', 'refund_amount_mismatch',
-- 'exceeds_capture', 'unsupported_kind'.
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
  v_refund      public.refund_attempts%rowtype;
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

  -- --- REFUNDS ------------------------------------------------------------
  -- Before the settled-attempt check, on purpose: see the note above.
  if p_kind = 'refund' then
    -- Match on the provider's own refund id first — that is what the executor
    -- wrote down when it made the call. Fall back to the live attempt for this
    -- intent with exactly this amount, which covers a callback that beat the
    -- synchronous response home.
    if p_provider_reference is not null then
      select * into v_refund from public.refund_attempts
       where provider = p_provider
         and provider_refund_reference = p_provider_reference
       limit 1;
    end if;

    if v_refund.id is null then
      select * into v_refund from public.refund_attempts
       where payment_intent_id = v_intent.id
         and state in ('pending', 'processing')
         and (p_amount_minor is null or amount_minor = p_amount_minor)
       order by created_at
       limit 1;
    end if;

    if v_refund.id is null then
      -- A refund we never asked for. Kept as evidence and applied to nothing:
      -- somebody refunded in the provider's dashboard, and our books and
      -- theirs now disagree in a way a person has to reconcile.
      update public.payment_events set disposition = 'unknown_refund' where id = v_stored;
      insert into public.order_events (order_id, kind, actor, to_value, note)
      values (v_intent.order_id, 'payment_state', 'system', 'refund_unmatched',
              'the provider reported a refund AKALT did not request');
      return 'unknown_refund';
    end if;

    if p_amount_minor is not null and p_amount_minor <> v_refund.amount_minor then
      update public.payment_events set disposition = 'refund_amount_mismatch' where id = v_stored;
      update public.refund_attempts
         set state = 'abandoned', manual_review = true,
             last_error_code = 'amount_mismatch',
             last_error_message = format('provider refunded %s against a request for %s',
                                         p_amount_minor, v_refund.amount_minor)
       where id = v_refund.id;
      return 'refund_amount_mismatch';
    end if;

    if p_outcome = 'succeeded' then
      v_disposition := public.apply_refund_success(v_refund.id, p_provider_reference);
    elsif p_outcome = 'pending' then
      v_disposition := 'ignored_out_of_order';
    else
      perform public.record_refund_result(
        v_refund.id, 'failed', p_provider_reference, p_failure_code, p_failure_message
      );
      v_disposition := 'applied';
    end if;

    update public.payment_events set disposition = v_disposition where id = v_stored;
    return v_disposition;
  end if;

  -- --- VOIDS --------------------------------------------------------------
  if p_kind = 'void' then
    update public.payment_events set disposition = 'unsupported_kind' where id = v_stored;
    insert into public.order_events (order_id, kind, actor, to_value, note)
    values (v_intent.order_id, 'payment_state', 'system', 'void_reported',
            'the provider reported a void; AKALT does not void in V1 — reconcile by hand');
    return 'unsupported_kind';
  end if;

  -- --- ORDINARY TRANSACTIONS ----------------------------------------------
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
-- 11. What the customer is told
-- ===========================================================================
-- One row per order, joining the ledger position to the live attempt, so the
-- app does not have to fetch two things and reason about the pairing. The
-- vocabulary here is the vocabulary on the screen — see
-- features/commerce/refund.ts, which must agree with it.
create or replace function public.order_refund_status(p_order_id uuid)
returns table (
  currency              text,
  captured_minor        integer,
  refunded_minor        integer,
  refund_required_minor integer,
  attempt_state         text,
  attempt_amount_minor  integer,
  needs_review          boolean,
  last_error_code       text,
  requested_at          timestamptz,
  settled_at            timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.currency,
    p.captured_minor,
    p.refunded_minor,
    p.refund_required_minor,
    r.state::text,
    r.amount_minor,
    coalesce(r.manual_review, false),
    r.last_error_code,
    r.created_at,
    r.settled_at
  from public.orders o
  join lateral public.refund_position_of(o.id) p on true
  left join lateral (
    select * from public.refund_attempts a
     where a.order_id = o.id
     order by a.created_at desc
     limit 1
  ) r on true
  where o.id = p_order_id
    and (o.user_id = auth.uid() or public.is_admin());
$$;

revoke all on function public.order_refund_status(uuid) from public, anon;
grant execute on function public.order_refund_status(uuid) to authenticated;
