-- Commerce-6: the merchant side.
--
-- A paid order has been sitting at `placed` with nobody able to see it. This
-- gives it somewhere to go, and gives the people who work in the shop an
-- identity — which is the part that has to be right before anything else here
-- matters.
--
-- THE RULE THIS FILE ENFORCES: a merchant operator acts for ONE merchant, and
-- only on orders that have already been paid for. They cannot see another
-- shop's orders, cannot touch money, cannot set a status by writing a column,
-- and cannot mark an order ready while somebody is still waiting to be asked
-- about a substitution.
--
-- Not here, on purpose: AKALT riders, live tracking, settlement payouts,
-- promotions, and any flow that would charge the customer more than they have
-- already paid.

-- ===========================================================================
-- 1. Who works in the shop
-- ===========================================================================
-- DELIBERATELY SMALL. Two roles, one table. An enterprise RBAC system is a
-- month of work and a week of bugs for a V1 with one merchant, and the thing
-- that actually matters — "may this person act for this shop" — is answerable
-- without any of it.
create type public.merchant_role as enum ('admin', 'operator');

create table public.merchant_memberships (
  id                   uuid primary key default gen_random_uuid(),
  merchant_id          uuid not null references public.merchants (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  -- NULL means every branch of this merchant. A chain's area manager has one
  -- row; a branch's picker has one per branch they work in.
  merchant_location_id uuid references public.merchant_locations (id) on delete cascade,
  role                 public.merchant_role not null default 'operator',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Two indexes rather than one constraint, because `unique` treats every NULL
-- as distinct and would happily store "all branches" twice.
create unique index merchant_memberships_scoped_idx
  on public.merchant_memberships (merchant_id, user_id, merchant_location_id)
  where merchant_location_id is not null;
create unique index merchant_memberships_chain_idx
  on public.merchant_memberships (merchant_id, user_id)
  where merchant_location_id is null;

create index merchant_memberships_user_idx on public.merchant_memberships (user_id);

create trigger merchant_memberships_set_updated_at
  before update on public.merchant_memberships
  for each row execute function public.set_updated_at();

comment on table public.merchant_memberships is
  'Merchant staff. A row grants the user the right to act for that merchant, '
  'at one branch or at all of them. There is no other route in.';

/**
 * May the caller act for this merchant, at this branch?
 *
 * `security definer` and `stable`: it is called from inside RLS policies on
 * `orders`, and a policy that had to read `merchant_memberships` through its
 * own RLS would either recurse or need a policy loose enough to leak the
 * staff list.
 */
create or replace function public.is_merchant_member(
  p_merchant uuid,
  p_location uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.merchant_memberships m
     where m.user_id = auth.uid()
       and m.merchant_id = p_merchant
       and (m.merchant_location_id is null or m.merchant_location_id = p_location)
  );
$$;

revoke all on function public.is_merchant_member(uuid, uuid) from public, anon;
grant execute on function public.is_merchant_member(uuid, uuid) to authenticated;

-- ===========================================================================
-- 2. What the merchant may see
-- ===========================================================================
alter table public.merchant_memberships enable row level security;

-- You can see your OWN memberships and nobody else's. A merchant's staff list
-- is not something another member needs, and it is exactly the sort of thing
-- that leaks once a screen decides it would be convenient.
create policy "merchant_memberships: own rows" on public.merchant_memberships
  for select to authenticated using (user_id = auth.uid());

/**
 * The queue gate, as one expression.
 *
 * Written once here and used by every merchant-facing policy below, because
 * the rule — paid, and mine — is the whole security model of this phase and
 * five copies of it would eventually disagree.
 *
 * `MERCHANT_VISIBLE_STATES` in features/commerce/fulfilment-state.ts is the
 * client's copy of the state half. `draft` and `pending` are absent from both:
 * picking an unpaid basket is the merchant's loss.
 */
create or replace function public.merchant_may_see_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.orders o
     where o.id = p_order_id
       and o.fulfilment_state in ('placed', 'accepted', 'picking', 'ready',
                                  'dispatched', 'delivered', 'undeliverable',
                                  'rejected', 'cancelled')
       and public.is_merchant_member(o.merchant_id, o.merchant_location_id)
  );
$$;

revoke all on function public.merchant_may_see_order(uuid) from public, anon;
grant execute on function public.merchant_may_see_order(uuid) to authenticated;

-- THE QUEUE. Paid, and mine. Note there is no update policy: a status is not
-- a column a client writes.
create policy "orders: merchant reads its own paid orders" on public.orders
  for select to authenticated
  using (
    fulfilment_state in ('placed', 'accepted', 'picking', 'ready',
                         'dispatched', 'delivered', 'undeliverable',
                         'rejected', 'cancelled')
    and public.is_merchant_member(merchant_id, merchant_location_id)
  );

create policy "order_items: merchant reads via its own order" on public.order_items
  for select to authenticated using (public.merchant_may_see_order(order_id));

create policy "order_events: merchant reads via its own order" on public.order_events
  for select to authenticated using (public.merchant_may_see_order(order_id));

create policy "order_substitutions: merchant reads via its own order"
  on public.order_substitutions
  for select to authenticated using (public.merchant_may_see_order(order_id));

create policy "order_adjustments: merchant reads via its own order"
  on public.order_adjustments
  for select to authenticated using (public.merchant_may_see_order(order_id));

-- NOTHING IS ADDED FOR `delivery_addresses`, `payment_intents` OR
-- `payment_events`, and that is the point. What the merchant needs to deliver
-- is in `orders.delivery_snapshot`, frozen at placement; the address book, the
-- payment attempts and the provider callbacks are the customer's and ours.

-- ===========================================================================
-- 3. Operational columns
-- ===========================================================================
alter table public.orders
  -- The merchant's own rider. A name and a number so the customer can be told
  -- who is at the door — NOT an account, not a device, not a location feed.
  add column rider_name      text,
  add column rider_phone     text,
  add column delivered_at    timestamptz,
  add column rejected_reason text;

comment on column public.orders.rider_name is
  'The merchant''s rider. AKALT has no riders and no rider accounts.';

-- ===========================================================================
-- 4. Substitutions: a decision, not a deletion
-- ===========================================================================
-- `removed` says what happened without pretending somebody rejected an offer:
-- there was nothing suitable, so the line came off. `substitutionAdjustmentMinor`
-- in features/commerce/ledger.ts already refunds the full line whenever there
-- is no replacement, and this makes the reason readable.
alter type public.substitution_decision add value if not exists 'removed';

alter table public.order_substitutions
  add column reason text,
  -- After this, an unanswered "shall I substitute?" falls back to the
  -- customer's rule rather than holding up a shop full of shopping.
  add column expires_at timestamptz,
  add column decided_by uuid references auth.users (id) on delete set null;

create index order_substitutions_pending_idx
  on public.order_substitutions (order_id)
  where decision = 'pending_customer';

-- ===========================================================================
-- 5. Can the DATABASE tell whether a product is safe?
-- ===========================================================================
-- It could not, and that is a real gap this phase has to close. A product with
-- no rows in `merchant_product_allergens` might be one the merchant declared
-- free of allergens, or one they published nothing about — and for somebody
-- with an allergy those are opposite answers. The bundled catalogue models the
-- difference (`allergens: null` vs `[]`); the schema did not.
--
-- Without this, `report_item_unavailable` could not offer a safe replacement
-- without either guessing or refusing everything.
alter table public.merchant_products
  add column allergens_published boolean not null default false;

comment on column public.merchant_products.allergens_published is
  'The merchant publishes allergen data for this product. FALSE means unknown, '
  'which is never safe for a customer with allergies — it is not the same as '
  'a declaration that the product contains none.';

/**
 * Is this product safe and suitable for the person who placed this order?
 *
 * The SQL half of features/commerce/sourcing.ts, and it follows the same two
 * rules:
 *
 *   UNKNOWN IS NEVER SAFE. A customer with allergies is refused a product
 *   whose allergen data the merchant has not published, not offered it with a
 *   shrug.
 *
 *   A DIET MUST BE POSITIVELY DECLARED COMPATIBLE. A missing row is unknown,
 *   and unknown is not compatible.
 */
create or replace function public.product_suits_customer(
  p_product_id uuid,
  p_user_id    uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_has_allergens boolean;
  v_published     boolean;
  v_diet          public.dietary_preference;
begin
  select exists (select 1 from public.user_allergens where user_id = p_user_id)
    into v_has_allergens;

  if v_has_allergens then
    select allergens_published into v_published
      from public.merchant_products where id = p_product_id;

    if not coalesce(v_published, false) then
      return false;
    end if;

    if exists (
      select 1
        from public.merchant_product_allergens mpa
        join public.user_allergens ua on ua.allergen = mpa.allergen
       where mpa.merchant_product_id = p_product_id
         and ua.user_id = p_user_id
    ) then
      return false;
    end if;
  end if;

  select dietary_preference into v_diet
    from public.user_preferences where user_id = p_user_id;

  -- `none` is no requirement; `other` is a requirement nothing can satisfy by
  -- catalogue metadata, so it is treated as "we cannot confirm this" and the
  -- product is not auto-selected.
  if v_diet is null or v_diet = 'none' then
    return true;
  end if;
  if v_diet = 'other' then
    return false;
  end if;

  return exists (
    select 1 from public.merchant_product_diets
     where merchant_product_id = p_product_id
       and diet = v_diet
       and is_compatible
  );
end;
$$;

revoke all on function public.product_suits_customer(uuid, uuid) from public, anon;
grant execute on function public.product_suits_customer(uuid, uuid) to authenticated;

-- ===========================================================================
-- 6. Moving an order along
-- ===========================================================================
-- THE ONLY WAY A STATUS CHANGES. There is no update policy on `orders`, so a
-- dashboard cannot write `fulfilment_state` however convenient that would be.
-- Every move comes through here, is checked against the state machine, and
-- leaves a row in `order_events` saying who did it and when.
--
-- IDEMPOTENT. A double-tapped ACCEPT is one accept, not an error the operator
-- has to interpret while holding a crate of shopping.
create or replace function public.advance_fulfilment(
  p_order_id    uuid,
  p_to          public.order_fulfilment_state,
  p_reason      text default null,
  p_rider_name  text default null,
  p_rider_phone text default null
)
returns public.order_fulfilment_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_order   public.orders%rowtype;
  v_allowed boolean;
  v_open    integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if not public.is_merchant_member(v_order.merchant_id, v_order.merchant_location_id) then
    -- The same answer a stranger gets for an order that does not exist. A
    -- different one would confirm that it does.
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  -- ALREADY THERE. Not an error: two operators tapping the same button is a
  -- shop, not an attack.
  if v_order.fulfilment_state = p_to then
    return p_to;
  end if;

  -- PAID, OR IT IS NOT THE MERCHANT'S TO TOUCH. The queue policy says the same
  -- thing about visibility; this says it about action, because a policy can be
  -- widened by somebody who only meant to fix a screen.
  if v_order.payment_state not in ('captured', 'authorised') then
    raise exception 'order_not_paid' using errcode = 'P0001';
  end if;

  -- The merchant's half of ORDER_FULFILMENT_TRANSITIONS in
  -- features/commerce/fulfilment-state.ts. Written out rather than derived, so
  -- a change to either has to be a change to both — and so `delivered` cannot
  -- be reached from `placed` by anybody in a hurry.
  v_allowed := case
    when v_order.fulfilment_state = 'placed'      and p_to in ('accepted', 'rejected') then true
    when v_order.fulfilment_state = 'accepted'    and p_to = 'picking'                 then true
    when v_order.fulfilment_state = 'picking'     and p_to = 'ready'                   then true
    when v_order.fulfilment_state = 'ready'       and p_to = 'dispatched'              then true
    when v_order.fulfilment_state = 'dispatched'  and p_to in ('delivered', 'undeliverable') then true
    when v_order.fulfilment_state = 'undeliverable' and p_to = 'delivered'             then true
    else false
  end;

  if not v_allowed then
    raise exception 'illegal_transition' using errcode = 'P0001';
  end if;

  -- READY MEANS EVERY LINE IS SETTLED. Not "mostly picked": a customer still
  -- waiting to be asked about a replacement must not find their order on a
  -- motorbike with the question unanswered.
  if p_to = 'ready' then
    select count(*) into v_open
      from public.order_substitutions
     where order_id = v_order.id and decision = 'pending_customer';

    if v_open > 0 then
      raise exception 'substitutions_unresolved' using errcode = 'P0001';
    end if;
  end if;

  if p_to = 'rejected' then
    -- THE WHOLE ORDER COMES OFF. `order_cancelled` is a goods adjustment, so
    -- the ledger nets the merchandise to zero, charges no commission, and
    -- reports the captured amount as refund due. It does NOT refund anything —
    -- see the note on `order_refund_position`.
    insert into public.order_adjustments (order_id, kind, amount_minor, reason, actor, actor_id)
    values (
      v_order.id, 'order_cancelled',
      -(v_order.items_subtotal_minor + v_order.delivery_fee_minor
        + v_order.service_fee_minor - v_order.discount_minor),
      coalesce(p_reason, 'merchant rejected the order'), 'merchant', v_user
    );
  end if;

  update public.orders
     set fulfilment_state = p_to,
         rider_name       = case when p_to = 'dispatched'
                                 then coalesce(p_rider_name, rider_name) else rider_name end,
         rider_phone      = case when p_to = 'dispatched'
                                 then coalesce(p_rider_phone, rider_phone) else rider_phone end,
         delivered_at     = case when p_to = 'delivered' then now() else delivered_at end,
         rejected_reason  = case when p_to = 'rejected' then p_reason else rejected_reason end
   where id = v_order.id;

  insert into public.order_events (order_id, kind, actor, actor_id, from_value, to_value, note)
  values (v_order.id, 'fulfilment_state', 'merchant', v_user,
          v_order.fulfilment_state::text, p_to::text, p_reason);

  return p_to;
end;
$$;

revoke all on function public.advance_fulfilment(
  uuid, public.order_fulfilment_state, text, text, text
) from public, anon;
grant execute on function public.advance_fulfilment(
  uuid, public.order_fulfilment_state, text, text, text
) to authenticated;

-- ===========================================================================
-- 7. An item the shop has not got
-- ===========================================================================
-- What happens next is the CUSTOMER'S rule, not the picker's preference, and
-- the price policy is absolute in V1: a replacement may never cost more than
-- the line it replaces. We captured a specific amount; charging above it would
-- need a second payment, and there is deliberately no second payment in this
-- phase.
--
-- THE ORIGINAL LINE IS NEVER DELETED. `order_items` is what the customer
-- bought; a substitution is a row beside it saying what happened instead.
create or replace function public.report_item_unavailable(
  p_order_item_id          uuid,
  p_replacement_product_id uuid default null,
  p_reason                 text default null,
  p_response_window        interval default interval '20 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user        uuid := auth.uid();
  v_item        public.order_items%rowtype;
  v_order       public.orders%rowtype;
  v_replacement public.merchant_products%rowtype;
  v_usable      boolean := false;
  v_delta       integer := 0;
  v_decision    public.substitution_decision;
  v_sub_id      uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_item from public.order_items where id = p_order_item_id;
  if v_item.id is null then
    raise exception 'order_item_not_found' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = v_item.order_id for update;

  if not public.is_merchant_member(v_order.merchant_id, v_order.merchant_location_id) then
    raise exception 'order_item_not_found' using errcode = 'P0002';
  end if;
  if v_order.fulfilment_state not in ('accepted', 'picking') then
    raise exception 'order_not_being_picked' using errcode = 'P0001';
  end if;

  -- ONE OPEN QUESTION PER LINE. A second report on the same item would produce
  -- two adjustments for one absence, which is a refund paid twice.
  if exists (
    select 1 from public.order_substitutions
     where order_item_id = v_item.id
       and decision <> 'rejected'
  ) then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;

  -- --- Is the proposed replacement usable at all? --------------------------
  if p_replacement_product_id is not null then
    select * into v_replacement from public.merchant_products
     where id = p_replacement_product_id;

    v_usable :=
      v_replacement.id is not null
      -- The same branch. Another shop's shelf is not a replacement.
      and v_replacement.merchant_location_id = v_order.merchant_location_id
      and v_replacement.is_active
      and v_replacement.availability <> 'out_of_stock'
      and v_replacement.price_minor is not null
      -- THE V1 PRICE RULE. Equal or cheaper, never more. We hold a captured
      -- amount and there is no flow in this phase that could raise it.
      and v_replacement.price_minor <= v_item.unit_price_minor
      -- AND IT MUST BE SAFE. An unsafe substitute is never offered, whatever
      -- the customer's substitution preference says.
      and public.product_suits_customer(v_replacement.id, v_order.user_id);
  end if;

  if v_usable then
    v_delta := v_replacement.price_minor - v_item.unit_price_minor;

    v_decision := case v_order.substitution_preference
      -- "Closest option" — and it is already known to be safe and no dearer.
      when 'best_match' then 'auto_approved'::public.substitution_decision
      when 'contact_me' then 'pending_customer'::public.substitution_decision
      -- "Just remove it" is an instruction, not a preference to be overridden
      -- because we happen to have found something.
      when 'remove'     then 'removed'::public.substitution_decision
    end;
  else
    -- Nothing suitable. The line comes off and the money comes back.
    v_decision := 'removed';
  end if;

  insert into public.order_substitutions (
    order_id, order_item_id,
    original_product_id, original_product_name, original_unit_price_minor,
    replacement_product_id, replacement_product_name, replacement_unit_price_minor,
    unit_price_delta_minor, quantity, decision, decided_at, decided_by,
    proposed_by, reason, expires_at
  ) values (
    v_order.id, v_item.id,
    v_item.merchant_product_id, v_item.product_name, v_item.unit_price_minor,
    case when v_decision in ('auto_approved', 'pending_customer') then v_replacement.id end,
    case when v_decision in ('auto_approved', 'pending_customer') then v_replacement.name end,
    case when v_decision in ('auto_approved', 'pending_customer') then v_replacement.price_minor end,
    case when v_decision in ('auto_approved', 'pending_customer') then v_delta else 0 end,
    v_item.quantity,
    v_decision,
    case when v_decision = 'pending_customer' then null else now() end,
    case when v_decision = 'pending_customer' then null else v_user end,
    'merchant',
    p_reason,
    case when v_decision = 'pending_customer' then now() + p_response_window end
  )
  returning id into v_sub_id;

  -- A decision that is already made moves money now. A pending one moves
  -- nothing until the customer answers.
  if v_decision <> 'pending_customer' then
    perform public.apply_substitution_adjustment(v_sub_id);
  end if;

  insert into public.order_events (order_id, kind, actor, actor_id, to_value, note)
  values (v_order.id, 'substitution', 'merchant', v_user, v_decision::text,
          coalesce(p_reason, v_item.product_name));

  return v_sub_id;
end;
$$;

revoke all on function public.report_item_unavailable(uuid, uuid, text, interval)
  from public, anon;
grant execute on function public.report_item_unavailable(uuid, uuid, text, interval)
  to authenticated;

-- ===========================================================================
-- 8. What a settled substitution does to the money
-- ===========================================================================
-- One writer, so the arithmetic exists once. It mirrors
-- `substitutionAdjustmentMinor` in features/commerce/ledger.ts, which is the
-- version the client folds — they have to agree, and the tests check they do.
--
-- Internal: every caller here is already a definer function that has checked
-- who is asking.
create or replace function public.apply_substitution_adjustment(p_substitution_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub    public.order_substitutions%rowtype;
  v_amount integer;
begin
  select * into v_sub from public.order_substitutions where id = p_substitution_id;
  if v_sub.id is null then
    raise exception 'substitution_not_found' using errcode = 'P0002';
  end if;

  -- Already accounted for. Calling twice must not refund twice.
  if exists (
    select 1 from public.order_adjustments
     where order_item_id = v_sub.order_item_id
       and kind in ('substitution', 'item_removed')
  ) then
    return;
  end if;

  if v_sub.replacement_product_id is null
     or v_sub.decision in ('rejected', 'removed') then
    -- No replacement, or the customer said no to the one offered: the whole
    -- line comes off.
    v_amount := -(v_sub.original_unit_price_minor * v_sub.quantity);

    insert into public.order_adjustments (
      order_id, order_item_id, kind, amount_minor, reason, actor, actor_id
    ) values (
      v_sub.order_id, v_sub.order_item_id, 'item_removed', v_amount,
      coalesce(v_sub.reason, 'item unavailable'),
      (case when v_sub.decision = 'rejected' then 'customer' else 'merchant' end)::public.commerce_actor,
      v_sub.decided_by
    );
  else
    -- A replacement that is equal or cheaper. `report_item_unavailable`
    -- refuses anything dearer, so this delta is never positive — and if a
    -- future change made it so, `checkAdjustment` in the ledger would refuse
    -- the fold rather than quietly overcharging.
    v_amount := v_sub.unit_price_delta_minor * v_sub.quantity;

    if v_amount <> 0 then
      insert into public.order_adjustments (
        order_id, order_item_id, kind, amount_minor, reason, actor, actor_id
      ) values (
        v_sub.order_id, v_sub.order_item_id, 'substitution', v_amount,
        coalesce(v_sub.reason, 'substituted'),
        (case when v_sub.decision = 'approved' then 'customer' else 'merchant' end)::public.commerce_actor,
        v_sub.decided_by
      );
    end if;
  end if;
end;
$$;

revoke all on function public.apply_substitution_adjustment(uuid)
  from public, anon, authenticated;

-- ===========================================================================
-- 9. The customer answers
-- ===========================================================================
-- Two answers only, because there is no higher price to approve: take the
-- replacement, or take the item off. Anything else would be a charge.
create or replace function public.decide_substitution(
  p_substitution_id uuid,
  p_accept          boolean
)
returns public.substitution_decision
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_sub      public.order_substitutions%rowtype;
  v_order    public.orders%rowtype;
  v_decision public.substitution_decision;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_sub from public.order_substitutions
   where id = p_substitution_id for update;
  if v_sub.id is null then
    raise exception 'substitution_not_found' using errcode = 'P0002';
  end if;

  select * into v_order from public.orders where id = v_sub.order_id;
  -- THE CUSTOMER'S DECISION, and only theirs. A merchant answering on the
  -- customer's behalf is the failure this whole flow exists to prevent.
  if v_order.user_id <> v_user then
    raise exception 'substitution_not_found' using errcode = 'P0002';
  end if;

  if v_sub.decision <> 'pending_customer' then
    -- Already answered — by them, or by the timeout. Idempotent rather than an
    -- error: the second tap of a slow button is not a mistake.
    return v_sub.decision;
  end if;

  v_decision := case when p_accept then 'approved' else 'rejected' end;

  update public.order_substitutions
     set decision = v_decision, decided_at = now(), decided_by = v_user
   where id = v_sub.id;

  perform public.apply_substitution_adjustment(v_sub.id);

  insert into public.order_events (order_id, kind, actor, actor_id, to_value, note)
  values (v_order.id, 'substitution', 'customer', v_user, v_decision::text,
          v_sub.original_product_name);

  return v_decision;
end;
$$;

revoke all on function public.decide_substitution(uuid, boolean) from public, anon;
grant execute on function public.decide_substitution(uuid, boolean) to authenticated;

-- ===========================================================================
-- 10. Nobody answered
-- ===========================================================================
-- PICKING MUST NOT HANG. A customer who is asleep, on a call, or simply out
-- must not leave a picker holding a crate — so an unanswered question falls
-- back to the safe answer, which is to take the item off and give the money
-- back. Never to the one that keeps the sale.
create or replace function public.resolve_expired_substitutions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   record;
  v_count integer := 0;
begin
  for v_sub in
    select id, order_id, original_product_name
      from public.order_substitutions
     where decision = 'pending_customer'
       and expires_at is not null
       and expires_at <= now()
     for update
  loop
    update public.order_substitutions
       set decision = 'removed', decided_at = now()
     where id = v_sub.id;

    perform public.apply_substitution_adjustment(v_sub.id);

    insert into public.order_events (order_id, kind, actor, to_value, note)
    values (v_sub.order_id, 'substitution', 'system', 'removed',
            format('no answer in time: %s removed', v_sub.original_product_name));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.resolve_expired_substitutions()
  from public, anon, authenticated;
grant execute on function public.resolve_expired_substitutions() to service_role;

-- ===========================================================================
-- 11. Where the money stands
-- ===========================================================================
-- FIVE DISTINCT FACTS, and the distinctions are the point:
--
--   captured          what the customer actually paid. HISTORY. Never changes.
--   fulfilled goods   what the shop actually handed over, after removals.
--   amount due        what they should have paid, given what arrived.
--   refund required   captured minus due minus already refunded. CALCULATED.
--   refunded          what has actually gone back. Only a real refund moves it.
--
-- A refund is not refunded because we worked out that it should be. Nothing in
-- Commerce-6 executes one, so `refunded` stays where the payment layer put it
-- and `refund_required` is a debt on the face of the order.
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
  with o as (
    select * from public.orders
     where id = p_order_id
       and (user_id = auth.uid()
            or public.is_merchant_member(merchant_id, merchant_location_id))
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

revoke all on function public.order_refund_position(uuid) from public, anon;
grant execute on function public.order_refund_position(uuid) to authenticated;
