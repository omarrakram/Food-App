-- ---------------------------------------------------------------------------
-- Akla — AI usage accounting and rate limiting
--
-- Every edge-function call to Claude writes a row here. Two jobs:
--   1. rate limiting — the function counts recent rows for the caller before
--      spending a token,
--   2. cost observability — token counts per user per function.
--
-- No prompt text or user content is stored. Only identifiers and counters.
-- ---------------------------------------------------------------------------

create table public.ai_usage_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references public.profiles (id) on delete set null,
  function_name  text not null,
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  latency_ms     integer,
  -- 'ok' | 'invalid_output' | 'upstream_error' | 'rate_limited' | 'blocked'
  status         text not null default 'ok',
  -- Number of schema-validation retries this request needed. Persistently
  -- non-zero values mean the prompt or schema needs work.
  retry_count    smallint not null default 0,
  created_at     timestamptz not null default now(),

  constraint ai_usage_tokens_non_negative check (input_tokens >= 0 and output_tokens >= 0),
  constraint ai_usage_retry_range check (retry_count between 0 and 5)
);

-- The rate-limit query: "how many calls has this user made in the last hour?"
create index ai_usage_user_time_idx on public.ai_usage_events (user_id, created_at desc);
create index ai_usage_function_time_idx on public.ai_usage_events (function_name, created_at desc);

comment on table public.ai_usage_events is
  'Counters only. Never store prompts, completions, or any user-entered text here.';

-- ---------------------------------------------------------------------------

-- Counts a user's AI calls in a trailing window. Used by the edge functions
-- before dispatching to Anthropic.
create or replace function public.ai_call_count(
  target_user uuid,
  window_interval interval
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.ai_usage_events
  where user_id = target_user
    and created_at > now() - window_interval
    and status <> 'rate_limited';
$$;

revoke all on function public.ai_call_count(uuid, interval) from public;
grant execute on function public.ai_call_count(uuid, interval) to service_role;
