type UploadScreenshotPayload = {
    userId: string;
    imageData: Buffer;
    sessionId?: string;
    capturedAt: Date;
};
type GetScreenshotsPayload = {
    userId: string;
    sessionId?: string;
    limit: number;
};
export declare const ScreenshotService: {
    uploadScreenshot(payload: UploadScreenshotPayload): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        sessionId: string | null;
        capturedAt: Date;
    }>;
    getScreenshots(payload: GetScreenshotsPayload): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        sessionId: string | null;
        capturedAt: Date;
    }[]>;
    getScreenshotById(id: string): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        sessionId: string | null;
        capturedAt: Date;
        imageData: Buffer;
    } | null>;
    deleteScreenshot(id: string): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        sessionId: string | null;
        capturedAt: Date;
        imageData: Buffer;
    }>;
    deleteOldScreenshots(daysOld?: number): Promise<import(".prisma/client").Prisma.BatchPayload>;
};
export {};
//# sourceMappingURL=screenshot.service.d.ts.map