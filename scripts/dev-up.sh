#!/usr/bin/env bash
#
# Brings the whole local stack up: PostgreSQL, the Go API, the Next.js
# dashboard, and the Expo dev server.
#
#   ./scripts/dev-up.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="/Applications/Postgres.app/Contents/Versions/16/bin"
PGDATA="${HOME}/Library/Application Support/Postgres/var-16"
export PATH="${PGBIN}:${PATH}"

# The phone reaches the API over the LAN, so it needs this machine's address
# rather than localhost.
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"

echo "▸ PostgreSQL"
if "${PGBIN}/pg_isready" -q -p 5432 2>/dev/null; then
  echo "  already running"
else
  "${PGBIN}/pg_ctl" -D "${PGDATA}" -l "${PGDATA}/server.log" -o "-p 5432" start >/dev/null
  until "${PGBIN}/pg_isready" -q -p 5432; do sleep 1; done
  echo "  started"
fi

echo "▸ Go API on :5000"
pkill -f 'teamlens-api' 2>/dev/null || true
(cd "${REPO_ROOT}/backend-go" && go build -o /tmp/teamlens-api ./cmd/server && /tmp/teamlens-api >/tmp/teamlens-api.log 2>&1 &)
until curl -fsS http://localhost:5000/health >/dev/null 2>&1; do sleep 1; done
echo "  healthy"

echo "▸ Dashboard on :3000"
pkill -f 'next dev' 2>/dev/null || true
(cd "${REPO_ROOT}/frontend" && npm run dev >/tmp/teamlens-frontend.log 2>&1 &)

echo "▸ Expo on :8081"
pkill -f 'expo start' 2>/dev/null || true
(cd "${REPO_ROOT}/mobile" && EXPO_PUBLIC_API_URL="http://${LAN_IP}:5000" npx expo start --lan)
