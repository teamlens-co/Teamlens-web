/*
  Warnings:

  - You are about to drop the column `image_data` on the `screenshots` table. All the data in the column will be lost.
  - You are about to drop the `ActivityLog` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `file_path` to the `screenshots` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "users_invited_by_id_idx";

-- DropIndex
DROP INDEX "users_organization_id_idx";

-- AlterTable
ALTER TABLE "live_screen_sessions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "screenshots" DROP COLUMN "image_data",
ADD COLUMN     "file_path" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "ActivityLog";

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "mouse_moves" INTEGER NOT NULL,
    "key_presses" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "clock_in_at" TIMESTAMP(3) NOT NULL,
    "clock_out_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_sessions_pkey" PRIMARY KEY ("id")
);
