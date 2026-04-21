"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScreenshotService = void 0;
const prisma_1 = require("../../../shared/db/prisma");
exports.ScreenshotService = {
    async uploadScreenshot(payload) {
        const screenshot = await prisma_1.prisma.screenshot.create({
            data: {
                userId: payload.userId,
                sessionId: payload.sessionId ?? null,
                imageData: payload.imageData,
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
    async getScreenshots(payload) {
        const screenshots = await prisma_1.prisma.screenshot.findMany({
            where: {
                userId: payload.userId,
                ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
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
    async getScreenshotById(id) {
        const screenshot = await prisma_1.prisma.screenshot.findUnique({
            where: { id },
        });
        return screenshot;
    },
    async deleteScreenshot(id) {
        return prisma_1.prisma.screenshot.delete({
            where: { id },
        });
    },
    async deleteOldScreenshots(daysOld = 7) {
        const date = new Date();
        date.setDate(date.getDate() - daysOld);
        return prisma_1.prisma.screenshot.deleteMany({
            where: {
                createdAt: {
                    lt: date,
                },
            },
        });
    },
};
//# sourceMappingURL=screenshot.service.js.map