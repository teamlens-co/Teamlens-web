CREATE TYPE "ActivityCategory" AS ENUM ('PRODUCTIVE', 'UNPRODUCTIVE', 'NEUTRAL');
CREATE TYPE "ActivityTargetType" AS ENUM ('APP', 'DOMAIN', 'URL');

ALTER TABLE "screenshots"
  ADD COLUMN IF NOT EXISTS "active_application" TEXT,
  ADD COLUMN IF NOT EXISTS "window_title" TEXT,
  ADD COLUMN IF NOT EXISTS "domain" TEXT,
  ADD COLUMN IF NOT EXISTS "url" TEXT,
  ADD COLUMN IF NOT EXISTS "employee_name" TEXT,
  ADD COLUMN IF NOT EXISTS "project_name" TEXT;

CREATE TABLE IF NOT EXISTS "activity_usage_logs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "session_id" TEXT,
  "target_type" "ActivityTargetType" NOT NULL,
  "app_name" TEXT NOT NULL,
  "window_title" TEXT,
  "domain" TEXT,
  "url" TEXT,
  "category" "ActivityCategory" NOT NULL DEFAULT 'NEUTRAL',
  "duration_seconds" INTEGER NOT NULL DEFAULT 0,
  "idle_seconds" INTEGER NOT NULL DEFAULT 0,
  "is_idle" BOOLEAN NOT NULL DEFAULT false,
  "captured_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "activity_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "classification_rules" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "target_type" "ActivityTargetType" NOT NULL,
  "target_value" TEXT NOT NULL,
  "category" "ActivityCategory" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "classification_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activity_usage_logs_organization_id_captured_at_idx" ON "activity_usage_logs"("organization_id", "captured_at");
CREATE INDEX IF NOT EXISTS "activity_usage_logs_user_id_captured_at_idx" ON "activity_usage_logs"("user_id", "captured_at");
CREATE INDEX IF NOT EXISTS "activity_usage_logs_session_id_idx" ON "activity_usage_logs"("session_id");
CREATE INDEX IF NOT EXISTS "activity_usage_logs_target_type_app_name_idx" ON "activity_usage_logs"("target_type", "app_name");
CREATE INDEX IF NOT EXISTS "activity_usage_logs_domain_idx" ON "activity_usage_logs"("domain");
CREATE INDEX IF NOT EXISTS "classification_rules_organization_id_idx" ON "classification_rules"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "classification_rules_organization_id_target_type_target_value_key"
  ON "classification_rules"("organization_id", "target_type", "target_value");
