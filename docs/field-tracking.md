# Field tracking

Geofenced clock-in, route tracking, distance, steps, and stop detection — the
Jibble-style capability for staff who work away from a desk.

## What each part does

| Piece | Location |
| --- | --- |
| Schema | `backend-ws/prisma/migrations/20260830120000_add_field_tracking/` |
| Ingest, distance, stops | `backend-go/internal/services/tracking_service.go` |
| Geofence matching | `backend-go/internal/services/location_service.go` |
| Clock-in enforcement | `backend-go/internal/services/activity_service.go` |
| Client API | `backend-go/internal/handlers/agent/tracking_handler.go` |
| Manager API | `backend-go/internal/handlers/web/tracking_handler.go` |
| Manager UI | `frontend/app/dashboard/field-tracking/page.tsx` |
| Map rendering | `frontend/components/RouteMap.tsx` (Leaflet + OpenStreetMap) |
| Phone app | `mobile/` |

## Data model

`location_pings` stores one row per breadcrumb. `work_sessions` carries the
rollups (`distance_meters`, `step_count`, `geofence_status`, `last_latitude`,
`last_longitude`, `last_location_at`) so the live map and summary tables never
have to scan the breadcrumb table.

A unique index on `(session_id, captured_at)` makes ingest idempotent: a client
replaying a batch after a network failure cannot double-count distance.

Stops are **not** stored. They are derived from the breadcrumbs on read, so
tuning the algorithm re-labels history instead of requiring a backfill.

## Org settings

On `organizations`:

- `geofence_policy` — `off` (record only), `warn` (allow, flag the session), or
  `block` (refuse clock-in outside every office radius). Defaults to `off`, so
  existing orgs are unaffected until someone opts in.
- `location_ping_interval_seconds` — how often clients report. Default 120.
- `track_location_while_clocked_in` — master switch for route tracking.

Managers change these at **Dashboard → Field Tracking**, or via
`PUT /api/web/tracking/settings`.

## How the numbers are computed

### Distance

Raw phone GPS is noisy enough that naively summing every fix makes a stationary
device "walk" several kilometres a day. A segment counts only if it clears three
gates (`tracking_service.go`):

1. **Accuracy** — fixes worse than 100 m are dropped entirely.
2. **Noise floor** — the segment must exceed the fixes' own error budget, with a
   10 m floor. A fix good to 5 m can prove a 12 m walk; one good to 80 m cannot.
3. **Plausible speed** — anything over 55 m/s (~198 km/h) is a bad fix, not a
   commute.

Distance accumulates incrementally at ingest, so the running total is available
without re-reading the trail.

### Steps

Steps come from the device pedometer as a **cumulative count since clock-in**.
The server keeps the highest value it has seen, so duplicate or out-of-order
batches can never walk the total backwards.

Platform differences are handled in `mobile/src/tracking/pedometer.ts`: iOS
queries CoreMotion history for the shift interval (accurate even if the app was
killed mid-shift), while Android has no history API and instead subtracts a
baseline captured at clock-in.

### Stops

`detectStops` walks the trail in time order and groups consecutive fixes that
stay within 75 m of their running centroid. A group lasting 5 minutes or more
becomes a stop. This answers "when did they stop, and for how long", and a stop
falling inside an office radius is labelled with that office's name.

### Tuning

The constants live at the top of `tracking_service.go`. If field staff report
under-counted distance, lower `minSegmentMeters`; if a stationary phone still
accumulates distance, raise it or lower `maxAccuracyMeters`. `minStopSeconds`
controls how brief a pause counts as a stop — raise it if traffic lights are
showing up as visits.

## API

### Clients (desktop agent and phone)

Mounted under both `/api/agent` and `/api/mobile`.

```
POST /location/pings      { sessionId?, pings: [...] } -> counts + running totals
GET  /tracking/settings   -> whether to track, and how often
```

`POST /sessions/clock-in` now returns **403** when the org enforces geofencing
and the caller is outside every office. The body's `issues` field carries the
`GeofenceMatch` — nearest office, its label, the distance, and the radius — so
the client can say *"You are 820 m from Andheri HQ"* rather than just refusing.

Clock-in with `geofence_policy = block` and **no coordinates** is also refused;
otherwise the rule would be bypassable by omitting the location.

### Managers

```
GET /api/web/tracking/live                      -> last known position of everyone on shift
GET /api/web/tracking/sessions?startDate&endDate -> shift history, active and completed
GET /api/web/tracking/sessions/{sessionId}      -> breadcrumbs, stops, totals, both endpoints
GET /api/web/tracking/summary?startDate&endDate -> per-employee travel rollup
GET /api/web/tracking/settings
PUT /api/web/tracking/settings
```

`GET /tracking/sessions/{id}` is readable by a manager, or by the employee whose
session it is.

### Mobile bootstrap

`GET /api/mobile/bootstrap` returns the active session, tracking settings, and
office geofences in one call, so the app can draw the geofences and pre-check
clock-in locally before spending a round trip.

## Privacy

Tracking runs **only while clocked in**. `stopTracking()` is called on clock-out
and on sign-out, and the background task stops itself if it wakes to find no
session. Android shows a persistent foreground-service notification for the
whole shift; iOS shows the blue location indicator. Both permission strings say
explicitly that tracking stops at clock-out.

Consider your jurisdiction's rules on employee location monitoring before
enabling `block` or continuous tracking — in several of them, notice and consent
are legal requirements, not courtesies.

## Offline behaviour

Field staff lose signal constantly. Breadcrumbs are written to a disk-backed
queue (`mobile/src/services/storage.ts`) before any upload is attempted, and
flushed oldest-first when the network returns. Only what the server accepted is
removed from the queue. The queue is capped at 2000 entries, dropping the oldest
first, so a long offline stretch cannot fill the device.

## Testing

```bash
cd backend-go && go test ./internal/services/
```

18 tests cover the distance gates (jitter rejection, speed sanity, real
movement), stop detection (long dwell, brief pause, multiple visits, office
labelling), and geofence matching (inside, nearest-office reporting, containing
office preferred over a nearer one, and orgs with no offices configured).

## Known gaps

- **Stop counts in the summary** replay stop detection over every breadcrumb in
  the range on each request. Fine for a team; add a materialised rollup before
  this runs over months of data for a large org.
- **Tile provider.** The map uses openstreetmap.org tiles, which need no API key
  but whose usage policy forbids heavy production traffic. Before customers use
  this, point `TILE_URL` in `RouteMap.tsx` at MapTiler, Stadia, Mapbox, or a
  self-hosted tile server. Nothing else changes.
- **Battery.** Ping interval is the main lever; 120 s is a reasonable default,
  60 s noticeably costs battery on older Android hardware.
