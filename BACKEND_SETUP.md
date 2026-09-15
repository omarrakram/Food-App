# Activating the real backend

Everything in this repository runs today without a server. This document is the
sequence for giving it one.

It is written to be followed once, in order, by one person with a terminal. Each
step says what it does, how to check it worked, and what breaks if it is
skipped. **No secret in this document, and none needs to be pasted into a chat
or committed.**

Roughly 30–45 minutes, most of it waiting for a project to provision.

---

## Before you start

| You need | Why | Cost |
|---|---|---|
| A Supabase account | The database, auth, storage and edge functions | Free tier is enough to start |
| The Supabase CLI | Applies migrations and deploys functions | `brew install supabase/tap/supabase` |
| An Anthropic API key | AI recipe suggestion and search interpretation | Optional — the app works without it |

The Anthropic key is genuinely optional. Without it the two edge functions
return a "not configured" error, the client catches it, and every screen answers
from the bundled 161-recipe catalogue instead. Nothing looks broken.

---

## 1. Create the project

1. https://supabase.com/dashboard → **New project**.
2. Pick a region close to your users. For Egypt, `eu-central-1` (Frankfurt) is
   the nearest low-latency option; `eu-west-2` (London) is second.
3. Set a database password and put it in your password manager. You will need
   it in step 3 and nowhere else.
4. Wait for provisioning (~2 minutes).

**Check:** the project dashboard loads and shows "Project is healthy".

---

## 2. Collect the two client values

Dashboard → **Settings → API**:

| Value | Where it goes | Secret? |
|---|---|---|
| Project URL | `EXPO_PUBLIC_SUPABASE_URL` | No |
| Publishable key (`sb_publishable_…`) | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **No — see below** |
| Secret key (`sb_secret_…`) | Nowhere in this repository | **YES. Never.** |

Supabase's modern key pair is `sb_publishable_…` / `sb_secret_…`; older
projects call the same two things `anon` and `service_role`. Either publishable
form works here — the client passes the key through without inspecting it — so
if your project still shows an `anon` JWT, that value goes in the same
variable.

The publishable key is safe in a shipped bundle *only because row level
security is enabled on every table*, which this schema does and
`supabase/tests/09_privacy_audit_test.sql` asserts on every CI run. That is the
whole basis of the safety, so if you ever disable RLS on a table, the
publishable key stops being safe that same minute.

The secret key bypasses RLS entirely. It belongs in Supabase's own secret store
(step 7) and nowhere else. The preview deploy refuses to publish a bundle
containing one: it matches `sb_secret_` literally, and decodes any JWT it finds
and fails on a `service_role` payload.

---

## 3. Apply the schema

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF     # prompts for the db password
supabase db push
```

This applies all 21 migrations in `supabase/migrations/` in filename order. They
are verified to apply cleanly to an empty database on every CI run
(`.github/workflows/ci.yml` → *Migrations, seed and RLS policies*), so this
should be uneventful.

What they create, in order of what they are for:

| Migrations | What |
|---|---|
| `…120000` – `…120600` | Enums, profiles, preferences, ingredients, recipes, pantry, saved, shopping, pricing, AI usage |
| `…120700` – `…120900` | Row level security on every table; account deletion; the lock that stops clients publishing recipes |
| `20260911…` – `20260912…` | Arabic recipe content; the catalogue expansion to 161 recipes |
| `20260913090000` | `public_profiles` — the view that is the only way one user sees another |
| `20260913100000` | Storage buckets and their policies |
| `20260913110000` – `20260913120000` | Friends, requests, blocking; one-to-one conversations |
| `20260914090000` – `20260914130000` | Recipe sharing without a note; submissions and moderation; notifications; the definer-function lockdown; submission photographs |

**Check:**

```bash
supabase db diff          # prints nothing when the remote matches the migrations
```

---

## 4. Seed the reference data

`supabase db push` applies migrations and nothing else, so the reference data
is a separate step.

The connection string is in the dashboard: **Project Settings → Database →
Connection string → URI**. It embeds your database password, so keep it out of
shell history and out of Git — read it into a variable for the one command and
unset it after:

```bash
read -rs SUPABASE_DB_URL      # paste the URI; it is not echoed
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
unset SUPABASE_DB_URL
```

**Not `supabase status`.** That reports the LOCAL development stack started by
`supabase start`. Seeding through its `DB_URL` fills a Docker database on your
own machine and leaves the project you just created empty — and if the local
stack is not running it simply fails.

Pasting `supabase/seed.sql` into the dashboard SQL editor works too, but it is
18,000 lines and the editor struggles with that. Either way it is reference
data, not user data, and safe to re-run.

**Check:** dashboard → Table editor → `recipes` shows 161 rows, `ingredients`
257, `ingredient_price_estimates` 69. Those are the exact figures a clean
migrate-then-seed produces; they were verified against an empty database while
writing this.

Skipping this leaves the database empty. The app still works — it falls back to
its bundled catalogue — but nothing server-side has anything to search.

---

## 5. Confirm RLS came with it

`supabase db push` applies the policies along with the tables, so there is
nothing to do here. Verify rather than trust:

Dashboard → **Authentication → Policies**. Every table in `public` should show
RLS enabled and at least one policy. If any shows "RLS not enabled", stop and
find out why — that table is readable by anyone with the anon key.

The structural version of this check runs in CI and is worth reading once:
`supabase/tests/09_privacy_audit_test.sql` asserts that every table has RLS,
every read policy on a private table is scoped to `auth.uid()`, every
security-definer function is revoked from `anon`, and `public_profiles` exposes
exactly eight columns.

---

## 6. Storage buckets

Created by migration `20260913100000_storage_buckets.sql`, including their
policies. Verify in dashboard → **Storage**:

| Bucket | Public | Holds |
|---|---|---|
| `avatars` | Yes | Profile pictures. Public because an avatar exists to be shown next to a name |
| `recipe-images` | Yes | The published catalogue's photographs. Read-only to every client |
| `recipe-uploads` | **No** | Community submission photographs |

`recipe-uploads` being private is load-bearing: a submission under review must
not be reachable by URL, or moderation is advisory. Its photographs become
readable exactly while the recipe referencing them is public — so unpublishing a
recipe takes its photograph down in the same statement. There is no copy in
another bucket to forget about.

---

## 7. Edge functions and the Anthropic secret

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy ai-suggest
supabase functions deploy ai-interpret
```

Optional tuning, same mechanism: `ANTHROPIC_MODEL` (defaults to
`claude-opus-5`), `ANTHROPIC_EFFORT`, `AI_RATE_LIMIT_PER_HOUR`,
`AI_RATE_LIMIT_PER_DAY`, and `ALLOWED_ORIGINS` if you deploy the web build to a
domain.

`supabase secrets set` stores the value in Supabase's secret store. It is never
written to this repository, never bundled into the app, and never printed.

**Check:** dashboard → Edge Functions shows both as deployed. The app's
`/settings/about` screen reports AI as available once they are.

**Skipping this is fine.** Both functions are optional and the app degrades to
its local catalogue without them.

---

## 8. Auth: email and redirect URLs

Dashboard → **Authentication → URL Configuration**.

The app builds its confirmation and reset links with `Linking.createURL`, which
produces a different shape per platform. Add all of these to **Redirect URLs**:

```
akla://auth/callback
akla://auth/reset
exp://127.0.0.1:8081/--/auth/callback      # Expo Go, development only
exp://127.0.0.1:8081/--/auth/reset
http://localhost:8081/auth/callback        # `npx expo start --web`
http://localhost:8081/auth/reset
```

**A web build served from a sub-path needs a code change before these work.**
On web, `Linking.createURL('auth/callback')` resolves the path against
`window.location.origin` — see `expo-linking/build/createURL.web.js`, which is
`new URL(path, window.location.origin)` — and an origin is scheme plus host
with no path at all. A GitHub Pages *project* site is served from
`https://<user>.github.io/<repo>/`, so the link the app generates is
`https://<user>.github.io/auth/callback`: GitHub's 404 page, not the app.
Adding that URL to the whitelist does not help, because the URL itself is
wrong.

Nothing is broken by this today. The Pages preview ships no Supabase
credentials and therefore never sends an email. It becomes real only when a web
build is deployed against this backend (step 12) on a sub-path. Two ways out:
serve that build from a domain root — a custom domain, or a `<user>.github.io`
user site — or make `redirectTo` in `src/features/auth/auth-provider.tsx`
prepend the deployed base path. Native builds and local `expo start` are
unaffected: the app is at the root there.

`akla` is the scheme from `app.json`. The two paths are
`AUTH_REDIRECT_PATHS` in `src/features/auth/deep-link.ts`, which is also where
they are read back — they are asserted against each other in
`src/features/auth/__tests__/deep-link.test.ts`, so a redirect nobody listens
for cannot be introduced by changing one of them.

Set **Site URL** to your web domain if you have one, otherwise leave the
default.

**A note on what happens after the tap.** On web, the Supabase client parses
the callback out of the URL itself. On native there is no URL bar, so the app
listens for the deep link and exchanges the code — both on a cold start and
while already running. This was missing until the activation audit found it;
it could not be noticed without a backend, because with no project configured
no email is ever sent.

Then **Authentication → Providers → Email**: confirm "Enable email provider" is
on. Supabase's built-in SMTP is rate-limited and fine for testing; for real
users configure your own SMTP under **Project Settings → Auth → SMTP**.

Getting the redirect URLs wrong is the commonest failure here, and it fails in a
particular way: sign-up appears to work, the email arrives, and tapping the link
opens a browser that says "requested path is invalid" instead of returning to
the app.

---

## 9. Realtime

Nothing to configure. Realtime is enabled per-publication in Supabase and this
app opens no subscriptions yet — the messaging data layer is shaped for it
(repository methods, query keys, cache invalidation) but nothing subscribes.
Messages arrive on refetch.

When you do want live delivery, the work is one `.channel()` on `messages`
filtered by `conversation_id`. The RLS policies already apply to Realtime, so a
non-member receives nothing; no new policy is needed.

---

## 10. Point the app at it

Create `.env.local` (git-ignored) from the template:

```bash
cp .env.example .env.local
```

Fill in exactly two values:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

`EXPO_PUBLIC_SUPABASE_ANON_KEY` is still read as a fallback, so an older
`.env.local` keeps working — but the app lists it as deprecated in its startup
diagnostics until it is renamed. The value is unchanged; only the name is.

**Do not set `EXPO_PUBLIC_DEMO_MODE`.** It is off by default, and
`src/lib/config/env.ts` forces it off anyway once Supabase credentials are
present — demo mode exists because there is nowhere to send anything, so a
configured backend turns it off. `src/lib/config/__tests__/env.test.ts` asserts
the two can never be true together, over every combination of the flag, the
environment and the credentials.

```bash
npx expo start
```

**Check:** `/settings/about` reports Supabase as configured. Sign up, confirm
the email, and the Friends screen offers search instead of "Messages need an
account".

---

## 11. Grant yourself the moderator role

There is deliberately no way to do this from inside the app. `user_roles` has
read policies and **no write policy at all**, so every client insert is refused
regardless of who is asking — a policy that let admins grant admin would let
anyone who reached one admin reach all of them.

Dashboard → SQL editor, after signing up:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

**Check:** the Review queue row appears in the drawer. It is gated on the
server's answer to `is_moderator()`; `src/components/navigation/__tests__/drawer-content.test.tsx`
asserts an ordinary user never sees it.

---

## 12. Deploying the web build against the real backend

The GitHub Pages preview deliberately has **no** credentials and runs in demo
mode. To deploy a real one, set repository secrets and reference them in
`.github/workflows/preview.yml`'s build step:

```yaml
EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.EXPO_PUBLIC_SUPABASE_URL }}
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
```

and remove the two `EXPO_PUBLIC_DEMO_MODE` / `EXPO_PUBLIC_APP_ENV: preview`
lines. The demo flag would turn itself off regardless, but leaving it in the
workflow is a misleading thing for the next reader to find.

The workflow's secret gate stays on either way: it refuses a bundle containing
`sb_secret_`, and decodes every JWT in it to refuse one carrying a
`service_role` payload.

---

## Troubleshooting

**"Supabase is not configured" after filling in `.env.local`** — Expo inlines
`EXPO_PUBLIC_*` at bundle time. Restart the dev server; a hot reload will not
pick them up.

**Sign-up email never arrives** — Supabase's built-in SMTP is heavily rate
limited. Check Authentication → Logs, then configure your own SMTP.

**Email link says "requested path is invalid"** — step 8. The exact URL the app
generated is in Authentication → Logs; add it verbatim.

**Every query returns empty for a signed-in user** — RLS is working and your
policies are stricter than you think. Dashboard → SQL editor, `set role
authenticated; set request.jwt.claim.sub = '<user-id>';` then run the query and
see what it returns.

**Friends/Messages still show demo data** — you still have
`EXPO_PUBLIC_DEMO_MODE=true` AND no credentials. Check `/settings/about`: it
reports what `env` actually resolved.

---

## What this does not cover

- **EAS / native builds** — see `EAS.md`. Needs `npx eas init` and an Apple or
  Google developer account.
- **Grocery ordering** — commercial agreements, not configuration. The `mock`
  provider is what ships.
- **Push notifications** — needs APNs/FCM credentials and a native build. The
  in-app feed is complete and nothing in the schema changes to add push: a
  worker reads `notifications` and sends.
