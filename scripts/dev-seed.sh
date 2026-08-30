#!/usr/bin/env bash
#
# Seeds a local TeamLens org so the dashboard and mobile app are usable
# immediately: one manager (dashboard login), one employee (mobile login), and
# one office geofence.
#
# The Go API must already be running.
#
#   ./scripts/dev-seed.sh
#   OFFICE_LAT=19.0760 OFFICE_LNG=72.8777 ./scripts/dev-seed.sh
#
set -euo pipefail

API="${API_URL:-http://localhost:5000}"

MANAGER_EMAIL="${MANAGER_EMAIL:-manager@teamlens.test}"
MANAGER_PASSWORD="${MANAGER_PASSWORD:-teamlens123}"
EMPLOYEE_EMAIL="${EMPLOYEE_EMAIL:-employee@teamlens.test}"
EMPLOYEE_PASSWORD="${EMPLOYEE_PASSWORD:-teamlens123}"
ORG_NAME="${ORG_NAME:-TeamLens Demo}"

# Default office: central Mumbai. Override with your own coordinates so the
# geofence lines up with where you actually are.
OFFICE_LAT="${OFFICE_LAT:-19.0760}"
OFFICE_LNG="${OFFICE_LNG:-72.8777}"
OFFICE_RADIUS="${OFFICE_RADIUS:-500}"
OFFICE_LABEL="${OFFICE_LABEL:-Head Office}"


say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ─── Wait for the API ──────────────────────────────────────────────────────

say "Waiting for the API at ${API}…"
for _ in $(seq 1 30); do
  if curl -fsS "${API}/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "${API}/health" >/dev/null || { echo "API not reachable at ${API}"; exit 1; }
echo "API is up."

# ─── Manager ───────────────────────────────────────────────────────────────

say "Creating manager ${MANAGER_EMAIL}…"
SIGNUP=$(curl -fsS -X POST "${API}/api/web/auth/signup" \
  -H 'Content-Type: application/json' \
  -d "{\"fullName\":\"Demo Manager\",\"email\":\"${MANAGER_EMAIL}\",\"password\":\"${MANAGER_PASSWORD}\",\"organizationName\":\"${ORG_NAME}\"}" \
  || true)

if echo "${SIGNUP}" | grep -q '"success":true'; then
  echo "Manager created."
else
  echo "Manager already exists (or signup refused); logging in instead."
fi

LOGIN=$(curl -fsS -X POST "${API}/api/web/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${MANAGER_EMAIL}\",\"password\":\"${MANAGER_PASSWORD}\"}")

TOKEN=$(printf '%s' "${LOGIN}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])")
[ -n "${TOKEN}" ] || { echo "Could not obtain a manager token."; exit 1; }
echo "Manager token acquired."

AUTH=(-H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json')

# ─── Office geofence ───────────────────────────────────────────────────────

say "Creating office geofence '${OFFICE_LABEL}' (${OFFICE_LAT}, ${OFFICE_LNG}, ${OFFICE_RADIUS} m)…"
curl -fsS -X POST "${API}/api/web/office-locations" "${AUTH[@]}" \
  -d "{\"label\":\"${OFFICE_LABEL}\",\"latitude\":${OFFICE_LAT},\"longitude\":${OFFICE_LNG},\"radiusMeters\":${OFFICE_RADIUS}}" \
  >/dev/null
echo "Office created."

# ─── Tracking settings ─────────────────────────────────────────────────────

# Route tracking on, but geofence enforcement left at "warn" so a first clock-in
# always succeeds. Flip it to "block" from the dashboard to demo enforcement.
say "Enabling route tracking…"
curl -fsS -X PUT "${API}/api/web/tracking/settings" "${AUTH[@]}" \
  -d '{"trackLocationWhileClockedIn":true,"geofencePolicy":"warn","locationPingIntervalSeconds":60}' \
  >/dev/null
echo "Tracking enabled (ping every 60s, geofence policy: warn)."

# ─── Employee ──────────────────────────────────────────────────────────────
#
# The mobile and desktop clients only accept EMPLOYEE logins, so the manager
# account cannot be used on the phone.

say "Inviting employee ${EMPLOYEE_EMAIL}…"
INVITE=$(curl -fsS -X POST "${API}/api/web/invites" "${AUTH[@]}" \
  -d "{\"email\":\"${EMPLOYEE_EMAIL}\",\"role\":\"EMPLOYEE\"}" || true)

INVITE_TOKEN=$(printf '%s' "${INVITE}" \
  | python3 -c "
import sys, json, urllib.parse
try:
    link = json.load(sys.stdin)['data']['inviteLink']
    print(urllib.parse.parse_qs(urllib.parse.urlparse(link).query)['token'][0])
except Exception:
    print('')
")

if [ -n "${INVITE_TOKEN}" ]; then
  ACCEPT=$(curl -fsS -X POST "${API}/api/web/auth/invite/accept" \
    -H 'Content-Type: application/json' \
    -d "{\"token\":\"${INVITE_TOKEN}\",\"fullName\":\"Demo Employee\",\"password\":\"${EMPLOYEE_PASSWORD}\"}" || true)
  if echo "${ACCEPT}" | grep -q '"success":true'; then
    echo "Employee created."
  else
    echo "Employee already exists — reusing the existing account."
  fi
else
  echo "No new invite issued — the employee likely already exists."
fi

# ─── Summary ───────────────────────────────────────────────────────────────

cat <<SUMMARY

────────────────────────────────────────────────────────────
  Seed complete.

  Dashboard   http://localhost:3000/manager/sign-in
    email     ${MANAGER_EMAIL}
    password  ${MANAGER_PASSWORD}

  Mobile app  (Expo Go)
    email     ${EMPLOYEE_EMAIL}
    password  ${EMPLOYEE_PASSWORD}

  Office geofence: ${OFFICE_LABEL} @ ${OFFICE_LAT}, ${OFFICE_LNG} (${OFFICE_RADIUS} m)
  Re-run with OFFICE_LAT / OFFICE_LNG set to your real coordinates to test
  geofence enforcement properly.
────────────────────────────────────────────────────────────

SUMMARY
