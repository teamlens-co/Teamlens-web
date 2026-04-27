import type { DashboardAnalytics } from "../../../shared/types/dashboard";
import { ActivityService } from "../../agent/services/activity.service";

export class DashboardService {
  static async getAnalytics(userId: string, start: Date, end: Date): Promise<DashboardAnalytics> {
    return ActivityService.getAnalytics(userId, start, end);
  }

  static async addManualHours(userId: string, dateStr: string, hours: number): Promise<void> {
    await ActivityService.addManualHours(userId, dateStr, hours);
  }
}
