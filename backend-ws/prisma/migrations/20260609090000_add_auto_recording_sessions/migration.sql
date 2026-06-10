ALTER TABLE "work_sessions"
  ADD COLUMN IF NOT EXISTS "is_recording" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "recording_started_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "recording_stopped_at" TIMESTAMPTZ;

ALTER TABLE "screen_recordings"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "retention_hours" INTEGER NOT NULL DEFAULT 48;

CREATE TABLE IF NOT EXISTS "recording_sessions" (
  "id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "work_session_id" TEXT,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "stopped_at" TIMESTAMPTZ,
  "fps" INTEGER NOT NULL DEFAULT 10,
  "width" INTEGER NOT NULL DEFAULT 0,
  "height" INTEGER NOT NULL DEFAULT 0,
  "codec" TEXT NOT NULL DEFAULT 'vp8',
  "mime_type" TEXT NOT NULL DEFAULT 'video/webm',
  "status" TEXT NOT NULL DEFAULT 'recording',
  "total_size" BIGINT NOT NULL DEFAULT 0,
  "duration_ms" BIGINT NOT NULL DEFAULT 0,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "recording_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recording_chunks" (
  "id" TEXT NOT NULL,
  "recording_session_id" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "file_path" TEXT NOT NULL,
  "file_size" BIGINT NOT NULL DEFAULT 0,
  "duration_ms" BIGINT NOT NULL DEFAULT 0,
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "recording_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "recording_chunks_session_index_key"
  ON "recording_chunks"("recording_session_id", "chunk_index");
CREATE INDEX IF NOT EXISTS "recording_sessions_org_started_idx"
  ON "recording_sessions"("organization_id", "started_at");
CREATE INDEX IF NOT EXISTS "recording_sessions_employee_started_idx"
  ON "recording_sessions"("employee_id", "started_at");
CREATE INDEX IF NOT EXISTS "recording_sessions_cleanup_idx"
  ON "recording_sessions"("started_at", "deleted_at");
CREATE INDEX IF NOT EXISTS "recording_sessions_status_idx"
  ON "recording_sessions"("status");
CREATE INDEX IF NOT EXISTS "recording_chunks_session_idx"
  ON "recording_chunks"("recording_session_id", "chunk_index");
CREATE INDEX IF NOT EXISTS "screen_recordings_deleted_at_idx"
  ON "screen_recordings"("deleted_at");

ALTER TABLE "recording_chunks"
  ADD CONSTRAINT "recording_chunks_recording_session_id_fkey"
  FOREIGN KEY ("recording_session_id") REFERENCES "recording_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
