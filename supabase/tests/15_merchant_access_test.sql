-- Who gets to work in the shop, written as the four people who should not.
--
--   THE PICKER        who would like to add their friend.
--   THE BRANCH MANAGER who would like the whole chain.
--   THE OTHER SHOP     who would like a seat at this one.
--   AND A STRANGER     holding an invitation code that was not addressed to
--                      them, which is the one that decides whether the token
--                      is a capability or a password.
--
-- The rule underneath all of it: AKALT decides who runs a shop, a shop's
-- manager decides who picks in it, and nobody escalates their own scope.

\set ON_ERROR_STOP on
\echo ''
\echo 'Merchant access: invitations, scope and the people who should not have it'

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
  ('80000000-0000-4000-8000-00000000000a', 'akalt.ops@access.test'),
  ('80000000-0000-4000-8000-00000000000b', 'chain.manager@access.test'),
  ('80000000-0000-4000-8000-00000000000c', 'branch.manager@access.test'),
  ('80000000-0000-4000-8000-00000000000d', 'picker@access.test'),
  ('80000000-0000-4000-8000-00000000000e', 'newcomer@access.test'),
  ('80000000-0000-4000-8000-00000000000f', 'stranger@access.test'),
  ('80000000-0000-4000-8000-000000000010', 'rival.manager@access.test');

insert into public.user_roles (user_id, role)
values ('80000000-0000-4000-8000-00000000000a', 'admin');

insert into public.merchants (id, slug, name, country, currency, fulfilment_mode,
                              commission_rate_basis_points, merchant_keeps_delivery_fee,
                              is_enabled, is_demo)
values
  ('81000000-0000-4000-8000-000000000001', 'access-shop', 'Access Shop', 'EG', 'EGP',
   'dashboard', 1000, true, true, false),
  ('81000000-0000-4000-8000-000000000002', 'rival-shop', 'Rival Shop', 'EG', 'EGP',
   'dashboard', 1000, true, true, false);

-- Two branches of the same chain, which is what makes scope a real question.
insert into public.merchant_locations (id, merchant_id, external_id, name, country,
                                       delivery_fee_minor, minimum_order_minor,
                                       is_accepting_orders)
values
  ('81000000-0000-4000-8000-00000000000a', '81000000-0000-4000-8000-000000000001',
   'access-dokki', 'Access Dokki', 'EG', 2000, 1000, true),
  ('81000000-0000-4000-8000-00000000000b', '81000000-0000-4000-8000-000000000001',
   'access-maadi', 'Access Maadi', 'EG', 2000, 1000, true),
  ('81000000-0000-4000-8000-00000000000c', '81000000-0000-4000-8000-000000000002',
   'rival-dokki', 'Rival Dokki', 'EG', 2000, 1000, true);

-- ===========================================================================
-- 1. AKALT MAKES THE FIRST MANAGER
-- ===========================================================================
-- Somebody has to, and there is nobody to invite them: this is the only route
-- that creates a merchant admin.

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000a';

do $$
begin
  perform pg_temp.assert(
    public.grant_merchant_access(
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-00000000000b', 'admin', null) is not null,
    'AKALT can make the chain manager');

  perform pg_temp.assert(
    public.grant_merchant_access(
      '81000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-00000000000c', 'admin',
      '81000000-0000-4000-8000-00000000000a') is not null,
    'and a branch manager for Dokki only');

  perform pg_temp.assert(
    public.grant_merchant_access(
      '81000000-0000-4000-8000-000000000002',
      '80000000-0000-4000-8000-000000000010', 'admin', null) is not null,
    'and a manager at the rival shop');

  -- A BRANCH THAT IS NOT THEIRS. Without this check, naming another shop's
  -- branch id would create a membership `is_merchant_member` would honour.
  perform pg_temp.assert_rejected(
    format('select public.grant_merchant_access(%L, %L, %L, %L)',
           '81000000-0000-4000-8000-000000000001',
           '80000000-0000-4000-8000-00000000000d', 'operator',
           '81000000-0000-4000-8000-00000000000c'),
    'but not a seat at one merchant scoped to another merchant''s branch');

  perform pg_temp.assert_rejected(
    format('select public.grant_merchant_access(%L, %L, %L)',
           '81000000-0000-4000-8000-000000000001', gen_random_uuid(), 'operator'),
    'nor a seat for a user that does not exist');
end;
$$;

reset role;

-- ===========================================================================
-- 2. THE MANAGER RUNS THEIR OWN ROTA
-- ===========================================================================

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000b';

do $$
declare
  v_token text;
  v_id    uuid;
begin
  select token, id into v_token, v_id from public.invite_merchant_staff(
    '81000000-0000-4000-8000-000000000001', 'Newcomer@Access.TEST', 'operator', null);

  perform pg_temp.assert(v_token is not null,
    'the chain manager can invite a picker');
  perform pg_temp.assert(
    (select email from public.merchant_invites where id = v_id) = 'newcomer@access.test',
    'and the address is folded to lower case, so one person is one invitation');

  -- IDEMPOTENT. A manager who taps twice gets one invitation, not two live
  -- tokens the second of which nobody can revoke.
  perform pg_temp.assert(
    (select id from public.invite_merchant_staff(
       '81000000-0000-4000-8000-000000000001', 'newcomer@access.test', 'operator', null)) = v_id,
    'inviting the same person twice returns the same invitation');

  -- RULE 1. Only AKALT makes managers.
  perform pg_temp.assert_rejected(
    format('select * from public.invite_merchant_staff(%L, %L, %L)',
           '81000000-0000-4000-8000-000000000001', 'another@access.test', 'admin'),
    'a merchant manager cannot invite another manager');

  -- NO CROSS-MERCHANT INVITES.
  perform pg_temp.assert_rejected(
    format('select * from public.invite_merchant_staff(%L, %L)',
           '81000000-0000-4000-8000-000000000002', 'newcomer@access.test'),
    'nor invite anybody to the rival shop');

  perform pg_temp.assert_rejected(
    format('select * from public.invite_merchant_staff(%L, %L, %L, %L)',
           '81000000-0000-4000-8000-000000000001', 'newcomer@access.test', 'operator',
           '81000000-0000-4000-8000-00000000000c'),
    'nor scope an invitation to a branch of another merchant');

  perform pg_temp.assert_rejected(
    format('select * from public.invite_merchant_staff(%L, %L)',
           '81000000-0000-4000-8000-000000000001', 'not-an-email'),
    'nor invite something that is not an email address');
end;
$$;

reset role;

-- ===========================================================================
-- 3. THE BRANCH MANAGER CANNOT BECOME THE CHAIN
-- ===========================================================================
-- RULE 4, and the shape of `is_merchant_admin` is what enforces it: asking
-- about the chain-wide scope passes a NULL branch, and a branch admin's own
-- row is not NULL, so the comparison is NULL rather than true.

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000c';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.invite_merchant_staff(
       '81000000-0000-4000-8000-000000000001', 'dokki.picker@access.test', 'operator',
       '81000000-0000-4000-8000-00000000000a')) = 1,
    'the Dokki manager can invite a picker to Dokki');

  perform pg_temp.assert_rejected(
    format('select * from public.invite_merchant_staff(%L, %L, %L, %L)',
           '81000000-0000-4000-8000-000000000001', 'maadi.picker@access.test', 'operator',
           '81000000-0000-4000-8000-00000000000b'),
    'but not to Maadi, which is not their branch');

  -- THE ESCALATION. Omitting the branch asks for a seat at EVERY branch.
  perform pg_temp.assert_rejected(
    format('select * from public.invite_merchant_staff(%L, %L, %L, null)',
           '81000000-0000-4000-8000-000000000001', 'everywhere@access.test', 'operator'),
    'and cannot create a chain-wide seat by leaving the branch out');

  perform pg_temp.assert(
    public.is_merchant_admin('81000000-0000-4000-8000-000000000001',
                             '81000000-0000-4000-8000-00000000000a'),
    'is_merchant_admin says yes for their own branch');
  perform pg_temp.assert(
    not public.is_merchant_admin('81000000-0000-4000-8000-000000000001', null),
    'and no for the chain-wide scope');
  perform pg_temp.assert(
    not public.is_merchant_admin('81000000-0000-4000-8000-000000000002',
                                 '81000000-0000-4000-8000-00000000000c'),
    'and no for another merchant entirely');
end;
$$;

reset role;

-- ===========================================================================
-- 4. THE TOKEN IS NOT A PASSWORD
-- ===========================================================================
-- The invitation was addressed to newcomer@. A stranger holding the same token
-- must get nowhere, or the token is a bearer credential for a job.

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000f';

do $$
declare
  v_token text;
begin
  -- Read as `postgres`, standing in for somebody forwarding the message. The
  -- stranger below could not have read it themselves, which §4's second
  -- assertion proves separately.
  set role postgres;
  select token into v_token from public.merchant_invites
   where email = 'newcomer@access.test' and accepted_at is null;
  set role authenticated;

  perform pg_temp.assert(
    (select count(*) from public.my_merchant_invites()) = 0,
    'a stranger sees no invitations, because none is addressed to them');

  perform pg_temp.assert(
    (select count(*) from public.merchant_invites) = 0,
    'and cannot read the invitation table either');

  -- The token was fetched above as `postgres` would see it; here the stranger
  -- is holding it as though somebody had forwarded the message.
  perform pg_temp.assert_rejected(
    format('select public.accept_merchant_invite(%L)', v_token),
    'and holding somebody else''s token gets them nothing');

  perform pg_temp.assert_rejected(
    format('select public.accept_merchant_invite(%L)', 'not-a-real-token'),
    'as does inventing one');
end;
$$;

reset role;

-- ===========================================================================
-- 5. THE PERSON IT WAS FOR
-- ===========================================================================

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000e';

do $$
declare
  v_token text;
  v_member uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.my_merchant_invites()) = 1,
    'the invited person sees exactly their own invitation');

  select token into v_token from public.my_merchant_invites();
  v_member := public.accept_merchant_invite(v_token);

  perform pg_temp.assert(v_member is not null, 'and can accept it');
  perform pg_temp.assert(
    public.is_merchant_member('81000000-0000-4000-8000-000000000001',
                              '81000000-0000-4000-8000-00000000000a'),
    'which makes them staff at the shop');
  perform pg_temp.assert(
    not public.is_merchant_admin('81000000-0000-4000-8000-000000000001', null),
    'as a picker, not a manager');

  -- SINGLE USE.
  perform pg_temp.assert_rejected(
    format('select public.accept_merchant_invite(%L)', v_token),
    'and the token does not work a second time');
  perform pg_temp.assert(
    (select count(*) from public.my_merchant_invites()) = 0,
    'the invitation is gone from their list');
end;
$$;

-- ===========================================================================
-- 6. WHAT A PICKER MAY NOT DO
-- ===========================================================================
-- RULE 3. They are staff now, and staff is not management.

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.merchant_staff('81000000-0000-4000-8000-000000000001')) = 0,
    'a picker cannot read the staff list');

  perform pg_temp.assert_rejected(
    format('select * from public.invite_merchant_staff(%L, %L)',
           '81000000-0000-4000-8000-000000000001', 'friend@access.test'),
    'nor invite anybody');

  perform pg_temp.assert_rejected(
    format('select public.revoke_merchant_access(%L)',
           (select id from public.merchant_memberships
             where user_id = '80000000-0000-4000-8000-00000000000b')),
    'nor remove their own manager');

  perform pg_temp.assert_rejected(
    format('select public.set_merchant_role(%L, %L)',
           (select id from public.merchant_memberships
             where user_id = '80000000-0000-4000-8000-00000000000e'), 'admin'),
    'nor promote themselves');

  perform pg_temp.assert(
    (select role from public.merchant_memberships
      where user_id = '80000000-0000-4000-8000-00000000000e') = 'operator',
    'and they are still a picker afterwards');
end;
$$;

reset role;

-- ===========================================================================
-- 7. WHAT A MANAGER MAY AND MAY NOT DO
-- ===========================================================================

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000b';

do $$
declare
  v_picker uuid;
  v_branch uuid;
  v_chain  uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.merchant_staff('81000000-0000-4000-8000-000000000001')) >= 3,
    'the chain manager can read their own staff list');
  perform pg_temp.assert(
    (select count(*) from public.merchant_staff('81000000-0000-4000-8000-000000000002')) = 0,
    'and not the rival shop''s');

  select membership_id into v_picker
    from public.merchant_staff('81000000-0000-4000-8000-000000000001')
   where email = 'newcomer@access.test';
  select membership_id into v_branch
    from public.merchant_staff('81000000-0000-4000-8000-000000000001')
   where email = 'branch.manager@access.test';
  select membership_id into v_chain
    from public.merchant_staff('81000000-0000-4000-8000-000000000001')
   where email = 'chain.manager@access.test';

  -- RULE 1 AGAIN, from the other side.
  perform pg_temp.assert_rejected(
    format('select public.set_merchant_role(%L, %L)', v_picker, 'admin'),
    'a manager cannot promote a picker — only AKALT can');
  perform pg_temp.assert_rejected(
    format('select public.revoke_merchant_access(%L)', v_branch),
    'nor remove another manager');
  perform pg_temp.assert_rejected(
    format('select public.revoke_merchant_access(%L)', v_chain),
    'nor remove themselves');

  perform pg_temp.assert(public.revoke_merchant_access(v_picker),
    'but can remove a picker');
  perform pg_temp.assert(
    (select count(*) from public.merchant_memberships
      where user_id = '80000000-0000-4000-8000-00000000000e') = 0,
    'and the seat is gone');
end;
$$;

reset role;

-- The removed picker is out immediately. Nothing cached, nothing lingering.
set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000e';

do $$
begin
  perform pg_temp.assert(
    not public.is_merchant_member('81000000-0000-4000-8000-000000000001',
                                  '81000000-0000-4000-8000-00000000000a'),
    'a removed picker is no longer staff');
end;
$$;

reset role;

-- ===========================================================================
-- 8. THE RIVAL SHOP
-- ===========================================================================

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-000000000010';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.merchant_memberships) = 1,
    'the rival manager sees only their own shop''s memberships');

  perform pg_temp.assert_rejected(
    format('select * from public.invite_merchant_staff(%L, %L)',
           '81000000-0000-4000-8000-000000000001', 'spy@access.test'),
    'and cannot invite anybody to a shop that is not theirs');

  perform pg_temp.assert(
    (select count(*) from public.merchant_invites) = 0,
    'nor read another shop''s invitations');
end;
$$;

reset role;

-- ===========================================================================
-- 9. WITHDRAWING AN INVITATION
-- ===========================================================================

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000b';

do $$
declare
  v_id    uuid;
  v_token text;
begin
  select id, token into v_id, v_token from public.invite_merchant_staff(
    '81000000-0000-4000-8000-000000000001', 'secondthoughts@access.test');

  perform pg_temp.assert(public.revoke_merchant_invite(v_id),
    'a manager can withdraw an invitation they sent');
  perform pg_temp.assert(
    (select revoked_at from public.merchant_invites where id = v_id) is not null,
    'and it is marked withdrawn rather than deleted');

  -- Withdrawing it can be re-issued; the partial unique index only covers OPEN
  -- invitations, so a change of mind is not permanently blocked.
  perform pg_temp.assert(
    (select count(*) from public.invite_merchant_staff(
       '81000000-0000-4000-8000-000000000001', 'secondthoughts@access.test')) = 1,
    'and a fresh one can be issued afterwards');
end;
$$;

reset role;

-- The withdrawn token is dead even in the right hands.
insert into auth.users (id, email)
values ('80000000-0000-4000-8000-000000000011', 'secondthoughts@access.test');

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-000000000011';

do $$
declare
  v_dead text;
begin
  select token into v_dead from public.merchant_invites
   where email = 'secondthoughts@access.test' and revoked_at is not null;

  perform pg_temp.assert(
    (select count(*) from public.my_merchant_invites()) = 1,
    'the invited person sees only the live invitation, not the withdrawn one');

  perform pg_temp.assert_rejected(
    format('select public.accept_merchant_invite(%L)', v_dead),
    'and a withdrawn token is refused even from the right person');
end;
$$;

reset role;

-- An expired one likewise.
update public.merchant_invites set expires_at = now() - interval '1 day'
 where email = 'secondthoughts@access.test' and revoked_at is null;

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-000000000011';

do $$
declare
  v_old text;
begin
  select token into v_old from public.merchant_invites
   where email = 'secondthoughts@access.test' and revoked_at is null;

  perform pg_temp.assert(
    (select count(*) from public.my_merchant_invites()) = 0,
    'an expired invitation disappears from the list');
  perform pg_temp.assert_rejected(
    format('select public.accept_merchant_invite(%L)', v_old),
    'and cannot be accepted');
end;
$$;

reset role;

-- ===========================================================================
-- 10. THE LAST WAY IN
-- ===========================================================================
-- RULE 5. Recovering from removing the final chain admin means the database
-- password, and a pilot should not have a button for that.

set role authenticated;
set request.jwt.claim.sub = '80000000-0000-4000-8000-00000000000a';

do $$
declare
  v_chain uuid;
begin
  select membership_id into v_chain
    from public.merchant_staff('81000000-0000-4000-8000-000000000001')
   where email = 'chain.manager@access.test';

  perform pg_temp.assert_rejected(
    format('select public.revoke_merchant_access(%L)', v_chain),
    'not even AKALT can remove a merchant''s last chain manager');
  perform pg_temp.assert_rejected(
    format('select public.set_merchant_role(%L, %L)', v_chain, 'operator'),
    'nor demote them to a picker, which is the same thing by another route');

  -- With a second one in place, the first can go.
  perform public.grant_merchant_access(
    '81000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-00000000000d', 'admin', null);

  perform pg_temp.assert(public.revoke_merchant_access(v_chain),
    'once there are two, either may be removed');

  -- AKALT CAN PROMOTE. That is the whole of rule 1's positive half.
  perform pg_temp.assert(
    public.set_merchant_role(
      (select membership_id from public.merchant_staff('81000000-0000-4000-8000-000000000001')
        where email = 'branch.manager@access.test'), 'operator'),
    'and AKALT can change a role');
end;
$$;

reset role;

\echo 'Merchant access: passed'
