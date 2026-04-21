"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createActivity = exports.clockOut = exports.clockIn = exports.getActiveSession = void 0;
const zod_1 = require("zod");
const activity_service_1 = require("../services/activity.service");
const clockInSchema = zod_1.z.object({
    timestamp: zod_1.z.string().datetime().optional(),
});
const clockOutSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(1).optional(),
    timestamp: zod_1.z.string().datetime().optional(),
});
const activitySchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(1).optional(),
    mouseMoves: zod_1.z.number().int().min(0),
    keyPresses: zod_1.z.number().int().min(0),
    capturedAt: zod_1.z.string().datetime().optional(),
});
const getActiveSession = async (req, res) => {
    if (!req.auth || req.auth.tokenType !== "agent") {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const userId = req.auth.userId;
    try {
        const session = await activity_service_1.ActivityService.getActiveSession(userId);
        res.status(200).json({
            success: true,
            data: session,
        });
    }
    catch (error) {
        console.error("Failed to fetch active session", error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch active session",
        });
    }
};
exports.getActiveSession = getActiveSession;
const clockIn = async (req, res) => {
    if (!req.auth || req.auth.tokenType !== "agent") {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const parsed = clockInSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid clock-in payload",
            issues: parsed.error.flatten(),
        });
        return;
    }
    try {
        const payload = {
            userId: req.auth.userId,
            ...(parsed.data.timestamp ? { timestamp: parsed.data.timestamp } : {}),
        };
        const session = await activity_service_1.ActivityService.clockIn(payload);
        res.status(201).json({
            success: true,
            data: session,
        });
    }
    catch (error) {
        console.error("Failed to clock in", error);
        res.status(500).json({
            success: false,
            message: "Unable to start work session",
        });
    }
};
exports.clockIn = clockIn;
const clockOut = async (req, res) => {
    if (!req.auth || req.auth.tokenType !== "agent") {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const parsed = clockOutSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid clock-out payload",
            issues: parsed.error.flatten(),
        });
        return;
    }
    try {
        const payload = {
            userId: req.auth.userId,
            ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
            ...(parsed.data.timestamp ? { timestamp: parsed.data.timestamp } : {}),
        };
        const session = await activity_service_1.ActivityService.clockOut(payload);
        if (!session) {
            res.status(404).json({
                success: false,
                message: "No active session found",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: session,
        });
    }
    catch (error) {
        console.error("Failed to clock out", error);
        res.status(500).json({
            success: false,
            message: "Unable to close work session",
        });
    }
};
exports.clockOut = clockOut;
const createActivity = async (req, res) => {
    if (!req.auth || req.auth.tokenType !== "agent") {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const parsed = activitySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid activity payload",
            issues: parsed.error.flatten(),
        });
        return;
    }
    try {
        const payload = {
            userId: req.auth.userId,
            mouseMoves: parsed.data.mouseMoves,
            keyPresses: parsed.data.keyPresses,
            ...(parsed.data.sessionId ? { sessionId: parsed.data.sessionId } : {}),
            ...(parsed.data.capturedAt ? { capturedAt: parsed.data.capturedAt } : {}),
        };
        const activity = await activity_service_1.ActivityService.create(payload);
        res.status(201).json({
            success: true,
            data: activity,
        });
    }
    catch (error) {
        console.error("Failed to create activity", error);
        res.status(500).json({
            success: false,
            message: "Unable to create activity log",
        });
    }
};
exports.createActivity = createActivity;
//# sourceMappingURL=activity.controller.js.map