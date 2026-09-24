#!/usr/bin/env bash
#
# A THROWAWAY LOCAL DATABASE with the whole commerce flow in it.
#
#   ./scripts/db-local.sh          # build it
#   npm run db:local               # the same
#
# Why this exists: the bundled demo catalogue lives in memory, which is enough
# for the sourcing panel and a guest cart and NOT enough for
# `create_order_draft` — that function reads `merchant_products`, locks a
# `carts` row and joins to `merchants`. Without real rows, the only way to
# exercise it was to hand-write fixtures inside a test, which tests the
# function against a shape nobody ships.
#
# So: migrations, the ingredient seed, and the demo catalogue as actual rows,
# with the branch switched ON so an authenticated user can walk
#
#   cart -> address -> validation -> create_order_draft -> payment
#
# Resetting is re-running it. It drops the database first, every time.
#
# NEVER POINT THIS AT HOSTED SUPABASE. The fixture itself refuses unless
# `akalt.local_fixture` is set and no real merchant exists, but the first line
# of defence is not running it against anything you care about.
set -euo pipefail

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-akla_local}"

export PGHOST PGPORT PGUSER

echo "-> ${DB} on ${PGHOST}:${PGPORT}"
psql -d postgres -v ON_ERROR_STOP=1 -q -c "drop database if exists ${DB};"
psql -d postgres -v ON_ERROR_STOP=1 -q -c "create database ${DB};"

echo "-> platform shim (auth schema, auth.uid(), the Supabase roles)"
psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_platform_shim.sql

echo "-> migrations"
for file in supabase/migrations/*.sql; do
  psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f "${file}"
done

echo "-> seed (ingredients, recipes, price estimates)"
psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql

echo "-> demo catalogue as rows"
psql -d "${DB}" -v ON_ERROR_STOP=1 -q \
  -c "set akalt.local_fixture = 'yes';" \
  -f supabase/fixtures/commerce-demo.generated.sql

psql -d "${DB}" -v ON_ERROR_STOP=1 -qAt -c "
  select '   merchants: '   || (select count(*) from public.merchants where is_demo)
      || ', branches: '     || (select count(*) from public.merchant_locations)
      || ', products: '     || (select count(*) from public.merchant_products)
      || ', mappings: '     || (select count(*) from public.ingredient_product_mappings)
      || ', areas: '        || (select count(*) from public.delivery_areas);
"

echo ""
echo "ready. Connect with:  psql -h ${PGHOST} -p ${PGPORT} -U ${PGUSER} -d ${DB}"
