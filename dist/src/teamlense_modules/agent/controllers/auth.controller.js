"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginAgent = void 0;
const zod_1 = require("zod");
const agent_auth_service_1 = require("../services/agent-auth.service");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    deviceLabel: zod_1.z.string().min(2).max(60).optional(),
});
const loginAgent = async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid login payload",
            issues: parsed.error.flatten(),
        });
        return;
    }
    try {
        const payload = await agent_auth_service_1.AgentAuthService.login({
            email: parsed.data.email,
            password: parsed.data.password,
            ...(parsed.data.deviceLabel ? { deviceLabel: parsed.data.deviceLabel } : {}),
        });
        res.status(200).json({
            success: true,
            data: payload,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to login agent";
        const statusCode = message.includes("Invalid") || message.includes("not active") ? 401 : 500;
        res.status(statusCode).json({
            success: false,
            message,
        });
    }
};
exports.loginAgent = loginAgent;
//# sourceMappingURL=auth.controller.js.map