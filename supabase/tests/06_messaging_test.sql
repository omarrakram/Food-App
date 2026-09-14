-- One-to-one conversations.
--
-- The question this file exists to answer is the one from the brief: can A
-- read B's messages? Everything else supports it.
--
--   * can I read a thread I am not in?
--   * can I insert myself into one?
--   * can I send as somebody else, or edit their words?
--   * can somebody I blocked keep messaging an EXISTING thread?
--   * can a "one-to-one" conversation quietly become a three-way?

\set ON_ERROR_STOP on
\echo ''
\echo 'Messaging'

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

insert into auth.users (id, email)
values
  ('c0000000-0000-4000-8000-00000000000a', 'a@msg.test'),
  ('c0000000-0000-4000-8000-00000000000b', 'b@msg.test'),
  ('c0000000-0000-4000-8000-00000000000c', 'c@msg.test');

update public.profiles set username = 'amsg' where id = 'c0000000-0000-4000-8000-00000000000a';
update public.profiles set username = 'bmsg' where id = 'c0000000-0000-4000-8000-00000000000b';
update public.profiles set username = 'cmsg' where id = 'c0000000-0000-4000-8000-00000000000c';

-- Ids captured across role switches. Granted to `authenticated` because the
-- test runs most of its assertions as that role, and a temp table is not
-- covered by the schema's default privileges.
create temp table msg_ids (label text primary key, id uuid);
grant select, insert, update, delete on msg_ids to authenticated;

set role authenticated;
set request.jwt.claim.sub = 'c0000000-0000-4000-8000-00000000000a';

-- --------------------------------------------------------------------------
-- Starting a thread
-- --------------------------------------------------------------------------

do $$
declare
  first_id uuid;
  second_id uuid;
begin
  first_id := public.start_conversation('c0000000-0000-4000-8000-00000000000b');
  perform pg_temp.assert(first_id is not null, 'a conversation can be started');

  -- Tapping "Message" twice must not split the history in two.
  second_id := public.start_conversation('c0000000-0000-4000-8000-00000000000b');
  perform pg_temp.assert(second_id = first_id, 'starting again returns the same conversation');

  insert into msg_ids values ('ab', first_id);

  perform pg_temp.assert_rejected(
    $sql$select public.start_conversation('c0000000-0000-4000-8000-00000000000a')$sql$,
    'you cannot start a conversation with yourself');

  perform pg_temp.assert(
    (select count(*) from public.conversation_members where conversation_id = first_id) = 2,
    'a new conversation has exactly two members');
end
$$;

insert into public.messages (conversation_id, sender_id, body)
select id, 'c0000000-0000-4000-8000-00000000000a', 'shall we make koshari'
  from msg_ids where label = 'ab';

do $$
begin
  perform pg_temp.assert(
    (select last_message_body from public.conversations
      where id = (select id from msg_ids where label = 'ab')) = 'shall we make koshari',
    'the conversation preview is maintained by the database, not the sender');
end
$$;

-- --------------------------------------------------------------------------
-- A stranger sees nothing
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'c0000000-0000-4000-8000-00000000000c';

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
begin
  -- THE assertion this file exists for.
  perform pg_temp.assert(
    (select count(*) from public.messages) = 0,
    'a non-member cannot read the messages');
  perform pg_temp.assert(
    (select count(*) from public.conversations) = 0,
    'a non-member cannot even see the conversation exists');
  perform pg_temp.assert(
    (select count(*) from public.conversation_members) = 0,
    'a non-member cannot see who is in it');

  perform pg_temp.assert_rejected(
    format(
      $sql$insert into public.messages (conversation_id, sender_id, body)
           values (%L, 'c0000000-0000-4000-8000-00000000000c', 'let me in')$sql$,
      target),
    'a non-member cannot send into the conversation');

  -- Adding yourself to somebody else's thread.
  perform pg_temp.assert_rejected(
    format(
      $sql$insert into public.conversation_members (conversation_id, user_id)
           values (%L, 'c0000000-0000-4000-8000-00000000000c')$sql$,
      target),
    'a non-member cannot add themselves to the conversation');
end
$$;

-- --------------------------------------------------------------------------
-- A member cannot forge or rewrite
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'c0000000-0000-4000-8000-00000000000b';

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
begin
  perform pg_temp.assert(
    (select count(*) from public.messages) = 1,
    'the other member can read the thread');

  perform pg_temp.assert_rejected(
    format(
      $sql$insert into public.messages (conversation_id, sender_id, body)
           values (%L, 'c0000000-0000-4000-8000-00000000000a', 'I did not write this')$sql$,
      target),
    'a member cannot send a message attributed to the other person');

  perform pg_temp.assert_rejected(
    format(
      $sql$insert into public.messages (conversation_id, sender_id, body)
           values (%L, 'c0000000-0000-4000-8000-00000000000b', '')$sql$,
      target),
    'an empty message with nothing attached is rejected');
end
$$;

-- --------------------------------------------------------------------------
-- Sharing a recipe
-- --------------------------------------------------------------------------
-- Two things have to be true at once. Tapping Share and sending the card with
-- no covering note is the most ordinary sharing gesture there is, so a message
-- carrying only a `shared_recipe_id` must be accepted — otherwise the app has
-- to invent a body, and an invented body is words the user did not write
-- appearing under their name. And a message carrying NEITHER words nor a
-- recipe is still nothing, and still refused (asserted just above).

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
  dish uuid := (select id from public.recipes limit 1);
  shared uuid;
begin
  perform pg_temp.assert(dish is not null, 'the seed has a recipe to share');

  insert into public.messages (conversation_id, sender_id, body, shared_recipe_id)
  values (target, 'c0000000-0000-4000-8000-00000000000b', '', dish)
  returning id into shared;

  perform pg_temp.assert(
    shared is not null,
    'a shared recipe needs no covering note');

  -- The reference, not a copy. Unpublishing the recipe must actually take
  -- effect in the chat log, which it cannot do if the content travelled.
  perform pg_temp.assert(
    (select shared_recipe_id from public.messages where id = shared) = dish,
    'the share is stored as a reference to the recipe');

  perform pg_temp.assert(
    (select last_message_body from public.conversations where id = target) = '',
    'the preview of a wordless share is empty rather than invented');

  delete from public.messages where id = shared;
end
$$;

-- Editing someone else's message. Refused by RLS as a zero-row update, so the
-- proof is that the text did not change.
update public.messages set body = 'tampered'
 where sender_id = 'c0000000-0000-4000-8000-00000000000a';

do $$
begin
  perform pg_temp.assert(
    (select body from public.messages
      where sender_id = 'c0000000-0000-4000-8000-00000000000a') = 'shall we make koshari',
    'a member cannot edit the other person''s message');
end
$$;

-- --------------------------------------------------------------------------
-- Unread counts
-- --------------------------------------------------------------------------

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
begin
  perform pg_temp.assert(
    (select unread from public.unread_counts() where conversation_id = target) = 1,
    'an unopened message counts as unread');

  update public.conversation_members
     set last_read_at = now()
   where conversation_id = target and user_id = 'c0000000-0000-4000-8000-00000000000b';

  perform pg_temp.assert(
    (select unread from public.unread_counts() where conversation_id = target) = 0,
    'marking read clears the count');
end
$$;

insert into public.messages (conversation_id, sender_id, body)
select id, 'c0000000-0000-4000-8000-00000000000b', 'yes, with extra dakka'
  from msg_ids where label = 'ab';

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
begin
  -- Your own message must not make your own thread unread.
  perform pg_temp.assert(
    (select unread from public.unread_counts() where conversation_id = target) = 0,
    'your own message does not count as unread to you');
end
$$;

set request.jwt.claim.sub = 'c0000000-0000-4000-8000-00000000000a';

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
begin
  perform pg_temp.assert(
    (select unread from public.unread_counts() where conversation_id = target) = 1,
    'the reply is unread for the other person');
  perform pg_temp.assert(
    (select count(*) from public.unread_counts()) = 1,
    'unread_counts returns only the caller''s own conversations');
end
$$;

-- --------------------------------------------------------------------------
-- Blocking stops an EXISTING thread
-- --------------------------------------------------------------------------
-- A block that only prevents NEW conversations is not a block: the two already
-- have a thread, and it would keep working.

select public.block_user('c0000000-0000-4000-8000-00000000000b');

set request.jwt.claim.sub = 'c0000000-0000-4000-8000-00000000000b';

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
begin
  perform pg_temp.assert_rejected(
    format(
      $sql$insert into public.messages (conversation_id, sender_id, body)
           values (%L, 'c0000000-0000-4000-8000-00000000000b', 'are you there')$sql$,
      target),
    'a blocked person cannot send into an existing thread');

  perform pg_temp.assert_rejected(
    $sql$select public.start_conversation('c0000000-0000-4000-8000-00000000000a')$sql$,
    'a blocked person cannot start a new thread either');
end
$$;

-- The blocker cannot message them either. Symmetric on purpose: a one-sided
-- silence would tell the blocked person exactly what happened.
set request.jwt.claim.sub = 'c0000000-0000-4000-8000-00000000000a';

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
begin
  perform pg_temp.assert_rejected(
    format(
      $sql$insert into public.messages (conversation_id, sender_id, body)
           values (%L, 'c0000000-0000-4000-8000-00000000000a', 'hello?')$sql$,
      target),
    'the blocker cannot message the person they blocked');
end
$$;

-- --------------------------------------------------------------------------
-- Two parties, and only two
-- --------------------------------------------------------------------------

reset role;
reset request.jwt.claim.sub;

do $$
declare
  target uuid := (select id from msg_ids where label = 'ab');
begin
  -- Attempted as superuser, bypassing RLS entirely: the two-party rule is a
  -- constraint on the DATA, not a permission, and must hold even for a writer
  -- that policies do not apply to.
  perform pg_temp.assert_rejected(
    format(
      $sql$insert into public.conversation_members (conversation_id, user_id)
           values (%L, 'c0000000-0000-4000-8000-00000000000c')$sql$,
      target),
    'a one-to-one conversation cannot become a three-way, even for a superuser');
end
$$;

-- Structure, asserted rather than assumed.
do $$
begin
  perform pg_temp.assert(
    not exists (
      select 1 from pg_policies
       where schemaname = 'public' and tablename = 'conversations'
         and cmd in ('INSERT', 'UPDATE', 'DELETE')
    ),
    'conversations has no write policy — the preview cannot be forged');

  perform pg_temp.assert(
    (select relrowsecurity from pg_class where oid = 'public.messages'::regclass),
    'messages has row level security enabled');
end
$$;

\echo ''
\echo 'ALL MESSAGING TESTS PASSED'
