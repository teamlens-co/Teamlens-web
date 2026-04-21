import type { ActivityPayload, ActivityRecord } from "../../../shared/types/activity";
import type { ClockInPayload, ClockOutPayload, DashboardAnalytics, WorkSessionRecord } from "../../../shared/types/dashboard";
export declare class ActivityService {
    private static schemaReady;
    private static mapSessionRow;
    private static ensureSchema;
    static getActiveSession(userId: string): Promise<WorkSessionRecord | null>;
    static clockIn(payload: ClockInPayload): Promise<WorkSessionRecord>;
    static clockOut(payload: ClockOutPayload): Promise<WorkSessionRecord | null>;
    static create(payload: ActivityPayload): Promise<ActivityRecord>;
    static getAnalytics(userId: string, range: "today" | "week"): Promise<DashboardAnalytics>;
}
//# sourceMappingURL=activity.service.d.ts.map