"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const activity_service_1 = require("../../agent/services/activity.service");
class DashboardService {
    static async getAnalytics(userId, range) {
        return activity_service_1.ActivityService.getAnalytics(userId, range);
    }
}
exports.DashboardService = DashboardService;
//# sourceMappingURL=dashboard.service.js.map