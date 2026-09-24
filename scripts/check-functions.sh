#!/usr/bin/env bash
#
# Type-checks every edge function against ITS OWN deno.json.
#
#   npm run fn:check
#
# Discovered from the filesystem rather than listed here. The list used to be
# hard-coded in package.json, which meant a new function was silently
# unchecked — the failure mode of every hand-maintained list, and an expensive
# one when the thing not being checked is a payment webhook.
#
# Each function is checked with its OWN config, because that is what the hosted
# bundler reads. A shared config type-checks locally and then fails on deploy
# with "Relative import path not prefixed with ./" — see the note in
# supabase/functions/ai-suggest/deno.json.
set -euo pipefail

cd "$(dirname "$0")/.."

count=0
for entry in supabase/functions/*/index.ts; do
  dir="$(dirname "${entry}")"
  name="$(basename "${dir}")"

  if [ ! -f "${dir}/deno.json" ]; then
    echo "✗ ${name} has no deno.json of its own; the deploy will not resolve its imports."
    exit 1
  fi

  deno check --min-dep-age 0 \
    --config "${dir}/deno.json" \
    --lock supabase/functions/deno.lock \
    "${entry}"
  count=$((count + 1))
done

echo "${count} edge functions type-check against their own config."
