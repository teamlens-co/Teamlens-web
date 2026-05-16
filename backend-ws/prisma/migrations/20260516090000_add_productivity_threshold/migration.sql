ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "productivity_threshold_minutes" INTEGER NOT NULL DEFAULT 180;
