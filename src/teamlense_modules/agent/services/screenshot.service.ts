import { prisma } from "../../../shared/db/prisma";

type UploadScreenshotPayload = {
  userId: string;
  filePath: string;
  sessionId?: string;
  activeApplication?: string;
  windowTitle?: string;
  domain?: string;
  url?: string;
  employeeName?: string;
  projectName?: string;
  capturedAt: Date;
};

type GetScreenshotsPayload = {
  userId: string;
  sessionId?: string;
  limit: number;
  startDate?: Date;
  endDate?: Date;
};

export const ScreenshotService = {
  async uploadScreenshot(payload: UploadScreenshotPayload) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "active_application" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "window_title" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "domain" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "url" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "employee_name" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "screenshots" ADD COLUMN IF NOT EXISTS "project_name" TEXT`);

    const id = crypto.randomUUID();
    const rows = (await prisma.$queryRawUnsafe(
      `INSERT INTO "screenshots"
        ("id", "user_id", "session_id", "file_path", "active_application", "window_title",
         "domain", "url", "employee_name", "project_name", "captured_at", "created_at")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING "id", "user_id" AS "userId", "session_id" AS "sessionId",
                 "active_application" AS "activeApplication", "window_title" AS "windowTitle",
                 "domain", "url", "employee_name" AS "employeeName", "project_name" AS "projectName",
                 "captured_at" AS "capturedAt", "created_at" AS "createdAt"`,
      id,
      payload.userId,
      payload.sessionId ?? null,
      payload.filePath,
      payload.activeApplication ?? null,
      payload.windowTitle ?? null,
      payload.domain ?? null,
      payload.url ?? null,
      payload.employeeName ?? null,
      payload.projectName ?? null,
      payload.capturedAt,
    )) as Array<Record<string, unknown>>;

    return rows[0];
  },

  async getScreenshots(payload: GetScreenshotsPayload) {
    const filters = [
      `"user_id" = $1`,
      payload.sessionId ? `"session_id" = $2` : "",
      payload.startDate ? `"captured_at" >= $${payload.sessionId ? 3 : 2}` : "",
      payload.endDate ? `"captured_at" <= $${payload.sessionId ? (payload.startDate ? 4 : 3) : payload.startDate ? 3 : 2}` : "",
    ].filter(Boolean);

    const values: unknown[] = [payload.userId];
    if (payload.sessionId) values.push(payload.sessionId);
    if (payload.startDate) values.push(payload.startDate);
    if (payload.endDate) values.push(payload.endDate);
    values.push(payload.limit);

    return prisma.$queryRawUnsafe(
      `SELECT "id", "user_id" AS "userId", "session_id" AS "sessionId",
              "active_application" AS "activeApplication", "window_title" AS "windowTitle",
              "domain", "url", "employee_name" AS "employeeName", "project_name" AS "projectName",
              "captured_at" AS "capturedAt", "created_at" AS "createdAt"
       FROM "screenshots"
       WHERE ${filters.join(" AND ")}
       ORDER BY "captured_at" DESC
       LIMIT $${values.length}`,
      ...values,
    );
  },

  async getScreenshotById(id: string) {
    const screenshot = await prisma.screenshot.findUnique({
      where: { id },
    });

    return screenshot;
  },

  async deleteScreenshot(id: string) {
    return prisma.screenshot.delete({
      where: { id },
    });
  },

  async deleteOldScreenshots(daysOld: number = 7) {
    const date = new Date();
    date.setDate(date.getDate() - daysOld);

    return prisma.screenshot.deleteMany({
      where: {
        createdAt: {
          lt: date,
        },
      },
    });
  },
};
