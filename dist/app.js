"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const mainRoutes_1 = __importDefault(require("./mainRoutes"));
const app = (0, express_1.default)();
const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
const frontendOrigins = process.env.FRONTEND_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
const allowedOrigins = new Set([
    env_1.env.webAppUrl,
    frontendOrigin,
    ...frontendOrigins,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://91.108.105.211:3001",
]);
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin) || /^file:\/\//.test(origin) || /^tauri:\/\//.test(origin) || /^https?:\/\/tauri\.localhost/.test(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: true,
}));
// Raw body parser for screenshot uploads MUST come before generalized body parsers.
app.use("/api/agent/screenshots", express_1.default.raw({ type: ["image/*", "application/octet-stream"], limit: "50mb" }));
// JSON parser for most endpoints
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({
        success: true,
        message: "TeamLens backend is running",
    });
});
app.use("/api", mainRoutes_1.default);
exports.default = app;
//# sourceMappingURL=app.js.map