"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachOptionalAuth = exports.requireRole = exports.requireAuth = void 0;
const prisma_1 = require("../db/prisma");
const crypto_1 = require("../auth/crypto");
const jwt_1 = require("../auth/jwt");
const unauthorized = (res, message = "Unauthorized") => {
    return res.status(401).json({
        success: false,
        message,
    });
};
const extractBearerToken = (req) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return null;
    }
    return header.slice(7).trim();
};
const extractCookieToken = (req) => {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
        return null;
    }
    const cookies = cookieHeader.split(";").map((item) => item.trim());
    const sessionCookie = cookies.find((item) => item.startsWith("teamlens_access_token="));
    if (!sessionCookie) {
        return null;
    }
    const value = sessionCookie.slice("teamlens_access_token=".length).trim();
    return value.length > 0 ? decodeURIComponent(value) : null;
};
const extractToken = (req) => {
    return extractBearerToken(req) ?? extractCookieToken(req);
};
const assertActiveAgentToken = async (token) => {
    if (!prisma_1.prisma.$queryRawUnsafe) {
        return false;
    }
    const tokenHash = (0, crypto_1.sha256)(token);
    const rows = (await prisma_1.prisma.$queryRawUnsafe(`SELECT "id"
     FROM "agent_tokens"
     WHERE "token_hash" = $1
       AND "status" = 'ACTIVE'
       AND "expires_at" > NOW()
       AND "revoked_at" IS NULL
     LIMIT 1`, tokenHash));
    return rows.length > 0;
};
const requireAuth = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
        unauthorized(res, "Missing auth token");
        return;
    }
    try {
        const claims = (0, jwt_1.verifyToken)(token);
        if (claims.type === "agent") {
            const isActive = await assertActiveAgentToken(token);
            if (!isActive) {
                unauthorized(res, "Agent token is not active");
                return;
            }
        }
        req.auth = {
            userId: claims.sub,
            organizationId: claims.orgId,
            role: claims.role,
            tokenType: claims.type,
            token,
        };
        next();
    }
    catch (error) {
        console.error("Auth verification failed", error);
        unauthorized(res, "Invalid or expired token");
    }
};
exports.requireAuth = requireAuth;
const requireRole = (allowedRole) => {
    return (req, res, next) => {
        if (!req.auth) {
            unauthorized(res);
            return;
        }
        if (req.auth.role !== allowedRole) {
            res.status(403).json({
                success: false,
                message: "Forbidden",
            });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
const attachOptionalAuth = async (req, _res, next) => {
    const token = extractToken(req);
    if (!token) {
        next();
        return;
    }
    try {
        const claims = (0, jwt_1.verifyToken)(token);
        if (claims.type === "agent") {
            const isActive = await assertActiveAgentToken(token);
            if (!isActive) {
                next();
                return;
            }
        }
        req.auth = {
            userId: claims.sub,
            organizationId: claims.orgId,
            role: claims.role,
            tokenType: claims.type,
            token,
        };
    }
    catch {
        // Keep optional auth silent.
    }
    next();
};
exports.attachOptionalAuth = attachOptionalAuth;
//# sourceMappingURL=auth.middleware.js.map