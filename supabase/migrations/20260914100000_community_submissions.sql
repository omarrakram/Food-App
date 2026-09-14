-- ---------------------------------------------------------------------------
-- Akla — community recipe submissions and moderation
--
-- The gap this closes was written down in
-- `20260910120900_lock_recipe_publication.sql`: clients cannot set
-- `recipes.is_public`, and the note there says "when recipe sharing ships it
-- gets a moderated path, not a boolean the client controls". This is that
-- path.
--
-- THE SHAPE, AND WHY.
--
-- A submission is a row ABOUT a recipe, not a copy of one. The author builds
-- an ordinary private recipe with the ordinary recipe tables — same
-- ingredients, same steps, same validation — and the submission points at it.
-- A separate "pending_recipes" table with its own columns would be a second
-- recipe schema to keep in step, and the copy-back on approval is exactly
-- where a field gets forgotten.
--
-- Publication is a FUNCTION, never a column write. `is_public` stays
-- unwritable by every client, moderators included: the only way a recipe
-- becomes public is `moderate_submission('approve', ...)`, which checks the
-- caller's role server-side. A moderator with a crafted client still cannot
-- publish a recipe that has no approved submission.
--
-- Roles are granted by NOBODY through the API. `user_roles` has read policies
-- and no write policies at all, so an insert is refused for every client
-- regardless of what they claim to be; the service role (and a human with
-- database access) is the only way in. That is what "server-authoritative"
-- has to mean — a policy that lets admins grant admin is a policy that lets
-- anyone who reaches one admin reach all of them.
-- ---------------------------------------------------------------------------

create type public.submission_status as enum (
  'draft',
  'pending',
  'changes_requested',
  'approved',
  'rejected'
);

create type public.moderation_action as enum (
  'submit',
  'resubmit',
  'approve',
  'reject',
  'request_changes',
  'withdraw'
);

create type public.app_role as enum ('moderator', 'admin');

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.app_role not null,
  granted_at timestamptz not null default now(),
  -- Null when granted out of band (the first admin has nobody to grant them).
  granted_by uuid references public.profiles (id) on delete set null,

  primary key (user_id, role)
);

comment on table public.user_roles is
  'Grants are made by the service role only. There is deliberately no insert, '
  'update or delete policy: a client cannot grant itself or anyone else a role.';

/**
 * Does this user hold this role?
 *
 * Security definer so a policy can ask without the asker needing to read
 * `user_roles` — and so the answer cannot be influenced by a policy on that
 * table recursing back into this one.
 */
create or replace function public.has_role(who uuid, wanted public.app_role)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.user_roles r where r.user_id = who and r.role = wanted
  );
$$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

/** An admin is a moderator with more. Written once so no policy forgets it. */
create or replace function public.is_moderator()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select auth.uid() is not null
     and (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));
$$;

revoke all on function public.is_moderator() from public, anon;
grant execute on function public.is_moderator() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select auth.uid() is not null and public.has_role(auth.uid(), 'admin');
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.user_roles enable row level security;

-- You may see what you hold. You may not see who else holds anything —
-- the moderator list is not public information.
create policy "user_roles: read own"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

-- An admin can see the whole grant table, which is what an admin screen needs.
create policy "user_roles: admins read all"
  on public.user_roles for select to authenticated
  using (public.is_admin());

-- NO insert / update / delete policy. Intentional, and load-bearing: with RLS
-- enabled and no write policy, every client write is refused.

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------

create table public.recipe_submissions (
  id           uuid primary key default gen_random_uuid(),
  recipe_id    uuid not null references public.recipes (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  status       public.submission_status not null default 'draft',
  -- Bumped on every resubmission, so the history reads in order and a
  -- moderator can tell "changed since I asked" from "sent again unchanged".
  revision     integer not null default 1,
  submitted_at timestamptz,
  decided_at   timestamptz,
  decided_by   uuid references public.profiles (id) on delete set null,
  -- The feedback the AUTHOR sees. Moderation notes that are not for the
  -- author live in `moderation_events`, which authors cannot read.
  author_note  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One live submission per recipe. Resubmitting reuses the row and bumps the
  -- revision rather than opening a second one, which is what keeps the queue
  -- from filling with duplicates of the same dish.
  constraint recipe_submissions_one_per_recipe unique (recipe_id),
  constraint recipe_submissions_note_length check (
    author_note is null or char_length(author_note) <= 2000
  ),
  -- A decision has a decider and a time, or it is not a decision.
  constraint recipe_submissions_decided_together check (
    (status in ('approved', 'rejected', 'changes_requested'))
      = (decided_at is not null)
  )
);

create trigger recipe_submissions_set_updated_at
  before update on public.recipe_submissions
  for each row execute function public.set_updated_at();

-- The moderator queue's only query: oldest pending first, because a
-- newest-first queue is how a submission waits forever.
create index recipe_submissions_queue_idx
  on public.recipe_submissions (status, submitted_at)
  where status = 'pending';

create index recipe_submissions_author_idx on public.recipe_submissions (author_id);

-- ---------------------------------------------------------------------------
-- Moderation history
-- ---------------------------------------------------------------------------
-- Append-only. Nothing updates or deletes a row here, and no policy allows it:
-- a moderation log a moderator can edit is not a log.

create table public.moderation_events (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.recipe_submissions (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  action        public.moderation_action not null,
  -- Mandatory for a refusal (enforced in `moderate_submission`): "rejected,
  -- no reason given" is not a thing an author can act on.
  note          text,
  revision      integer not null,
  created_at    timestamptz not null default now(),

  constraint moderation_events_note_length check (
    note is null or char_length(note) <= 2000
  )
);

create index moderation_events_submission_idx
  on public.moderation_events (submission_id, created_at);

comment on table public.moderation_events is
  'Append-only. Readable by moderators and admins only — an author sees the '
  'feedback written onto their submission, never the internal history.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.recipe_submissions enable row level security;

create policy "recipe_submissions: authors read own"
  on public.recipe_submissions for select to authenticated
  using (author_id = auth.uid());

create policy "recipe_submissions: moderators read all"
  on public.recipe_submissions for select to authenticated
  using (public.is_moderator());

-- An author creates their own draft, for their own recipe.
create policy "recipe_submissions: authors create own"
  on public.recipe_submissions for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.owns_recipe(recipe_id)
    -- Submitting is a FUNCTION call, not an insert with status='pending'.
    -- Without this an author could file a submission already marked approved.
    and status = 'draft'
  );

/**
 * What an author may change about their own submission: nothing that decides
 * anything.
 *
 * The status transitions are all made by `submit_recipe` and
 * `moderate_submission` below, which run as definer and therefore bypass this
 * policy. The `using` clause keeps an author from touching a decided
 * submission at all — editing a rejected submission back into a draft would
 * erase the decision.
 */
create policy "recipe_submissions: authors edit own draft"
  on public.recipe_submissions for update to authenticated
  using (author_id = auth.uid() and status in ('draft', 'changes_requested'))
  with check (
    author_id = auth.uid()
    and status in ('draft', 'changes_requested')
  );

create policy "recipe_submissions: authors delete own draft"
  on public.recipe_submissions for delete to authenticated
  using (author_id = auth.uid() and status in ('draft', 'changes_requested'));

alter table public.moderation_events enable row level security;

-- Moderators only. The author's copy of the feedback is on the submission,
-- where it belongs; the internal history is not theirs to read.
create policy "moderation_events: moderators read"
  on public.moderation_events for select to authenticated
  using (public.is_moderator());

-- No insert policy: events are written by the definer functions below, so the
-- log cannot be forged.

-- ---------------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------------

create or replace function public.submit_recipe(submission uuid)
returns public.submission_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  row_ public.recipe_submissions;
  next_revision integer;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into row_ from public.recipe_submissions where id = submission;
  if row_.id is null or row_.author_id <> me then
    -- Same error for "does not exist" and "not yours": the difference is
    -- information about somebody else's submission.
    raise exception 'no such submission' using errcode = '42501';
  end if;

  if row_.status not in ('draft', 'changes_requested') then
    raise exception 'that submission is not editable' using errcode = '22023';
  end if;

  -- A first submission stays at revision 1; a resubmission after feedback is
  -- a new revision, so the queue can show "revised" rather than "again".
  next_revision := case when row_.status = 'changes_requested'
                        then row_.revision + 1
                        else row_.revision end;

  update public.recipe_submissions
     set status = 'pending',
         revision = next_revision,
         submitted_at = now(),
         decided_at = null,
         decided_by = null
   where id = submission;

  insert into public.moderation_events (submission_id, actor_id, action, revision)
  values (
    submission,
    me,
    (case when row_.status = 'changes_requested' then 'resubmit' else 'submit' end)::public.moderation_action,
    next_revision
  );

  return 'pending';
end;
$$;

revoke all on function public.submit_recipe(uuid) from public, anon;
grant execute on function public.submit_recipe(uuid) to authenticated;

/** Pulls a pending submission back out of the queue. */
create or replace function public.withdraw_submission(submission uuid)
returns public.submission_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  row_ public.recipe_submissions;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into row_ from public.recipe_submissions where id = submission;
  if row_.id is null or row_.author_id <> me then
    raise exception 'no such submission' using errcode = '42501';
  end if;
  if row_.status <> 'pending' then
    raise exception 'that submission is not pending' using errcode = '22023';
  end if;

  update public.recipe_submissions
     set status = 'draft', submitted_at = null
   where id = submission;

  insert into public.moderation_events (submission_id, actor_id, action, revision)
  values (submission, me, 'withdraw', row_.revision);

  return 'draft';
end;
$$;

revoke all on function public.withdraw_submission(uuid) from public, anon;
grant execute on function public.withdraw_submission(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Deciding
-- ---------------------------------------------------------------------------
-- The ONLY route to `recipes.is_public = true`. Everything about publication
-- that has to be true is checked here, in one place, as the database:
--
--   * the caller holds a role (checked server-side, not claimed by a client),
--   * the submission is actually pending,
--   * a refusal carries feedback the author can act on,
--   * approving publishes; every other outcome leaves the recipe private.

create or replace function public.moderate_submission(
  submission uuid,
  decision public.moderation_action,
  feedback text default null
)
returns public.submission_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  row_ public.recipe_submissions;
  next_status public.submission_status;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- THE authorization check. Definer functions run with the owner's rights,
  -- so without this line any authenticated user could publish anything.
  if not public.is_moderator() then
    raise exception 'not a moderator' using errcode = '42501';
  end if;

  if decision not in ('approve', 'reject', 'request_changes') then
    raise exception 'not a moderation decision' using errcode = '22023';
  end if;

  -- A refusal without a reason is a dead end for the author.
  if decision in ('reject', 'request_changes')
     and coalesce(btrim(feedback), '') = '' then
    raise exception 'feedback is required' using errcode = '22023';
  end if;

  select * into row_ from public.recipe_submissions where id = submission;
  if row_.id is null then
    raise exception 'no such submission' using errcode = '42501';
  end if;
  if row_.status <> 'pending' then
    raise exception 'that submission is not pending' using errcode = '22023';
  end if;

  next_status := case decision
                   when 'approve' then 'approved'
                   when 'reject' then 'rejected'
                   else 'changes_requested'
                 end::public.submission_status;

  update public.recipe_submissions
     set status = next_status,
         decided_at = now(),
         decided_by = me,
         author_note = feedback
   where id = submission;

  -- Publication. Note what is NOT here: there is no branch that publishes on
  -- anything but an approval, and no way for a caller to pass one in.
  if next_status = 'approved' then
    update public.recipes
       set is_public = true
     where id = row_.recipe_id;
  else
    -- Belt and braces for a re-decision after a bug: a recipe that is not
    -- approved is not public, whatever it was a moment ago.
    update public.recipes
       set is_public = false
     where id = row_.recipe_id;
  end if;

  insert into public.moderation_events (submission_id, actor_id, action, note, revision)
  values (submission, me, decision, feedback, row_.revision);

  return next_status;
end;
$$;

revoke all on function public.moderate_submission(uuid, public.moderation_action, text)
  from public, anon;
grant execute on function public.moderate_submission(uuid, public.moderation_action, text)
  to authenticated;

comment on function public.moderate_submission is
  'The only path to recipes.is_public = true. Checks the caller''s role '
  'server-side; a refusal must carry feedback.';

-- ---------------------------------------------------------------------------
-- Unpublishing
-- ---------------------------------------------------------------------------
-- An approved recipe that turns out to be unsafe has to come down, and it must
-- come down everywhere at once. Because a shared recipe travels as a reference
-- rather than a copy, this also empties every card of it already sitting in a
-- chat log.

create or replace function public.unpublish_recipe(target uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  submission uuid;
begin
  if me is null or not public.is_moderator() then
    raise exception 'not a moderator' using errcode = '42501';
  end if;
  if coalesce(btrim(reason), '') = '' then
    raise exception 'feedback is required' using errcode = '22023';
  end if;

  update public.recipes set is_public = false where id = target;

  select id into submission from public.recipe_submissions where recipe_id = target;
  if submission is not null then
    update public.recipe_submissions
       set status = 'rejected', decided_at = now(), decided_by = me, author_note = reason
     where id = submission;

    insert into public.moderation_events (submission_id, actor_id, action, note, revision)
    select submission, me, 'reject', reason, revision
      from public.recipe_submissions where id = submission;
  end if;
end;
$$;

revoke all on function public.unpublish_recipe(uuid, text) from public, anon;
grant execute on function public.unpublish_recipe(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------
-- One round trip for the moderator screen: the submission, who wrote it, and
-- the recipe's headline facts. Definer so it can join `profiles` — a
-- moderator needs to see the author, and `public_profiles` hides an account
-- that has chosen not to be discoverable.

create or replace function public.moderation_queue()
returns table (
  submission_id uuid,
  recipe_id     uuid,
  title         text,
  author_id     uuid,
  author_name   text,
  author_handle text,
  status        public.submission_status,
  revision      integer,
  submitted_at  timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    s.id, s.recipe_id, r.title, s.author_id,
    p.display_name, p.username,
    s.status, s.revision, s.submitted_at
  from public.recipe_submissions s
  join public.recipes r on r.id = s.recipe_id
  join public.profiles p on p.id = s.author_id
  where public.is_moderator() and s.status = 'pending'
  order by s.submitted_at asc;
$$;

revoke all on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

comment on function public.moderation_queue is
  'Empty for anybody who is not a moderator — the role check is inside the '
  'query, so there is no version of this that returns rows to the wrong caller.';

-- ---------------------------------------------------------------------------
-- Reading a submitted recipe
-- ---------------------------------------------------------------------------
-- A moderator has to be able to READ the recipe they are judging, and the
-- recipe is private until they approve it. Rather than widening the recipe
-- read policy — which would make every private recipe in the database
-- moderator-readable — the policy is scoped to recipes that have actually been
-- submitted.
--
-- `status <> 'draft'` rather than `= 'pending'`: a moderator has to be able to
-- look at what they just decided (did I reject the right one?) and at the
-- previous revision of something that has come back. Scoping it to 'pending'
-- makes a recipe vanish from under them the instant they act on it, which
-- reads as a bug and makes a wrong decision impossible to check. A recipe
-- nobody has ever submitted stays private to its author either way.

create policy "recipes: moderators read submitted recipes"
  on public.recipes for select to authenticated
  using (
    public.is_moderator()
    and exists (
      select 1 from public.recipe_submissions s
      where s.recipe_id = recipes.id and s.status <> 'draft'
    )
  );
