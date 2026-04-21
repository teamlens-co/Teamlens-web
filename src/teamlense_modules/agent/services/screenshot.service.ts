import { prisma } from "../../../shared/db/prisma";

type UploadScreenshotPayload = {
  userId: string;
  filePath: string;
  sessionId?: string;
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
    const screenshot = await prisma.screenshot.create({
      data: {
        userId: payload.userId,
        sessionId: payload.sessionId ?? null,
        filePath: payload.filePath,
        capturedAt: payload.capturedAt,
      },
      select: {
        id: true,
        userId: true,
        sessionId: true,
        capturedAt: true,
        createdAt: true,
      },
    });

    return screenshot;
  },

  async getScreenshots(payload: GetScreenshotsPayload) {
    const screenshots = await prisma.screenshot.findMany({
      where: {
        userId: payload.userId,
        ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
        ...(payload.startDate || payload.endDate ? {
          capturedAt: {
            ...(payload.startDate ? { gte: payload.startDate } : {}),
            ...(payload.endDate ? { lte: payload.endDate } : {}),
          }
        } : {}),
      },
      select: {
        id: true,
        userId: true,
        sessionId: true,
        capturedAt: true,
        createdAt: true,
      },
      orderBy: {
        capturedAt: "desc",
      },
      take: payload.limit,
    });

    return screenshots;
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
