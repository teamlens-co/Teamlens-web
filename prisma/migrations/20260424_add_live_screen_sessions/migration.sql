CREATE TABLE IF NOT EXISTS "live_screen_sessions" (
  "id" TEXT PRIMARY KEY,
  "manager_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "session_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "session_end" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "live_screen_sessions_manager_id_idx" ON "live_screen_sessions"("manager_id");
CREATE INDEX IF NOT EXISTS "live_screen_sessions_employee_id_idx" ON "live_screen_sessions"("employee_id");
CREATE INDEX IF NOT EXISTS "live_screen_sessions_organization_id_idx" ON "live_screen_sessions"("organization_id");
CREATE INDEX IF NOT EXISTS "live_screen_sessions_status_idx" ON "live_screen_sessions"("status");
