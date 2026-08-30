-- Field tracking: geofenced clock-in, location breadcrumbs, distance and steps.

-- Org-level geofence policy.
--   off   = record location, never restrict (current behaviour)
--   warn  = allow clock-in outside a geofence but flag the session
--   block = reject clock-in outside every office geofence
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "geofence_policy" TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS "location_ping_interval_seconds" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS "track_location_while_clocked_in" BOOLEAN NOT NULL DEFAULT false;

-- Per-session travel rollups, maintained incrementally as pings arrive.
ALTER TABLE "work_sessions"
  ADD COLUMN IF NOT EXISTS "distance_meters" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "step_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "geofence_status" TEXT,
  ADD COLUMN IF NOT EXISTS "office_location_id" TEXT,
  ADD COLUMN IF NOT EXISTS "last_latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "last_location_at" TIMESTAMPTZ(6);

-- Raw location breadcrumbs for a clocked-in session.
CREATE TABLE IF NOT EXISTS "location_pings" (
    "id" BIGSERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "altitude_meters" DOUBLE PRECISION,
    "speed_mps" DOUBLE PRECISION,
    "heading_degrees" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'gps',
    "battery_level" INTEGER,
    "is_moving" BOOLEAN,
    "step_count" INTEGER,
    "segment_meters" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "geofence_status" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "location_pings_pkey" PRIMARY KEY ("id")
);

-- A client retrying a batch must not double-count distance.
CREATE UNIQUE INDEX IF NOT EXISTS "location_pings_session_captured_key"
  ON "location_pings" ("session_id", "captured_at");

CREATE INDEX IF NOT EXISTS "location_pings_session_captured_idx"
  ON "location_pings" ("session_id", "captured_at");

CREATE INDEX IF NOT EXISTS "location_pings_user_captured_idx"
  ON "location_pings" ("user_id", "captured_at");

CREATE INDEX IF NOT EXISTS "location_pings_org_captured_idx"
  ON "location_pings" ("organization_id", "captured_at");
