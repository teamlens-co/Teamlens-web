-- CreateTable
CREATE TABLE "screenshots" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "image_data" BYTEA NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "screenshots_user_id_captured_at_idx" ON "screenshots"("user_id", "captured_at");

-- CreateIndex
CREATE INDEX "screenshots_session_id_idx" ON "screenshots"("session_id");
