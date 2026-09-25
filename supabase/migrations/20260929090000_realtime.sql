-- The merchant queue, told about changes rather than asked.
--
-- `useMerchantQueue` subscribes to `postgres_changes` on `orders` and
-- `order_substitutions` and re-reads through RLS when either moves. That
-- subscription has never received anything, because a table only emits
-- realtime changes once it is in the `supabase_realtime` publication — and
-- nothing ever added these two. The queue has been running on its 60-second
-- fallback poll the whole time, which works and is not what a picker needs
-- when a paid order lands.
--
-- WHAT THIS DOES NOT CHANGE: the subscription carries no payload into the UI.
-- It only says "something moved"; the rows come back through RLS, because a
-- realtime message is not a permission check and treating one as data is how a
-- merchant is shown a row their policy would refuse.
--
-- CONDITIONAL, because `supabase_realtime` is a Supabase platform object and
-- the test suite runs against a plain Postgres. Absent, this is a notice.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime is not present; realtime is NOT configured here.';
    return;
  end if;

  -- `add table` errors if the table is already a member, and re-applying a
  -- migration must be safe.
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    execute 'alter publication supabase_realtime add table public.orders';
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'order_substitutions'
  ) then
    execute 'alter publication supabase_realtime add table public.order_substitutions';
  end if;
end
$$;

-- DEFAULT REPLICA IDENTITY IS ENOUGH and is left alone on purpose. `full`
-- would put every column of every order change onto the replication stream,
-- including the delivery snapshot, to serve an `old_record` nothing reads.
