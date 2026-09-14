-- Community submissions and moderation.
--
-- The questions this file exists to answer, in order of how much damage a
-- wrong answer does:
--
--   * can an ordinary user make themselves a moderator?
--   * can an ordinary user approve a recipe — theirs or anybody's?
--   * can a pending or rejected recipe be read by the public?
--   * can an author mark their own submission approved?
--   * can an author read somebody else's submission, or the moderation log?
--   * can a moderator reject without saying why?
--
-- Every one of those is a way for unreviewed content to reach every user's
-- Discover feed, which is the outcome the whole feature exists to prevent.

\set ON_ERROR_STOP on
\echo ''
\echo 'Community submissions and moderation'

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
  ('d0000000-0000-4000-8000-00000000000a', 'author@mod.test'),
  ('d0000000-0000-4000-8000-00000000000b', 'stranger@mod.test'),
  ('d0000000-0000-4000-8000-00000000000c', 'moderator@mod.test');

update public.profiles set username = 'modauthor'
 where id = 'd0000000-0000-4000-8000-00000000000a';
update public.profiles set username = 'modstranger'
 where id = 'd0000000-0000-4000-8000-00000000000b';
update public.profiles set username = 'modmoderator'
 where id = 'd0000000-0000-4000-8000-00000000000c';

-- The grant is made as the service role, because that is the ONLY way a grant
-- can be made. The assertions below prove no client can make one.
insert into public.user_roles (user_id, role)
values ('d0000000-0000-4000-8000-00000000000c', 'moderator');

create temp table mod_ids (label text primary key, id uuid);
grant select, insert, update, delete on mod_ids to authenticated;

set role authenticated;

-- --------------------------------------------------------------------------
-- An author writes a recipe and files a draft
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-00000000000a';

do $$
declare
  dish uuid;
  submission uuid;
begin
  insert into public.recipes (title, description, source, created_by, is_public)
  values ('Grandmother''s fatta', 'A family recipe.', 'user',
          'd0000000-0000-4000-8000-00000000000a', false)
  returning id into dish;
  insert into mod_ids values ('recipe', dish);

  perform pg_temp.assert(dish is not null, 'an author can write a private recipe');

  -- The lock from 20260910120900 still holds: a client cannot publish.
  perform pg_temp.assert_rejected(
    format($sql$update public.recipes set is_public = true where id = %L$sql$, dish),
    'an author cannot publish their own recipe directly');

  insert into public.recipe_submissions (recipe_id, author_id, status)
  values (dish, 'd0000000-0000-4000-8000-00000000000a', 'draft')
  returning id into submission;
  insert into mod_ids values ('submission', submission);

  perform pg_temp.assert(submission is not null, 'an author can start a draft submission');
end
$$;

-- --------------------------------------------------------------------------
-- What an author cannot do
-- --------------------------------------------------------------------------

do $$
declare
  dish uuid := (select id from mod_ids where label = 'recipe');
  submission uuid := (select id from mod_ids where label = 'submission');
  other uuid;
begin
  -- THE assertion. A role a user can grant themselves is not a role.
  perform pg_temp.assert_rejected(
    $sql$insert into public.user_roles (user_id, role)
         values ('d0000000-0000-4000-8000-00000000000a', 'admin')$sql$,
    'an ordinary user cannot grant themselves admin');

  perform pg_temp.assert_rejected(
    $sql$insert into public.user_roles (user_id, role)
         values ('d0000000-0000-4000-8000-00000000000a', 'moderator')$sql$,
    'an ordinary user cannot grant themselves moderator');

  -- An update or delete against a row the read policy hides is not an ERROR,
  -- it is a no-op — which is the right outcome and an easy one to assert
  -- wrongly. What matters is that nothing moved, so that is what is checked.
  update public.user_roles set user_id = 'd0000000-0000-4000-8000-00000000000a';
  delete from public.user_roles;

  perform pg_temp.assert(
    public.has_role('d0000000-0000-4000-8000-00000000000a', 'moderator') = false,
    'an ordinary user cannot reassign an existing grant to themselves');
  perform pg_temp.assert(
    public.has_role('d0000000-0000-4000-8000-00000000000c', 'moderator'),
    'an ordinary user cannot revoke somebody else''s role');

  perform pg_temp.assert(
    (select count(*) from public.user_roles) = 0,
    'an ordinary user cannot even see who the moderators are');

  perform pg_temp.assert(
    public.is_moderator() = false,
    'is_moderator says no for an ordinary user');

  -- Approving their own work, the direct way and the function way.
  perform pg_temp.assert_rejected(
    format($sql$update public.recipe_submissions set status = 'approved' where id = %L$sql$,
           submission),
    'an author cannot mark their own submission approved');

  perform pg_temp.assert_rejected(
    format($sql$select public.moderate_submission(%L, 'approve')$sql$, submission),
    'an author cannot call the moderation function');

  perform pg_temp.assert(
    (select is_public from public.recipes where id = dish) = false,
    'the recipe is still private after all of that');

  -- Filing a submission that is already past the queue.
  insert into public.recipes (title, description, source, created_by, is_public)
  values ('Second dish', '', 'user', 'd0000000-0000-4000-8000-00000000000a', false)
  returning id into other;
  insert into mod_ids values ('recipe2', other);

  perform pg_temp.assert_rejected(
    format($sql$insert into public.recipe_submissions (recipe_id, author_id, status)
                values (%L, 'd0000000-0000-4000-8000-00000000000a', 'approved')$sql$, other),
    'an author cannot file a submission that is already approved');

  perform pg_temp.assert_rejected(
    format($sql$insert into public.recipe_submissions (recipe_id, author_id, status)
                values (%L, 'd0000000-0000-4000-8000-00000000000a', 'pending')$sql$, other),
    'an author cannot file a submission straight into the queue');

  -- Filing against somebody else's recipe.
  perform pg_temp.assert_rejected(
    format($sql$insert into public.recipe_submissions (recipe_id, author_id, status)
                values (%L, 'd0000000-0000-4000-8000-00000000000a', 'draft')$sql$,
           (select id from public.recipes where source = 'curated' limit 1)),
    'an author cannot submit a recipe they do not own');

  perform pg_temp.assert(
    (select count(*) from public.moderation_events) = 0,
    'an author cannot read the moderation log');
end
$$;

-- --------------------------------------------------------------------------
-- Submitting
-- --------------------------------------------------------------------------

do $$
declare
  submission uuid := (select id from mod_ids where label = 'submission');
begin
  perform pg_temp.assert(
    public.submit_recipe(submission) = 'pending',
    'submitting moves the draft into the queue');

  perform pg_temp.assert(
    (select submitted_at is not null from public.recipe_submissions where id = submission),
    'the submission records when it was sent');

  perform pg_temp.assert(
    (select revision from public.recipe_submissions where id = submission) = 1,
    'a first submission is revision 1');

  -- A pending submission is not editable by its author: they would be
  -- changing what a moderator is in the middle of reading. The policy's
  -- `using` clause excludes the row, so the update is a silent no-op rather
  -- than an error — which is the right behaviour and the wrong thing to
  -- assert with `assert_rejected`. What matters is that nothing changed.
  update public.recipe_submissions set author_note = 'sneaky' where id = submission;

  perform pg_temp.assert(
    (select author_note is null from public.recipe_submissions where id = submission),
    'an author cannot edit a submission that is already pending');

  perform pg_temp.assert_rejected(
    format($sql$select public.submit_recipe(%L)$sql$, submission),
    'submitting twice is refused rather than queueing it twice');
end
$$;

-- --------------------------------------------------------------------------
-- A stranger sees nothing
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-00000000000b';

do $$
declare
  dish uuid := (select id from mod_ids where label = 'recipe');
  submission uuid := (select id from mod_ids where label = 'submission');
begin
  -- THE assertion the brief names: pending recipes must never be public.
  perform pg_temp.assert(
    (select count(*) from public.recipes where id = dish) = 0,
    'a pending recipe is invisible to everybody else');

  perform pg_temp.assert(
    (select count(*) from public.recipe_submissions) = 0,
    'a stranger cannot see somebody else''s submission');

  perform pg_temp.assert(
    (select count(*) from public.moderation_events) = 0,
    'a stranger cannot read the moderation log');

  perform pg_temp.assert(
    (select count(*) from public.moderation_queue()) = 0,
    'the moderation queue is empty for a non-moderator');

  perform pg_temp.assert_rejected(
    format($sql$select public.moderate_submission(%L, 'approve')$sql$, submission),
    'a stranger cannot approve a submission');

  perform pg_temp.assert_rejected(
    format($sql$select public.unpublish_recipe(%L, 'because')$sql$, dish),
    'a stranger cannot unpublish a recipe');

  perform pg_temp.assert_rejected(
    format($sql$select public.withdraw_submission(%L)$sql$, submission),
    'a stranger cannot withdraw somebody else''s submission');
end
$$;

-- --------------------------------------------------------------------------
-- The moderator
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-00000000000c';

do $$
declare
  dish uuid := (select id from mod_ids where label = 'recipe');
  submission uuid := (select id from mod_ids where label = 'submission');
begin
  perform pg_temp.assert(public.is_moderator(), 'the moderator holds the role');
  perform pg_temp.assert(
    public.is_admin() = false,
    'a moderator is not automatically an admin');

  perform pg_temp.assert(
    (select count(*) from public.moderation_queue()) = 1,
    'the queue shows the pending submission');

  perform pg_temp.assert(
    (select title from public.moderation_queue() limit 1) = 'Grandmother''s fatta',
    'the queue names the recipe');

  perform pg_temp.assert(
    (select author_handle from public.moderation_queue() limit 1) = 'modauthor',
    'the queue names the author');

  -- A moderator can read the recipe they are judging, and only because there
  -- is a pending submission against it.
  perform pg_temp.assert(
    (select count(*) from public.recipes where id = dish) = 1,
    'a moderator can read a recipe that is awaiting review');

  perform pg_temp.assert(
    (select count(*) from public.recipes
      where id = (select id from mod_ids where label = 'recipe2')) = 0,
    'a moderator cannot read a private recipe nobody has submitted');

  -- A refusal has to say why.
  perform pg_temp.assert_rejected(
    format($sql$select public.moderate_submission(%L, 'reject')$sql$, submission),
    'rejecting without feedback is refused');

  perform pg_temp.assert_rejected(
    format($sql$select public.moderate_submission(%L, 'request_changes', '   ')$sql$, submission),
    'whitespace does not count as feedback');

  perform pg_temp.assert_rejected(
    format($sql$select public.moderate_submission(%L, 'submit', 'x')$sql$, submission),
    'submit is not a moderation decision');

  -- Asking for changes.
  perform pg_temp.assert(
    public.moderate_submission(submission, 'request_changes', 'Please add quantities.')
      = 'changes_requested',
    'a moderator can ask for changes');

  perform pg_temp.assert(
    (select is_public from public.recipes where id = dish) = false,
    'asking for changes does not publish anything');

  perform pg_temp.assert(
    (select author_note from public.recipe_submissions where id = submission)
      = 'Please add quantities.',
    'the feedback reaches the author');

  perform pg_temp.assert(
    (select count(*) from public.moderation_events where submission_id = submission) = 2,
    'the moderation log records the submission and the decision');
end
$$;

-- --------------------------------------------------------------------------
-- The author revises and resubmits
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-00000000000a';

do $$
declare
  submission uuid := (select id from mod_ids where label = 'submission');
begin
  perform pg_temp.assert(
    (select author_note from public.recipe_submissions where id = submission)
      = 'Please add quantities.',
    'the author can read the feedback they were given');

  perform pg_temp.assert(
    public.submit_recipe(submission) = 'pending',
    'the author can resubmit after changes were requested');

  perform pg_temp.assert(
    (select revision from public.recipe_submissions where id = submission) = 2,
    'a resubmission is a new revision');

  perform pg_temp.assert(
    (select decided_at is null from public.recipe_submissions where id = submission),
    'resubmitting clears the previous decision');
end
$$;

-- --------------------------------------------------------------------------
-- Approval, and what it publishes
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-00000000000c';

do $$
declare
  dish uuid := (select id from mod_ids where label = 'recipe');
  submission uuid := (select id from mod_ids where label = 'submission');
begin
  perform pg_temp.assert(
    public.moderate_submission(submission, 'approve') = 'approved',
    'a moderator can approve without feedback');

  perform pg_temp.assert(
    (select is_public from public.recipes where id = dish),
    'approval is what publishes the recipe');

  perform pg_temp.assert(
    (select decided_by from public.recipe_submissions where id = submission)
      = 'd0000000-0000-4000-8000-00000000000c',
    'the decision records who made it');

  perform pg_temp.assert(
    (select count(*) from public.moderation_queue()) = 0,
    'an approved submission leaves the queue');
end
$$;

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-00000000000b';

do $$
declare
  dish uuid := (select id from mod_ids where label = 'recipe');
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes where id = dish) = 1,
    'an approved recipe is visible to everybody');
end
$$;

-- --------------------------------------------------------------------------
-- Taking it back down
-- --------------------------------------------------------------------------

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-00000000000c';

do $$
declare
  dish uuid := (select id from mod_ids where label = 'recipe');
  submission uuid := (select id from mod_ids where label = 'submission');
begin
  perform pg_temp.assert_rejected(
    format($sql$select public.unpublish_recipe(%L, '')$sql$, dish),
    'unpublishing without a reason is refused');

  perform public.unpublish_recipe(dish, 'Unsafe canning instructions.');

  perform pg_temp.assert(
    (select is_public from public.recipes where id = dish) = false,
    'unpublishing takes the recipe out of every feed');

  perform pg_temp.assert(
    (select status from public.recipe_submissions where id = submission) = 'rejected',
    'the submission is marked rejected so the author is told');
end
$$;

set request.jwt.claim.sub = 'd0000000-0000-4000-8000-00000000000b';

do $$
declare
  dish uuid := (select id from mod_ids where label = 'recipe');
begin
  perform pg_temp.assert(
    (select count(*) from public.recipes where id = dish) = 0,
    'an unpublished recipe is invisible again');
end
$$;

-- --------------------------------------------------------------------------
-- Structural guarantees
-- --------------------------------------------------------------------------

reset role;
reset request.jwt.claim.sub;

do $$
begin
  -- The load-bearing absence: with RLS on and no write policy, every client
  -- write to user_roles is refused whatever the client claims to be.
  perform pg_temp.assert(
    (select count(*) from pg_policies
      where tablename = 'user_roles' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) = 0,
    'user_roles has no write policy at all');

  perform pg_temp.assert(
    (select count(*) from pg_policies
      where tablename = 'moderation_events' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) = 0,
    'moderation_events is append-only through the definer functions');

  perform pg_temp.assert(
    (select relrowsecurity from pg_class where relname = 'user_roles'),
    'user_roles has row level security enabled');
  perform pg_temp.assert(
    (select relrowsecurity from pg_class where relname = 'recipe_submissions'),
    'recipe_submissions has row level security enabled');
  perform pg_temp.assert(
    (select relrowsecurity from pg_class where relname = 'moderation_events'),
    'moderation_events has row level security enabled');

  -- No recipe policy may let a client write is_public.
  perform pg_temp.assert(
    (select count(*) from pg_policies
      where tablename = 'recipes' and cmd in ('INSERT', 'UPDATE')
        and with_check not like '%is_public = false%') = 0,
    'every client write policy on recipes forces is_public false');
end
$$;
