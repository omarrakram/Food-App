-- Friends and blocks.
--
-- The design goal is that the impossible states are impossible in Postgres,
-- not merely unreachable through the UI. Every rule below could be enforced in
-- the client; none of them would be, because a client is a thing an attacker
-- controls and a race is a thing an honest client loses.
--
-- Four rules, and each has a constraint rather than a code path:
--
--   * you cannot friend yourself
--   * two people are friends once, not twice
--   * two people have at most one pending request between them, in either
--     direction
--   * a blocked person cannot reach you at all
--
-- The last one is the reason `blocks` is in this migration rather than a later
-- one: a block that only stops NEW requests is not a block.

create type public.friend_request_status as enum (
  'pending',
  'accepted',
  'declined',
  'cancelled'
);

-- --------------------------------------------------------------------------
-- Blocks
-- --------------------------------------------------------------------------
-- Deliberately first: the friendship rules below reference it.

create table public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

-- "Who has blocked me?" is asked on every request and every message send, and
-- it is asked from the blocked side, which the primary key does not serve.
create index blocks_blocked_idx on public.blocks (blocked_id);

comment on table public.blocks is
  'One-directional. A block is not a mutual state and must not be visible to '
  'the person blocked — being told you have been blocked is itself a signal.';

-- --------------------------------------------------------------------------
-- Requests
-- --------------------------------------------------------------------------

create table public.friend_requests (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  status        public.friend_request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,

  constraint friend_requests_not_self check (sender_id <> recipient_id),
  -- A resolved request records WHEN, so "declined last week" and "declined
  -- just now" are distinguishable when we decide whether to allow a re-send.
  constraint friend_requests_responded
    check ((status = 'pending') = (responded_at is null))
);

-- At most one LIVE request between two people, whichever way round.
--
-- A partial unique index on the unordered pair: without the `least/greatest`
-- normalisation, A→B and B→A are different rows and both can be pending, which
-- is how two people end up each waiting for the other to accept.
create unique index friend_requests_one_pending
  on public.friend_requests (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id)
  )
  where status = 'pending';

create index friend_requests_recipient_idx
  on public.friend_requests (recipient_id, created_at desc)
  where status = 'pending';

create index friend_requests_sender_idx
  on public.friend_requests (sender_id, created_at desc)
  where status = 'pending';

-- --------------------------------------------------------------------------
-- Friendships
-- --------------------------------------------------------------------------

create table public.friendships (
  -- Stored ONCE, with the ids ordered. The alternative — a row each way — has
  -- to be kept in sync by every writer, and "are these two friends?" becomes a
  -- question with two answers that can disagree.
  user_low_id   uuid not null references public.profiles (id) on delete cascade,
  user_high_id  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),

  primary key (user_low_id, user_high_id),
  constraint friendships_ordered check (user_low_id < user_high_id)
);

-- The primary key serves lookups from the low side; this serves the high side.
create index friendships_high_idx on public.friendships (user_high_id);

comment on table public.friendships is
  'One row per friendship, ids ordered low-high. `friendships_ordered` is what '
  'makes the ordering an invariant rather than a convention a writer can skip.';

-- --------------------------------------------------------------------------
-- Are these two friends?
-- --------------------------------------------------------------------------
-- Used by RLS on messages, by the profile view, and by the client. A function
-- so the ordering rule lives in exactly one place.

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_low_id = least(a, b)
      and f.user_high_id = greatest(a, b)
  );
$$;

revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

/**
 * Has either of these two blocked the other?
 *
 * Symmetric on purpose. A block stops contact in both directions: if it only
 * stopped the blocker from being contacted, the blocked person would still see
 * them in search, still be able to message an existing thread, and would learn
 * they had been blocked the moment a request failed.
 */
create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function public.blocked_between(uuid, uuid) from public, anon;
grant execute on function public.blocked_between(uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------

alter table public.blocks enable row level security;

-- A block is visible only to the person who made it. The blocked user must not
-- be able to discover it: "you have been blocked" is information.
create policy "blocks: read own"
  on public.blocks for select to authenticated
  using (blocker_id = auth.uid());

create policy "blocks: create own"
  on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

create policy "blocks: remove own"
  on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());

alter table public.friend_requests enable row level security;

create policy "friend_requests: read own"
  on public.friend_requests for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- Sending. Three things the database refuses regardless of the client:
-- sending as somebody else, sending to someone either side has blocked, and
-- sending to somebody who is already a friend.
create policy "friend_requests: send own"
  on public.friend_requests for insert to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id <> auth.uid()
    and status = 'pending'
    and not public.blocked_between(auth.uid(), recipient_id)
    and not public.are_friends(auth.uid(), recipient_id)
  );

-- Responding. The recipient accepts or declines; the sender may only cancel.
-- Expressed as two policies rather than one with an `or`, because the two
-- rules genuinely differ and a single clause would let a sender "accept" their
-- own request.
create policy "friend_requests: recipient responds"
  on public.friend_requests for update to authenticated
  using (recipient_id = auth.uid() and status = 'pending')
  with check (recipient_id = auth.uid() and status in ('accepted', 'declined'));

create policy "friend_requests: sender cancels"
  on public.friend_requests for update to authenticated
  using (sender_id = auth.uid() and status = 'pending')
  with check (sender_id = auth.uid() and status = 'cancelled');

alter table public.friendships enable row level security;

create policy "friendships: read own"
  on public.friendships for select to authenticated
  using (user_low_id = auth.uid() or user_high_id = auth.uid());

-- Deliberately NO insert policy. A friendship is created by accepting a
-- request, through the function below, and by no other route: an insert policy
-- would let a client add itself to anyone's friend list.
create policy "friendships: unfriend"
  on public.friendships for delete to authenticated
  using (user_low_id = auth.uid() or user_high_id = auth.uid());

-- --------------------------------------------------------------------------
-- Accepting a request
-- --------------------------------------------------------------------------
-- Two writes that must both happen or neither: the request becomes accepted
-- and the friendship appears. A client doing this in two calls can crash
-- between them and leave an accepted request with no friendship, which renders
-- as "you have no friends" to someone who just accepted one.

create or replace function public.accept_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req public.friend_requests;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- `for update` so two taps on Accept cannot both pass the status check.
  select * into req
    from public.friend_requests
   where id = request_id
   for update;

  if req.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  -- Only the RECIPIENT accepts. Checked here as well as in the policy because
  -- this function is security definer and therefore bypasses that policy.
  if req.recipient_id <> auth.uid() then
    raise exception 'only the recipient may accept' using errcode = '42501';
  end if;

  if req.status <> 'pending' then
    raise exception 'request is not pending' using errcode = '22023';
  end if;

  if public.blocked_between(req.sender_id, req.recipient_id) then
    raise exception 'blocked' using errcode = '42501';
  end if;

  update public.friend_requests
     set status = 'accepted', responded_at = now()
   where id = request_id;

  insert into public.friendships (user_low_id, user_high_id)
  values (least(req.sender_id, req.recipient_id), greatest(req.sender_id, req.recipient_id))
  on conflict do nothing;
end;
$$;

revoke all on function public.accept_friend_request(uuid) from public, anon;
grant execute on function public.accept_friend_request(uuid) to authenticated;

comment on function public.accept_friend_request is
  'The only route to a friendship row. There is no insert policy on '
  'friendships, so a client cannot add itself to anyone''s friend list.';

-- --------------------------------------------------------------------------
-- Blocking removes the relationship
-- --------------------------------------------------------------------------
-- A block that leaves the friendship in place is not a block: the two would
-- still be friends, still see each other's friends-only profile, and still
-- share any conversation the friendship allowed.

create or replace function public.block_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if target = auth.uid() then
    raise exception 'cannot block yourself' using errcode = '22023';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (auth.uid(), target)
  on conflict do nothing;

  delete from public.friendships
   where user_low_id = least(auth.uid(), target)
     and user_high_id = greatest(auth.uid(), target);

  -- Any request in flight either way is withdrawn rather than left pending.
  update public.friend_requests
     set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and ((sender_id = auth.uid() and recipient_id = target)
       or (sender_id = target and recipient_id = auth.uid()));
end;
$$;

revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- `friends` visibility now means something
-- --------------------------------------------------------------------------
-- Until this migration there was no friendship table, so the view treated
-- 'friends' as strictly narrower than 'public' — visible to nobody but the
-- owner. That was the safe direction to be wrong in. Widening it is this one
-- deliberate line.
--
-- A blocked user is excluded at every visibility level, including 'public':
-- blocking someone who can still read your profile has not achieved much.

create or replace view public.public_profiles
with (security_invoker = false) as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.country,
  case when p.show_city then p.city else null end as city,
  p.created_at as joined_at
from public.profiles p
where p.username is not null
  and (
    p.id = auth.uid()
    or (
      not public.blocked_between(p.id, auth.uid())
      and (
        p.visibility = 'public'
        or (p.visibility = 'friends' and public.are_friends(p.id, auth.uid()))
      )
    )
  );

revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

-- --------------------------------------------------------------------------
-- Seeing who you have blocked
-- --------------------------------------------------------------------------
-- `public_profiles` hides a blocked person from the blocker as well as the
-- other way round, which is right for browsing — you should not run into
-- somebody you blocked — but it leaves the block list itself unreadable, so
-- there is no way to unblock anyone by name.
--
-- A definer function is the narrow exception: it returns the same public
-- columns, for exactly the people the caller has blocked, and for nobody else.
-- It cannot be pointed at another user's block list because it takes no
-- argument.

create or replace function public.blocked_profiles()
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  country text,
  city text,
  joined_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.country,
    case when p.show_city then p.city else null end as city,
    p.created_at as joined_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
  limit 200;
$$;

revoke all on function public.blocked_profiles() from public, anon;
grant execute on function public.blocked_profiles() to authenticated;

comment on function public.blocked_profiles is
  'The blocker''s own block list. Same columns as public_profiles; no argument, '
  'so it cannot be pointed at anyone else''s.';
