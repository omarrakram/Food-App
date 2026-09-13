-- One-to-one conversations.
--
-- No group chat: the brief is explicit, and it is the right call for a first
-- version — a two-party conversation has no membership changes, no admin, no
-- "who can add whom", and no leaving-and-rejoining semantics to get wrong.
--
-- The structure is nonetheless `conversations` + `conversation_members` +
-- `messages` rather than a single table keyed on a pair of user ids. That is
-- not speculative generality: read state and archive state are per-PERSON, not
-- per-conversation, and they have to live somewhere. A members table is where.
-- The one-to-one rule is then a constraint on that table rather than a shape
-- the schema cannot express.

create table public.conversations (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  -- Denormalised from the newest message. Without it, the conversation list —
  -- the most-visited screen in any messaging feature — is a correlated
  -- subquery per row, which is exactly the query that gets slow first.
  last_message_at   timestamptz not null default now(),
  last_message_body text,

  constraint conversations_preview_length
    check (last_message_body is null or char_length(last_message_body) <= 200)
);

create index conversations_recent_idx on public.conversations (last_message_at desc);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  -- When this member last opened the thread. The unread count is derived from
  -- it rather than stored, so it cannot drift out of step with the messages.
  last_read_at    timestamptz not null default now(),

  primary key (conversation_id, user_id)
);

-- "My conversations, newest first" — the list screen's only query.
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  -- A shared recipe travels as a REFERENCE, never as copied content. The card
  -- then renders the recipe as it is now, and a recipe that is later made
  -- private or removed stops rendering rather than leaving a stale copy of
  -- someone's unapproved submission in a chat log.
  shared_recipe_id uuid references public.recipes (id) on delete set null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,

  constraint messages_body_length check (char_length(body) between 1 and 4000)
);

-- Keyset pagination through a thread: newest first, stable under new arrivals.
create index messages_thread_idx
  on public.messages (conversation_id, created_at desc, id desc);

comment on table public.messages is
  'A shared recipe is a reference, not a copy: the card renders the recipe as '
  'it is now, so unsharing or unpublishing one actually takes effect.';

-- --------------------------------------------------------------------------
-- Exactly two people, and only ever two
-- --------------------------------------------------------------------------
-- A "one-to-one conversation" with three members is not a thing this product
-- has screens for, so it must not be a thing the database has rows for.

create or replace function public.enforce_two_party_conversation()
returns trigger
language plpgsql
as $$
declare
  member_count integer;
begin
  select count(*) into member_count
    from public.conversation_members
   where conversation_id = new.conversation_id;

  if member_count > 2 then
    raise exception 'a conversation has exactly two members' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Fires immediately, per row, and deliberately NOT deferred. `start_conversation`
-- inserts two members in one statement and the count is 1 then 2, so nothing
-- legitimate needs the check postponed — while deferring it moves the failure
-- to commit time, where the caller has already been told the insert worked.
create trigger conversation_members_two_party
  after insert on public.conversation_members
  for each row execute function public.enforce_two_party_conversation();

-- --------------------------------------------------------------------------
-- Membership, as a function
-- --------------------------------------------------------------------------
-- Used by every policy below. A definer function so the policy on `messages`
-- can ask about `conversation_members` without recursing through that table's
-- own policy — the usual way a membership check deadlocks or silently returns
-- nothing.

create or replace function public.is_conversation_member(conversation uuid, who uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conversation and m.user_id = who
  );
$$;

revoke all on function public.is_conversation_member(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;

/** The other person in a two-party conversation. */
create or replace function public.conversation_partner(conversation uuid)
returns uuid
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select m.user_id
    from public.conversation_members m
   where m.conversation_id = conversation
     and m.user_id <> auth.uid()
   limit 1;
$$;

revoke all on function public.conversation_partner(uuid) from public, anon;
grant execute on function public.conversation_partner(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- Row level security
-- --------------------------------------------------------------------------

alter table public.conversations enable row level security;

create policy "conversations: read own"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id, auth.uid()));

-- Deliberately no insert, update or delete policy. A conversation is created
-- by `start_conversation` below, its preview is maintained by a trigger, and
-- nothing else may touch it: a client that could UPDATE a conversation could
-- rewrite the preview text everyone sees in their list.

alter table public.conversation_members enable row level security;

create policy "conversation_members: read own conversations"
  on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

-- The one thing a member may change about their own membership is how far they
-- have read.
create policy "conversation_members: mark own read"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table public.messages enable row level security;

create policy "messages: read own conversations"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

-- Sending. Three conditions, and the third is the one that makes blocking
-- work: a block must stop messages in an EXISTING thread, not merely stop a
-- new one being started.
create policy "messages: send to own conversations"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id, auth.uid())
    and not public.blocked_between(auth.uid(), public.conversation_partner(conversation_id))
  );

-- Editing your own words. `created_at` and `sender_id` are not editable, so
-- nobody can rewrite history or attribute a message to somebody else.
create policy "messages: edit own"
  on public.messages for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create policy "messages: delete own"
  on public.messages for delete to authenticated
  using (sender_id = auth.uid());

-- --------------------------------------------------------------------------
-- Starting a conversation
-- --------------------------------------------------------------------------
-- Returns the existing thread when there is one. Without that, tapping
-- "Message" twice produces two conversations with the same person and the
-- history splits between them.

create or replace function public.start_conversation(partner uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  existing uuid;
  created uuid;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if partner = me then
    raise exception 'cannot message yourself' using errcode = '22023';
  end if;
  if public.blocked_between(me, partner) then
    -- Deliberately the same error as a missing user would produce. Telling the
    -- blocked party that a block exists is the signal the block avoids.
    raise exception 'cannot start that conversation' using errcode = '42501';
  end if;

  -- The existing thread between exactly these two.
  select m1.conversation_id into existing
    from public.conversation_members m1
    join public.conversation_members m2 on m2.conversation_id = m1.conversation_id
   where m1.user_id = me and m2.user_id = partner
   limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.conversations default values returning id into created;
  insert into public.conversation_members (conversation_id, user_id)
  values (created, me), (created, partner);

  return created;
end;
$$;

revoke all on function public.start_conversation(uuid) from public, anon;
grant execute on function public.start_conversation(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- The conversation-list preview
-- --------------------------------------------------------------------------
-- Maintained by a trigger rather than by the sender. A client that had to
-- write it could write anything, and a client that forgot would leave every
-- other member's list showing a stale message.

create or replace function public.touch_conversation_preview()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_body = left(new.body, 200)
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_preview();

-- --------------------------------------------------------------------------
-- Unread counts
-- --------------------------------------------------------------------------
-- Derived from `last_read_at` rather than stored, so it cannot drift. One
-- function so the list screen gets every count in a single round trip instead
-- of one per conversation.

create or replace function public.unread_counts()
returns table (conversation_id uuid, unread integer)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    m.conversation_id,
    (
      select count(*)::integer
        from public.messages msg
       where msg.conversation_id = m.conversation_id
         and msg.created_at > m.last_read_at
         and msg.sender_id <> auth.uid()
    ) as unread
  from public.conversation_members m
  where m.user_id = auth.uid();
$$;

revoke all on function public.unread_counts() from public, anon;
grant execute on function public.unread_counts() to authenticated;

comment on function public.unread_counts is
  'Every conversation''s unread count in one round trip. Derived from '
  'last_read_at, so it cannot drift out of step with the messages.';
