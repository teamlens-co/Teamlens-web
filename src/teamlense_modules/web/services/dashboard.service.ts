import type { DashboardAnalytics } from "../../../shared/types/dashboard";
import { prisma } from "../../../shared/db/prisma";
import { ActivityService } from "../../agent/services/activity.service";
import { LocationService } from "./location.service";

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

export type ManualTimeRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type ManualTimeRequestRow = {
  id: string;
  organizationId: string;
  userId: string;
  employeeName: string;
  employeeEmail: string;
  requestedById: string;
  requestedByName: string;
  reviewedById: string | null;
  reviewedByName: string | null;
  startAt: string;
  endAt: string;
  durationSeconds: number;
  reason: string;
  status: ManualTimeRequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
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
const IMPLICIT_END_MS = 90 * 1000;

export class DashboardService {
  private static manualTimeSchemaReady = false;

  private static async ensureManualTimeSchema(): Promise<void> {
    if (this.manualTimeSchemaReady || !prisma.$executeRawUnsafe) return;

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ManualTimeStatus') THEN
          CREATE TYPE "ManualTimeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "manual_time_requests" (
        "id" TEXT PRIMARY KEY,
        "organization_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "requested_by_id" TEXT NOT NULL,
        "reviewed_by_id" TEXT,
        "start_at" TIMESTAMPTZ NOT NULL,
        "end_at" TIMESTAMPTZ NOT NULL,
        "duration_seconds" INTEGER NOT NULL,
        "reason" TEXT NOT NULL,
        "status" "ManualTimeStatus" NOT NULL DEFAULT 'PENDING',
        "review_note" TEXT,
        "reviewed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await LocationService.ensureSchema();

    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "manual_time_requests_organization_id_status_idx" ON "manual_time_requests" ("organization_id", "status")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "manual_time_requests_user_id_start_at_idx" ON "manual_time_requests" ("user_id", "start_at")',
    );

    this.manualTimeSchemaReady = true;
  }

  static async getAnalytics(userId: string, start: Date, end: Date): Promise<DashboardAnalytics> {
    return ActivityService.getAnalytics(userId, start, end);
  }

  static async addManualHours(userId: string, dateStr: string, hours: number): Promise<void> {
    await ActivityService.addManualHours(userId, dateStr, hours);
  }

  static async listManualTimeRequests(params: {
    organizationId: string;
    requestingUserId: string;
    isManager: boolean;
    status?: ManualTimeRequestStatus;
  }): Promise<ManualTimeRequestRow[]> {
    await this.ensureManualTimeSchema();

    const statusFilter = params.status ? `AND mtr."status" = $${params.isManager ? 2 : 3}::"ManualTimeStatus"` : "";
    const values = params.isManager
      ? [params.organizationId, ...(params.status ? [params.status] : [])]
      : [params.organizationId, params.requestingUserId, ...(params.status ? [params.status] : [])];
    const scopeFilter = params.isManager
      ? `mtr."organization_id" = $1`
      : `mtr."organization_id" = $1 AND mtr."user_id" = $2`;

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT mtr."id",
              mtr."organization_id",
              mtr."user_id",
              u."full_name" AS "employee_name",
              u."email" AS "employee_email",
              mtr."requested_by_id",
              requester."full_name" AS "requested_by_name",
              mtr."reviewed_by_id",
              reviewer."full_name" AS "reviewed_by_name",
              mtr."start_at",
              mtr."end_at",
              mtr."duration_seconds",
              mtr."reason",
              mtr."status",
              mtr."review_note",
              mtr."reviewed_at",
              mtr."created_at"
       FROM "manual_time_requests" mtr
       JOIN "users" u ON u."id" = mtr."user_id"
       JOIN "users" requester ON requester."id" = mtr."requested_by_id"
       LEFT JOIN "users" reviewer ON reviewer."id" = mtr."reviewed_by_id"
       WHERE ${scopeFilter}
         ${statusFilter}
       ORDER BY mtr."created_at" DESC`,
      ...values,
    )) as SqlRow[];

    return rows.map((row) => ({
      id: asString(row.id),
      organizationId: asString(row.organization_id),
      userId: asString(row.user_id),
      employeeName: asString(row.employee_name),
      employeeEmail: asString(row.employee_email),
      requestedById: asString(row.requested_by_id),
      requestedByName: asString(row.requested_by_name),
      reviewedById: asString(row.reviewed_by_id) || null,
      reviewedByName: asString(row.reviewed_by_name) || null,
      startAt: asString(row.start_at),
      endAt: asString(row.end_at),
      durationSeconds: asNumber(row.duration_seconds),
      reason: asString(row.reason),
      status: asString(row.status) as ManualTimeRequestStatus,
      reviewNote: asString(row.review_note) || null,
      reviewedAt: asString(row.reviewed_at) || null,
      createdAt: asString(row.created_at),
    }));
  }

  static async createManualTimeRequest(params: {
    organizationId: string;
    requestingUserId: string;
    isManager: boolean;
    userId?: string;
    startAt: Date;
    endAt: Date;
    reason: string;
  }): Promise<ManualTimeRequestRow> {
    await this.ensureManualTimeSchema();

    const userId = params.isManager && params.userId ? params.userId : params.requestingUserId;
    if (params.endAt <= params.startAt) {
      throw new Error("End time must be after start time");
    }

    const userRows = (await prisma.$queryRawUnsafe(
      `SELECT "id"
       FROM "users"
       WHERE "id" = $1
         AND "organization_id" = $2
         AND "status" = 'ACTIVE'
       LIMIT 1`,
      userId,
      params.organizationId,
    )) as SqlRow[];

    if (userRows.length === 0) {
      throw new Error("Employee not found");
    }

    const id = crypto.randomUUID();
    const durationSeconds = Math.round((params.endAt.getTime() - params.startAt.getTime()) / 1000);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "manual_time_requests"
         ("id","organization_id","user_id","requested_by_id","start_at","end_at","duration_seconds","reason","status","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',NOW(),NOW())`,
      id,
      params.organizationId,
      userId,
      params.requestingUserId,
      params.startAt,
      params.endAt,
      durationSeconds,
      params.reason,
    );

    const createdRows = await this.listManualTimeRequests({
      organizationId: params.organizationId,
      requestingUserId: params.isManager ? params.requestingUserId : userId,
      isManager: params.isManager,
    });

    const created = createdRows.find((item) => item.id === id);
    if (!created) throw new Error("Unable to load created manual time request");
    return created;
  }

  static async reviewManualTimeRequest(params: {
    organizationId: string;
    managerId: string;
    requestId: string;
    status: "APPROVED" | "REJECTED";
    reviewNote?: string;
  }): Promise<ManualTimeRequestRow> {
    await this.ensureManualTimeSchema();

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT "id", "user_id", "start_at", "end_at", "status"
       FROM "manual_time_requests"
       WHERE "id" = $1
         AND "organization_id" = $2
       LIMIT 1`,
      params.requestId,
      params.organizationId,
    )) as SqlRow[];

    const request = rows[0];
    if (!request) throw new Error("Manual time request not found");
    if (asString(request.status) !== "PENDING") throw new Error("Manual time request has already been reviewed");

    if (params.status === "APPROVED") {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "work_sessions" ("id","user_id","clock_in_at","clock_out_at","location_type","created_at","updated_at")
         VALUES ($1,$2,$3,$4,'manual',NOW(),NOW())`,
        crypto.randomUUID(),
        asString(request.user_id),
        request.start_at as Date,
        request.end_at as Date,
      );
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "manual_time_requests"
       SET "status" = $1::"ManualTimeStatus",
           "reviewed_by_id" = $2,
           "review_note" = $3,
           "reviewed_at" = NOW(),
           "updated_at" = NOW()
       WHERE "id" = $4`,
      params.status,
      params.managerId,
      params.reviewNote ?? null,
      params.requestId,
    );

    const reviewed = await this.listManualTimeRequests({
      organizationId: params.organizationId,
      requestingUserId: params.managerId,
      isManager: true,
    });

    const match = reviewed.find((item) => item.id === params.requestId);
    if (!match) throw new Error("Unable to load reviewed request");
    return match;
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
      `SELECT "user_id", "session_id", "mouse_moves", "key_presses", "is_active",
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

    const sessionRows = (await prisma.$queryRawUnsafe(
      `SELECT "id", "user_id", "clock_in_at", "clock_out_at", "location_type"
       FROM "work_sessions"
       WHERE "clock_in_at" < $2
         AND COALESCE("clock_out_at", $2) > $1
         AND "user_id" IN (${placeholders})
       ORDER BY "user_id", "clock_in_at" ASC`,
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
      const userSessionRows = sessionRows.filter((row) => asString(row.user_id) === user.id);
      const rowsBySession = new Map<string, SqlRow[]>();

      for (const row of rows) {
        const sessionId = asString(row.session_id);
        if (!sessionId) continue;
        if (!rowsBySession.has(sessionId)) rowsBySession.set(sessionId, []);
        rowsBySession.get(sessionId)!.push(row);
      }

      for (const row of userSessionRows) {
        if (asString(row.location_type) === "manual") continue;

        const sessionId = asString(row.id);
        const clockInMs = (row.clock_in_at instanceof Date ? row.clock_in_at : new Date(asString(row.clock_in_at))).getTime();
        if (Number.isNaN(clockInMs)) continue;

        let clockOutMs: number;
        if (row.clock_out_at) {
          clockOutMs = (row.clock_out_at instanceof Date ? row.clock_out_at : new Date(asString(row.clock_out_at))).getTime();
        } else {
          const sessionActivityRows = rowsBySession.get(sessionId) ?? [];
          const sessionActivityTimes = sessionActivityRows
            .map((activityRow) => {
              const ts = activityRow.ts instanceof Date ? activityRow.ts : new Date(asString(activityRow.ts));
              return ts.getTime();
            })
            .filter((value) => Number.isFinite(value));
          const lastActivityMs =
            sessionActivityTimes.length > 0
              ? Math.max(...sessionActivityTimes)
              : clockInMs;
          const now = Date.now();
          const rangeEndDate = new Date(params.end.getTime());
          const nowDate = new Date(now);
          const isCurrentRange =
            params.end.getTime() >= now - 60_000 ||
            (rangeEndDate.getFullYear() === nowDate.getFullYear() &&
              rangeEndDate.getMonth() === nowDate.getMonth() &&
              rangeEndDate.getDate() === nowDate.getDate());
          clockOutMs = isCurrentRange && lastActivityMs >= now - IMPLICIT_END_MS ? now : Math.min(lastActivityMs, params.end.getTime());
        }

        const sessionStartMs = Math.max(clockInMs, params.start.getTime());
        const sessionEndMs = Math.min(clockOutMs, params.end.getTime());
        if (sessionEndMs <= sessionStartMs) continue;

        for (
          let bucketStartMs = params.start.getTime() + Math.floor((sessionStartMs - params.start.getTime()) / ACTIVITY_BUCKET_MS) * ACTIVITY_BUCKET_MS;
          bucketStartMs < sessionEndMs;
          bucketStartMs += ACTIVITY_BUCKET_MS
        ) {
          const bucketEndMs = bucketStartMs + ACTIVITY_BUCKET_MS;
          if (bucketEndMs <= sessionStartMs || bucketStartMs >= sessionEndMs) continue;
          if (!buckets.has(bucketStartMs)) {
            buckets.set(bucketStartMs, { mouseMoves: 0, keyPresses: 0, hasActivity: false });
          }
        }
      }

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
      const trackedWorkSeconds = analytics.workSeconds;
      const preciseActiveSeconds = Math.min(analytics.activeSeconds, trackedWorkSeconds);
      const workSeconds = trackedWorkSeconds + analytics.manualSeconds;
      const utilizationPercent = trackedWorkSeconds > 0
        ? Math.round((preciseActiveSeconds / trackedWorkSeconds) * 100)
        : 0;

      employees.push({
        userId: user.id,
        employeeName: user.full_name,
        email: user.email,
        activeSeconds: preciseActiveSeconds,
        idleSeconds: Math.max(trackedWorkSeconds - preciseActiveSeconds, 0),
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
