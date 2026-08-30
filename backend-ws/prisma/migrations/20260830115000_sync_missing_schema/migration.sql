-- Closes drift between prisma/schema.prisma (and the Go queries) and the
-- migration chain. Every object below is referenced by backend-go but was never
-- created by a migration, so a database built purely from migrations could not
-- serve signup, login, teams, or the superadmin views. Existing deployments have
-- these from out-of-band changes; all statements are idempotent so re-running is
-- safe there.

-- ─── organizations: subscription and status columns ───────────────────────
-- Read by middleware.AuthMiddleware (is_active) and the superadmin handlers.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "subscription_plan" TEXT NOT NULL DEFAULT 'BASIC',
  ADD COLUMN IF NOT EXISTS "subscription_price" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS "employee_limit" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "billing_cycle" TEXT NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN IF NOT EXISTS "renewal_date" TIMESTAMP(3);

-- ─── teams: organization scoping ──────────────────────────────────────────
-- team_service.go filters every query by t.organization_id.
ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- Backfill from the team's manager, then enforce the constraint.
UPDATE "teams" t
SET organization_id = u.organization_id
FROM "users" u
WHERE u.id = t.manager_id AND t.organization_id IS NULL;

DELETE FROM "teams" WHERE organization_id IS NULL;

ALTER TABLE "teams" ALTER COLUMN "organization_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "teams_organization_id_idx"
  ON "teams" ("organization_id");

DO $$
BEGIN
  ALTER TABLE "teams"
    ADD CONSTRAINT "teams_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── leads ────────────────────────────────────────────────────────────────
-- Backing table for the superadmin CRM views in lead_handler.go.
DO $$
BEGIN
  CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'LOST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "phone" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" ("status");
