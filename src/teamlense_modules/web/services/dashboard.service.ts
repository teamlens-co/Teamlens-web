import type { DashboardAnalytics } from "../../../shared/types/dashboard";
import { prisma } from "../../../shared/db/prisma";
import { ActivityService } from "../../agent/services/activity.service";

type SqlRow = Record<string, unknown>;

type ActivityTimelineSegment = {
  start: string;
  end: string;
  kind: "active" | "idle";
  mouseMoves: number;
  keyPresses: number;
};

type ActivityTimelineEmployee = {
  userId: string;
  employeeName: string;
  email: string;
  activeSeconds: number;
  idleSeconds: number;
  workSeconds: number;
  utilizationPercent: number;
  mouseMoves: number;
  keyPresses: number;
  mousePercent: number;
  keyboardPercent: number;
  firstActiveAt: string | null;
  lastActiveAt: string | null;
  topApps: Array<{ name: string; seconds: number }>;
  segments: ActivityTimelineSegment[];
};

type UserRow = {
  id: string;
  full_name: string;
  email: string;
};

const asString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : "";
};

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ACTIVITY_BUCKET_MS = 10 * 60 * 1000;

export class DashboardService {
  static async getAnalytics(userId: string, start: Date, end: Date): Promise<DashboardAnalytics> {
    return ActivityService.getAnalytics(userId, start, end);
  }

  static async addManualHours(userId: string, dateStr: string, hours: number): Promise<void> {
    await ActivityService.addManualHours(userId, dateStr, hours);
  }

  static async getActivityTimeline(params: {
    organizationId: string;
    requestingUserId: string;
    isManager: boolean;
    start: Date;
    end: Date;
  }): Promise<{ start: string; end: string; employees: ActivityTimelineEmployee[] }> {
    const users = params.isManager
      ? ((await prisma.$queryRawUnsafe(
          `SELECT "id", "full_name", "email"
           FROM "users"
           WHERE "organization_id" = $1
             AND "status" = 'ACTIVE'
           ORDER BY "full_name" ASC`,
          params.organizationId,
        )) as UserRow[])
      : ((await prisma.$queryRawUnsafe(
          `SELECT "id", "full_name", "email"
           FROM "users"
           WHERE "id" = $1
           LIMIT 1`,
          params.requestingUserId,
        )) as UserRow[]);

    if (users.length === 0) {
      return { start: params.start.toISOString(), end: params.end.toISOString(), employees: [] };
    }

    const userIds = users.map((user) => user.id);
    const placeholders = userIds.map((_, index) => `$${index + 3}`).join(",");
    const logRows = (await prisma.$queryRawUnsafe(
      `SELECT "user_id", "mouse_moves", "key_presses", "is_active",
              COALESCE("captured_at", "created_at") AS "ts"
       FROM "activity_logs"
       WHERE COALESCE("captured_at", "created_at") >= $1
         AND COALESCE("captured_at", "created_at") <= $2
         AND "user_id" IN (${placeholders})
       ORDER BY "user_id", "ts" ASC`,
      params.start,
      params.end,
      ...userIds,
    )) as SqlRow[];

    const appRows = (await prisma.$queryRawUnsafe(
      `SELECT "user_id", "app_name", SUM("duration_seconds")::int AS "seconds"
       FROM "activity_usage_logs"
       WHERE "organization_id" = $1
         AND "captured_at" >= $2
         AND "captured_at" <= $3
         AND "user_id" IN (${userIds.map((_, index) => `$${index + 4}`).join(",")})
       GROUP BY "user_id", "app_name"
       ORDER BY "user_id", SUM("duration_seconds") DESC`,
      params.organizationId,
      params.start,
      params.end,
      ...userIds,
    ).catch(() => [])) as SqlRow[];

    const logsByUser = new Map<string, SqlRow[]>();
    for (const row of logRows) {
      const userId = asString(row.user_id);
      if (!logsByUser.has(userId)) logsByUser.set(userId, []);
      logsByUser.get(userId)!.push(row);
    }

    const appsByUser = new Map<string, Array<{ name: string; seconds: number }>>();
    for (const row of appRows) {
      const userId = asString(row.user_id);
      const apps = appsByUser.get(userId) ?? [];
      if (apps.length < 3) {
        apps.push({ name: asString(row.app_name) || "Unknown", seconds: asNumber(row.seconds) });
      }
      appsByUser.set(userId, apps);
    }

    const employees: ActivityTimelineEmployee[] = [];
    for (const user of users) {
      const rows = logsByUser.get(user.id) ?? [];
      const analytics = await ActivityService.getAnalytics(user.id, params.start, params.end);
      const segments: ActivityTimelineSegment[] = [];
      let mouseMoves = 0;
      let keyPresses = 0;
      let activeSeconds = 0;
      let idleSeconds = 0;
      let firstActiveAt: string | null = null;
      let lastActiveAt: string | null = null;
      const buckets = new Map<number, { mouseMoves: number; keyPresses: number; hasActivity: boolean }>();

      for (const row of rows) {
        const ts = row.ts instanceof Date ? row.ts : new Date(asString(row.ts));
        if (Number.isNaN(ts.getTime())) continue;

        const rowMouseMoves = asNumber(row.mouse_moves);
        const rowKeyPresses = asNumber(row.key_presses);
        const isActive = row.is_active === true || row.is_active === 1 || rowMouseMoves > 0 || rowKeyPresses > 0;
        const bucketStartMs =
          params.start.getTime() +
          Math.floor((ts.getTime() - params.start.getTime()) / ACTIVITY_BUCKET_MS) * ACTIVITY_BUCKET_MS;
        const bucket = buckets.get(bucketStartMs) ?? { mouseMoves: 0, keyPresses: 0, hasActivity: false };

        mouseMoves += rowMouseMoves;
        keyPresses += rowKeyPresses;
        bucket.mouseMoves += rowMouseMoves;
        bucket.keyPresses += rowKeyPresses;
        bucket.hasActivity = bucket.hasActivity || isActive;
        buckets.set(bucketStartMs, bucket);
      }

      for (const [bucketStartMs, bucket] of Array.from(buckets.entries()).sort(([a], [b]) => a - b)) {
        const segmentStartMs = Math.max(bucketStartMs, params.start.getTime());
        const segmentEndMs = Math.min(bucketStartMs + ACTIVITY_BUCKET_MS, params.end.getTime());
        if (segmentEndMs <= segmentStartMs) continue;

        const segmentSeconds = Math.round((segmentEndMs - segmentStartMs) / 1000);
        const isActive = bucket.hasActivity;

        if (isActive) {
          activeSeconds += segmentSeconds;
          firstActiveAt ??= new Date(segmentStartMs).toISOString();
          lastActiveAt = new Date(segmentEndMs).toISOString();
        } else {
          idleSeconds += segmentSeconds;
        }

        const previous = segments[segments.length - 1];
        const kind = isActive ? "active" : "idle";
        if (previous && previous.kind === kind && previous.end === new Date(segmentStartMs).toISOString()) {
          previous.end = new Date(segmentEndMs).toISOString();
          previous.mouseMoves += bucket.mouseMoves;
          previous.keyPresses += bucket.keyPresses;
        } else {
          segments.push({
            start: new Date(segmentStartMs).toISOString(),
            end: new Date(segmentEndMs).toISOString(),
            kind,
            mouseMoves: bucket.mouseMoves,
            keyPresses: bucket.keyPresses,
          });
        }
      }

      const engagementTotal = mouseMoves + keyPresses;
      const workSeconds = analytics.workSeconds + analytics.manualSeconds;
      const utilizationPercent = workSeconds > 0
        ? Math.round((Math.min(activeSeconds || analytics.activeSeconds, workSeconds) / workSeconds) * 100)
        : 0;

      employees.push({
        userId: user.id,
        employeeName: user.full_name,
        email: user.email,
        activeSeconds: activeSeconds || analytics.activeSeconds,
        idleSeconds: Math.max(idleSeconds, workSeconds - analytics.manualSeconds - (activeSeconds || analytics.activeSeconds), 0),
        workSeconds,
        utilizationPercent,
        mouseMoves,
        keyPresses,
        mousePercent: engagementTotal > 0 ? Math.round((mouseMoves / engagementTotal) * 100) : 0,
        keyboardPercent: engagementTotal > 0 ? Math.round((keyPresses / engagementTotal) * 100) : 0,
        firstActiveAt,
        lastActiveAt,
        topApps: appsByUser.get(user.id) ?? [],
        segments,
      });
    }

    return {
      start: params.start.toISOString(),
      end: params.end.toISOString(),
      employees,
    };
  }
}
