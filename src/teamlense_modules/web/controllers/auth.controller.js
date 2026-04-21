"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeamUsers = exports.createAgentConnectToken = exports.getMe = exports.logout = exports.login = exports.signupManager = void 0;
const zod_1 = require("zod");
const auth_service_1 = require("../services/auth.service");
const baseCookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
};
const shouldUseSecureCookie = (req) => {
    const explicit = process.env.COOKIE_SECURE?.trim().toLowerCase();
    if (explicit === "true")
        return true;
    if (explicit === "false")
        return false;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    return req.secure || proto === "https";
};
const setAuthCookie = (req, res, token) => {
    res.cookie("teamlens_access_token", token, {
        ...baseCookieOptions,
        secure: shouldUseSecureCookie(req),
        maxAge: 1000 * 60 * 60,
    });
};
const clearAuthCookie = (req, res) => {
    res.clearCookie("teamlens_access_token", {
        ...baseCookieOptions,
        secure: shouldUseSecureCookie(req),
    });
};
const managerSignupSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    organizationName: zod_1.z.string().min(2),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
const connectAgentSchema = zod_1.z.object({
    label: zod_1.z.string().min(2).max(60).optional(),
});
const signupManager = async (req, res) => {
    const parsed = managerSignupSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid signup payload",
            issues: parsed.error.flatten(),
        });
        return;
    }
    try {
        const result = await auth_service_1.AuthService.signupManager(parsed.data);
        setAuthCookie(req, res, result.accessToken);
        res.status(201).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to sign up manager";
        const statusCode = message.includes("already") ? 409 : 500;
        res.status(statusCode).json({
            success: false,
            message,
        });
    }
};
exports.signupManager = signupManager;
const login = async (req, res) => {
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
        const result = await auth_service_1.AuthService.login(parsed.data);
        setAuthCookie(req, res, result.accessToken);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to login";
        const statusCode = message.includes("Invalid") || message.includes("not active") ? 401 : 500;
        res.status(statusCode).json({
            success: false,
            message,
        });
    }
};
exports.login = login;
const logout = async (req, res) => {
    clearAuthCookie(req, res);
    res.status(200).json({
        success: true,
        message: "Logged out",
    });
};
exports.logout = logout;
const getMe = async (req, res) => {
    if (!req.auth) {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    try {
        const me = await auth_service_1.AuthService.me(req.auth.userId);
        res.status(200).json({
            success: true,
            data: me,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to get profile";
        res.status(500).json({
            success: false,
            message,
        });
    }
};
exports.getMe = getMe;
const createAgentConnectToken = async (req, res) => {
    if (!req.auth) {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const parsed = connectAgentSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            success: false,
            message: "Invalid agent connect payload",
            issues: parsed.error.flatten(),
        });
        return;
    }
    try {
        const payload = {
            userId: req.auth.userId,
            organizationId: req.auth.organizationId,
            role: req.auth.role,
            ...(parsed.data.label ? { label: parsed.data.label } : {}),
        };
        const tokenData = await auth_service_1.AuthService.createAgentConnectToken(payload);
        res.status(201).json({
            success: true,
            data: tokenData,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create agent token";
        res.status(500).json({
            success: false,
            message,
        });
    }
};
exports.createAgentConnectToken = createAgentConnectToken;
const getTeamUsers = async (req, res) => {
    if (!req.auth) {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    try {
        const users = await auth_service_1.AuthService.getTeamUsers(req.auth.organizationId);
        res.status(200).json({
            success: true,
            data: users,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unable to get team users";
        res.status(500).json({
            success: false,
            message,
        });
    }
};
exports.getTeamUsers = getTeamUsers;
//# sourceMappingURL=auth.controller.js.map