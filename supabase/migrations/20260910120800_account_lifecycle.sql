-- ---------------------------------------------------------------------------
-- Akla — account lifecycle
--
-- Creating a profile on signup and deleting everything on request. Both run as
-- SECURITY DEFINER because they touch auth.users, which the anon role cannot.
-- ---------------------------------------------------------------------------

-- Creates the profile, preference row and default shopping list for a new
-- user. Runs inside the signup transaction, so a user never exists without the
-- rows the app assumes are present.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  initial_name text;
begin
  -- `display_name` may arrive from OAuth metadata; onboarding overwrites it.
  initial_name := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  insert into public.profiles (id, display_name)
  values (new.id, left(initial_name, 80))
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.shopping_lists (user_id, name, is_default)
  values (new.id, 'My list', true)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------

-- Permanent account deletion.
--
-- Called by the `account-delete` edge function with the caller's JWT. It
-- derives the user from auth.uid() and NEVER from a parameter, so one user can
-- never delete another. Every owned table cascades from auth.users, so the
-- single delete below removes profile, preferences, pantry, saved recipes,
-- history, shopping lists and user-authored recipes.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Detach AI usage rows rather than deleting them: they carry no user content
  -- and are needed for cost reconciliation. user_id is nulled by the FK's
  -- ON DELETE SET NULL, which anonymises them.
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- ---------------------------------------------------------------------------

-- Clears a user's interaction history. Backs the "clear history" button on the
-- privacy screen; separate from account deletion so the two are independent.
create or replace function public.clear_own_history()
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.recipe_history where user_id = auth.uid();
$$;

grant execute on function public.clear_own_history() to authenticated;
