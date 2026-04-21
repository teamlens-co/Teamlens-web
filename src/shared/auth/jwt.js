"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.signAgentToken = exports.signAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../config/env");
const asExpiresIn = (value) => {
    return value;
};
const ensureSecret = () => {
    if (!env_1.env.jwtSecret) {
        throw new Error("JWT_SECRET is missing. Add it to backend/.env");
    }
    return env_1.env.jwtSecret;
};
const signAccessToken = (payload) => {
    const claims = {
        sub: payload.userId,
        orgId: payload.organizationId,
        role: payload.role,
        type: "access",
    };
    return jsonwebtoken_1.default.sign(claims, ensureSecret(), {
        expiresIn: asExpiresIn(env_1.env.jwtAccessTtl),
    });
};
exports.signAccessToken = signAccessToken;
const signAgentToken = (payload) => {
    const claims = {
        sub: payload.userId,
        orgId: payload.organizationId,
        role: payload.role,
        type: "agent",
        jti: payload.tokenId,
    };
    return jsonwebtoken_1.default.sign(claims, ensureSecret(), {
        expiresIn: asExpiresIn(env_1.env.jwtAgentTtl),
    });
};
exports.signAgentToken = signAgentToken;
const verifyToken = (token) => {
    return jsonwebtoken_1.default.verify(token, ensureSecret());
};
exports.verifyToken = verifyToken;
//# sourceMappingURL=jwt.js.map