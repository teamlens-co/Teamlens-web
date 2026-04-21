"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const auth_controller_1 = require("../controllers/auth.controller");
const invite_controller_1 = require("../controllers/invite.controller");
const auth_middleware_1 = require("../../../shared/middlewares/auth.middleware");
const webRouter = (0, express_1.Router)();
webRouter.get("/health", (_req, res) => {
    res.json({
        success: true,
        module: "web",
        message: "Web module ready",
    });
});
webRouter.get("/dashboard/analytics", auth_middleware_1.requireAuth, dashboard_controller_1.getDashboardAnalytics);
webRouter.post("/auth/signup-manager", auth_controller_1.signupManager);
webRouter.post("/auth/login", auth_controller_1.login);
webRouter.post("/auth/logout", auth_controller_1.logout);
webRouter.get("/auth/me", auth_middleware_1.requireAuth, auth_controller_1.getMe);
webRouter.post("/auth/agent-token", auth_middleware_1.requireAuth, auth_controller_1.createAgentConnectToken);
webRouter.get("/users", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)("MANAGER"), auth_controller_1.getTeamUsers);
webRouter.post("/invites", auth_middleware_1.requireAuth, (0, auth_middleware_1.requireRole)("MANAGER"), invite_controller_1.createInvite);
webRouter.get("/invites/validate", invite_controller_1.validateInvite);
webRouter.post("/invites/accept", invite_controller_1.acceptInvite);
exports.default = webRouter;
//# sourceMappingURL=web.routes.js.map