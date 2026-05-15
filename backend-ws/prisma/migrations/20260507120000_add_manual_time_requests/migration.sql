-- CreateEnum
CREATE TYPE "ManualTimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "manual_time_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ManualTimeStatus" NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "manual_time_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_time_requests_organization_id_status_idx" ON "manual_time_requests"("organization_id", "status");

-- CreateIndex
CREATE INDEX "manual_time_requests_user_id_start_at_idx" ON "manual_time_requests"("user_id", "start_at");

-- AddForeignKey
ALTER TABLE "manual_time_requests" ADD CONSTRAINT "manual_time_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_time_requests" ADD CONSTRAINT "manual_time_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
