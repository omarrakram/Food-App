-- In-app notifications.
--
-- Two questions, and the second is the one that bites:
--
--   * can I read somebody else's notifications? (no, not even to count them)
--   * can I WRITE one into somebody else's feed?
--
-- The second is the interesting one. A notifications table with an insert
-- policy is a spam channel with the product's name on it: anyone could put a
-- row in anyone's feed saying a friend request had arrived, or that a
-- submission had been approved. So there is no insert policy at all, and every
-- row comes from a trigger running as definer on the table where the event
-- actually happened.

\set ON_ERROR_STOP on
\echo ''
\echo 'Notifications'

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
  ('e0000000-0000-4000-8000-00000000000a', 'a@notif.test'),
  ('e0000000-0000-4000-8000-00000000000b', 'b@notif.test'),
  ('e0000000-0000-4000-8000-00000000000c', 'c@notif.test');

update public.profiles set username = 'anotif' where id = 'e0000000-0000-4000-8000-00000000000a';
update public.profiles set username = 'bnotif' where id = 'e0000000-0000-4000-8000-00000000000b';
update public.profiles set username = 'cnotif' where id = 'e0000000-0000-4000-8000-00000000000c';

create temp table notif_ids (label text primary key, id uuid);
grant select, insert, update, delete on notif_ids to authenticated;

set role authenticated;

-- --------------------------------------------------------------------------
-- A friend request notifies its recipient, and only its recipient
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'e0000000-0000-4000-8000-00000000000a';

insert into public.friend_requests (sender_id, recipient_id)
values ('e0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000b');

do $$
begin
  -- The sender knows what they did. A notification about it is noise.
  perform pg_temp.assert(
    (select count(*) from public.notifications) = 0,
    'sending a request does not notify the sender');
end
$$;

set request.jwt.claim.sub = 'e0000000-0000-4000-8000-00000000000b';

do $$
declare
  request_id uuid;
begin
  perform pg_temp.assert(
    (select count(*) from public.notifications where kind = 'friend_request') = 1,
    'the recipient is notified of a friend request');

  perform pg_temp.assert(
    (select actor_id from public.notifications where kind = 'friend_request')
      = 'e0000000-0000-4000-8000-00000000000a',
    'the notification names who sent it');

  perform pg_temp.assert(
    public.unread_notification_count() = 1,
    'it starts unread');

  -- Accepting notifies the other way round.
  select id into request_id from public.friend_requests
   where recipient_id = 'e0000000-0000-4000-8000-00000000000b';
  insert into notif_ids values ('request', request_id);
  perform public.accept_friend_request(request_id);
end
$$;

set request.jwt.claim.sub = 'e0000000-0000-4000-8000-00000000000a';

do $$
begin
  perform pg_temp.assert(
    (select count(*) from public.notifications where kind = 'friend_accepted') = 1,
    'the sender is told when their request is accepted');
end
$$;

-- --------------------------------------------------------------------------
-- Messages, and the difference between words and a shared recipe
-- --------------------------------------------------------------------------

do $$
declare
  conversation uuid;
  dish uuid := (select id from public.recipes limit 1);
begin
  conversation := public.start_conversation('e0000000-0000-4000-8000-00000000000b');
  insert into notif_ids values ('conversation', conversation);

  insert into public.messages (conversation_id, sender_id, body)
  values (conversation, 'e0000000-0000-4000-8000-00000000000a', 'are you cooking tonight');

  insert into public.messages (conversation_id, sender_id, body, shared_recipe_id)
  values (conversation, 'e0000000-0000-4000-8000-00000000000a', '', dish);
end
$$;

set request.jwt.claim.sub = 'e0000000-0000-4000-8000-00000000000b';

do $$
declare
  conversation uuid := (select id from notif_ids where label = 'conversation');
begin
  perform pg_temp.assert(
    (select count(*) from public.notifications where kind = 'message') = 1,
    'a message notifies the other member');

  perform pg_temp.assert(
    (select count(*) from public.notifications where kind = 'recipe_shared') = 1,
    'a shared recipe is its own kind of notification');

  -- A pointer, not a copy: the subject is the conversation, and the screen
  -- looks it up. A notification carrying the message body would outlive the
  -- message being deleted.
  perform pg_temp.assert(
    (select subject_id from public.notifications where kind = 'message') = conversation,
    'the notification points at the conversation rather than copying the words');

  perform pg_temp.assert(
    (select count(*) from public.notifications
      where kind in ('message', 'recipe_shared')
        and (subject_id::text like '%are you cooking%')) = 0,
    'no message text is stored on the notification');
end
$$;

-- --------------------------------------------------------------------------
-- A stranger
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'e0000000-0000-4000-8000-00000000000c';

do $$
begin
  -- THE assertion this file exists for.
  perform pg_temp.assert(
    (select count(*) from public.notifications) = 0,
    'a stranger cannot read anybody else''s notifications');

  perform pg_temp.assert(
    public.unread_notification_count() = 0,
    'a stranger cannot even count them');

  -- THE OTHER one. An insert policy here would be a spam channel.
  perform pg_temp.assert_rejected(
    $sql$insert into public.notifications (user_id, kind, actor_id)
         values ('e0000000-0000-4000-8000-00000000000b', 'submission_approved',
                 'e0000000-0000-4000-8000-00000000000c')$sql$,
    'a client cannot write a notification into somebody else''s feed');

  perform pg_temp.assert_rejected(
    $sql$insert into public.notifications (user_id, kind)
         values ('e0000000-0000-4000-8000-00000000000c', 'friend_request')$sql$,
    'a client cannot write a notification into its own feed either');

  perform pg_temp.assert_rejected(
    $sql$select public.notify('e0000000-0000-4000-8000-00000000000b',
                              'friend_request', null, null)$sql$,
    'the notify function is not callable by a client');
end
$$;

-- --------------------------------------------------------------------------
-- Marking read
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'e0000000-0000-4000-8000-00000000000b';

do $$
begin
  perform pg_temp.assert(
    public.unread_notification_count() > 0,
    'there is something unread to clear');

  perform public.mark_all_notifications_read();

  perform pg_temp.assert(
    public.unread_notification_count() = 0,
    'marking all read clears the badge');
end
$$;

set request.jwt.claim.sub = 'e0000000-0000-4000-8000-00000000000a';

do $$
begin
  -- Marking read is per person. B reading their copy must not clear A's.
  perform pg_temp.assert(
    public.unread_notification_count() > 0,
    'one person reading their feed does not clear another''s');
end
$$;

-- --------------------------------------------------------------------------
-- Structural guarantees
-- --------------------------------------------------------------------------

reset role;
reset request.jwt.claim.sub;

do $$
begin
  perform pg_temp.assert(
    (select count(*) from pg_policies
      where tablename = 'notifications' and cmd in ('INSERT', 'ALL')) = 0,
    'notifications has no insert policy — a client cannot forge one');

  perform pg_temp.assert(
    (select relrowsecurity from pg_class where relname = 'notifications'),
    'notifications has row level security enabled');
end
$$;
