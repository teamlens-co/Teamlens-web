#!/usr/bin/env bash
#
# Feeds a realistic route into the currently clocked-in session, so field
# tracking can be demonstrated without walking three kilometres.
#
# The employee must be clocked in first (from the phone, or via the API).
#
#   ./scripts/dev-simulate-route.sh
#   EMPLOYEE_EMAIL=someone@example.com ./scripts/dev-simulate-route.sh
#
set -euo pipefail

API="${API_URL:-http://localhost:5000}"
EMPLOYEE_EMAIL="${EMPLOYEE_EMAIL:-employee@teamlens.test}"
EMPLOYEE_PASSWORD="${EMPLOYEE_PASSWORD:-teamlens123}"
START_LAT="${START_LAT:-19.0760}"
START_LNG="${START_LNG:-72.8777}"

TOKEN=$(curl -fsS -X POST "${API}/api/mobile/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMPLOYEE_EMAIL}\",\"password\":\"${EMPLOYEE_PASSWORD}\",\"deviceLabel\":\"Route Simulator\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

ACTIVE=$(curl -fsS "${API}/api/mobile/sessions/active" -H "Authorization: Bearer ${TOKEN}")
SESSION=$(printf '%s' "${ACTIVE}" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('data')
print(d['id'] if d else '')")

if [ -z "${SESSION}" ]; then
  echo "Nobody is clocked in. Clock in from the app first, then re-run this."
  exit 1
fi

CLOCKIN=$(printf '%s' "${ACTIVE}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['clockInAt'])")

python3 - "${SESSION}" "${CLOCKIN}" "${START_LAT}" "${START_LNG}" > /tmp/teamlens-route.json <<'PY'
import sys, json, datetime, random, math

session, clockin, lat0, lng0 = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
t0 = datetime.datetime.strptime(clockin, "%Y-%m-%dT%H:%M:%SZ")
random.seed(11)
pings = []

def ping(minute, lat, lng, steps, moving):
    return {
        "capturedAt": (t0 + datetime.timedelta(minutes=minute)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "latitude": lat, "longitude": lng,
        "accuracyMeters": 7.0, "source": "gps",
        "batteryLevel": max(25, 95 - minute // 4),
        "isMoving": moving, "stepCount": steps,
    }

# 30 minutes parked at the start point — only GPS jitter, which must not count
# as travelled distance.
for m in range(1, 32, 5):
    pings.append(ping(m, lat0 + random.uniform(-3e-5, 3e-5),
                         lng0 + random.uniform(-3e-5, 3e-5), 0, False))

# A curved drive out to a client site.
for i, m in enumerate(range(36, 71, 4)):
    f = (i + 1) / 9
    pings.append(ping(m, lat0 - 0.018 * f, lng0 + 0.022 * math.sin(f * 2.2), int(900 * f), True))

# 35 minutes at the client site.
for m in range(74, 110, 5):
    pings.append(ping(m, lat0 - 0.018 + random.uniform(-3e-5, 3e-5),
                         lng0 + 0.0176 + random.uniform(-3e-5, 3e-5), 920, False))

# The return leg.
for i, m in enumerate(range(114, 141, 4)):
    f = (i + 1) / 7
    pings.append(ping(m, lat0 - 0.018 + 0.018 * f, lng0 + 0.0176 - 0.016 * f, int(920 + 400 * f), True))

print(json.dumps({"sessionId": session, "pings": pings}))
PY

curl -fsS -X POST "${API}/api/mobile/location/pings" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
  -d @/tmp/teamlens-route.json \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f\"Accepted {d['accepted']} breadcrumbs ({d['duplicates']} duplicates, {d['rejected']} rejected)\")
print(f\"Distance: {d['distanceMeters']/1000:.2f} km   Steps: {d['stepCount']}\")
print('Open Dashboard -> Field Tracking and click the employee.')"
