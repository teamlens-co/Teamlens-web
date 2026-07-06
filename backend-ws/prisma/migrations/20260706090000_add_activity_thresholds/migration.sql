-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "min_mouse_moves_per_active_window" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "min_key_presses_per_active_window" INTEGER NOT NULL DEFAULT 0;
