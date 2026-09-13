#!/usr/bin/env bash
#
# Applies every migration to a throwaway Postgres database, seeds it, and runs
# the RLS test suite against it.
#
# Usage:
#   PGHOST=/tmp PGPORT=55432 PGUSER=postgres ./scripts/db-test.sh
#
# In CI a plain Postgres service container is enough — the `auth` schema,
# `auth.uid()` and the Supabase roles are recreated by
# supabase/tests/00_platform_shim.sql. Against a real Supabase project the
# platform already provides them, so the shim is never applied there.
set -euo pipefail

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-akla_test}"

export PGHOST PGPORT PGUSER

psql -d postgres -v ON_ERROR_STOP=1 -q -c "drop database if exists ${DB};"
psql -d postgres -v ON_ERROR_STOP=1 -q -c "create database ${DB};"

echo "-> platform shim"
psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_platform_shim.sql

echo "-> migrations"
for file in supabase/migrations/*.sql; do
  echo "   $(basename "${file}")"
  psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f "${file}"
done

echo "-> seed"
psql -d "${DB}" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql

echo "-> tests"
for suite in supabase/tests/0[1-9]*.sql; do
  # Capture first, then filter: piping psql straight into a filter would hide
  # the ERROR line that tells you which assertion failed.
  output="$(psql -d "${DB}" -v ON_ERROR_STOP=1 -f "${suite}" 2>&1)" || {
    echo "${output}" | sed 's/^psql:[^ ]* //'
    echo ""
    echo "DATABASE TESTS FAILED ($(basename "${suite}"))"
    exit 1
  }

  echo "${output}" | sed -e 's/^psql:[^ ]* //' -e '/^NOTICE:  /!d' -e 's/^NOTICE:  //'
done

echo ""
echo "database tests passed"
