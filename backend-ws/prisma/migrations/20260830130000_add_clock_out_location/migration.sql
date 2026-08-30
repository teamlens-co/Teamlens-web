-- Clock-out never recorded where it happened, so a finished shift could show
-- where someone started but not where they ended.
ALTER TABLE "work_sessions"
  ADD COLUMN IF NOT EXISTS "clock_out_latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clock_out_longitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "clock_out_location_type" TEXT;
