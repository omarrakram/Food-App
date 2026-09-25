-- Commerce-7: how somebody becomes merchant staff.
--
-- Commerce-6 gave the shop an identity and then left the only way to create
-- one as an INSERT run by whoever had the database password. That is fine for
-- a demo and impossible for a pilot: the supermarket's own manager has to be
-- able to add the two pickers who joined last week, at eight in the morning,
-- without anybody at AKALT being awake.
--
-- THE RULES, and they are the whole point of the file:
--
--   1. AKALT decides who runs a shop. Only an AKALT admin can create a
--      merchant ADMIN, and only an AKALT admin can promote anybody.
--
--   2. A merchant admin runs their own shop and nothing else. They may invite
--      and remove OPERATORS, for their own merchant, within their own scope.
--
--   3. AN OPERATOR MAY DO NONE OF THIS. Not invite, not revoke, not promote,
--      not read the staff list.
--
--   4. SCOPE CANNOT BE ESCALATED. An admin for one branch cannot create a
--      chain-wide row, cannot reach another branch, and cannot reach another
--      merchant. The check that enforces this is one function, used
--      everywhere, because three copies of it would eventually disagree.
--
--   5. THE LAST WAY IN IS NOT REMOVABLE. Revoking the final chain admin of a
--      merchant is refused, because the recovery from it is a database
--      password.
--
-- Not here, on purpose: org charts, per-permission grants, shift rosters,
-- approval chains, and any notion of a merchant user who is not a real
-- `auth.users` row.

-- ===========================================================================
-- 1. Who may administer this shop, at this branch
-- ===========================================================================
-- RULE 4 LIVES HERE. Read it carefully: when `p_location` is NULL the caller
-- is asking about a CHAIN-WIDE row, and `m.merchant_location_id = p_location`
-- is then NULL rather than true — so only a chain admin (whose own scope is
-- NULL) passes. A branch admin cannot widen their reach by omitting the
-- branch, which is exactly the mistake this shape is chosen to prevent.
create or replace function public.is_merchant_admin(
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
       and m.role = 'admin'
       and (m.merchant_location_id is null or m.merchant_location_id = p_location)
  );
$$;

revoke all on function public.is_merchant_admin(uuid, uuid) from public, anon;
grant execute on function public.is_merchant_admin(uuid, uuid) to authenticated;

comment on function public.is_merchant_admin(uuid, uuid) is
  'May the caller administer this merchant at this branch? A NULL branch means '
  'the chain-wide scope, which only a chain admin holds.';

/**
 * The caller's own email address, folded.
 *
 * SECURITY DEFINER because `auth.users` is not readable by `authenticated` on
 * Supabase — and an RLS policy that reads it directly fails with a permission
 * error for every caller, which reads like a bug in the feature rather than in
 * the policy. It returns one address and only ever the caller's own.
 *
 * `auth.users` is the authority here rather than a JWT claim, because a claim
 * is whatever was minted into the token and this decides who becomes staff.
 */
create or replace function public.current_email()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid();
$$;

revoke all on function public.current_email() from public, anon;
grant execute on function public.current_email() to authenticated;

-- ===========================================================================
-- 2. An invitation
-- ===========================================================================
-- BY EMAIL, NOT BY USER ID, and that is the design. The person a manager wants
-- to add has usually not opened AKALT yet, and a flow that requires them to
-- sign up first and then read a uuid to somebody over the phone is a flow that
-- gets replaced by sharing one login.
--
-- The token is the capability. It is random, single-use, expiring, and — this
-- is the part that matters — ACCEPTING IT STILL CHECKS THE EMAIL. A leaked
-- token cannot make a stranger into staff; it can only let the person it was
-- addressed to finish the job.
create table public.merchant_invites (
  id                   uuid primary key default gen_random_uuid(),
  merchant_id          uuid not null references public.merchants (id) on delete cascade,
  -- NULL means every branch, exactly as on `merchant_memberships`.
  merchant_location_id uuid references public.merchant_locations (id) on delete cascade,
  role                 public.merchant_role not null default 'operator',

  -- Stored folded to lower case so `Ahmed@Shop.eg` and `ahmed@shop.eg` are one
  -- invitation rather than two.
  email                text not null,
  token                text not null default encode(gen_random_bytes(24), 'hex'),

  invited_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null default now() + interval '7 days',

  accepted_at          timestamptz,
  accepted_by          uuid references auth.users (id) on delete set null,
  revoked_at           timestamptz,
  revoked_by           uuid references auth.users (id) on delete set null,
  updated_at           timestamptz not null default now(),

  constraint merchant_invites_email_lower check (email = lower(email)),
  constraint merchant_invites_email_shaped check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint merchant_invites_token_unique unique (token),
  constraint merchant_invites_accepted_has_user
    check (accepted_at is null or accepted_by is not null)
);

-- One OPEN invitation per person per scope. A manager who clicks twice gets
-- one invitation, not two tokens the second of which silently wins.
create unique index merchant_invites_open_scoped_idx
  on public.merchant_invites (merchant_id, email, merchant_location_id)
  where accepted_at is null and revoked_at is null and merchant_location_id is not null;
create unique index merchant_invites_open_chain_idx
  on public.merchant_invites (merchant_id, email)
  where accepted_at is null and revoked_at is null and merchant_location_id is null;

create index merchant_invites_email_idx on public.merchant_invites (email)
  where accepted_at is null and revoked_at is null;
create index merchant_invites_merchant_idx on public.merchant_invites (merchant_id, created_at desc);

create trigger merchant_invites_set_updated_at
  before update on public.merchant_invites
  for each row execute function public.set_updated_at();

comment on table public.merchant_invites is
  'Pending merchant staff. The token is a capability; accepting it still '
  'checks that the caller owns the invited email address.';

alter table public.merchant_invites enable row level security;

-- The person it is addressed to. `auth.users` is the authority on who owns an
-- address, not a claim in a token somebody might have shaped by hand.
create policy "merchant_invites: addressee reads own" on public.merchant_invites
  for select to authenticated
  using (
    accepted_at is null
    and revoked_at is null
    and expires_at > now()
    and email = public.current_email()
  );

-- The manager who can act on it. RULE 3: an operator matches neither policy.
create policy "merchant_invites: merchant admin reads its own" on public.merchant_invites
  for select to authenticated
  using (public.is_merchant_admin(merchant_id, merchant_location_id));

create policy "merchant_invites: akalt admin reads all" on public.merchant_invites
  for select to authenticated using (public.is_admin());

-- No insert, update or delete policy. Every write is a function below.

-- Staff lists follow the same rule as invitations: a manager sees their own
-- shop's people. Commerce-6 gave members sight of their OWN row only, which
-- was right then and is not enough to run a rota.
create policy "merchant_memberships: merchant admin reads its own"
  on public.merchant_memberships
  for select to authenticated
  using (public.is_merchant_admin(merchant_id, merchant_location_id));

create policy "merchant_memberships: akalt admin reads all"
  on public.merchant_memberships
  for select to authenticated using (public.is_admin());

-- ===========================================================================
-- 3. Inviting
-- ===========================================================================
-- Returns the invitation id and the token. The caller is responsible for
-- getting the token to the invitee — in the pilot, by reading it out or
-- pasting it into a message. Sending email is not this function's job and
-- pretending otherwise would make a failure to deliver look like a failure to
-- invite.
create or replace function public.invite_merchant_staff(
  p_merchant uuid,
  p_email    text,
  p_role     public.merchant_role default 'operator',
  p_location uuid default null,
  p_expires_in interval default interval '7 days'
)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_email    text := lower(trim(coalesce(p_email, '')));
  v_akalt    boolean;
  v_row      public.merchant_invites%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_akalt := public.is_admin();

  -- RULE 1 AND RULE 2. An AKALT admin may do anything here; a merchant admin
  -- may only invite operators, only to their own merchant, only inside their
  -- own scope.
  if not v_akalt then
    if not public.is_merchant_admin(p_merchant, p_location) then
      raise exception 'not_authorised' using errcode = '42501';
    end if;
    if p_role <> 'operator' then
      raise exception 'cannot_grant_admin' using errcode = '42501';
    end if;
  end if;

  if v_email = '' then
    raise exception 'email_required' using errcode = 'P0001';
  end if;

  -- The branch must belong to the merchant. Without this, a chain admin could
  -- name somebody else's branch id and create a membership that
  -- `is_merchant_member` would then honour.
  if p_location is not null and not exists (
    select 1 from public.merchant_locations l
     where l.id = p_location and l.merchant_id = p_merchant
  ) then
    raise exception 'branch_not_of_merchant' using errcode = 'P0001';
  end if;

  insert into public.merchant_invites (
    merchant_id, merchant_location_id, role, email, invited_by, expires_at
  ) values (
    p_merchant, p_location, p_role, v_email, v_user,
    now() + coalesce(p_expires_in, interval '7 days')
  )
  on conflict do nothing
  returning * into v_row;

  if v_row.id is null then
    -- An open invitation for this person and scope already exists. Hand back
    -- the same one rather than a second token: two live tokens for one seat is
    -- one token nobody can revoke.
    select * into v_row from public.merchant_invites
     where merchant_id = p_merchant
       and email = v_email
       and merchant_location_id is not distinct from p_location
       and accepted_at is null and revoked_at is null
     limit 1;
  end if;

  if v_row.id is null then
    raise exception 'invite_failed' using errcode = 'P0001';
  end if;

  return query select v_row.id, v_row.token, v_row.expires_at;
end;
$$;

revoke all on function public.invite_merchant_staff(uuid, text, public.merchant_role, uuid, interval)
  from public, anon;
grant execute on function public.invite_merchant_staff(uuid, text, public.merchant_role, uuid, interval)
  to authenticated;

-- ===========================================================================
-- 4. Accepting
-- ===========================================================================
-- THE EMAIL CHECK IS THE SECURITY, not the token. The token says which
-- invitation; `auth.users` says who the caller is. Both must agree.
create or replace function public.accept_merchant_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_email  text;
  v_invite public.merchant_invites%rowtype;
  v_member uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_email := public.current_email();
  if v_email is null then
    raise exception 'no_email_on_account' using errcode = 'P0001';
  end if;

  select * into v_invite from public.merchant_invites
   where token = trim(coalesce(p_token, ''))
     for update;

  -- ONE ANSWER FOR EVERY FAILURE. A token that is wrong, expired, revoked,
  -- already used, or addressed to somebody else all read the same from
  -- outside — otherwise this endpoint tells a stranger which tokens are real.
  if v_invite.id is null
     or v_invite.accepted_at is not null
     or v_invite.revoked_at is not null
     or v_invite.expires_at <= now()
     or v_invite.email <> v_email then
    raise exception 'invite_not_valid' using errcode = 'P0002';
  end if;

  insert into public.merchant_memberships (merchant_id, user_id, merchant_location_id, role)
  values (v_invite.merchant_id, v_user, v_invite.merchant_location_id, v_invite.role)
  on conflict do nothing
  returning id into v_member;

  if v_member is null then
    -- Already staff at this scope. Accepting is then a no-op that still closes
    -- the invitation, which is the behaviour a second tap should have.
    select id into v_member from public.merchant_memberships
     where merchant_id = v_invite.merchant_id
       and user_id = v_user
       and merchant_location_id is not distinct from v_invite.merchant_location_id;
  end if;

  update public.merchant_invites
     set accepted_at = now(), accepted_by = v_user
   where id = v_invite.id;

  return v_member;
end;
$$;

revoke all on function public.accept_merchant_invite(text) from public, anon;
grant execute on function public.accept_merchant_invite(text) to authenticated;

-- ===========================================================================
-- 5. Withdrawing an invitation
-- ===========================================================================
create or replace function public.revoke_merchant_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.merchant_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_invite from public.merchant_invites where id = p_invite_id for update;
  if v_invite.id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  if not public.is_admin()
     and not public.is_merchant_admin(v_invite.merchant_id, v_invite.merchant_location_id) then
    -- Indistinguishable from "no such invitation", on purpose.
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  if v_invite.accepted_at is not null then
    -- Already staff. Withdrawing the paper does not undo the seat — use
    -- `revoke_merchant_access` for that, so the two actions stay legible in
    -- the audit trail.
    raise exception 'invite_already_accepted' using errcode = 'P0001';
  end if;

  update public.merchant_invites
     set revoked_at = now(), revoked_by = auth.uid()
   where id = v_invite.id and revoked_at is null;

  return true;
end;
$$;

revoke all on function public.revoke_merchant_invite(uuid) from public, anon;
grant execute on function public.revoke_merchant_invite(uuid) to authenticated;

-- ===========================================================================
-- 6. Removing somebody
-- ===========================================================================
-- RULE 5 is enforced here: the last chain admin of a merchant cannot be
-- removed by anybody, AKALT included. Recovering from that requires the
-- database, and a pilot should not have a one-click route to it.
create or replace function public.revoke_merchant_access(p_membership_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.merchant_memberships%rowtype;
  v_akalt  boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_member from public.merchant_memberships where id = p_membership_id for update;
  if v_member.id is null then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  v_akalt := public.is_admin();

  if not v_akalt and not public.is_merchant_admin(v_member.merchant_id, v_member.merchant_location_id) then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  -- RULE 1. A merchant admin manages operators. Removing another admin — or
  -- themselves — is AKALT's decision, because it changes who runs the shop.
  if not v_akalt and v_member.role = 'admin' then
    raise exception 'cannot_remove_admin' using errcode = '42501';
  end if;

  if v_member.role = 'admin' and v_member.merchant_location_id is null then
    if (select count(*) from public.merchant_memberships m
         where m.merchant_id = v_member.merchant_id
           and m.role = 'admin'
           and m.merchant_location_id is null) <= 1 then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
  end if;

  delete from public.merchant_memberships where id = v_member.id;
  return true;
end;
$$;

revoke all on function public.revoke_merchant_access(uuid) from public, anon;
grant execute on function public.revoke_merchant_access(uuid) to authenticated;

-- ===========================================================================
-- 7. Promotion
-- ===========================================================================
-- AKALT ONLY, and this is RULE 1 in its most literal form. If a merchant admin
-- could promote an operator, then every operator is one compromised manager
-- away from being an admin, and the distinction between the two roles stops
-- meaning anything.
create or replace function public.set_merchant_role(
  p_membership_id uuid,
  p_role          public.merchant_role
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.merchant_memberships%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  select * into v_member from public.merchant_memberships where id = p_membership_id for update;
  if v_member.id is null then
    raise exception 'membership_not_found' using errcode = 'P0002';
  end if;

  if v_member.role = 'admin' and p_role <> 'admin'
     and v_member.merchant_location_id is null then
    if (select count(*) from public.merchant_memberships m
         where m.merchant_id = v_member.merchant_id
           and m.role = 'admin'
           and m.merchant_location_id is null) <= 1 then
      raise exception 'last_admin' using errcode = 'P0001';
    end if;
  end if;

  update public.merchant_memberships set role = p_role where id = v_member.id;
  return true;
end;
$$;

revoke all on function public.set_merchant_role(uuid, public.merchant_role) from public, anon;
grant execute on function public.set_merchant_role(uuid, public.merchant_role) to authenticated;

-- ===========================================================================
-- 8. Adding somebody who already has an account
-- ===========================================================================
-- AKALT ONLY. This is the route that creates the FIRST admin of a merchant —
-- the one nobody could have invited, because there was nobody to send the
-- invitation. Everything after that goes through the invite flow.
create or replace function public.grant_merchant_access(
  p_merchant uuid,
  p_user     uuid,
  p_role     public.merchant_role default 'operator',
  p_location uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  if p_location is not null and not exists (
    select 1 from public.merchant_locations l
     where l.id = p_location and l.merchant_id = p_merchant
  ) then
    raise exception 'branch_not_of_merchant' using errcode = 'P0001';
  end if;

  insert into public.merchant_memberships (merchant_id, user_id, merchant_location_id, role)
  values (p_merchant, p_user, p_location, p_role)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    update public.merchant_memberships
       set role = p_role
     where merchant_id = p_merchant
       and user_id = p_user
       and merchant_location_id is not distinct from p_location
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.grant_merchant_access(uuid, uuid, public.merchant_role, uuid)
  from public, anon;
grant execute on function public.grant_merchant_access(uuid, uuid, public.merchant_role, uuid)
  to authenticated, service_role;

-- ===========================================================================
-- 9. The staff list
-- ===========================================================================
-- A function rather than a view, because it returns the one piece of personal
-- data a manager genuinely needs — the email of the person holding the seat —
-- and that has to be gated by an explicit check rather than by whichever
-- policy happens to be on `auth.users` today.
create or replace function public.merchant_staff(p_merchant uuid)
returns table (
  membership_id        uuid,
  user_id              uuid,
  email                text,
  role                 public.merchant_role,
  merchant_location_id uuid,
  created_at           timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.user_id, lower(u.email), m.role, m.merchant_location_id, m.created_at
    from public.merchant_memberships m
    join auth.users u on u.id = m.user_id
   where m.merchant_id = p_merchant
     and (public.is_admin() or public.is_merchant_admin(m.merchant_id, m.merchant_location_id))
   order by m.role, lower(u.email);
$$;

revoke all on function public.merchant_staff(uuid) from public, anon;
grant execute on function public.merchant_staff(uuid) to authenticated;

-- ===========================================================================
-- 10. Invitations waiting for me
-- ===========================================================================
create or replace function public.my_merchant_invites()
returns table (
  id                   uuid,
  token                text,
  merchant_id          uuid,
  merchant_name        text,
  merchant_location_id uuid,
  role                 public.merchant_role,
  expires_at           timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.token, i.merchant_id, m.name, i.merchant_location_id, i.role, i.expires_at
    from public.merchant_invites i
    join public.merchants m on m.id = i.merchant_id
   where i.accepted_at is null
     and i.revoked_at is null
     and i.expires_at > now()
     and i.email = public.current_email()
   order by i.created_at;
$$;

revoke all on function public.my_merchant_invites() from public, anon;
grant execute on function public.my_merchant_invites() to authenticated;
