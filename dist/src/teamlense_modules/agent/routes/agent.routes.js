"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const activity_controller_1 = require("../controllers/activity.controller");
const auth_controller_1 = require("../controllers/auth.controller");
const screenshot_controller_1 = require("../controllers/screenshot.controller");
const auth_middleware_1 = require("../../../shared/middlewares/auth.middleware");
const agentRouter = (0, express_1.Router)();
agentRouter.post("/auth/login", auth_controller_1.loginAgent);
agentRouter.get("/active-session", auth_middleware_1.requireAuth, activity_controller_1.getActiveSession);
agentRouter.post("/clock-in", auth_middleware_1.requireAuth, activity_controller_1.clockIn);
agentRouter.post("/clock-out", auth_middleware_1.requireAuth, activity_controller_1.clockOut);
agentRouter.post("/activity", auth_middleware_1.requireAuth, activity_controller_1.createActivity);
// Screenshot routes
agentRouter.post("/screenshots", auth_middleware_1.requireAuth, screenshot_controller_1.uploadScreenshot);
agentRouter.get("/screenshots", auth_middleware_1.requireAuth, screenshot_controller_1.getScreenshots);
agentRouter.get("/screenshots/:id", auth_middleware_1.requireAuth, screenshot_controller_1.getScreenshot);
exports.default = agentRouter;
//# sourceMappingURL=agent.routes.js.map