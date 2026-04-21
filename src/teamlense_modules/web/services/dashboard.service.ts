import type { DashboardAnalytics } from "../../../shared/types/dashboard";
import { ActivityService } from "../../agent/services/activity.service";

export class DashboardService {
  static async getAnalytics(userId: string, start: Date, end: Date): Promise<DashboardAnalytics> {
    return ActivityService.getAnalytics(userId, start, end);
  }
}
