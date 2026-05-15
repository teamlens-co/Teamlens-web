CREATE TABLE IF NOT EXISTS "teams" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "manager_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "teams_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "teams_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "team_memberships" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "team_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "teams_manager_id_idx" ON "teams"("manager_id");
CREATE UNIQUE INDEX IF NOT EXISTS "team_memberships_team_id_user_id_key" ON "team_memberships"("team_id", "user_id");
CREATE INDEX IF NOT EXISTS "team_memberships_user_id_idx" ON "team_memberships"("user_id");
