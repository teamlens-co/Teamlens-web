"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScreenshot = exports.getScreenshots = exports.uploadScreenshot = void 0;
const zod_1 = require("zod");
const screenshot_service_1 = require("../services/screenshot.service");
const uploadScreenshotSchema = zod_1.z.object({
    sessionId: zod_1.z.string().optional(),
    capturedAt: zod_1.z.string().datetime().optional(),
});
const uploadScreenshot = async (req, res) => {
    if (!req.auth || req.auth.tokenType !== "agent") {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    // Check if body contains binary image data
    if (!req.body || req.body.length === 0) {
        res.status(400).json({
            success: false,
            message: "No image data provided",
        });
        return;
    }
    const query = req.query;
    const sessionId = typeof query.sessionId === "string" ? query.sessionId : undefined;
    const capturedAt = typeof query.capturedAt === "string" ? query.capturedAt : undefined;
    try {
        const screenshot = await screenshot_service_1.ScreenshotService.uploadScreenshot({
            userId: req.auth.userId,
            imageData: req.body,
            ...(sessionId ? { sessionId } : {}),
            capturedAt: capturedAt ? new Date(capturedAt) : new Date(),
        });
        res.status(201).json({
            success: true,
            data: {
                id: screenshot.id,
                capturedAt: screenshot.capturedAt,
            },
        });
    }
    catch (error) {
        console.error("Failed to upload screenshot", error);
        res.status(500).json({
            success: false,
            message: "Unable to upload screenshot",
        });
    }
};
exports.uploadScreenshot = uploadScreenshot;
const getScreenshots = async (req, res) => {
    if (!req.auth || (req.auth.tokenType !== "access" && req.auth.tokenType !== "agent")) {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "20", 10);
    try {
        const screenshots = await screenshot_service_1.ScreenshotService.getScreenshots({
            userId: userId || req.auth.userId,
            ...(sessionId ? { sessionId } : {}),
            limit: Math.min(limit, 100),
        });
        res.status(200).json({
            success: true,
            data: screenshots,
        });
    }
    catch (error) {
        console.error("Failed to fetch screenshots", error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch screenshots",
        });
    }
};
exports.getScreenshots = getScreenshots;
const getScreenshot = async (req, res) => {
    if (!req.auth || (req.auth.tokenType !== "access" && req.auth.tokenType !== "agent")) {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const { id } = req.params;
    if (typeof id !== "string") {
        res.status(400).json({
            success: false,
            message: "Invalid screenshot ID",
        });
        return;
    }
    try {
        const screenshot = await screenshot_service_1.ScreenshotService.getScreenshotById(id);
        if (!screenshot) {
            res.status(404).json({
                success: false,
                message: "Screenshot not found",
            });
            return;
        }
        // Return image as binary
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", screenshot.imageData.length);
        res.send(screenshot.imageData);
    }
    catch (error) {
        console.error("Failed to fetch screenshot", error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch screenshot",
        });
    }
};
exports.getScreenshot = getScreenshot;
//# sourceMappingURL=screenshot.controller.js.map