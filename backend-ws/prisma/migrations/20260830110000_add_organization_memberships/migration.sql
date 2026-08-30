-- organization_memberships is referenced throughout backend-go (signup, login,
-- invite acceptance, org switching, and every org-scoped query) and exists in
-- prisma/schema.prisma, but no migration ever created it. Existing databases
-- have it from an out-of-band change; a fresh one did not, so signup failed with
-- "relation organization_memberships does not exist".
CREATE TABLE IF NOT EXISTS "organization_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organization_memberships_user_id_organization_id_key"
  ON "organization_memberships" ("user_id", "organization_id");

CREATE INDEX IF NOT EXISTS "organization_memberships_organization_id_idx"
  ON "organization_memberships" ("organization_id");

DO $$
BEGIN
  ALTER TABLE "organization_memberships"
    ADD CONSTRAINT "organization_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "organization_memberships"
    ADD CONSTRAINT "organization_memberships_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill memberships for users that predate this table.
INSERT INTO "organization_memberships" (id, user_id, organization_id, role, created_at, updated_at)
SELECT md5(random()::text || u.id), u.id, u.organization_id, u.role, NOW(), NOW()
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "organization_memberships" m
  WHERE m.user_id = u.id AND m.organization_id = u.organization_id
);
