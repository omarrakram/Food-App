# Staging deployment attempt — 2026-09-25

**Outcome: nothing was deployed. Two hard blockers, neither of which is code.**

Target, as instructed: `ufnrjgnvfbpsxsnnyssl`.
Never touched, and now refused in code: `qriymxsnrphytzopigwb`.

---

## What actually happened, step by step

| # | Step | Result |
|---|---|---|
| 1 | Validate staging env variables | **FAILED — none are set.** No `SUPABASE_ACCESS_TOKEN`, no DB URL, no service-role key, no publishable key. `.env.staging` does not exist; only `.env.staging.example` does. |
| 2 | Link the CLI to `ufnrjgnvfbpsxsnnyssl` | **NOT ATTEMPTED.** `supabase link` authenticates against `api.supabase.com`, which this container cannot reach (below), and has no token to present in any case. |
| 3 | Confirm the linked ref before mutating | **N/A** — nothing was linked, so nothing was mutated. |
| 4–8 | Migrations, functions, webhook, extensions, endpoints | **NOT ATTEMPTED.** Every one of them is a write to a hosted project. |
| 9–11 | Paymob, Anthropic, real merchant | **Correctly skipped**, as instructed. |
| 12 | `verify-staging.mjs` | **Cannot run** — it needs the same credentials and the same network. |
| 13 | Security / performance checks | **Ran locally**, in full. See below. |

Nothing hosted was read, written, linked, or logged into.

---

## Blocker 1 — no credentials

Nothing in the environment carries them and no `.env.staging` exists. The
project ref alone is not enough to authenticate: the CLI needs a personal
access token, `db push` needs a database URL with its password, and the
verifier needs the service-role key.

What is needed, exactly (this is `.env.staging.example`, filled in):

```
SUPABASE_ACCESS_TOKEN=            # Dashboard → Account → Access Tokens
SUPABASE_STAGING_PROJECT_REF=ufnrjgnvfbpsxsnnyssl
SUPABASE_STAGING_DB_URL=          # Settings → Database → Connection string (URI), with the password
SUPABASE_STAGING_URL=             # Settings → API → Project URL
SUPABASE_STAGING_PUBLISHABLE_KEY= # Settings → API → publishable (anon) key
SUPABASE_STAGING_SERVICE_ROLE_KEY=# Settings → API → service_role key
```

Paymob and Anthropic stay blank until you say otherwise; the deploy script
currently requires them, and will be relaxed to allow a credentials-light first
pass when you are ready to run it.

## Blocker 2 — this container cannot reach Supabase

Even with the credentials, the deploy cannot run **from here**:

```
https://api.supabase.com/v1/projects              → CONNECT tunnel failed, 403
https://ufnrjgnvfbpsxsnnyssl.supabase.co/rest/v1/ → CONNECT tunnel failed, 403
```

The environment's network policy denies both hosts at the proxy. DNS resolves
(`db.ufnrjgnvfbpsxsnnyssl.supabase.co` and the pooler both answer), so this is
policy rather than routing.

Either allow `supabase.com`, `*.supabase.co` and `*.pooler.supabase.com` on the
environment's network settings, or run `./scripts/deploy-staging.sh` from a
machine that already has network access. The script and the runbook are
written to be run by a person, and that was deliberate.

---

## What WAS done

**The safety rule is now in the code rather than in an instruction.**
`scripts/deploy-staging.sh` carries `qriymxsnrphytzopigwb` in a
`PRODUCTION_REFS` list and refuses outright if it is ever the target — the list
can only refuse, never enable. `ufnrjgnvfbpsxsnnyssl` is in a `STAGING_REFS`
allow-list, and any ref in neither list prompts for explicit confirmation.
`verify-staging.mjs` refuses the production ref the same way.

The script also now **re-reads `supabase/.temp/project-ref` after linking and
before the first write**, and stops if the CLI ended up linked somewhere else.
A stale link file is the realistic way a careful deploy still lands on the
wrong project, and it was the one gap in the original guards.

**Local verification, run in full:**

| Gate | Result |
|---|---|
| TypeScript | clean |
| ESLint (`--max-warnings=0`) | clean |
| Jest | 1,475 tests / 107 suites |
| Database suite | 685 assertions |
| Deno (edge functions) | 35 tests |
| `db:types:check` | in step |
| `audit:testids` | 402 ids, no collisions |
| `fn:check` / `fn:imports` | 7 functions, deploy-safe |
| Provider-secret gate | no secret and no Paymob API surface in the client bundle |

---

## Ready to go the moment either blocker lifts

1. `cp .env.staging.example .env.staging`, fill in the six values above.
2. `./scripts/deploy-staging.sh --dry-run` — prints every command, touches nothing.
3. `./scripts/deploy-staging.sh` — migrations, secrets, seven functions,
   `payments-webhook` with `--no-verify-jwt`.
4. The three SQL steps the CLI cannot do (`STAGING.md` § 2): the extensions,
   the Vault secret, the two `edge_job_endpoints` rows.
5. `node scripts/verify-staging.mjs`.

Steps 4 and 5 are the ones that catch what fails silently — an absent cron
extension, a Vault secret that never resolves, a realtime publication missing
the two tables, and a `payments-webhook` that answers 401 because it was
deployed with JWT verification on.
