-- ---------------------------------------------------------------------------
-- Akla — close the default EXECUTE grant on trigger functions
--
-- Found by the structural privacy audit
-- (`supabase/tests/09_privacy_audit_test.sql`), which asserts that NO
-- security-definer function in `public` is callable by `anon`.
--
-- Six were. Postgres grants EXECUTE on every new function to `PUBLIC` unless
-- told otherwise, and the migrations that created these trigger functions
-- revoked nothing — the ones with arguments were locked down individually,
-- the trigger functions were not.
--
-- HOW BAD WAS IT, HONESTLY: not very. A function returning `trigger` cannot be
-- called directly ("trigger functions can only be called as triggers"), and
-- PostgREST does not expose them as RPC. So there was no reachable path, and
-- this is not a patched hole.
--
-- WHY FIX IT ANYWAY: the audit is worth more than the six grants. A rule with
-- exemptions in it stops being a rule — the next definer function that turns
-- up in that list is a real one, and it will be waved through as "another one
-- of those" unless the list is empty today.
-- ---------------------------------------------------------------------------

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_conversation_preview() from public, anon, authenticated;
revoke all on function public.notify_friend_request() from public, anon, authenticated;
revoke all on function public.notify_friend_accepted() from public, anon, authenticated;
revoke all on function public.notify_message() from public, anon, authenticated;
revoke all on function public.notify_submission_decision() from public, anon, authenticated;

-- The trigger itself is unaffected: a trigger fires as the table's owner, not
-- as the caller, so revoking EXECUTE from every role does not stop it.

comment on function public.notify_message is
  'Trigger only. EXECUTE is revoked from every client role; the trigger fires '
  'as the table owner regardless.';
