-- ---------------------------------------------------------------------------
-- Akla — in-app notifications
--
-- WHAT THIS IS NOT: a message bus, a job queue, or a place to put arbitrary
-- text. A notification is a POINTER — a kind, and the id of the thing it is
-- about — and every screen that renders one looks the subject up. That is the
-- same rule a shared recipe follows, and for the same reason: a notification
-- carrying a copy of a message body would survive the message being deleted,
-- and a notification carrying a copy of a recipe title would keep advertising
-- a recipe that was unpublished for being unsafe.
--
-- WHO WRITES THEM: triggers, running as definer, on the tables where the
-- events actually happen. Not the client. A client that could insert a
-- notification could put one in somebody else's feed saying anything at all,
-- which is a spam channel with the product's name on it.
--
-- WHO READS THEM: the recipient, and nobody else — not even to count.
-- ---------------------------------------------------------------------------

create type public.notification_kind as enum (
  'friend_request',
  'friend_accepted',
  'message',
  'recipe_shared',
  'submission_approved',
  'submission_rejected',
  'submission_changes_requested'
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null,
  -- Who caused it. Null for anything the system did on its own.
  actor_id   uuid references public.profiles (id) on delete set null,
  -- What it is about: a conversation, a submission, a recipe. Deliberately
  -- untyped — the kind says which table to look in, and a column per target
  -- would be six mostly-null columns.
  subject_id uuid,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- The only query the bell makes: my notifications, newest first. Partial index
-- on the unread ones because the badge count runs on every screen.
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id)
  where read_at is null;

comment on table public.notifications is
  'Pointers, not copies. Every row names a kind and a subject id; the screen '
  'looks the subject up, so deleted or unpublished content stops appearing.';

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

-- Marking read is the one thing a client may change, and only on its own rows.
create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications: delete own"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- NO INSERT POLICY. Deliberate, and the whole reason this is safe: every row
-- is written by a trigger below, running as definer. A client cannot put a
-- notification in anybody's feed, including its own.

-- ---------------------------------------------------------------------------
-- Writing them
-- ---------------------------------------------------------------------------

create or replace function public.notify(
  recipient uuid,
  kind public.notification_kind,
  actor uuid,
  subject uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Never notify somebody about their own action. "You sent a message" is not
  -- news, and it is the commonest way a feed fills with noise.
  if recipient is null or recipient = actor then
    return;
  end if;

  insert into public.notifications (user_id, kind, actor_id, subject_id)
  values (recipient, kind, actor, subject);
end;
$$;

revoke all on function public.notify(uuid, public.notification_kind, uuid, uuid)
  from public, anon, authenticated;

-- --- Friends ---------------------------------------------------------------

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'pending' then
    perform public.notify(new.recipient_id, 'friend_request', new.sender_id, new.id);
  end if;
  return new;
end;
$$;

create trigger friend_requests_notify
  after insert on public.friend_requests
  for each row execute function public.notify_friend_request();

create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The person who SENT the request is the one who wants to know.
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.notify(new.sender_id, 'friend_accepted', new.recipient_id, new.id);
  end if;
  return new;
end;
$$;

create trigger friend_requests_notify_accepted
  after update on public.friend_requests
  for each row execute function public.notify_friend_accepted();

-- --- Messages --------------------------------------------------------------

create or replace function public.notify_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  other uuid;
begin
  select m.user_id into other
    from public.conversation_members m
   where m.conversation_id = new.conversation_id
     and m.user_id <> new.sender_id
   limit 1;

  -- A shared recipe and a written message are different events to a reader,
  -- and the feed should say which arrived.
  perform public.notify(
    other,
    (case when new.shared_recipe_id is not null then 'recipe_shared' else 'message' end)
      ::public.notification_kind,
    new.sender_id,
    new.conversation_id
  );
  return new;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_message();

-- --- Submissions -----------------------------------------------------------

create or replace function public.notify_submission_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'approved' then
      perform public.notify(new.author_id, 'submission_approved', new.decided_by, new.id);
    elsif new.status = 'rejected' then
      perform public.notify(new.author_id, 'submission_rejected', new.decided_by, new.id);
    elsif new.status = 'changes_requested' then
      perform public.notify(
        new.author_id, 'submission_changes_requested', new.decided_by, new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger recipe_submissions_notify
  after update on public.recipe_submissions
  for each row execute function public.notify_submission_decision();

-- ---------------------------------------------------------------------------
-- Reading them
-- ---------------------------------------------------------------------------

create or replace function public.unread_notification_count()
returns integer
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select count(*)::integer
    from public.notifications
   where user_id = auth.uid() and read_at is null;
$$;

revoke all on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated;

/** Clears the whole feed's unread state in one round trip. */
create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
