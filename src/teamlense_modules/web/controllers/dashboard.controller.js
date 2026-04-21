"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardAnalytics = void 0;
const dashboard_service_1 = require("../services/dashboard.service");
const resolveRange = (value) => {
    return value === "week" ? "week" : "today";
};
const getDashboardAnalytics = async (req, res) => {
    if (!req.auth) {
        res.status(401).json({
            success: false,
            message: "Unauthorized",
        });
        return;
    }
    const requestedUserId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    const userId = req.auth.role === "MANAGER" && requestedUserId ? requestedUserId : req.auth.userId;
    const range = resolveRange(typeof req.query.range === "string" ? req.query.range : undefined);
    try {
        const analytics = await dashboard_service_1.DashboardService.getAnalytics(userId, range);
        res.status(200).json({
            success: true,
            data: analytics,
        });
    }
    catch (error) {
        console.error("Failed to fetch dashboard analytics", error);
        res.status(500).json({
            success: false,
            message: "Unable to fetch dashboard analytics",
        });
    }
};
exports.getDashboardAnalytics = getDashboardAnalytics;
//# sourceMappingURL=dashboard.controller.js.map