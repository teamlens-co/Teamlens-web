-- Add retention settings to organizations
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "screenshot_retention_days" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "recording_retention_days"  INTEGER NOT NULL DEFAULT 30;

-- Indexes to speed up retention cleanup queries
CREATE INDEX IF NOT EXISTS "screenshots_captured_at_idx" ON "screenshots"("captured_at");
CREATE INDEX IF NOT EXISTS "recording_sessions_started_at_idx" ON "recording_sessions"("started_at");
