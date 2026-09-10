# Pre-release security review

Reviewed 2026-09-10 at commit `bd515fa` + the fix below. Structured around the
OWASP Mobile Top 10 and the API risks that actually apply to this architecture.

---

## Findings

### 1. Clients could publish recipes to every user — **FIXED**

**Severity:** high · **Status:** fixed in `20260910120900_lock_recipe_publication.sql`

The `recipes` RLS policies let an owner set `is_public = true` on their own
row, and `is_public` is exactly what the read policy keys on. The app has no
publishing feature, so nothing exercised it — but a crafted client could have
pushed arbitrary content, including unsafe cooking instructions, into every
other user's Discover feed.

Insert and update policies now require `is_public = false` for user-owned
rows. Curated recipes are seeded by the service role, which bypasses RLS, so
seeding is unaffected. Two assertions cover it.

### 2. Rate-limit counters fail open — **accepted**

**Severity:** low · **Status:** accepted, documented

If `ai_call_count` cannot be read, `checkRateLimit` allows the call. Failing
closed would lock every user out of generation during a transient database
problem, for a risk that is cost rather than security. The Anthropic account's
own limits remain as a backstop, and the failure is logged.

### 3. Wildcard CORS when unconfigured — **accepted for development**

**Severity:** low · **Status:** mitigated

With no `ALLOWED_ORIGINS`, the edge functions echo the request origin. The
mobile app sends no Origin header and is unaffected; this only matters for web
builds. `ALLOWED_ORIGINS` must be set in any deployment serving a web client —
noted in `.env.example` and the functions README.

---

## Verified

| Area | Check | Result |
|---|---|---|
| Secrets | No `sk-ant-`, service-role key or non-`EXPO_PUBLIC_` variable reachable from `src/` | pass |
| Secrets | Built web bundle grepped for secret patterns | pass |
| Secrets | System prompts absent from the client bundle | pass |
| Secrets | `src/lib/config/env.ts` can only read `EXPO_PUBLIC_*` | pass |
| Authz | Every table in `public` has RLS enabled (asserted in CI) | pass |
| Authz | No table has RLS on with no policy (silent deny-all) | pass |
| Authz | Cross-user read, update, insert and delete all denied | pass, 40 assertions |
| Authz | Forged parent id on a child table denied | pass |
| Authz | Reference data readable, not writable, through the anon key | pass |
| Authz | Every `SECURITY DEFINER` function pins `search_path` | pass |
| Authz | `delete_own_account()` derives the user from `auth.uid()`, never a parameter | pass |
| Authz | Unconditional `USING (true)` policies exist only on reference tables | pass |
| Auth | Session tokens in the keychain, not AsyncStorage | pass |
| Auth | Password reset and sign-in errors do not reveal whether an account exists | pass |
| Auth | Sign-out clears the local cache and the query cache | pass |
| AI | Caller identified from JWT, never the request body | pass |
| AI | User text sanitised server-side before reaching a prompt | pass |
| AI | User text passed as JSON data, never concatenated into instructions | pass |
| AI | Enum inputs narrowed to known values | pass |
| AI | Model output schema-validated; allergens re-checked after generation | pass |
| AI | Rate limits counted from a table clients cannot write | pass |
| AI | No prompt or completion text stored anywhere | pass |
| Injection | No `eval`, `new Function`, or `dangerouslySetInnerHTML` | pass |
| Transport | No `http://` URLs outside localhost | pass |
| Logging | Emails, tokens, queries and free text redacted by the logger | pass |
| Input | Request body size-capped before parsing; deep-link params clamped | pass |

---

## Residual risks

| Risk | Why it is accepted |
|---|---|
| Anon key is in the bundle | By design. It is safe only because RLS is enabled everywhere, which is why that is the single most-tested property in the project. |
| `database.types.ts` is hand-maintained | Drift is a runtime error TypeScript cannot catch. Regenerate with `npm run db:types` once a project exists. |
| No certificate pinning | Standard TLS only. Proportionate for the data involved; revisit if payment ever moves in-app. |
| No account lockout beyond Supabase defaults | Supabase Auth rate-limits sign-in attempts. A per-account lockout would be worth adding before scale. |

## Before public launch

1. Set `ALLOWED_ORIGINS` on the deployed functions.
2. Regenerate `database.types.ts` against the real project.
3. Turn on Supabase's leaked-password protection and configure the SMTP
   sender so confirmation mail is not rate-limited by the shared default.
4. Re-run this review after any migration that adds a table — CI fails if one
   arrives without RLS, but a permissive policy would still pass.
