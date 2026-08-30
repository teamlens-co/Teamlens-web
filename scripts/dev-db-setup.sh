#!/usr/bin/env bash
#
# Creates the local TeamLens database and applies the full schema.
# Expects a running PostgreSQL whose client tools are on PATH.
#
set -euo pipefail

DB_NAME="${DB_NAME:-teamlens_dev}"
DB_USER="${DB_USER:-teamlens}"
DB_PASSWORD="${DB_PASSWORD:-teamlens_dev}"
SUPERUSER="${SUPERUSER:-$(whoami)}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Creating role '${DB_USER}'…"
psql -U "${SUPERUSER}" -d postgres -v ON_ERROR_STOP=0 -c \
  "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}' CREATEDB;" 2>/dev/null \
  || echo "  role already exists"

echo "Creating database '${DB_NAME}'…"
psql -U "${SUPERUSER}" -d postgres -v ON_ERROR_STOP=0 -c \
  "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null \
  || echo "  database already exists"

echo "Applying migrations…"
# The Prisma migration chain — not schema.sql — is the authoritative schema.
# schema.sql is a snapshot that has fallen behind (it predates
# organization_memberships and the retention columns), so a fresh database is
# built by replaying the migrations in timestamp order.
for migration in $(ls -1 "${REPO_ROOT}"/backend-ws/prisma/migrations/*/migration.sql | sort); do
  printf '  %s\n' "$(basename "$(dirname "${migration}")")"
  PGPASSWORD="${DB_PASSWORD}" psql -U "${DB_USER}" -h localhost -d "${DB_NAME}" \
    -v ON_ERROR_STOP=1 -q -f "${migration}"
done

echo "Verifying field-tracking objects…"
PGPASSWORD="${DB_PASSWORD}" psql -U "${DB_USER}" -h localhost -d "${DB_NAME}" -tAc "
SELECT
  (SELECT count(*) FROM information_schema.tables  WHERE table_name = 'location_pings')                                    AS pings_table,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'work_sessions'  AND column_name = 'distance_meters') AS distance_col,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'organizations'  AND column_name = 'geofence_policy') AS policy_col;
"

echo "Database ready: postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
