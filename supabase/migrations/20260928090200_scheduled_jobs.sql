-- Commerce-7: the background work actually runs.
--
-- Three functions have existed since Commerce-5 and Commerce-6 with nothing
-- calling them:
--
--   expire_stale_drafts()            unpaid drafts stay priceable forever
--   resolve_expired_substitutions()  "reply within 20 minutes" never times out
--   payments-reconcile               attempts stuck in `processing` stay stuck
--
-- Commerce-7 adds two more (`queue_due_refunds`, `sweep_stalled_refunds`) and
-- then has to answer the question all five raise: WHO CALLS THEM. A pilot
-- where the answer is "somebody runs psql" is a pilot where the answer is
-- nobody.
--
-- WHAT THIS FILE IS CAREFUL ABOUT:
--
--   NO HOSTED URL AND NO SECRET LIVES IN A MIGRATION. Migrations are in git
--   and get applied to more than one project. The HTTP jobs read their
--   endpoint from a table an operator fills in at deploy time, and their
--   credential from Supabase Vault — so this file is the same file for every
--   environment, and a fresh checkout dispatches nothing.
--
--   EVERY JOB IS SAFE TO RUN TWICE. Overlap is prevented by a transaction-level
--   advisory lock per job, so a run that takes longer than its interval is
--   skipped rather than doubled. The underlying functions are individually
--   idempotent as well, because a lock is a convenience and idempotency is a
--   guarantee.
--
--   EVERY JOB IS BOUNDED. Each takes a row limit, and the limits are small
--   enough that a backlog drains over several runs rather than in one
--   transaction that holds locks for a minute.
--
--   EVERY RUN IS VISIBLE. `job_runs` says what ran, when, for how long, what it
--   touched and what went wrong. A scheduler nobody can see is a scheduler
--   nobody notices has stopped.
--
--   THE SCHEDULE IS CONDITIONAL. `pg_cron`, `pg_net` and `vault` are Supabase
--   platform extensions and are absent from the plain Postgres the test suite
--   runs against. Every block that needs one checks for it first, so the same
--   migration applies in both places.

-- ===========================================================================
-- 1. What ran, and how it went
-- ===========================================================================
create table public.job_runs (
  id          bigint generated always as identity primary key,
  job_name    text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  -- 'ok', 'skipped_overlap', 'not_configured', 'error'
  outcome     text not null default 'ok',
  -- Rows touched. Meaningful per job; always a count, never a payload.
  affected    integer,
  detail      text
);

create index job_runs_recent_idx on public.job_runs (job_name, started_at desc);

comment on table public.job_runs is
  'One row per scheduled run. Retained by trim_job_runs(); never contains '
  'customer data — a count and an error string, nothing else.';

alter table public.job_runs enable row level security;

-- Operations data. Not the customer's, not the merchant's.
create policy "job_runs: akalt admin reads" on public.job_runs
  for select to authenticated using (public.is_admin());

-- ===========================================================================
-- 2. Running one job
-- ===========================================================================
-- THE DISPATCHER, and the only thing `cron` ever calls. One entry point rather
-- than five scheduled SQL snippets, because a snippet in a cron table is a
-- piece of code nobody reviews, nobody tests and nobody can grep for.
--
-- `pg_try_advisory_xact_lock` is the overlap guard. Transaction-scoped, so it
-- is released by the commit or the rollback — there is no path where a crashed
-- run leaves a job locked out forever.
create or replace function public.run_job(p_name text, p_limit integer default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id   bigint;
  v_affected integer;
  v_outcome  text := 'ok';
  v_detail   text;
begin
  if p_name not in (
    'expire_stale_drafts',
    'resolve_expired_substitutions',
    'queue_due_refunds',
    'sweep_stalled_refunds',
    'trim_job_runs'
  ) then
    raise exception 'unknown_job' using errcode = 'P0001';
  end if;

  insert into public.job_runs (job_name) values (p_name) returning id into v_run_id;

  -- Somebody else is already running this one. Not an error: the next tick
  -- will pick it up, and two concurrent sweeps of the same table is how a
  -- bounded job stops being bounded.
  if not pg_try_advisory_xact_lock(hashtext('akalt.job.' || p_name)) then
    update public.job_runs
       set finished_at = now(), outcome = 'skipped_overlap'
     where id = v_run_id;
    return 'skipped_overlap';
  end if;

  begin
    v_affected := case p_name
      when 'expire_stale_drafts'           then public.expire_stale_drafts()
      when 'resolve_expired_substitutions' then public.resolve_expired_substitutions()
      when 'queue_due_refunds'             then public.queue_due_refunds(coalesce(p_limit, 25))
      when 'sweep_stalled_refunds'         then public.sweep_stalled_refunds()
      when 'trim_job_runs'                 then public.trim_job_runs()
    end;
  exception
    when others then
      -- The message, not the context. A job that fails must not turn the
      -- observability table into a place stack traces accumulate.
      v_outcome := 'error';
      v_detail  := left(sqlerrm, 500);
  end;

  update public.job_runs
     set finished_at = now(),
         outcome     = v_outcome,
         affected    = v_affected,
         detail      = v_detail
   where id = v_run_id;

  return v_outcome;
end;
$$;

revoke all on function public.run_job(text, integer) from public, anon, authenticated;
grant execute on function public.run_job(text, integer) to service_role;

-- ===========================================================================
-- 3. The log does not grow forever
-- ===========================================================================
create or replace function public.trim_job_runs(p_keep interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from public.job_runs
   where started_at < now() - coalesce(p_keep, interval '30 days');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.trim_job_runs(interval) from public, anon, authenticated;
grant execute on function public.trim_job_runs(interval) to service_role;

-- ===========================================================================
-- 4. Is the scheduler alive?
-- ===========================================================================
-- The question an operator actually asks, answered without them needing to
-- know the job names: for each job, when did it last run, how did it go, and
-- how long ago was that.
create or replace function public.job_health()
returns table (
  job_name     text,
  last_run_at  timestamptz,
  last_outcome text,
  last_affected integer,
  last_detail  text,
  runs_24h     integer,
  errors_24h   integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    j.job_name,
    max(j.started_at),
    (array_agg(j.outcome order by j.started_at desc))[1],
    (array_agg(j.affected order by j.started_at desc))[1],
    (array_agg(j.detail order by j.started_at desc))[1],
    count(*) filter (where j.started_at > now() - interval '24 hours')::integer,
    count(*) filter (where j.started_at > now() - interval '24 hours'
                       and j.outcome = 'error')::integer
  from public.job_runs j
  where public.is_admin()
  group by j.job_name
  order by j.job_name;
$$;

revoke all on function public.job_health() from public, anon;
grant execute on function public.job_health() to authenticated;

-- ===========================================================================
-- 5. Jobs that have to leave the database
-- ===========================================================================
-- `payments-reconcile` asks Paymob about attempts we have lost track of, and
-- `refunds-execute` sends refunds. Neither can be SQL: both need the provider
-- secret, and the provider secret is not going in the database.
--
-- THE ENDPOINT IS CONFIGURATION, NOT CODE. This table is created empty. An
-- operator inserts the project's own function URL at deploy time — see
-- supabase/functions/README.md — and until they do, the dispatcher records
-- `not_configured` and does nothing. A migration that shipped a URL would
-- point every environment at whichever one was written first.
create table public.edge_job_endpoints (
  name        text primary key,
  url         text not null,
  -- The name of the Supabase Vault secret holding the bearer token. NOT the
  -- token. Vault decrypts it at call time; this column is just a pointer, and
  -- a database dump of this table reveals nothing.
  secret_name text not null default 'service_role_key',
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint edge_job_endpoints_known_name
    check (name in ('payments-reconcile', 'refunds-execute')),
  constraint edge_job_endpoints_https
    check (url ~ '^https://')
);

create trigger edge_job_endpoints_set_updated_at
  before update on public.edge_job_endpoints
  for each row execute function public.set_updated_at();

comment on table public.edge_job_endpoints is
  'Deploy-time configuration for the HTTP-invoked scheduled jobs. Created '
  'empty on purpose: no migration carries a hosted URL. secret_name points at '
  'a Supabase Vault secret and is never the secret itself.';

alter table public.edge_job_endpoints enable row level security;

-- No policy at all beyond the admin read. There is no client reason to know
-- the internal endpoints, and the service role bypasses RLS anyway.
create policy "edge_job_endpoints: akalt admin reads" on public.edge_job_endpoints
  for select to authenticated using (public.is_admin());

/**
 * Fire one HTTP job.
 *
 * Returns what it decided so the same `job_runs` story covers these too. It
 * DOES NOT WAIT for the response: `net.http_post` is asynchronous by design,
 * and a cron job that blocks on a provider round trip is a cron job that holds
 * a connection open until the provider decides otherwise. The function it
 * calls writes its own results to the database, which is where the outcome is
 * read from.
 */
create or replace function public.dispatch_edge_job(p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_endpoint public.edge_job_endpoints%rowtype;
  v_run_id   bigint;
  v_secret   text;
  v_outcome  text := 'ok';
  v_detail   text;
begin
  insert into public.job_runs (job_name) values (p_name) returning id into v_run_id;

  if not pg_try_advisory_xact_lock(hashtext('akalt.job.' || p_name)) then
    update public.job_runs set finished_at = now(), outcome = 'skipped_overlap'
     where id = v_run_id;
    return 'skipped_overlap';
  end if;

  select * into v_endpoint from public.edge_job_endpoints
   where name = p_name and enabled;

  if v_endpoint.name is null then
    update public.job_runs
       set finished_at = now(), outcome = 'not_configured',
           detail = 'no enabled row in edge_job_endpoints'
     where id = v_run_id;
    return 'not_configured';
  end if;

  -- The platform extensions. Absent on a plain Postgres, which is where the
  -- test suite runs — so their absence is a recorded fact, not an exception.
  if to_regnamespace('vault') is null or to_regnamespace('net') is null then
    update public.job_runs
       set finished_at = now(), outcome = 'not_configured',
           detail = 'pg_net or supabase_vault is not installed'
     where id = v_run_id;
    return 'not_configured';
  end if;

  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1'
       into v_secret using v_endpoint.secret_name;

    if v_secret is null then
      update public.job_runs
         set finished_at = now(), outcome = 'not_configured',
             detail = format('vault secret %L is missing', v_endpoint.secret_name)
       where id = v_run_id;
      return 'not_configured';
    end if;

    execute
      'select net.http_post(url := $1, headers := $2::jsonb, body := $3::jsonb, timeout_milliseconds := 60000)'
      using v_endpoint.url,
            jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || v_secret
            ),
            jsonb_build_object('source', 'cron');
  exception
    when others then
      v_outcome := 'error';
      v_detail  := left(sqlerrm, 500);
  end;

  update public.job_runs
     set finished_at = now(), outcome = v_outcome, detail = v_detail
   where id = v_run_id;

  return v_outcome;
end;
$$;

revoke all on function public.dispatch_edge_job(text) from public, anon, authenticated;
grant execute on function public.dispatch_edge_job(text) to service_role;

-- ===========================================================================
-- 6. The schedule
-- ===========================================================================
-- INTERVALS CHOSEN AGAINST WHAT THE CUSTOMER FEELS, not against what is cheap:
--
--   substitutions   every minute. The customer was given 20 minutes to answer;
--                   a timeout that fires 9 minutes late is a shop held up.
--   drafts          every 5. Nobody is waiting on an expiry.
--   refunds queued  every 5. The money is already owed; minutes are fine,
--                   hours are not.
--   stalled sweep   every 10. It only ever catches a crash.
--   reconcile       every 10, as Commerce-5 intended.
--   refunds execute every 5, just behind the queueing pass.
--   trim            daily, at a quiet hour.
--
-- `cron.schedule` is idempotent by name in recent pg_cron, and unschedule-then-
-- schedule is used anyway so re-running this migration cannot leave two
-- entries firing the same job.
do $$
declare
  v_jobs text[][] := array[
    ['akalt-substitutions',  '* * * * *',    $q$select public.run_job('resolve_expired_substitutions')$q$],
    ['akalt-drafts',         '*/5 * * * *',  $q$select public.run_job('expire_stale_drafts')$q$],
    ['akalt-refunds-queue',  '*/5 * * * *',  $q$select public.run_job('queue_due_refunds', 25)$q$],
    ['akalt-refunds-sweep',  '*/10 * * * *', $q$select public.run_job('sweep_stalled_refunds')$q$],
    ['akalt-refunds-send',   '*/5 * * * *',  $q$select public.dispatch_edge_job('refunds-execute')$q$],
    ['akalt-reconcile',      '*/10 * * * *', $q$select public.dispatch_edge_job('payments-reconcile')$q$],
    ['akalt-trim-job-runs',  '17 3 * * *',   $q$select public.run_job('trim_job_runs')$q$]
  ];
  v_job text[];
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; AKALT background jobs are NOT scheduled here.';
    return;
  end if;

  foreach v_job slice 1 in array v_jobs loop
    begin
      perform cron.unschedule(v_job[1]);
    exception when others then
      null; -- not scheduled yet, which is the normal first run
    end;
    perform cron.schedule(v_job[1], v_job[2], v_job[3]);
  end loop;
end
$$;
