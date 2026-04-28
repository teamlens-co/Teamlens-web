-- CreateTable
CREATE TABLE "screen_recordings" (
    "id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "live_session_id" TEXT,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'video/webm',
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screen_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screen_recordings_manager_id_idx" ON "screen_recordings"("manager_id");

-- CreateIndex
CREATE INDEX "screen_recordings_employee_id_idx" ON "screen_recordings"("employee_id");

-- CreateIndex
CREATE INDEX "screen_recordings_organization_id_idx" ON "screen_recordings"("organization_id");

-- CreateIndex
CREATE INDEX "screen_recordings_recorded_at_idx" ON "screen_recordings"("recorded_at");
