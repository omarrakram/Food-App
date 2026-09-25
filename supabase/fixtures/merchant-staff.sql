-- LOCAL ONLY. Two accounts and a shop rota, so the merchant dashboard can be
-- driven in a browser against a real database.
--
-- WHY THIS EXISTS: every merchant assertion up to now has been made in SQL or
-- in a unit test. Neither proves that the dashboard a picker actually taps
-- reaches those functions — a screen can be wired to the wrong RPC, pass the
-- wrong argument, or render a queue it filtered client-side, and every test
-- would still pass. `npm run walk:merchant` drives the real screens against
-- real RLS, and it needs somebody to sign in as.
--
-- THE SAME TWO GUARDS AS THE DEMO CATALOGUE, for the same reason: this creates
-- merchant staff, which is an access grant, and an access grant applied to the
-- wrong database is the worst thing in this repository.
--
--   1. `akalt.local_fixture` must be set to 'yes' by the caller.
--   2. There must be no enabled NON-DEMO merchant. A real supermarket in the
--      database means this is not a throwaway.
do $$
begin
  if coalesce(current_setting('akalt.local_fixture', true), '') <> 'yes' then
    raise exception
      'merchant-staff.sql is a LOCAL fixture. Run it with '
      '`set akalt.local_fixture = ''yes''` and only against a throwaway database.';
  end if;

  if exists (select 1 from public.merchants where is_enabled and not is_demo) then
    raise exception
      'This database has a real merchant in it. The staff fixture refuses to '
      'create access grants here.';
  end if;
end
$$;

-- Deterministic ids, so the walk script can address them without a lookup.
insert into auth.users (id, email)
values
  ('9a1c0000-0000-4000-8000-000000000001', 'walk.customer@akalt.test'),
  ('9a1c0000-0000-4000-8000-000000000002', 'walk.manager@akalt.test'),
  ('9a1c0000-0000-4000-8000-000000000003', 'walk.picker@akalt.test')
on conflict (id) do nothing;

-- ONBOARDING IS ALREADY DONE for these three. The app routes a signed-in
-- account with `onboarding_completed = false` to the language picker, which is
-- correct behaviour and not what the merchant walk is testing — without this
-- the first screen of every walk is step 1 of 3.
update public.user_preferences
   set onboarding_completed = true
 where user_id in (
   '9a1c0000-0000-4000-8000-000000000001',
   '9a1c0000-0000-4000-8000-000000000002',
   '9a1c0000-0000-4000-8000-000000000003'
 );

-- The manager runs the whole (single-branch) chain. The picker is created
-- WITHOUT a membership on purpose: the walk invites them through the real
-- invitation flow, which is the only way anybody but the first admin gets in.
insert into public.merchant_memberships (merchant_id, user_id, merchant_location_id, role)
select m.id, '9a1c0000-0000-4000-8000-000000000002', null, 'admin'
  from public.merchants m
 where m.is_demo
on conflict do nothing;

-- Somewhere for the order to go. The area has to be one the demo branch
-- actually serves, or `create_order_draft` refuses — which is correct, and
-- would make the walk fail at checkout rather than at the merchant screen.
insert into public.delivery_addresses (
  id, user_id, label, recipient_name, phone, area_key, street, building,
  floor, apartment, country, is_default
)
select
  '9a1c0000-0000-4000-8000-00000000000a',
  '9a1c0000-0000-4000-8000-000000000001',
  'Home', 'Salma Adel', '+201007778888',
  a.area_key, 'Road 9', '14', '3', '31', 'EG', true
  from public.merchant_location_areas a
  join public.merchant_locations l on l.id = a.merchant_location_id
  join public.merchants m on m.id = l.merchant_id and m.is_demo
 order by a.area_key
 limit 1
on conflict (id) do nothing;

select 'staff fixture: '
    || (select count(*) from public.merchant_memberships) || ' membership(s), '
    || (select count(*) from public.delivery_addresses) || ' address(es)' as summary;
