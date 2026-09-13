-- Friends, requests and blocks.
--
-- Written as an attacker. The interesting questions are not "can Amina accept
-- Bishoy's request" but:
--
--   * can I add myself to somebody's friend list?
--   * can I accept a request that was not sent to me?
--   * can I keep sending requests to someone who declined?
--   * can someone I blocked still see me, message me, or find out they are
--     blocked?
--
-- Every answer must be no, and must be no because of Postgres.

\set ON_ERROR_STOP on
\echo ''
\echo 'Friends and blocks'

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
  ('f0000000-0000-4000-8000-00000000000a', 'amina@friends.test'),
  ('f0000000-0000-4000-8000-00000000000b', 'bishoy@friends.test'),
  ('f0000000-0000-4000-8000-00000000000c', 'careem@friends.test'),
  ('f0000000-0000-4000-8000-00000000000d', 'dalia@friends.test');

update public.profiles set username = 'amina.f' where id = 'f0000000-0000-4000-8000-00000000000a';
update public.profiles set username = 'bishoy.f' where id = 'f0000000-0000-4000-8000-00000000000b';
update public.profiles set username = 'careem.f', visibility = 'friends'
  where id = 'f0000000-0000-4000-8000-00000000000c';
update public.profiles set username = 'dalia.f' where id = 'f0000000-0000-4000-8000-00000000000d';

set role authenticated;

-- --------------------------------------------------------------------------
-- The states that must be impossible
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000a';

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$insert into public.friend_requests (sender_id, recipient_id)
         values ('f0000000-0000-4000-8000-00000000000a',
                 'f0000000-0000-4000-8000-00000000000a')$sql$,
    'you cannot send yourself a friend request');

  perform pg_temp.assert_rejected(
    $sql$insert into public.friend_requests (sender_id, recipient_id)
         values ('f0000000-0000-4000-8000-00000000000b',
                 'f0000000-0000-4000-8000-00000000000c')$sql$,
    'you cannot send a request as somebody else');

  perform pg_temp.assert_rejected(
    $sql$insert into public.friendships (user_low_id, user_high_id)
         values (least('f0000000-0000-4000-8000-00000000000a'::uuid,
                       'f0000000-0000-4000-8000-00000000000b'::uuid),
                 greatest('f0000000-0000-4000-8000-00000000000a'::uuid,
                          'f0000000-0000-4000-8000-00000000000b'::uuid))$sql$,
    'you cannot add yourself to somebody''s friend list directly');
end
$$;

-- Amina sends to Bishoy.
insert into public.friend_requests (sender_id, recipient_id)
values ('f0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000b');

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$insert into public.friend_requests (sender_id, recipient_id)
         values ('f0000000-0000-4000-8000-00000000000a',
                 'f0000000-0000-4000-8000-00000000000b')$sql$,
    'you cannot send a second request to the same person');
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000b';

do $$
begin
  -- The one the unordered unique index exists for: without it both directions
  -- can be pending and each person waits for the other to accept.
  perform pg_temp.assert_rejected(
    $sql$insert into public.friend_requests (sender_id, recipient_id)
         values ('f0000000-0000-4000-8000-00000000000b',
                 'f0000000-0000-4000-8000-00000000000a')$sql$,
    'you cannot send a request back to someone already asking you');

  perform pg_temp.assert(
    (select count(*) from public.friend_requests where status = 'pending') = 1,
    'the recipient can see the request');
end
$$;

-- --------------------------------------------------------------------------
-- Only the recipient accepts
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000c';

do $$
declare
  target uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.friend_requests) = 0,
    'an uninvolved user cannot see other people''s requests');
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000a';

do $$
declare
  target uuid;
begin
  select id into target from public.friend_requests where status = 'pending';

  -- The sender "accepting" their own request would make friendship unilateral.
  perform pg_temp.assert_rejected(
    format('select public.accept_friend_request(%L)', target),
    'the sender cannot accept their own request');
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000b';

do $$
declare
  target uuid;
begin
  select id into target from public.friend_requests where status = 'pending';
  perform public.accept_friend_request(target);

  perform pg_temp.assert(
    public.are_friends('f0000000-0000-4000-8000-00000000000a',
                       'f0000000-0000-4000-8000-00000000000b'),
    'accepting creates the friendship');
  perform pg_temp.assert(
    (select count(*) from public.friendships) = 1,
    'a friendship is stored once, not twice');
  perform pg_temp.assert(
    (select status from public.friend_requests) = 'accepted',
    'the request is marked accepted');

  -- Two taps on Accept, or a retry after a dropped response.
  perform pg_temp.assert_rejected(
    format('select public.accept_friend_request(%L)', target),
    'accepting twice is refused rather than duplicating the friendship');
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000a';

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$insert into public.friend_requests (sender_id, recipient_id)
         values ('f0000000-0000-4000-8000-00000000000a',
                 'f0000000-0000-4000-8000-00000000000b')$sql$,
    'you cannot request someone who is already your friend');
end
$$;

-- --------------------------------------------------------------------------
-- Friends-only visibility now resolves
-- --------------------------------------------------------------------------
-- Careem's profile is friends-only. Amina is not a friend; Dalia becomes one.

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.public_profiles where username = 'careem.f') = 0,
    'a friends-only profile is invisible to a non-friend');
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000d';
insert into public.friend_requests (sender_id, recipient_id)
values ('f0000000-0000-4000-8000-00000000000d', 'f0000000-0000-4000-8000-00000000000c');

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000c';
do $$
declare
  target uuid;
begin
  select id into target from public.friend_requests
   where recipient_id = 'f0000000-0000-4000-8000-00000000000c' and status = 'pending';
  perform public.accept_friend_request(target);
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000d';
do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.public_profiles where username = 'careem.f') = 1,
    'a friends-only profile is visible to a friend');
  -- Still only the eight public columns, friendship or not.
  perform pg_temp.assert(
    (select count(*) from public.user_allergens
     where user_id = 'f0000000-0000-4000-8000-00000000000c') = 0,
    'being a friend does not expose allergens');
  perform pg_temp.assert(
    (select count(*) from public.pantry_items
     where user_id = 'f0000000-0000-4000-8000-00000000000c') = 0,
    'being a friend does not expose a pantry');
end
$$;

-- --------------------------------------------------------------------------
-- Blocking
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000a';
select public.block_user('f0000000-0000-4000-8000-00000000000b');

do $$
begin
  perform pg_temp.assert(
    not public.are_friends('f0000000-0000-4000-8000-00000000000a',
                           'f0000000-0000-4000-8000-00000000000b'),
    'blocking removes the friendship — a block that leaves it is not a block');
  perform pg_temp.assert(
    (select count(*) from public.public_profiles where username = 'bishoy.f') = 0,
    'a blocked person disappears from the blocker''s view');
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000b';

do $$
begin
  -- The blocked person must not be able to tell. Being told is a signal, and
  -- the usual next move is a second account.
  perform pg_temp.assert(
    (select count(*) from public.blocks) = 0,
    'the blocked person cannot see that they were blocked');

  perform pg_temp.assert(
    (select count(*) from public.public_profiles where username = 'amina.f') = 0,
    'a block hides the blocker from the blocked person too');

  perform pg_temp.assert_rejected(
    $sql$insert into public.friend_requests (sender_id, recipient_id)
         values ('f0000000-0000-4000-8000-00000000000b',
                 'f0000000-0000-4000-8000-00000000000a')$sql$,
    'a blocked person cannot send a friend request');

  perform pg_temp.assert_rejected(
    $sql$select public.block_user('f0000000-0000-4000-8000-00000000000b')$sql$,
    'you cannot block yourself');
end
$$;

-- --------------------------------------------------------------------------
-- Declining, cancelling, and re-sending
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000c';
insert into public.friend_requests (sender_id, recipient_id)
values ('f0000000-0000-4000-8000-00000000000c', 'f0000000-0000-4000-8000-00000000000b');

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000b';
update public.friend_requests set status = 'declined', responded_at = now()
 where sender_id = 'f0000000-0000-4000-8000-00000000000c' and status = 'pending';

do $$
begin
  perform pg_temp.assert(
    (select status from public.friend_requests
     where sender_id = 'f0000000-0000-4000-8000-00000000000c') = 'declined',
    'the recipient can decline');
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000c';

do $$
begin
  -- A declined request does not become a permanent ban; the partial unique
  -- index only covers pending rows, so asking again later is allowed.
  perform pg_temp.assert(
    (select count(*) from public.friend_requests
     where sender_id = 'f0000000-0000-4000-8000-00000000000c') = 1,
    'the sender can see their request was declined');
end
$$;

insert into public.friend_requests (sender_id, recipient_id)
values ('f0000000-0000-4000-8000-00000000000c', 'f0000000-0000-4000-8000-00000000000b');

update public.friend_requests set status = 'cancelled', responded_at = now()
 where sender_id = 'f0000000-0000-4000-8000-00000000000c' and status = 'pending';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.friend_requests
     where sender_id = 'f0000000-0000-4000-8000-00000000000c'
       and status = 'cancelled') = 1,
    'the sender can cancel a request they sent');
end
$$;

-- The sender must not be able to accept by writing the row directly.
--
-- This one is REJECTED rather than silently affecting zero rows, and the
-- difference is worth naming: the sender-cancels policy's USING clause does
-- match the row (they are the sender and it is pending), so the row is
-- selected for update and the WITH CHECK then refuses the new value. A policy
-- whose USING clause did not match would give a silent no-op instead, which is
-- safe but tells the client nothing.
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000d';
insert into public.friend_requests (sender_id, recipient_id)
values ('f0000000-0000-4000-8000-00000000000d', 'f0000000-0000-4000-8000-00000000000b');

do $$
begin
  perform pg_temp.assert_rejected(
    $sql$update public.friend_requests set status = 'accepted', responded_at = now()
          where sender_id = 'f0000000-0000-4000-8000-00000000000d'
            and status = 'pending'$sql$,
    'the sender cannot mark their own request accepted');

  perform pg_temp.assert(
    (select status from public.friend_requests
     where sender_id = 'f0000000-0000-4000-8000-00000000000d'
       and recipient_id = 'f0000000-0000-4000-8000-00000000000b') = 'pending',
    'the request is still pending after the attempt');
end
$$;

-- --------------------------------------------------------------------------
-- Unfriending
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000d';
delete from public.friendships
 where user_low_id = least('f0000000-0000-4000-8000-00000000000d'::uuid,
                           'f0000000-0000-4000-8000-00000000000c'::uuid)
   and user_high_id = greatest('f0000000-0000-4000-8000-00000000000d'::uuid,
                               'f0000000-0000-4000-8000-00000000000c'::uuid);

do $$
begin
  perform pg_temp.assert(
    not public.are_friends('f0000000-0000-4000-8000-00000000000d',
                           'f0000000-0000-4000-8000-00000000000c'),
    'either party can unfriend');
  perform pg_temp.assert(
    (select count(*) from public.public_profiles where username = 'careem.f') = 0,
    'unfriending closes the friends-only profile again');
end
$$;

-- --------------------------------------------------------------------------
-- The block list is readable by the blocker, and by nobody else
-- --------------------------------------------------------------------------
-- `public_profiles` hides a blocked person from the blocker too, so without
-- `blocked_profiles()` the block list renders empty and nobody can be
-- unblocked by name.

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000a';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.blocked_profiles()) = 1,
    'the blocker can read their own block list');
  perform pg_temp.assert(
    (select username from public.blocked_profiles()) = 'bishoy.f',
    'the block list names who was blocked, so they can be unblocked');
end
$$;

set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000b';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.blocked_profiles()) = 0,
    'blocked_profiles shows the caller''s own blocks and nobody else''s');
end
$$;

-- Unblocking restores contact.
set request.jwt.claim.sub = 'f0000000-0000-4000-8000-00000000000a';
delete from public.blocks
 where blocker_id = 'f0000000-0000-4000-8000-00000000000a'
   and blocked_id = 'f0000000-0000-4000-8000-00000000000b';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.blocked_profiles()) = 0,
    'unblocking empties the block list');
  perform pg_temp.assert(
    (select count(*) from public.public_profiles where username = 'bishoy.f') = 1,
    'an unblocked person is visible again');
  -- Unblocking does NOT restore the friendship the block removed. Asserted so
  -- nobody "fixes" it into a surprise: getting the friend back would be a
  -- decision, not a rollback.
  perform pg_temp.assert(
    not public.are_friends('f0000000-0000-4000-8000-00000000000a',
                           'f0000000-0000-4000-8000-00000000000b'),
    'unblocking does not silently restore the friendship');
end
$$;

reset role;
reset request.jwt.claim.sub;

-- Structural guarantees, asserted rather than assumed.
do $$
begin
  perform pg_temp.assert(
    not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'friendships' and cmd = 'INSERT'
    ),
    'friendships has no insert policy — accepting a request is the only route in');

  perform pg_temp.assert(
    (select count(*) from public.friendships where user_low_id >= user_high_id) = 0,
    'every friendship row is stored with its ids in order');
end
$$;

\echo ''
\echo 'ALL FRIENDS TESTS PASSED'
