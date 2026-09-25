# Staging deployment

**Read `PILOT_READINESS.md` first.** This is the runbook for standing up a
staging environment; that document says what a pilot still needs after it.

**Nothing in this repository has ever been applied to a hosted Supabase
project.** Every migration, function, cron job and Vault secret described here
is unapplied. That is deliberate and it is also the reason this runbook exists
rather than a list of things somebody remembers doing.

---

## 0. What is needed before any of this can run

These are the things engineering cannot produce:

| # | Needed | Where it comes from |
|---|---|---|
| 1 | A **staging Supabase project**, separate from production | supabase.com — a new project, or a branch of the existing one |
| 2 | `SUPABASE_ACCESS_TOKEN` | Supabase Dashboard → Account → Access Tokens |
| 3 | The staging project's ref, DB URL, API URL, publishable key, service-role key | Dashboard → Project Settings |
| 4 | **Paymob SANDBOX credentials**: secret key, public key, HMAC secret, card integration id, wallet integration id | Paymob merchant dashboard, test mode |
| 5 | An **Anthropic API key** for staging | console.anthropic.com |
| 6 | Permission to create the first merchant staff account | you |

Put 2–5 in `.env.staging` (copy `.env.staging.example`). It is git-ignored.

**Do not reuse production values for any of them.**

---

## 1. Deploy

The Supabase CLI is the only tool needed and installs from npm
(`npm i -g supabase` — 2.118.0 at time of writing). **Docker is not required**:
`db push --db-url` connects directly, and `functions deploy` bundles with the
CLI's own bundler.

```bash
cp .env.staging.example .env.staging     # then fill it in
./scripts/deploy-staging.sh              # migrations + functions + secrets
```

The script refuses to run if:

* `.env.staging` is missing or has blanks;
* the project ref matches `SUPABASE_PRODUCTION_PROJECT_REF`, if that is set;
* the database already contains an enabled non-demo merchant it did not put
  there (a sign you are pointed at the wrong project).

It does, in order:

1. `supabase link` to the staging ref,
2. `supabase db push` — every migration in `supabase/migrations/`,
3. `supabase secrets set` — the function environment, from `.env.staging`,
4. `supabase functions deploy` — all seven, with `payments-webhook`
   `--no-verify-jwt` because Paymob has no Supabase token and its HMAC is the
   authentication.

## 2. Things the CLI cannot do

These are SQL, run once against the staging database:

```sql
-- Platform extensions.
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- The service-role key, in Vault. NOT in a table and not in a migration.
select vault.create_secret('<STAGING SERVICE ROLE KEY>', 'service_role_key');

-- The two HTTP jobs, pointed at THIS project.
insert into public.edge_job_endpoints (name, url, secret_name) values
  ('refunds-execute',
   'https://<ref>.supabase.co/functions/v1/refunds-execute', 'service_role_key'),
  ('payments-reconcile',
   'https://<ref>.supabase.co/functions/v1/payments-reconcile', 'service_role_key');
```

Then re-apply `supabase/migrations/20260928090200_scheduled_jobs.sql`, which is
safe to re-run and which schedules the seven cron jobs once `pg_cron` exists.

Realtime is handled by `20260929090000_realtime.sql`, which adds `orders` and
`order_substitutions` to the `supabase_realtime` publication.

## 3. Paymob sandbox

In Paymob's dashboard, **test mode**:

| Setting | Value |
|---|---|
| Card integration → transaction processed callback | `https://<ref>.supabase.co/functions/v1/payments-webhook` |
| Card integration → transaction response callback | `PAYMOB_REDIRECTION_URL` |
| **Wallet** integration → transaction processed callback | `https://<ref>.supabase.co/functions/v1/payments-webhook` |
| Wallet integration → transaction response callback | `PAYMOB_REDIRECTION_URL` |

**Both integrations, separately.** The per-intention `notification_url` AKALT
sends is documented for CARD integrations; a wallet integration ignores it and
uses the URL configured against the integration itself. A wallet payment whose
callback was never configured simply never settles, and it fails silently.

## 4. Verify

```bash
node scripts/verify-staging.mjs
```

It checks, against the live staging project, that: the migrations are applied
(by looking for the newest objects, not by trusting a version table), the seven
functions answer, the extensions exist, the Vault secret resolves, the endpoint
table is filled in, the cron jobs are scheduled, the realtime publication
carries both tables, and Paymob is configured with something that is not a
live key. It writes a checklist and exits non-zero on anything missing.

## 5. Then, and only then

Run the hosted end-to-end journeys — customer through Paymob sandbox, merchant
through fulfilment, schedulers, realtime — as described in `PILOT_READINESS.md`
§4. Nothing about a green local walk predicts a hosted one: the local walks run
against PostgREST with a hand-minted JWT and no GoTrue, which is the part
staging exists to replace.
