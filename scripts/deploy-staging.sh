#!/usr/bin/env bash
#
# Deploys this repository to a STAGING Supabase project.
#
#     cp .env.staging.example .env.staging   # then fill it in
#     ./scripts/deploy-staging.sh
#     ./scripts/deploy-staging.sh --dry-run  # print what it would do
#
# IT WILL NOT DEPLOY TO PRODUCTION. Four guards, and each of them exists
# because the failure it prevents is unrecoverable rather than annoying:
#
#   1. `.env.staging` must exist and be complete. A half-filled environment
#      deploys functions that fail at the first real payment.
#   2. `SUPABASE_STAGING_PROJECT_REF` must not equal
#      `SUPABASE_PRODUCTION_PROJECT_REF` when that is set.
#   3. The database must not already hold an enabled non-demo merchant this
#      script did not put there — that is what a production database looks
#      like from here.
#   4. The Paymob key must not look live. See `assert_sandbox` below; it is a
#      weak check on purpose (Paymob's test and live keys are not reliably
#      distinguishable by shape), and it prints a warning rather than claiming
#      certainty it does not have.
#
# NOTHING HERE IS RUN AUTOMATICALLY. It is a runbook you can execute, not a
# pipeline step, because the first deploy of a payment system should be
# somebody's deliberate act.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
run() {
  if ${DRY_RUN}; then
    printf '   (dry run) %s\n' "$*"
  else
    "$@"
  fi
}

# --- 1. The environment ------------------------------------------------------

[[ -f .env.staging ]] || die ".env.staging is missing. Copy .env.staging.example and fill it in."

set -a
# shellcheck disable=SC1091
source .env.staging
set +a

REQUIRED=(
  SUPABASE_STAGING_PROJECT_REF
  SUPABASE_STAGING_DB_URL
  SUPABASE_ACCESS_TOKEN
  SUPABASE_STAGING_URL
  SUPABASE_STAGING_PUBLISHABLE_KEY
  SUPABASE_STAGING_SERVICE_ROLE_KEY
  # Not secrets, and required anyway — both fail SILENTLY when absent. Without
  # APP_BASE_URL, `payments-begin` falls back to the caller's Origin and then
  # to a hard-coded production URL, so a staging payment can send the customer
  # into the production app. Without ALLOWED_ORIGINS, a deployed function
  # refuses every browser origin and the hosted web build cannot call it.
  APP_BASE_URL
  ALLOWED_ORIGINS
  PAYMOB_SECRET_KEY
  PAYMOB_PUBLIC_KEY
  PAYMOB_HMAC_SECRET
  PAYMOB_CARD_INTEGRATION_ID
  PAYMOB_WALLET_INTEGRATION_ID
  ANTHROPIC_API_KEY
)

MISSING=()
for name in "${REQUIRED[@]}"; do
  [[ -n "${!name:-}" ]] || MISSING+=("${name}")
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  die "these are blank in .env.staging: ${MISSING[*]}"
fi

# --- 1b. The two URLs, which are not the same kind of thing -------------------
#
# APP_BASE_URL IS A BASE URL AND MAY CARRY A PATH. The deployed preview is a
# GitHub Pages PROJECT site — `https://omarrakram.github.io/Food-App` — and
# `payments-begin` appends `/payment/<orderId>` to whatever this is.
#
# ALLOWED_ORIGINS IS A LIST OF BROWSER `Origin` HEADER VALUES, which are
# `scheme://host[:port]` and nothing else. `_shared/http.ts` compares them with
# `includes()`, so an entry carrying a path or a trailing slash can never match
# anything and the only symptom is a blocked request with no server-side trace.
#
# The relation between them is therefore not equality. It is: THE ORIGIN OF
# APP_BASE_URL MUST BE ON THE ALLOW-LIST — the page the customer is redirected
# back to is the page that then calls the functions.
#
# All of that is judged by the WHATWG URL parser in
# `scripts/lib/staging-config.mjs`, shared with `verify-staging.mjs`, rather
# than by shell pattern matching. `new URL(x).origin` is the same
# serialisation the browser puts in the header; a regex is a guess at it.

command -v node >/dev/null || die "node is required to validate APP_BASE_URL / ALLOWED_ORIGINS."

# On success: two lines, the normalised values. On failure: the reasons.
# The normalised values are what get deployed, so what reaches Supabase is what
# was checked rather than what was typed.
CONFIG_CHECK="$(node scripts/lib/staging-config.mjs check "${APP_BASE_URL}" "${ALLOWED_ORIGINS}")" \
  || die "${CONFIG_CHECK}"

{ read -r APP_BASE_URL; read -r ALLOWED_ORIGINS; } <<< "${CONFIG_CHECK}"

say "App base URL: ${APP_BASE_URL}"
printf '    customers return to %s/payment/<orderId>\n' "${APP_BASE_URL}"
printf '    browser Origin allow-list: %s\n' "${ALLOWED_ORIGINS}"

# --- 2. Not production -------------------------------------------------------
#
# TWO REFS ARE WRITTEN DOWN HERE, on purpose.
#
# A guard that lives only in a variable somebody sets is a guard that is absent
# the one time it matters — the tired evening deploy with a half-copied
# `.env.staging`. These are the actual project refs for this product, and the
# list can only ever REFUSE: no value here enables anything, and the allow-list
# does not replace the environment file, it agrees with it.
readonly PRODUCTION_REFS=(
  "qriymxsnrphytzopigwb"   # AKALT production. NEVER.
)
readonly STAGING_REFS=(
  "ufnrjgnvfbpsxsnnyssl"   # AKALT staging.
)

for ref in "${PRODUCTION_REFS[@]}"; do
  if [[ "${SUPABASE_STAGING_PROJECT_REF}" == "${ref}" ]]; then
    die "${ref} is the PRODUCTION project. This script will never deploy to it."
  fi
done

if [[ -n "${SUPABASE_PRODUCTION_PROJECT_REF:-}" ]]; then
  if [[ "${SUPABASE_STAGING_PROJECT_REF}" == "${SUPABASE_PRODUCTION_PROJECT_REF}" ]]; then
    die "the staging ref equals the production ref. Refusing."
  fi
fi

# An unrecognised ref is not refused — a second staging project is a
# reasonable thing to have — but it is said out loud and confirmed, because
# "which project am I actually pointed at" is the question this whole section
# exists to answer.
KNOWN=false
for ref in "${STAGING_REFS[@]}"; do
  [[ "${SUPABASE_STAGING_PROJECT_REF}" == "${ref}" ]] && KNOWN=true
done
if ! ${KNOWN}; then
  printf '\n\033[33mWARNING: %s is not a project ref this script knows about.\033[0m\n' \
    "${SUPABASE_STAGING_PROJECT_REF}"
  ${DRY_RUN} || {
    read -r -p 'Type the project ref to continue: ' CONFIRM
    [[ "${CONFIRM}" == "${SUPABASE_STAGING_PROJECT_REF}" ]] || die "not confirmed."
  }
fi

say "Target project: ${SUPABASE_STAGING_PROJECT_REF}"

case "${SUPABASE_STAGING_DB_URL}" in
  *"${SUPABASE_STAGING_PROJECT_REF}"*) ;;
  *) die "SUPABASE_STAGING_DB_URL does not mention the staging project ref. Check both." ;;
esac

command -v supabase >/dev/null || die "the supabase CLI is not installed. https://supabase.com/docs/guides/cli"
command -v psql >/dev/null || die "psql is not installed; the guard below needs it."

# A DRY RUN CONNECTS TO NOTHING. This guard opened a real database connection
# even under `--dry-run`, which made "print what you would do" not quite true —
# and the whole point of the flag is that somebody can read the plan before
# anything reaches the network.
if ${DRY_RUN}; then
  say "Guard: skipped (dry run connects to nothing)"
  EXISTING="0"
else
  say "Guard: is this database already somebody's production?"
  EXISTING="$(psql "${SUPABASE_STAGING_DB_URL}" -At -c "
    select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'merchants'" 2>/dev/null || echo 0)"
fi

if [[ "${EXISTING}" == "1" ]]; then
  LIVE="$(psql "${SUPABASE_STAGING_DB_URL}" -At -c "
    select count(*) from public.merchants where is_enabled and not is_demo" || echo 0)"
  if [[ "${LIVE}" != "0" ]]; then
    printf '\n\033[33mWARNING: this database already has %s enabled non-demo merchant(s).\033[0m\n' "${LIVE}"
    printf 'If this is the staging project and you put them there, continue.\n'
    read -r -p 'Type the project ref to continue: ' CONFIRM
    [[ "${CONFIRM}" == "${SUPABASE_STAGING_PROJECT_REF}" ]] || die "not confirmed."
  fi
fi

assert_sandbox() {
  # Paymob does not guarantee a distinguishable prefix between test and live
  # keys, so this cannot be certain and does not pretend to be.
  if [[ "${PAYMOB_BASE_URL:-}" == *"paymobsolutions.com"* ]]; then
    printf '\n\033[33mWARNING: PAYMOB_BASE_URL points at the legacy live host.\033[0m\n'
  fi
  printf '\n\033[33mConfirm these are Paymob SANDBOX credentials.\033[0m\n'
  read -r -p 'Type SANDBOX to continue: ' CONFIRM
  [[ "${CONFIRM}" == "SANDBOX" ]] || die "not confirmed."
}
${DRY_RUN} || assert_sandbox

# --- 3. Migrations -----------------------------------------------------------

say "Linking to ${SUPABASE_STAGING_PROJECT_REF}"
run supabase link --project-ref "${SUPABASE_STAGING_PROJECT_REF}"

# CONFIRM WHAT WE ARE ACTUALLY LINKED TO, after linking and before the first
# mutation. `supabase link` can succeed against a different project than the
# one you meant if a stale `.temp/project-ref` is in the way, and every command
# after this point writes.
if ! ${DRY_RUN}; then
  LINKED="$(cat supabase/.temp/project-ref 2>/dev/null || echo '')"
  if [[ -n "${LINKED}" && "${LINKED}" != "${SUPABASE_STAGING_PROJECT_REF}" ]]; then
    die "the CLI is linked to ${LINKED}, not ${SUPABASE_STAGING_PROJECT_REF}. Stopping before any write."
  fi
  say "Confirmed linked project: ${LINKED:-${SUPABASE_STAGING_PROJECT_REF}}"
fi

say "Applying migrations"
run supabase db push --db-url "${SUPABASE_STAGING_DB_URL}"

# --- 4. Function secrets -----------------------------------------------------
# NEVER echoed. `supabase secrets set` reads them from here and they go no
# further; nothing below prints a value.
#
# APP_BASE_URL and ALLOWED_ORIGINS are not secrets — they are public facts
# about where the app is served — but they are function ENVIRONMENT, which on
# Supabase is the same mechanism, so they are set here with everything else.

say "Setting Edge Function secrets"
run supabase secrets set \
  APP_BASE_URL="${APP_BASE_URL}" \
  ALLOWED_ORIGINS="${ALLOWED_ORIGINS}" \
  PAYMOB_BASE_URL="${PAYMOB_BASE_URL:-https://accept.paymob.com}" \
  PAYMOB_SECRET_KEY="${PAYMOB_SECRET_KEY}" \
  PAYMOB_PUBLIC_KEY="${PAYMOB_PUBLIC_KEY}" \
  PAYMOB_HMAC_SECRET="${PAYMOB_HMAC_SECRET}" \
  PAYMOB_CARD_INTEGRATION_ID="${PAYMOB_CARD_INTEGRATION_ID}" \
  PAYMOB_WALLET_INTEGRATION_ID="${PAYMOB_WALLET_INTEGRATION_ID}" \
  ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
  ALLOW_PAYMENT_SIMULATOR="false" \
  --project-ref "${SUPABASE_STAGING_PROJECT_REF}"

# --- 5. Functions ------------------------------------------------------------

say "Deploying Edge Functions"
for fn in ai-suggest ai-interpret payments-begin payments-simulate payments-reconcile refunds-execute; do
  run supabase functions deploy "${fn}" --project-ref "${SUPABASE_STAGING_PROJECT_REF}"
done

# THE WEBHOOK TAKES NO JWT. Paymob has no Supabase token; its HMAC signature is
# the authentication, and it is verified before a single field of the body is
# read. Deploying this WITH jwt verification silently breaks every payment
# callback — the provider retries, gets 401, and no order ever settles.
say "Deploying payments-webhook WITHOUT jwt verification (by design)"
run supabase functions deploy payments-webhook --no-verify-jwt \
  --project-ref "${SUPABASE_STAGING_PROJECT_REF}"

# --- 6. What is left ---------------------------------------------------------

cat <<'NEXT'

==> Deployed. THREE THINGS THE CLI CANNOT DO REMAIN — see STAGING.md § 2:

    1. create extension pg_cron / pg_net / supabase_vault
    2. vault.create_secret(<service role key>, 'service_role_key')
    3. insert the two rows into public.edge_job_endpoints

    Then re-apply supabase/migrations/20260928090200_scheduled_jobs.sql,
    configure BOTH Paymob integrations' callbacks (STAGING.md § 3), and run:

        node scripts/verify-staging.mjs

NEXT
