import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Caller identification.
 *
 * The user id is derived from the JWT the caller presented, never from the
 * request body. That is the whole reason these functions can be trusted to
 * rate-limit and bill the right account.
 */

export type Caller = {
  userId: string;
  /** Client scoped to the caller's JWT — every query is subject to RLS. */
  client: SupabaseClient;
};

/** Service-role client. Bypasses RLS, so it is only used for usage accounting. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticate(request: Request): Promise<Caller | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // getUser() verifies the token against the auth server rather than decoding
  // it locally, so a forged or revoked token fails here.
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;

  return { userId: data.user.id, client };
}
