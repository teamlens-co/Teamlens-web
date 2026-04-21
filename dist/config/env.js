"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const toNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
exports.env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    port: toNumber(process.env.PORT, 5000),
    databaseUrl: process.env.DATABASE_URL ?? "",
    jwtSecret: process.env.JWT_SECRET ?? "", // Added for JWT secret
    jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? "1h", // Added for JWT access token TTL
    jwtAgentTtl: process.env.JWT_AGENT_TTL ?? "30d", // Added for JWT agent token TTL
    inviteTtlHours: toNumber(process.env.INVITE_TTL_HOURS, 72), // Added for invite TTL hours
    webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:3000", // Added for web app URL
};
//# sourceMappingURL=env.js.map