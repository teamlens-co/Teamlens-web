export interface ClockInPayload {
    userId: string;
    timestamp?: string;
}
export interface ClockOutPayload {
    userId: string;
    sessionId?: string;
    timestamp?: string;
}
export interface WorkSessionRecord {
    id: string;
    userId: string;
    clockInAt: string;
    clockOutAt?: string;
}
export interface DashboardAnalytics {
    userId: string;
    range: "today" | "week";
    workSeconds: number;
    activeSeconds: number;
    productivityPercent: number;
    totalMouseMoves: number;
    totalKeyPresses: number;
    sessions: WorkSessionRecord[];
}
//# sourceMappingURL=dashboard.d.ts.map