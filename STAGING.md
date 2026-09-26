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
| 6 | The **URL the staging web build is served from** — for `APP_BASE_URL` and `ALLOWED_ORIGINS` | wherever you deploy the export |
| 7 | Permission to create the first merchant staff account | you |

Put 2–6 in `.env.staging` (copy `.env.staging.example`). It is git-ignored.

Item 6 is not a credential and is easy to skip, so it is listed with the rest:
both values fail silently when absent, in opposite directions. It is **one**
piece of information that produces **two different values** — see § 3.

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
* the project ref is a known production ref, or matches
  `SUPABASE_PRODUCTION_PROJECT_REF` if that is set;
* the CLI ends up linked to a different project than the one you named;
* `APP_BASE_URL` is not a valid https base URL (a **path is fine**, a query,
  a fragment, credentials or a non-https scheme off localhost are not);
* an `ALLOWED_ORIGINS` entry is not a **bare origin** — a trailing slash or a
  path can never match a browser's `Origin` header, and the only symptom would
  be a blocked request with nothing in any log;
* the **origin of** `APP_BASE_URL` is not on the allow-list, which would leave
  the page the customer returns to unable to call the functions;
* the database already contains an enabled non-demo merchant it did not put
  there (a sign you are pointed at the wrong project).

It does, in order:

1. `supabase link` to the staging ref,
2. `supabase db push` — every migration in `supabase/migrations/`,
3. `supabase secrets set` — the function environment, from `.env.staging`
   (including `APP_BASE_URL` and `ALLOWED_ORIGINS`, which are not secrets but
   are function environment, which on Supabase is the same mechanism),
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

### First, the distinction everything else here depends on

Paymob sends **two** things after a payment, to two different places, and they
are not both evidence.

| | Where it goes | What it is |
|---|---|---|
| **Processed callback** (server → server) | `payments-webhook` | **THE ONLY PROOF A PAYMENT HAPPENED.** Signed with an HMAC over twenty ordered fields, verified before a single field of the body is read, and the only route by which an order becomes `captured` and reaches the merchant queue. |
| **Response callback** (the customer's browser) | `<APP_BASE_URL>/payment/<orderId>` | **UX, AND NEVER PROOF.** It is where the browser lands. It is under the customer's control, it can be edited, replayed, or never followed at all, and the app treats arriving there as a request to *ask the server* what happened — not as an answer. |

A customer who closes the tab has still paid. A customer who reaches the return
page has not necessarily paid anything. The app's payment screen polls the
order's real state either way, which is why the redirect can be wrong without
costing money — and why the webhook cannot.

### Where each one is configured

The redirect is **not** a dashboard setting for AKALT and there is no
environment variable for it. `payments-begin` builds it per order from
`APP_BASE_URL` and sends it as the Intention's `redirection_url`:

```
redirection_url = <APP_BASE_URL>/payment/<orderId>
```

So setting `APP_BASE_URL` in `.env.staging` is the whole of it. (An earlier
version of this runbook named a `PAYMOB_REDIRECTION_URL`; no code has ever read
one, and it has been removed rather than wired up — a per-order return
destination cannot come from a single static URL.)

### `APP_BASE_URL` is a base URL. `ALLOWED_ORIGINS` is not.

They are filled in from the same fact — where the staging build is served —
and they are still **not the same string**, which is worth being explicit about
because getting it wrong produces no error anywhere.

| | `APP_BASE_URL` | `ALLOWED_ORIGINS` |
|---|---|---|
| What it is | The base URL the app is **served from** | The browser `Origin` header values allowed to **call the functions** |
| Read by | `payments-begin`, which appends `/payment/<orderId>` | `_shared/http.ts`, which compares with exact string equality |
| Path allowed? | **Yes** | **Never** — an `Origin` header is `scheme://host[:port]` and nothing more |
| Trailing slash? | Stripped; write it without one | Never |
| How many | One | A comma-separated list |

The deployed preview is a **GitHub Pages project site**, served under the
repository name, so it is exactly the case where the two differ:

```
APP_BASE_URL=https://omarrakram.github.io/Food-App
ALLOWED_ORIGINS=https://omarrakram.github.io
```

`payments-begin` then builds
`https://omarrakram.github.io/Food-App/payment/<orderId>`, and the browser that
lands there sends `Origin: https://omarrakram.github.io`. Putting the `/Food-App`
into `ALLOWED_ORIGINS` would match nothing; dropping it from `APP_BASE_URL`
would redirect the customer to a page the Pages site does not serve.

A site at a domain root simply has the two the same
(`https://akalt-staging.pages.dev` for both), which is why the distinction is
easy to miss until it is a project site.

The rule the deploy script and the verifier enforce is therefore **the origin
of `APP_BASE_URL` must be on the allow-list** — not that the two are equal.
Both use `scripts/lib/staging-config.mjs`, which asks the WHATWG URL parser
rather than matching strings, so they cannot disagree about what is valid.

The **processed callbacks** do need the dashboard, and they need it twice. In
Paymob's dashboard, **test mode**:

| Setting | Value |
|---|---|
| **Card** integration → transaction processed callback | `https://<ref>.supabase.co/functions/v1/payments-webhook` |
| **Wallet** integration → transaction processed callback | `https://<ref>.supabase.co/functions/v1/payments-webhook` |
| Either integration → transaction *response* callback | Leave as Paymob's default, or set it to `<APP_BASE_URL>/payment` — `payments-begin` overrides it per order anyway. |

**Both integrations, separately.** The per-intention `notification_url` AKALT
sends is documented for CARD integrations; a wallet integration ignores it and
uses the URL configured against the integration itself. A wallet payment whose
callback was never configured simply never settles, and it fails silently.

### And the app has to be allowed to call the functions

`ALLOWED_ORIGINS` must contain the staging web build's origin — the origin,
not the base URL; see the table above. In a deployment with no allow-list,
`_shared/http.ts` refuses every browser origin — so the page the customer is
redirected back to would load and then be unable to ask the server anything.
The native app is unaffected (no `Origin` header), and so is
`payments-webhook` (Paymob is server-to-server).

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
