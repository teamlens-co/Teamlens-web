"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptInvite = exports.validateInvite = exports.createInvite = void 0;
const zod_1 = require("zod");
const invite_service_1 = require("../services/invite.service");
const inviteSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    role: zod_1.z.enum(["MANAGER", "EMPLOYEE"]).optional(),
});
const acceptInviteSchema = zod_1.z.object({
    token: zod_1.z.string().min(10),
    fullName: zod_1.z.string().min(2),
    password: zod_1.z.string().min(8),
});
const createInvite = async (req, res) => {
    if (!req.auth) {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid invite payload",
            issues: parsed.error.flatten(),
        });
        return;
    }
    try {
        const invite = await invite_service_1.InviteService.createInvite({
            managerId: req.auth.userId,
            organizationId: req.auth.organizationId,
            email: parsed.data.email,
            role: parsed.data.role ?? "EMPLOYEE",
        });
        res.status(201).json({
            success: true,
            data: invite,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create invite";
        res.status(500).json({
            success: false,
            message,
        });
    }
};
exports.createInvite = createInvite;
const validateInvite = async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) {
        res.status(400).json({
            success: false,
            message: "Missing invite token",
        });
        return;
    }
    try {
        const invite = await invite_service_1.InviteService.validateInvite(token);
        res.status(200).json({
            success: true,
            data: invite,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to validate invite";
        const statusCode = message.includes("expired") || message.includes("active") ? 410 : 404;
        res.status(statusCode).json({
            success: false,
            message,
        });
    }
};
exports.validateInvite = validateInvite;
const acceptInvite = async (req, res) => {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid accept-invite payload",
            issues: parsed.error.flatten(),
        });
        return;
    }
    try {
        const result = await invite_service_1.InviteService.acceptInvite(parsed.data);
        res.status(201).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to accept invite";
        const statusCode = message.includes("expired") || message.includes("active") ? 410 :
            message.includes("exists") ? 409 :
                message.includes("not found") ? 404 : 500;
        res.status(statusCode).json({
            success: false,
            message,
        });
    }
};
exports.acceptInvite = acceptInvite;
//# sourceMappingURL=invite.controller.js.map